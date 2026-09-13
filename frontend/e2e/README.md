# E2E Tests (Playwright)

End-to-end tests live in this folder and exercise the **running stack** (frontend dev server + backend API). They are intentionally kept thin and resilient to i18n / copy churn — they assert structure (elements, routes, behaviors), not exact wording.

## Quick start

```bash
# 1. Make sure the backend is running on :3000 and the frontend on :5173
#    (or just `npm run dev` from /frontend — playwright.config.ts will start it).

# 2. Install browser binaries (one-time, downloads ~150 MB)
npm run test:e2e:install

# 3. Run all tests headlessly
npm run test:e2e

# Or with the Playwright UI
npm run test:e2e:ui
```

## Structure

| File | Purpose |
|------|---------|
| `global-setup.ts` | Logs in once as admin and once as dentist, saves each session to `e2e/.auth/*.json`. |
| `fixtures.ts` | Exports `login(page)`/`logout(page)` (used by `login.spec.ts`, which deliberately starts unauthenticated), `getSharedContext(browser, storageState)`, Playwright `test`/`expect` (with `context`/`page` overridden — see Auth below), and `type Page`. |
| `flow-helpers.ts` | Shared helpers for the `flow-*.spec.ts` detailed-journey specs: `loginAs()`, seeded `ACCOUNTS`, `isoDateOnly()`, `randomVnPhone()`. |
| `login.spec.ts` | Login page rendering, unauth redirect, invalid-credentials path. |
| `shell.spec.ts` | Dashboard, **⌘K command palette**, theme toggle persistence, mobile sidebar. |
| `critical-paths.spec.ts` | Patient list/search + Appointment calendar smoke tests. |
| `flow-*.spec.ts` | Full multi-step, multi-role business journeys (patient→payment, payroll period cycle, inventory stock-out, expense approval, shift registration) rather than single-page smoke checks. |

## Auth

Every spec except `login.spec.ts` starts **already authenticated** via a saved `storageState` (see `playwright.config.ts` / `global-setup.ts`) instead of submitting the login form per test — `POST /auth/login` is throttled to 5 requests/60s, which a full suite of individual per-test logins used to exhaust almost immediately.

By default, `global-setup.ts` logs in as the seeded admin `admin@clinic.local` / `Admin123!` and dentist `an.nguyen@clinic.local` / `Password123!`. Override with env vars:

```bash
E2E_USERNAME=admin@clinic.local E2E_PASSWORD=Admin123! \
E2E_DENTIST_USERNAME=an.nguyen@clinic.local E2E_DENTIST_PASSWORD=Password123! \
npm run test:e2e
```

**The saved session's refresh-token cookie is single-use.** The app calls `POST /auth/refresh` on every fresh page load (no in-memory access token survives across a brand-new browser context), and the backend rotates-and-invalidates that cookie on every refresh — reusing it from a second independent context trips `TokenReuseDetectedException` and revokes every session for that user (see `backend/src/auth/auth.service.ts`). This used to fail the majority of the suite, since every test's default `page` opened its own fresh context off the same frozen snapshot. `fixtures.ts` now overrides the default `context`/`page` fixtures to cache one long-lived, continuously-rotating context per distinct `storageState` value **within a worker process** — so tests that just read the pre-authenticated `page` fixture share one valid session instead of each reading a one-shot snapshot. This fully covers CI (`workers: 1`, one process). Locally, two different parallel worker processes can still race each other on the very first read of a given snapshot — a narrow, first-use-only window, not the guaranteed every-test failure this used to be.

**Consequence for anyone writing a new test:** never call `login()`/`logout()`/`loginAs()`, or otherwise mutate cookies (`context.clearCookies()`, manual `document.cookie` writes), on the default `page`/`context` fixture — that shared, cached context is reused by every other test in the worker that expects to still find its own role's session there afterward. A test that needs to log in for real (to test the login flow itself, or to drive a second/third role inside one multi-actor test) must open its own disposable session instead:

```ts
// Own throwaway context — safe to log in on, safe to mutate. The empty
// storageState is NOT optional: the `browser` fixture inherits
// use.storageState (admin.json) from playwright.config.ts as a default for
// ANY context it creates, including ones you construct yourself — a bare
// browser.newContext() comes back pre-authenticated as admin, so
// loginAs() below would goto('/login'), get silently bounced back to the
// dashboard, and hang for the full test timeout on a login form that's
// never going to appear. (Diagnosed live in
// appointment-booking-roles.spec.ts — see freshContext() there.)
const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
const page = await context.newPage();
await loginAs(page, email, password);
// ... 
await context.close();

// Need one of the two pre-baked role snapshots inside a multi-actor test
// instead? Use getSharedContext() rather than a raw
// browser.newContext({storageState: 'e2e/.auth/dentist.json'}) — the cache
// is what avoids the single-use-snapshot collision when more than one spec
// file reads the same role. Only close the *page* you opened from it, never
// the context itself.
const dentistCtx = await getSharedContext(browser, 'e2e/.auth/dentist.json');
const dentistPage = await dentistCtx.newPage();
// ...
await dentistPage.close(); // not dentistCtx.close()
```

See `appointment-booking-roles.spec.ts` (dedicated fresh contexts, real logins) and `flow-patient-to-payment.spec.ts` / `flow-inventory-stock-out.spec.ts` / `flow-shift-registration.spec.ts` (mix of both patterns) for worked examples.

## Configuration

`playwright.config.ts` is wired to:

- Start `npm run dev` automatically on first run (skip with `PLAYWRIGHT_NO_SERVER=1`).
- Retry once on CI, no retries locally.
- Save trace/screenshot/video on the first failure.
- Use the system Chromium by default. Add Firefox/WebKit under `projects` when needed.

## Rate limiting on a full run

The backend's general API throttle (`THROTTLE_LIMIT`/`THROTTLE_TTL` in `backend/.env`, default 100 requests/60s per IP — a real production safety feature, not test-specific) is shared across the whole suite since every test hits the same dev backend from the same machine. Running the full ~55-test suite back-to-back can burn through that budget partway through, and any page whose query gets a genuine 429 will correctly show its error state (not a false "no data" one) rather than the table/chart it normally would — a handful of failures on `/patients`-heavy specs on a full run is usually this, not a regression. Bump `THROTTLE_LIMIT` in your local `backend/.env` if you want a clean full-suite run; don't lower it in the shared dev seed or in production.

## Skipping tests that need seed data

If you don't have a seeded backend, `global-setup.ts` will fail to log in and the whole run aborts. To skip it in dev:

```bash
npx playwright test login.spec.ts
```

## Adding new tests

Keep these rules:

1. **Resilient selectors.** Prefer `getByRole`, `getByLabel`, `getByText(/regex/i)` over CSS classes.
2. **No hard-coded copy.** Use regex with case-insensitive flag for Vietnamese text.
3. **Isolate state.** New specs get the authenticated `storageState` for free (see Auth above) — only call `login()`/`logout()` directly if a test needs to exercise the auth flow itself.
4. **Network-idle waits.** Use `waitForLoadState('networkidle')` after navigation.
5. **No external dependencies.** No mocks — these tests assume the real backend.