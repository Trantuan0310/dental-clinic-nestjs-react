# Dark mode and English UI correction plan

## Goal
Switching Vietnamese/English and light/dark must update interface text, preserve
preferences on reload, keep controls legible, and retain working navigation/forms.
Do not translate patient names, service names or server-provided clinical content.
Do not change clinic timezone, API values, permissions, or business rules.

## Execution and ownership
Six gpt-6-luna agents handle bounded domains; the coordinating agent integrates
resources, reviews changes, runs browser checks and reports remaining gaps.
Each domain gets a separate locale module exporting `vi` and `en` objects. Existing
translation keys must be reused when suitable; no concurrent edits to en.json,
vi.json or locales/index.ts. The coordinator registers new domain keys.

1. Foundation: shared UI components, shell, locale/theme stores. Resource uiCommon.ts.
   Check persistence, menu/focus, shared labels, pagination, statuses, empty/error
   states, date/time/currency formatting helpers, dark controls and contrast.
2. Clinical: patient and medical-record screens. Resource uiClinical.ts.
   Prioritize list/detail/create/edit, encounter tabs, dental chart and dialogs.
3. Scheduling: appointments, schedule, booking. Resource uiScheduling.ts.
   Prioritize calendar/list, booking form/status, dates, errors and selection labels.
4. Operations: billing, inventory, expenses, reports. Resource uiOperations.ts.
   Check headers, filters, tables, totals, empty/error states and modal contrast.
5. Workforce: payroll, staff, shift, admin, catalog. Resource uiWorkforce.ts.
   Check main navigation destinations, list/filter/dialog text and dark surfaces.
6. Entry/dashboard: landing, authentication, dashboard. Resource uiEntry.ts.
   Check visible labels, cards, charts, error states and public white/dark surfaces.

## Required implementation rules
- Use existing react-i18next; never replace business values with translated values.
- Text must react immediately to locale change: no frozen module-level translations.
- Use semantic dark surface/text/border tokens; avoid blanket CSS color overrides.
- Translate visible headings, buttons, labels, placeholders, status, validation,
  loading/empty/error and accessible names in each corrected flow.
- Keep Vietnamese copy and behavior intact. Do not translate saved clinical data.
- No dependencies, commits, push or deployment as part of this work.
- Report exact corrected files, checks and known gaps, not claims of full coverage.

## Browser validation matrix
Modes: VI/light, VI/dark, EN/light, EN/dark.
Widths: 375px and 1440px for representative routes; 320px stress checks for shared
controls and forms. Use the actual language/theme controls and verify reload.

Representative routes: login, dashboard, patients, patient form, encounter detail,
appointments, schedule, public booking, inventory, invoice list, reports, expenses,
employees, users and payroll. API fixtures cover filled, empty and failure states.

Assertions: correct language/html lang, no raw translation keys, no untranslated
static labels in corrected flows, no document overflow, readable computed dark
colors, focus/keyboard behavior and persisted independent theme/locale settings.
Wait for theme transitions before screenshots. Inspect representative screenshots.

## Completion evidence
Run production build (tsc -b + Vite), ESLint on changed source, resource-key parity,
existing relevant UI checks and the new theme/language checks. Save screenshots in
frontend/artifacts/theme-language. Report what passes, uncovered routes/strings,
and that fixture checks do not establish live backend E2E correctness.
