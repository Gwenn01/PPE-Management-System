# Phase 17 UI and interactive acceptance checklist

## Enterprise UI refinement — 2026-10-25

The existing uncommitted Phase 18 redesign was retained and extended with coordinated landing/authentication screens, a navy navigation shell, updated shared typography/cards/fields/table spacing, permission-filtered module search, public mobile navigation, and table filter reset/count feedback.

- Existing service and domain suite: **143 passed, 14 suites, zero failures**. Includes all eight role navigation allowlists and scoped authentication.
- Final `npm run build` (including TypeScript) and `npm run lint`: **passed**. The build still reports large-chunk and mixed static/dynamic database-import warnings. `git diff --check` passed.
- No service/domain/seed, dependency manifest or lockfile changes are part of this refinement.
- Browser verification: **not executed**. Browser setup returned `No browser is available`; discovery returned `[]`. Automated results do not establish rendered layout, interaction, focus order or contrast.
- Manual additions: Ctrl/Cmd+K and the topbar search button; role-scoped results; search with no matches; clear search; keyboard link selection; Escape and focus restoration; no search opening over another dialog/mobile drawer; table clear filters and result counts; mobile public menu; sign-in and registration at 320px and 200% zoom; password visibility and validation states.
- Repeat the existing viewport/role/workflow matrix below, including desktop layouts, form errors and report downloads.

Status: Automated checks passed; interactive browser acceptance is NOT EXECUTED. The connected browser runtime reported no available browser (`[]`). This checklist remains a manual acceptance gate, not automated E2E evidence.

Use fictional data and a separate browser profile/origin. Run `npm run dev`, then repeat production-sensitive checks with `npm run build` and `npm run preview`. Test both municipalities and all eight accounts listed in README. Record browser/version, viewport, actual result, screenshot/error and date for each check.

| Check | Required observations |
| --- | --- |
| A: account lifecycle | Register; Pending login denied; local Administrator approves; account activates and logs in; foreign Administrator cannot review; reject/disable prevents login; refresh/logout/Remember Me behave as described |
| B: acquisition | Property draft validation, document upload, submit; Approving approve/return/reject and history; Accounting recognize once; refresh registry/report totals match persisted cost |
| C: construction | Assigned Engineering only; Budget return/resubmit; Regular Fund direct route; Trust Fund external Treasury evidence required; Accounting acknowledgment, CIP qualification/exclusion, completion/readiness evidence, capitalization approval creates one PPE record and transfers CIP |
| D: inventory | Create session, asset lookup, found/missing observation, duplicate check validation, discrepancy investigation/evidence, returned proposal, approved correction and immutable history |
| E: lifecycle | Transfer, maintenance and disposal draft/submit/review/approve/execute; Accounting disposal review; invalid transitions and duplicate execution denied; asset/history/accounting effects survive refresh |
| F: reconciliation | Period/import validation, exact-centavo mismatch, investigation/evidence, correction return/reject/approve, stale-source denial, once-only posting, refresh/reconcile/complete and Auditor report |
| Access | Directly enter every permitted/forbidden route for each role; Auditor writes absent/denied; foreign IDs and forged municipal scope denied; revoked grants/disabled account cease access |
| CRUD/UI | For each module exercise every offered create/edit/archive/delete action, required fields, invalid values, duplicate identifiers, cancel, close, Escape, confirm, error retry and loading/empty states; retained posted/audit/workflow records should refuse destructive edits |
| Tables/navigation | Search/case/whitespace, all filters, sort both ways, first/last/empty page, shrink results while on last page, module links/back/forward, mobile menu; report preview pagination retains whole-report totals |
| Documents | Upload valid/invalid/oversized files, open PDF/image/text/metadata-only preview, change files quickly, close/reopen, download actual bytes; no previous-file flash or leaked object URL |
| Persistence/data tools | Hard refresh and browser reopen after mutations; export JSON, validate/import unchanged export, reject malformed/foreign/stale protected data; reset wrong/correct/expired phrase, retained audit and other municipality, revoked session; JSON excludes attachment binaries |
| Exports/calculations | Open generated PDF/XLSX in viewers; verify headings, dates, municipality, all rows across preview pages and centavo totals against records; long text and spreadsheet formula-like input; no print clipping |
| Responsive | 360, 768, 1024 and 1440px widths; 200% zoom; no inaccessible controls, overlapping dialogs or unintended page overflow; tables can scroll horizontally |
| Dashboard scrolling | At every role, long page content scrolls in the main region while sidebar and topbar remain fixed; short viewports allow sidebar navigation to scroll independently with branding and role footer available |
| Mobile navigation | At 320, 360, 375, 390 and 430px, open drawer; verify backdrop, body scroll lock, independent drawer scrolling, link/outside/Escape dismissal, focus containment and focus return |
| Full viewport matrix | Check 320×700, 360×800, 390×844, 430×932, 768×1024, 820×900, 1024×768, 1280×720, 1366×768, 1440×900 and 1920×1080 across all eight roles and each accessible module |
| Accessibility | Keyboard-only completion, skip link, visible focus, menu/dialog focus containment/restoration, Escape, labels/errors/live statuses, sortable headers/pagination, contrast, screen reader and reduced motion |
| Runtime | Observe browser console/network through every flow; no uncaught exceptions, broken imports/assets, accidental business HTTP calls or duplicate submissions; verify production account switcher unavailable |

Service integration tests already exercise domain transitions, authorization, import/reset, source calculations and IndexedDB reopen behavior under fake-indexeddb. They do not establish that browser forms, downloads or accessibility work end to end. A repeatable browser E2E suite and assistive-technology audit remain outstanding.

# Phase 18 SaaS redesign acceptance

Reference images were inspected. All eight roles use the revised shared shell and dashboard composition. Feature headers, controls, operational tabs and panels now use named design classes; outer width caps were removed in source. Coverage and conventions are documented in `DESIGN_SYSTEM.md`.

Browser status: NOT EXECUTED. The Browser runtime returned `No browser is available` and browser discovery returned `[]`. No before/after application screenshots, visual comparison, browser zoom checks or interactive viewport results are claimed.

Automated verification completed: `npm run typecheck` PASS; `npm run lint` PASS; `npm test` PASS (143 tests, 14 suites, zero failures); `npm run build` PASS. The build retains its existing large-chunk and mixed static/dynamic database-import warnings. Tests cover services, roles, municipality access, workflow transitions and persistence through fake-indexeddb, not browser interactions. No existing tests were removed or weakened.

The remaining browser acceptance matrix is 320, 360, 390, 430, 768, 1024, 1280, 1366, 1440 and 1920px. For every role, inspect Dashboard Home and every permitted route. Confirm full page width, readable KPIs, full-width records, independent sidebar/main scrolling, active navigation, and mobile drawer focus/scroll restoration. Exercise search, filters, sorting, pagination, record details, the Auditor category selector, CRUD confirmations, upload/preview, export, and refresh persistence using a separate test profile. Mobile record lists should display cards without horizontal table scrolling. Desktop wide tables may scroll inside their own containers.

Also inspect long names/currencies/statuses, short viewport heights, long modal content, empty/error/loading states, 200% zoom and reduced motion. Services, seeds, permissions and schema must remain unchanged by presentation work.

## Phase 18 refinement verification — 2026-10-25

- PASS: `npm run typecheck` (also executed as part of the production build).
- PASS: `npm run lint`.
- PASS: `npm test` — 143 tests across 14 suites, zero failures.
- PASS: `npm run build` — TypeScript and Vite production build completed. Existing large-chunk and mixed static/dynamic import advisories remain.
- PASS: source audit verified the role-specific primary dashboard links resolve only to routes granted to each role; the Budget dashboard presents four processing KPIs and two supporting counts separately.
- PASS: route-level coverage and verification boundaries are recorded in `DESIGN_SYSTEM.md`.
- NOT EXECUTED: browser visual, keyboard, viewport, and click acceptance. Browser discovery returned no connected browsers (`[]`); no rendered result is claimed.

## Targeted recovery and dashboard correction — 2026-10-25

- Restored `LandingPage`, the changed hero/navbar/get-started components, `AuthLayout`, `TextField`, `SelectField`, `LoginPage`, and `RegisterPage` from the recoverable pre-redesign `HEAD`. Their diffs were presentation-only; the restored auth files retain the committed current validation, session, persistence and registration behavior.
- Restored the original palette values (`#8B8B8B` gray and `#F2F3F4` mist). Dashboard control/layout rules are scoped to `.dashboard-shell` and `.dashboard-dialog`.
- Replaced the generic role status breakdown with a 12-column role-specific Bento composition. Administrator sees the full pending registration queue, current audit timeline, account status totals, active department/user counts and a searchable recent administrative records table. Other roles receive scoped asset-category, posted account, inspection progress, approval, audit, construction or Budget routing panels.
- The desktop frame uses a full-height `#1F305E` sidebar, rounded connected white workspace, integrated 64px topbar, compact KPIs and independently scrolling content.
- PASS: `npm run typecheck`, `npm run lint`, `npm test` (143 tests, 14 suites, zero failures), `npm run build`, `git diff --check`.
- NOT EXECUTED: Browser screenshot and click/keyboard/viewport checks. The available browser runtime has no connected browser; source and build checks are not visual verification.
