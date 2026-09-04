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
| `fixtures.ts` | Exports `login(page)` helper + Playwright `test`/`expect`. |
| `login.spec.ts` | Login page rendering, unauth redirect, invalid-credentials path. |
| `shell.spec.ts` | Dashboard, **⌘K command palette**, theme toggle persistence, mobile sidebar. |
| `critical-paths.spec.ts` | Patient list/search + Appointment calendar smoke tests. |

## Auth

By default, tests log in as the seeded admin `admin@clinic.local` / `Admin123!`. Override with env vars:

```bash
E2E_USERNAME=admin@clinic.local E2E_PASSWORD=Admin123! npm run test:e2e
```

## Configuration

`playwright.config.ts` is wired to:

- Start `npm run dev` automatically on first run (skip with `PLAYWRIGHT_NO_SERVER=1`).
- Retry once on CI, no retries locally.
- Save trace/screenshot/video on the first failure.
- Use the system Chromium by default. Add Firefox/WebKit under `projects` when needed.

## Skipping tests that need seed data

If you don't have a seeded backend, the `critical-paths` and `shell` specs will fail at the `login()` step. To skip them in dev:

```bash
npx playwright test login.spec.ts
```

## Adding new tests

Keep these rules:

1. **Resilient selectors.** Prefer `getByRole`, `getByLabel`, `getByText(/regex/i)` over CSS classes.
2. **No hard-coded copy.** Use regex with case-insensitive flag for Vietnamese text.
3. **Isolate state.** Each test logs in via `beforeEach({ page }) => login(page)`.
4. **Network-idle waits.** Use `waitForLoadState('networkidle')` after navigation.
5. **No external dependencies.** No mocks — these tests assume the real backend.