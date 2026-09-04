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
| `fixtures.ts` | Exports the `login(page)`/`logout(page)` helpers (used by `login.spec.ts`, which deliberately starts unauthenticated) + Playwright `test`/`expect`. |
| `login.spec.ts` | Login page rendering, unauth redirect, invalid-credentials path. |
| `shell.spec.ts` | Dashboard, **⌘K command palette**, theme toggle persistence, mobile sidebar. |
| `critical-paths.spec.ts` | Patient list/search + Appointment calendar smoke tests. |

## Auth

Every spec except `login.spec.ts` starts **already authenticated** via a saved `storageState` (see `playwright.config.ts` / `global-setup.ts`) instead of submitting the login form per test — `POST /auth/login` is throttled to 5 requests/60s, which a full suite of individual per-test logins used to exhaust almost immediately.

By default, `global-setup.ts` logs in as the seeded admin `admin@clinic.local` / `Admin123!` and dentist `an.nguyen@clinic.local` / `Password123!`. Override with env vars:

```bash
E2E_USERNAME=admin@clinic.local E2E_PASSWORD=Admin123! \
E2E_DENTIST_USERNAME=an.nguyen@clinic.local E2E_DENTIST_PASSWORD=Password123! \
npm run test:e2e
```

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