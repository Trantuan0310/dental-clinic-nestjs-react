import { test as base, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export type { Page };

/**
 * Shared login helper for authenticated E2E flows. Tests that need a logged-in
 * state should call `await login(page)` in their setup.
 *
 * If `E2E_USERNAME` / `E2E_PASSWORD` env vars are set they take precedence,
 * otherwise we fall back to the seeded admin credentials.
 */
export async function login(page: Page): Promise<void> {
  const username = process.env.E2E_USERNAME ?? 'admin@clinic.local';
  const password = process.env.E2E_PASSWORD ?? 'Admin123!';

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(username);
  await page.getByLabel(/mật khẩu|password/i).fill(password);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

export async function logout(page: Page): Promise<void> {
  const trigger = page.locator('header button:has(svg)').last();
  await trigger.click();
  await page.getByRole('button', { name: /đăng xuất/i }).click();
  await page.waitForURL('**/login');
}

export async function saveDemoVideo(page: Page, title: string): Promise<string | undefined> {
  const video = page.video();
  await page.close();
  if (!process.env.E2E_RECORD_VIDEO || !video) return;
  const dir = `artifacts/demo-videos/${process.env.E2E_RUN_ID}`;
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/${title.replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 120)}.webm`;
  await video.saveAs(path);
  return path;
}

// ---------------------------------------------------------------------------
// Shared-context cache — fixes 41/58 suite-wide failures traced to
// TokenReuseDetectedException (backend/src/auth/auth.service.ts).
//
// global-setup.ts logs in ONCE per role and freezes the resulting session
// into e2e/.auth/{admin,dentist}.json. That snapshot's refresh-token cookie
// is single-use by design (rotation-on-every-refresh): the app calls
// POST /auth/refresh on every fresh page load (SessionBoot has no in-memory
// access token to fall back on in a brand-new browser context), so the
// FIRST test to load pre-authenticated from a given snapshot rotates it —
// and every OTHER test that later loads a fresh context from that SAME
// static file presents the now-already-rotated cookie, which the backend
// correctly treats as token theft and revokes every session for that user.
// This isn't a race in the usual sense: it reproduces 100% of the time,
// serially or in parallel, because the snapshot is consumed exactly once
// no matter how many tests expect to reuse it.
//
// Fix: don't let each test open its own fresh context from the static
// file. Cache one BrowserContext per distinct storageState value *within
// this worker process* (module-level state is automatically worker-scoped
// — each Playwright worker is a separate Node process) and hand out new
// pages from that same context to every test that asks for the same
// storageState. The cookie jar then evolves through one continuous,
// self-consistent rotation chain instead of N independent one-shot reads
// of a frozen snapshot.
//
// Both local and CI runs use one worker. Auth files are isolated by run id;
// Context teardown persists rotated cookies before any failed-worker restart.
//
// IMPORTANT: only route a `page`/`context` through this cache when the
// test will not itself mutate that session (no login()/loginAs()/logout()/
// clearCookies() calls) — those need their own disposable
// `browser.newContext()`, or they'd silently swap out the shared session
// for every other test in the worker still expecting to reuse it. See
// appointment-booking-roles.spec.ts and the flow-*.spec.ts files for the
// "own dedicated context" pattern.
type BrowserNewContextOptions = NonNullable<Parameters<Browser['newContext']>[0]>;
type StorageStateOption = BrowserNewContextOptions['storageState'];

// A shared context's cookie jar evolves through one rotation chain, but only
// if navigations against it never overlap. `page.goto()`/`page.reload()`
// both trigger a fresh SessionBoot mount (no in-memory access token survives
// a real navigation, by design), which fires its own POST /auth/refresh. Two
// of those landing close enough together — a test's next goto() firing
// before the previous one's refresh finished rotating the cookie — makes
// both requests present the same not-yet-rotated cookie. The backend's
// atomic single-winner rotation (auth.service.ts) is correct to treat the
// loser as reuse and revoke every session for the account; the bug is on
// this side, letting two navigations overlap in the first place. Once that
// fires for a role's shared context, EVERY later test reusing it is
// permanently locked out for the rest of the worker — there's no per-test
// recovery. Instrumenting `goto`/`reload` here, once, for every page pulled
// from a shared/cached context (not just the ones this file's own `page`
// fixture hands out — flow-*.spec.ts pages obtained directly via
// getSharedContext().newPage() go through the same override) closes the gap
// at its single choke point instead of auditing every spec for a stray
// double-navigation.
function instrumentPage(page: Page): Page {
  const settle = () => page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  const originalGoto = page.goto.bind(page);
  page.goto = (async (...args: Parameters<Page['goto']>) => {
    const response = await originalGoto(...args);
    await settle();
    return response;
  }) as Page['goto'];
  const originalReload = page.reload.bind(page);
  page.reload = (async (...args: Parameters<Page['reload']>) => {
    const response = await originalReload(...args);
    await settle();
    return response;
  }) as Page['reload'];
  return page;
}

const contextCache = new Map<string, Promise<BrowserContext>>();

// Per auth file, the chain of pending snapshot writes (serialised so an older
// snapshot can never land after a newer one).
const pendingSaves = new Map<string, Promise<void>>();

// Persist a file-backed shared context's cookies right after every successful
// login/refresh, i.e. every refresh-token rotation. Saving only at fixture
// teardown (persistAuthState) missed specs that take the shared context
// straight from getSharedContext() without the `context` fixture
// (flow-inventory-stock-out, flow-shift-registration): when such a spec
// failed, Playwright replaced the worker, the new worker loaded the auth file
// still holding the pre-rotation cookie, the backend flagged that as refresh
// token reuse and revoked every session for the account, and every later
// test using that role landed on /login.
function persistOnRotation(context: BrowserContext, path: string): void {
  context.on('requestfinished', (request) => {
    if (request.method() !== 'POST' || !/\/auth\/(login|refresh)$/.test(new URL(request.url()).pathname)) {
      return;
    }
    const previous = pendingSaves.get(path) ?? Promise.resolve();
    pendingSaves.set(
      path,
      previous
        .then(async () => {
          const response = await request.response();
          if (response?.ok()) await context.storageState({ path });
        })
        // The context may already be closing at the end of the worker.
        .catch(() => {}),
    );
  });
}

// A shared context also shares localStorage, so a test that switches the
// language (i18n.spec) or theme (shell.spec) would leak that choice into every
// later test on the same role — e.g. the shell tests then looked for "Mở menu"
// on an English UI. Give each new page the default preferences once; the
// sessionStorage flag survives reloads, so a test can still check that its own
// choice persists across page.reload().
function resetUiPreferences(): void {
  try {
    if (sessionStorage.getItem('e2e.uiPrefsReset')) return;
    sessionStorage.setItem('e2e.uiPrefsReset', '1');
    localStorage.removeItem('gensmile.i18n');
    localStorage.removeItem('gensmile.theme');
  } catch {
    // about:blank and opaque origins have no storage.
  }
}

// `storageState` accepts a file path (string) or an actual state object —
// the cache key has to be a string either way, but the value handed to
// newContext() must stay in whatever form the caller gave it (stringifying
// an object and passing THAT string back to newContext() would make
// Playwright try to read a file literally named after the JSON text).
export async function getSharedContext(
  browser: Browser,
  storageState: StorageStateOption,
): Promise<BrowserContext> {
  const resolvedState = typeof storageState === 'string' && /^e2e\/\.auth\/(admin|dentist)\.json$/.test(storageState)
    ? `${process.env.E2E_AUTH_DIR ?? 'e2e/.auth'}/${storageState.split('/').pop()}`
    : storageState;
  const key = typeof resolvedState === 'string' ? resolvedState : JSON.stringify(resolvedState ?? null);
  let cached = contextCache.get(key);
  if (!cached) {
    cached = browser
      .newContext({
        storageState: resolvedState,
        timezoneId: 'Asia/Ho_Chi_Minh',
        ...(process.env.E2E_RECORD_VIDEO
          ? { recordVideo: { dir: process.env.E2E_VIDEO_DIR ?? 'artifacts/playwright-videos', size: { width: 1280, height: 720 } } }
          : {}),
      })
      .then(async (context) => {
        if (typeof resolvedState === 'string' && resolvedState.endsWith('.json')) {
          persistOnRotation(context, resolvedState);
        }
        await context.addInitScript(resetUiPreferences);
        const originalNewPage = context.newPage.bind(context);
        context.newPage = (async (...args: Parameters<BrowserContext['newPage']>) =>
          instrumentPage(await originalNewPage(...args))) as BrowserContext['newPage'];
        return context;
      });
    contextCache.set(key, cached);
  }
  return cached;
}

export const test = base.extend({
  context: async ({ browser, storageState }, use) => {
    const context = await getSharedContext(browser, storageState);
    // Deliberately not closed here: cached and reused by later tests in
    // this worker that request the same storageState identity. Playwright
    // tears down the worker process (and everything in it) at the end of
    // the run.
    await use(context);
    await persistAuthState();
  },
  page: async ({ context }, use, testInfo) => {
    // `context` came through getSharedContext() above, so newPage() here is
    // already the instrumented version (see instrumentPage()) — goto/reload
    // settle before this fixture (or the test) ever proceeds.
    const page = await context.newPage();
    await use(page);
    const path = await saveDemoVideo(page, testInfo.title);
    if (path) {
      await testInfo.attach('demo-video', { path, contentType: 'video/webm' });
    }
  },
});
// Save after page teardown, when pending refresh requests can no longer
// rotate cookies after the snapshot. afterEach runs too early for fast failures.
export async function persistAuthState() {
  await Promise.all(pendingSaves.values());
  for (const [key, context] of contextCache) {
    if (key.endsWith('.json')) await (await context).storageState({ path: key });
  }
}
export { expect };
