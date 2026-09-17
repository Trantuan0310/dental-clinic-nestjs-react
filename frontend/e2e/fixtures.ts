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

const contextCache = new Map<string, Promise<BrowserContext>>();

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
    cached = browser.newContext({
      storageState: resolvedState,
      timezoneId: 'Asia/Ho_Chi_Minh',
      ...(process.env.E2E_RECORD_VIDEO
        ? { recordVideo: { dir: process.env.E2E_VIDEO_DIR ?? 'artifacts/playwright-videos', size: { width: 1280, height: 720 } } }
        : {}),
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
  for (const [key, context] of contextCache) {
    if (key.endsWith('.json')) await (await context).storageState({ path: key });
  }
}
export { expect };
