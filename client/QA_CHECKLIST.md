# Phase 16 interactive acceptance checklist

Status: NOT EXECUTED. Browser runtime returned `No browser is available`; connected-browser discovery returned `[]`. This checklist is a remaining acceptance gate, not automated E2E evidence.

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
| Accessibility | Keyboard-only completion, skip link, visible focus, menu/dialog focus containment/restoration, Escape, labels/errors/live statuses, sortable headers/pagination, contrast, screen reader and reduced motion |
| Runtime | Observe browser console/network through every flow; no uncaught exceptions, broken imports/assets, accidental business HTTP calls or duplicate submissions; verify production account switcher unavailable |

Service integration tests already exercise domain transitions, authorization, import/reset, source calculations and IndexedDB reopen behavior under fake-indexeddb. They do not establish that browser forms, downloads or accessibility work end to end. A repeatable browser E2E suite and assistive-technology audit remain outstanding.
