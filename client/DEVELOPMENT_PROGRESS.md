# PPE Management System — Development Progress

Current status: Phases 00–03 are complete. Earlier sections are historical; Phase 03 records the current demo authentication/session behavior. The user's actual phase scopes supersede the provisional sequence in the original audit. Full business modules remain future work.

## Phase 00 — Project audit and preparation

Status: complete (2026-10-22). Changes are documentation only. No application behavior, dependencies, styles, or business modules were changed.

Project: frontend-only Accounting Information System for Property, Plant, and Equipment Management for Botolan and San Antonio, Zambales.

### Verification scope

Reviewed every application source file, package scripts, TypeScript/ESLint/Vite configuration, public asset paths, and the lockfile. Findings below are based on source inspection and successful baseline compilation/linting. Interactive browser behavior, visual layouts, keyboard navigation, and deployment rewrites were not tested in this phase. No applicable AGENTS.md was found in the workspace or its ancestor directories. The initial Git working tree was clean.

The five detailed flowcharts were not supplied in this session or found among the client files. The proposed sequence follows the five workflow summaries in the project brief; exact transitions and office responsibilities remain provisional.

### Existing structure and dependencies

| Location | Current responsibility |
| --- | --- |
| `src/main.tsx` | React root, StrictMode, global CSS, App |
| `src/App.tsx` | CurrentUserProvider, BrowserRouter, public routes, nested dashboard routes generated from navigation |
| `src/pages/` | Landing, login, registration |
| `src/pages/dashboard/` | Role-specific module directory and shared module placeholder |
| `src/layouts/DashboardLayout.tsx` | Sidebar, sticky topbar, responsive main content and Outlet |
| `src/components/landing/` | Navbar, hero, highlights, about, features, process, CTA, footer, reveal animation |
| `src/components/auth/` | Shared branded layout, input/select fields, password visibility |
| `src/components/dashboard/` | Sidebar, Topbar, RequireRole |
| `src/config/` | Six-role registry and navigation/access arrays |
| `src/context/`, `src/hooks/` | Static user provider/context and useCurrentUser |
| `src/data/options.ts` | Two municipality labels and five requestable role labels; no domain seed records |
| `src/index.css` | Tailwind 4 import, palette tokens, typography, scroll behavior |
| `public/iamges/` | Existing landing/auth photography; spelling matches component references and files |

Declared stack: React/React DOM `^19.2.8`, React Router DOM `^7.18.4`, Tailwind and its Vite plugin `^4.3.3`, Lucide React `^1.59.0`, Axios `^1.20.0`; TypeScript `~6.0.2`, Vite `^8.3.0`, ESLint `^10.10.0`. A package-lock.json is present. Axios is installed but unused. No IndexedDB wrapper, runtime validation library, report export library, test runner, or test script is configured. Native IndexedDB remains an option; no new dependency was selected or installed.

### Feature assessment

| Area | Working in existing source | Incomplete or placeholder |
| --- | --- | --- |
| Landing | Composed branded sections, local photographs, section anchors, login links, IntersectionObserver reveals with reduced-motion classes | Static marketing content describes workflows that do not exist. Audience list has only six roles. Accounting/compliance claims need demo wording in a later authorized phase. Navbar Home styling is fixed rather than section-aware; section links are hidden on small screens without an alternate menu. |
| Login | Controlled fields, required-value checks, password reveal, remember checkbox, registration/home links | Valid submission ends at TODO: no identity lookup, session, redirect, async state or credential error. Remember has no persistence effect. `/forgot-password` is not routed and falls through to `/`. |
| Registration | Name/email checks, minimum password length, confirmation match, municipality/role selects | Valid submission ends at TODO: no saved request, duplicate check, administrator review or confirmation. Role/municipality validation checks nonempty strings rather than enum membership. |
| Dashboard shell | Responsive classes, mobile menu/backdrop and close handlers, grouped active links, current route title, static user display | No authentication gate, municipality context, notifications or real session handling. Mobile focus behavior requires work. |
| Role preview | Six-role selector updates context, cards, sidebar and guards; selected role persists under `ppe-dev-role` | Available in production builds too; hidden below `sm`. This is a preview control, not an authenticated identity/permission system. |
| RequireRole | Checks role membership and redirects disallowed module routes to `/dashboard` | No authenticated/disabled/pending-user state, municipality check, action permissions, service-level enforcement or access-denied explanation. |
| DashboardHome | Welcome/responsibility text and module cards derive from current role/navigation; auditor has read-only notice | No operational metrics, task queues, record queries or workflow data. No invented numerical metrics are currently displayed. Auditor read-only is only descriptive because no mutations exist yet. |
| ModulePage | Displays route-specific title, icon and description | All 23 non-home module destinations render the same explicit unbuilt-screen message. No domain forms, tables, filters, pagination, dialogs, reporting or transaction actions exist. |
| Logout | Navigates to `/login` | Does not clear identity/role storage or invalidate access; dashboard remains directly reachable. |

### Role and navigation coverage

All six configured roles can reach dashboard home. The following lists are the current module allowlists, not proposed business permissions. Administrator has no implicit access to every route.

| Required role | Configured? | Existing non-home paths under `/dashboard/` |
| --- | --- | --- |
| Administrator | Yes | `users`, `departments`, `permissions`, `settings`, `audit-trail` |
| Property Officer | Yes | `assets`, `construction-projects`, `discrepancies`, `transfers`, `maintenance`, `disposal` |
| Accounting Officer | Yes | `assets`, `recognition`, `depreciation`, `cip-costs`, `disposal-review`, `reconciliation`, `reports` |
| Inventory Personnel | Yes | `assets`, `physical-inventory`, `asset-monitoring` |
| Approving Officer | Yes | `approvals/registrations`, `approvals/capitalization`, `approvals/corrections`, `approvals/lifecycle`, `reports` |
| Auditor | Yes | `assets`, `reports`, `audit-trail` |
| Engineering Office | No | No identity, role identifier, label, responsibilities, navigation, guard assignment or request option |
| Budget Office | No | No identity, role identifier, label, responsibilities, navigation, guard assignment or request option |

Registration offers five roles: it excludes Administrator as well as both missing offices. Excluding Administrator from self-service requests may be intentional; keep administrator provisioning explicit rather than assuming it belongs in the public selector.

Navigation already names most high-level PPE workflows, but every module is unimplemented. No explicit destinations exist for acquisition intake/supporting-document review, Engineering construction-document submission/review, Budget funding/document validation, or preparing/submitting capitalization before approval. These may become views within existing modules instead of separate sidebar entries. Exact office permissions and document queues require the flowcharts. There is also no functional account-request review, correction preparation/resubmission, or cross-role inbox behind existing labels.

### Architectural findings

1. **Authentication:** CurrentUser is always non-null and contains only name, email and role. Provider restores a valid preview role or defaults to Administrator without login. There are no user IDs, account status, municipality IDs or sessions. Backend/API TODO comments describe a different direction from the authorized frontend-only plan; replace them when implementing mock services, not with HTTP calls.
2. **Permissions:** `navItems` is usefully shared by sidebar, cards and route guards, but duplicates the role registry in its `all` array. Navigation visibility is not sufficient for read/write/submit/approve permissions. Auditor immutability and administrator scope are undefined at a transaction level. Future service commands must check permissions independently of UI controls.
3. **Municipality separation:** Botolan/San Antonio appear only in registration options. Neither identity nor any record carries municipality scope, and no queries enforce separation. UI copy promising scoped records is aspirational. Future repositories must scope reads, writes, references, queues and reports; guessing an ID must not expose another municipality in the demo.
4. **Persistence:** No JSON domain seeds, IndexedDB database, schema, migrations, repositories or initialization exist. The only persistence is the preview-role preference in localStorage. There is no business data to recover, reset or synchronize.
5. **Service boundary:** No typed application request/response contracts or service implementations exist. Components currently hold local form state; future domain requests must go through replaceable typed services, with mock repositories behind them.
6. **Routing:** `/`, `/login`, `/register` and `/dashboard` are present. Non-home dashboard children use RequireRole; dashboard layout/index do not require a session. Unknown dashboard URLs redirect to dashboard home and other unknown URLs redirect to landing. No detail routes or explicit not-found/forbidden views exist. BrowserRouter hosting will require an SPA fallback; hosting configuration is not present here.
7. **Cross-role transactions:** No workflow states, transition guards, record version checks, consistent multi-record updates, return/reject reasons, approval history or shared queues exist. Independent component state would lose changes and allow contradictory records; mutations need central workflow commands and IndexedDB transactions.
8. **Accounting/reporting/auditing:** No ledger/subledger, reconciliation snapshots, CIP balances, capitalization, depreciation, exports, audit events or policy configuration exists. Report and audit links are placeholders. Demo policies must be explicit, configurable and recorded with calculations; browser audit records cannot provide production tamper resistance.
9. **Typing and verification:** Existing models use TypeScript without explicit `any`, but neither TypeScript project enables `strict`; build success does not imply strict null checking. Form selections are free strings and role preview uses casts. No automated behavior tests are configured. Tightening compiler settings should be scoped to a later authorized phase.
10. **Accessibility and resilience:** Labels and aria-invalid exist; errors lack aria-describedby/live announcements. Mobile sidebar lacks focus trapping/restoration, Escape handling and an inert/hidden state for offscreen links. No app error boundary or shared async loading/error/empty/notification patterns exist. These are source findings; visual contrast and screen-reader behavior remain unverified.

### Design foundation to preserve

- Tailwind `@theme`: navy `#1f305e`, derived navy-dark, charcoal/ink `#2c2c2b`, gray `#8b8b8b`, mist `#f2f3f4`, derived line/chip neutrals.
- Inter-first system font stack; no bundled or imported Inter font was found, so installed fonts determine fallback rendering.
- Existing imagery, Landmark identity, Lucide icons, rounded surfaces, bordered cards, pill buttons and responsive spacing/layout patterns.
- Reuse AuthLayout, DashboardLayout, Sidebar, Topbar, field components, navigation helpers and public landing components. Extend their behavior incrementally.
- `index.html` still uses the generic title `client`; record as a later polish task. Do not rename the existing `iamges` asset directory during unrelated feature work.

### Architectural decisions for future authorized phases

These are implementation constraints and proposed organization, not completed infrastructure.

- Keep the app frontend-only. Do not add a backend, external database, real authentication, or network-based business operations. Axios remains unused until a separate future HTTP implementation is explicitly requested.
- Use local JSON only as initial seed input. Initialize a versioned IndexedDB database once; subsequent edits write to IndexedDB, never source JSON. Seed/schema versions must prevent reloads from overwriting user changes. Explicit demo reset may reseed after confirmation.
- Reserve localStorage/sessionStorage for mock session references and lightweight preferences. Resolve the referenced identity against stored mock users; do not treat arbitrary role strings as a session. Use mock identities and describe authentication as a demo.
- Organize domain work by feature, with shared contracts, storage and UI primitives. Suggested boundaries: `features/auth`, `administration`, `assets`, `construction`, `inventory`, `lifecycle`, `accounting`, `reports`, `audit`; shared typed services/repositories/database support. Add folders only as phases need them.
- Components call asynchronous typed service interfaces, which accept validated request models and return typed results/errors. Mock implementations use repositories and central permission/workflow rules. Keep IndexedDB details out of components and service contracts independent of HTTP.
- Define stable IDs, municipality IDs, eight-role identifiers, action permissions, workflow status unions and record versions. Derive navigation access from shared permissions where practical while preserving existing paths and labels.
- Require active mock identity plus municipality scope for every domain service call. Enforce scope on related-record references and aggregates as well as individual records. Default to municipality-local access; any cross-municipality administrator access requires an explicit policy decision.
- Use one IndexedDB transaction for related record changes, approval history and audit events. Reject stale versions and invalid transitions; do not show success until persistence commits. Define event actor, municipality, entity, action, timestamp, reason and relevant change details.
- Derive future metrics, reports and queues from current scoped persisted records. Invalidate/refetch affected views after successful commands and expose loading/error/empty states. Do not introduce hardcoded dashboard totals.
- Treat depreciation, recognition thresholds, useful lives, residual values and capitalization rules as configurable DEMO settings, with policy versions attached to affected calculations. Do not claim legal verification.
- Introduce meaningful tests with the first behavioral implementation: permissions, municipality isolation, initialization persistence, transaction rollback, transition guards and session lifecycle. Select tooling then; do not add it solely for this documentation phase.

### Proposed implementation sequence

Only Phase 00 is authorized/completed. The sequence below is provisional; the user's next phase instructions govern scope and numbering.

| Proposed phase | Scope | Dependency and completion evidence |
| --- | --- | --- |
| 01 — Shared foundation and demo access | Eight roles/municipalities, typed identities/contracts, JSON seeds, IndexedDB initialization/repositories, mock authentication/session/route guards, common permission and audit primitives | Preserve existing UI; verify seed-once behavior, persisted changes, login/logout, role denials and municipality isolation. Build only minimal shared dependencies required by the specified phase. |
| 02 — Acquisition and asset recognition | Asset intake/registration, supporting documents, review/return/reject/approval, recognition and configurable demo costs | Depends on foundation and clarified flowchart; verify cross-role handoffs and consistent record/history updates. |
| 03 — Construction, CIP and capitalization | Engineering/Budget document processing, CIP cost accumulation, completion and capitalization | Depends on recognized asset model and explicit office responsibilities; verify approvals and cost transfer without duplicate recognition. |
| 04 — Inventory and lifecycle | Inventory sessions, discrepancies, approved corrections, transfers, maintenance and disposal | Depends on asset registry/approval primitives; verify resulting asset/accounting effects and traceability. |
| 05 — Accounting reconciliation, reporting and audit | Demo depreciation policies, reconciliations, scoped metrics/reports/exports, audit review | Depends on persisted preceding transactions; verify reports against source records and auditor read-only permissions. |

### Assumptions and important dependencies

- The two municipality labels are correct; stable IDs and user assignments still need defining.
- Engineering Office and Budget Office are internal roles; proposed identifiers `engineering_office` and `budget_office` are not yet implemented. Their specific document approval powers must follow the detailed flowcharts.
- Current route allowlists are a starting point, not a verified action-permission matrix. Do not infer an Administrator business-approval override.
- Registration appears to request administrator confirmation, but account states and review rules are unspecified. Forgot-password behavior is also unspecified; any future recovery must remain explicitly simulated.
- Required document types, attachment limits/storage, acquisition duplicate rules, approval order, return/rejection/resubmission behavior, cancellation and effective dates are not defined in the available summaries.
- Cross-municipality transfers and shared administrators must not silently bypass isolation; define policy before implementing these cases.
- Existing marketing mentions QR scanning and PDF/Excel exports. Those claims do not establish Phase 01 scope; libraries and device access should be considered only when an authorized phase needs them.
- Browser storage is origin/profile-local and may be cleared by the user; there is no multi-device or municipal deployment synchronization in this architecture.
- Node/npm and the checked-in lockfile are available. No dependency installation was necessary for Phase 00.

### Baseline checks

Executed in `client/` on 2026-10-22 with Node `v22.16.0` and npm `10.9.2`.

| Check | Result |
| --- | --- |
| `npm run build` | PASS, exit 0. Runs `tsc -b && vite build`; Vite 8.3.4 transformed 1,956 modules and emitted production assets. |
| `npm run lint` | PASS, exit 0; no reported errors or warnings. |
| Automated behavior tests | Not available: no test script, runner or test files found. |
| Browser/visual/accessibility testing | Not performed; no runtime interaction claims are made by this audit. |

No baseline build/lint failures were found. Build output is ignored by Git; no application fixes were needed.

### Phase 00 changed files and remaining work

- Added `DEVELOPMENT_PROGRESS.md`: assessment, role/navigation coverage, gaps, design foundation, architecture decisions, dependencies, proposed sequence and baseline results.
- Updated `README.md`: concise frontend-only approach, current limitations, commands and progress link; existing template reference remains below it.
- Remaining: all functional domain modules, mock authentication, eight-role coverage, municipality scoping, typed services, JSON seeds, IndexedDB persistence, workflow histories, reports and audit behavior.
- Next required task: follow the user's Phase 01 scope, using this assessment and documenting unresolved flowchart assumptions. No future-phase implementation has begun.

## Phase 01 — Frontend architecture and role access

Status: complete (2026-10-22). Scope: typed architecture and eight-role access only. Existing public pages, dashboard shell, visual tokens and business module placeholders are preserved. No full module screens, backend calls, domain mutations, JSON database seeds, IndexedDB database or mock authentication sessions were implemented.

### Implemented foundation

- `roleList` is the canonical eight-role registry and derives the Role union. Labels, responsibilities and sample names/emails cover Engineering Office and Budget Office. Landing audiences and registration role choices derive from this registry; Administrator remains excluded from public account requests.
- Added all 21 requested domain interfaces in `src/domain/models.ts`: User, Municipality, Department, Asset, AssetRegistration, ConstructionProject, ProjectDocumentRouting, CIPCost, InventorySession, InventoryCheck, InventoryDiscrepancy, AssetTransfer, MaintenanceRequest, DisposalRequest, AccountingRecord, DepreciationPolicy, Reconciliation, ApprovalRequest, Document, AuditLog and Notification.
- Scoped records carry IDs, municipality, version and timestamps. Workflow records carry submission metadata and document references. Approval history models include actor, role, status changes, reasons and timestamps. Money is defined as integer centavos; dates and numeric constraints still require runtime validation when commands are implemented.
- WorkflowStatus and AssetLifecycleStatus are separate unions: an approved registration is not an operational asset lifecycle state. Construction progress and inventory session progress also remain independent of approval state.
- `src/domain/permissions.ts` defines typed resources and all eight requested actions: read, create, update, submit, approve, reject, export and manage. Each immutable grant identifies its resource, action, role and municipality scope. Unsupported combinations are denied; manage does not imply other actions.
- A shared access evaluator requires an active identity with an ID, a known municipality and an exact municipality match. It rejects missing identities, unknown roles, pending/disabled users and unsupported actions/resources. Administrator has explicit administration/audit grants only, with no municipality bypass and no implicit business approval access.
- Refactored navigation from per-route role arrays to resource/action requirements. Sidebar, dashboard cards and route guards use the central evaluator. Existing URLs remain; added metadata/routes for `asset-registration`, `engineering` and `budget`, all using the existing ModulePage until their phases are authorized. Dashboard home is guarded using its shared route metadata.
- Added RequirePermission and an accessible access-denied message with a working dashboard link. RequireRole remains a compatibility wrapper; App uses RequirePermission. A denied request navigates to `/dashboard/access-denied` without a redirect loop. Future record routes must pass the record's municipality explicitly.
- Existing preview identities now satisfy User, including stable municipality-specific IDs and demo status. The provider calls a typed demo identity service backed by a mock preference repository. Legacy `ppe-dev-role` values still restore; `ppe-dev-municipality` stores only the preview preference. Invalid choices are rejected; unavailable preference storage falls back to an in-memory preview.
- Dashboard home offers a municipality selector. Changing it selects a different municipality-specific mock identity; it never grants access to another municipality's records. The topbar retains the eight-role preview, with a dashboard-home role selector for small screens. User display shows the municipality where space permits.
- Added reusable typed service result/error, pagination, request-context, optimistic-version update and scoped read-service contracts. Feature UI lives under `src/features/access/`, pure models/policies under `src/domain/`, mock identity preferences under `src/mock/`, and replaceable interfaces/identity implementation under `src/services/`.
- Enabled application TypeScript strict mode. Added explicit typecheck/test commands and dependency-free Node unit tests compiled with a separate strict TypeScript test configuration. Test output is ignored by Git and ESLint. No dependencies or lockfile changes were necessary.

### Permission policy and unresolved assumptions

- All resources are municipality-local, including dashboard, users, departments, settings, permissions, reports and audit logs. There is no global administrative tenant mode. Future queries and commands must enforce this same policy and check municipality ownership of related records.
- Auditor has no create/update/submit/approve/reject/manage grants, including notifications. Auditor may read the existing assets/reports/audit destinations and export reports. No business record is mutable through the current UI.
- Property Officer prepares/submits registration and lifecycle requests; Approving Officer alone has the listed business approval/rejection grants. Accounting grants do not imply approval powers. Asset changes will be applied through future validated workflow commands rather than broad direct asset edits.
- Engineering may read construction projects and prepare/submit engineering documents. Budget may read construction projects and read/update/submit budget documents. Neither office has business approve/reject or accounting-posting grants. These are conservative demo assumptions pending the detailed flowcharts; no document routing process was implemented.
- Existing role-to-route access was preserved for the original six roles, with the additional registration route for Property Officer and construction/document destinations for the new offices. Existing absence of an Administrator asset/report override is deliberate.
- Notification recipient ownership, document-to-record visibility, permission configuration, reference integrity, self-approval prevention and workflow transition checks must be enforced by future services when those operations exist; the current resource-level evaluator does not claim to implement those record-specific rules.
- Permission definitions are static TypeScript configuration in this phase. The Roles & Permissions page is still the original placeholder; runtime policy editing is not implemented.
- Demo identity preview intentionally retains direct dashboard access and defaults to a Botolan Administrator. It does not authenticate or validate credentials. Login/register still perform local form validation only, and logout still navigates only. Authentication TODO comments now point to future typed mock services rather than backend APIs.
- DepreciationPolicy is explicitly marked `isDemo: true`. Method, useful life, residual percentage, recognition threshold and timing convention are model fields only. No legally verified accounting rules or calculations were introduced.

### Changed files

| Files | Purpose |
| --- | --- |
| `src/config/roles.ts`, `src/config/navigation.ts` | Eight-role registry and shared permission-based route metadata |
| `src/domain/models.ts`, `src/domain/municipalities.ts`, `src/domain/permissions.ts` | Domain contracts, municipal registry and explicit access rules |
| `src/features/access/RequirePermission.tsx`, `src/features/access/AccessDenied.tsx` | Resource/action guard and denied-access UI |
| `src/mock/demoIdentityRepository.ts` | Mock identity factory and lightweight preference storage |
| `src/services/contracts.ts`, `src/services/demoIdentityService.ts` | Typed request/result contracts and replaceable preview identity service |
| `src/context/CurrentUserContext.ts`, `src/context/CurrentUserProvider.tsx` | Full scoped User context and service-backed previews |
| `src/App.tsx`, `src/components/dashboard/RequireRole.tsx` | Permission-guarded routes and compatibility guard |
| `src/components/dashboard/Sidebar.tsx`, `src/components/dashboard/Topbar.tsx`, `src/pages/dashboard/DashboardHome.tsx` | Shared scoped navigation, eight-role and municipality previews |
| `src/components/landing/AboutSection.tsx`, `src/data/options.ts` | Derived role audiences and registration choices |
| `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx` | Correct mock-service integration comments; registration selections checked against configured choices |
| `tests/architecture.test.ts`, `tsconfig.test.json` | Unit and compile-time contract tests |
| `package.json`, `tsconfig.app.json`, `eslint.config.js`, `.gitignore` | Test/typecheck commands, strict application checks, generated test output exclusions |
| `README.md`, `DEVELOPMENT_PROGRESS.md` | Current architecture, usage, results and remaining scope |

### Verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS: application and Vite TypeScript projects compile; application strict mode enabled. |
| `npm run build` | PASS: TypeScript and production Vite build. |
| `npm run lint` | PASS: no reported errors or warnings. |
| `npm test` | PASS: 20 unit tests across four suites using Node's built-in runner. |
| Compile-time status checks | PASS: test compilation verifies workflow and asset lifecycle status values cannot be interchanged. |
| `git diff --check` | PASS: no whitespace errors. Git may report existing LF/CRLF conversion notices on Windows. |

Tests exercise all eight role registries, sixteen distinct municipality/role identities, every explicit permission grant in both municipalities, every auditor mutation denial, unsupported/inactive identity denials, action separation, each role's exact route allowlist, sidebar/guard agreement, cross-municipality navigation denial, preference compatibility and storage failures. No interactive browser or visual testing was performed; unit tests validate the shared access rules rather than rendered navigation interactions.

### Next required tasks and remaining limitations

Follow the user's next phase instructions. Before functional modules, the remaining integration foundation will need versioned JSON seed initialization into IndexedDB, scoped repositories, transaction consistency and runtime input/reference validation, mock account/session handling, and audit/approval persistence. Replace preview identity selection with explicitly simulated sessions when that phase is authorized.

Do not add these operations until requested. Full module pages, actual asset data, metrics, accounting calculations, uploads, reports/exports and cross-role workflows remain unimplemented. The five detailed flowcharts are still needed to settle document responsibilities and transition ordering. Browser accessibility findings from Phase 00 beyond the new access controls remain outstanding.

## Phase 02 — JSON data, IndexedDB and mock services

Status: complete (2026-10-22). Added browser-only persistence and service operations, preserving the existing React pages and design. No backend, external database, real API requests or credential authentication was added.

### Implemented features and architectural decisions

- Added 24 separate seed JSON files under `src/mock/seeds/`, covering every requested collection (inventory sessions/checks are separate). They contain 406 entirely fictional initial records: both municipalities, eight departments, 16 accounts (eight roles in each municipality), 320 scoped permission snapshots, four categories/assets, six registrations, two construction projects, two CIP costs, inventory examples, lifecycle requests, six accounting entries, two demo depreciation policies, reconciliations, eight approvals with histories, document metadata, settings, notifications and seed audit events. Stable IDs and same-municipality references are validated together. Seed documents have no embedded binaries.
- Added Dexie `ppe-demo` schema versions 1 and 2. Version 1 defines entity stores, scoped/unique indexes and metadata. Version 2 adds Blob storage and the audit transaction index, preserving existing data and revision metadata. Creation-only population validates and loads JSON in its transaction; refresh, empty tables and changed source JSON never trigger reseeding. Missing metadata is reported as an error. Explicit reset is the only seed-restoration operation.
- Added Zod strict schemas for every entity and versioned transfer envelope. Validates primitive types, enums, dates, safe-integer centavos, unique natural keys, globally distinct IDs, foreign-key-like references, scope, reciprocal registration/asset and CIP/accounting links, inventory check/session consistency, approval subject/status/requester agreement, legal approval event sequences and actor permissions, and the central permission snapshot. Fiscal year and policy values are explicit demo settings.
- Added typed repositories and per-entity services for getAll, getById, filters/search/offset/limit and appropriate mutation capabilities. Create stamps identity/scope/version/timestamps. Update rejects protected/unknown fields and stale versions. Only draft/returned requests are editable. Request submit/cancel, approval review/return/reject/approve, account status and personal notification read-state have dedicated entry points.
- Each service resolves the actor from persisted users and checks active status, claimed role/scope and central plus persisted municipality grants. UI permissions are not the authority for data operations. Auditor remains read-only. Administrators have no cross-municipality override; local dataset management/export is an explicit grant. A reference-data grant supports internal municipal user/department directories without exposing administrative routes or writes. Depreciation policy configuration uses Accounting or local Administration's explicit grants.
- Shared write transactions include related records, approval history, event notifications and audit events. Full relationship validation precedes commit, and any persistence/audit/validation failure aborts all changes. Approved request status remains separate from operational asset lifecycle. Phase 02 does not execute asset recognition, capitalization, depreciation or lifecycle accounting postings; those need their module-specific commands and flowcharts.
- Added structured validation/not-found/forbidden/invalid-transition/duplicate/conflict/storage errors. Successful mutation responses resolve after commit. Batch create/update commands share a transaction ID; a failure in any command rolls back the entire batch and its audits.
- Added municipality-local JSON export/import with format/version and 10 MiB transfer limit. Import validates the whole dataset before replacement, keeps the importing Administrator active, preserves existing audit events, rejects rewritten audit history, advances changed record versions and leaves the other municipality untouched. JSON excludes Blob binaries; matching local files can survive import, and metadata-only imported documents report explicitly that no local file exists.
- Added reset previews with current record/file counts, a loss warning, exact confirmation phrase, actor/municipality binding, five-minute expiry, single-use token and database revision check. Reset restores only the selected municipality and removes its uploaded files. Historical audit entries survive; removed historical actors are retained as disabled archived identities so audit references remain valid. Therefore reset intentionally retains more history than an empty first-run database.
- Added local Blob upload/download services with a 5 MiB limit, PDF/PNG/JPEG/text allowlist, filename/extension/MIME/basic signature validation, scope/linked-record checks and draft-state requirements. Blob reading finishes before the IndexedDB write transaction; metadata, Blob, parent attachment link and audits commit together.
- Added lazy dashboard storage initialization with loading/error/retry states; public landing/login/registration remain available independently of database initialization. Lazy-loading separates the new data layer from the main application bundle. Administrator System Settings now has functional JSON export/import controls and a native reset confirmation dialog. Broader settings and domain module screens remain outside this phase.
- Installed Dexie `^4.4.6`, Zod `^4.6.7` and development-only fake-indexeddb `^6.2.6`; updated the lockfile. The first dependency install hit the workspace's npm-cache restriction and was successfully rerun with the environment's approval mechanism. No dependency vulnerabilities were reported by installation.

### Changed files

| Files | Purpose |
| --- | --- |
| `src/mock/seeds/*.json`, `src/mock/seeds/index.ts` | All initial fictional data and validated seed loader |
| `src/domain/data.ts`, `src/domain/models.ts`, `src/domain/workflow.ts`, `src/domain/permissions.ts` | Entity/dataset contracts, category/settings models, approval transition policy and explicit data/reference grants |
| `src/mock/database.ts`, `src/mock/repositories/entityRepository.ts`, `src/mock/unitOfWork.ts` | Dexie versions, typed adapters, persisted authorization, atomic commit and auditing |
| `src/mock/validation/schemas.ts`, `src/mock/validation/dataset.ts` | Zod entity/envelope schemas and cross-table integrity validation |
| `src/services/contracts.ts`, `src/services/dataContracts.ts`, `src/services/errors.ts` | Typed operations, capabilities, confirmation DTOs and structured errors |
| `src/services/entityAccess.ts`, `src/services/entityService.ts`, `src/services/datasetService.ts`, `src/services/documentService.ts`, `src/services/mockDataService.ts` | Scoped readers/mutations, approvals/status/notifications, batches, dataset tools, documents and composition root |
| `src/features/data/MockDataBoundary.tsx`, `src/features/data/DemoDataTools.tsx`, `src/App.tsx`, `src/pages/dashboard/ModulePage.tsx` | Dashboard initialization and reviewable data controls in the existing settings shell |
| `tests/data.test.ts`, `package.json`, `package-lock.json`, `tsconfig.app.json`, `tsconfig.test.json` | Data-layer tests/dependencies and JSON module compilation |
| `README.md`, `src/services/README.md`, `DEVELOPMENT_PROGRESS.md` | Current status, service/API guide, migration/transfer rules and phase results |

### Verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS: strict application TypeScript and Vite projects. |
| `npm run build` | PASS: production build; data layer and settings controls are separate chunks. The initial large-chunk warning was resolved by lazy loading. |
| `npm run lint` | PASS: no errors or warnings. |
| `npm test` | PASS: 50 tests across six suites (20 prior role/access tests and 30 data/migration tests). Uses actual Dexie with fake-indexeddb. |
| `git diff --check` | PASS: no whitespace errors. |
| Browser smoke test | Unavailable: Browser skill setup completed, but the runtime reported no available browser and discovery returned an empty list. Rendered controls, native browser storage behavior and visual/keyboard interaction were not verified. The temporary Vite process was stopped. |

Tests cover validated seed relationships, all 16 identities, concurrent first creation, reopen persistence, CRUD/filtering, natural-key and concurrent duplicates, monetary/date/input validation, protected fields, canonical identity/role/scope checks, disabled accounts and last-admin protection, exposed capabilities, submissions and related audits/notifications, review/return/resubmit/approve/cancel, self-approval and stale decisions, atomic batches, audit-write failure rollback, own-notification state, scoped import/export and history protection, reset phrase/identity/expiry/revision/reuse rules, historical actor archival, missing metadata, inventory observer stamping/duplicates, invalid CIP/accounting links and fabricated histories, Blob validation/persistence/rollback/reset and the v1→v2 migration without reseeding.

### Important assumptions and next required tasks

- The original five detailed flowcharts are still unavailable. Request submission/approval primitives are conservative demo rules, not the complete future acquisition, engineering/budget, inventory, lifecycle or accounting workflow.
- All seed names, emails, documents, costs and policies are fictional. Account emails can repeat across municipalities; IDs are distinct. Credentials/login and persisted mock session handling remain for the authentication phase. The existing UI preview is retained, while every data request checks the persisted user.
- Permissions JSON is a validated snapshot of the central policy and cannot grant arbitrary new privileges on import. Later policy changes require a seed update and explicit database migration, not a refresh-time reset.
- Dataset replacement retains history and archives missing historical actors, deliberately prioritizing resolvable audit records over reproducing the exact first-run row count. Attachment binaries require separate backup if needed; JSON transfer is explicitly metadata/records only.
- Whole-dataset validation and broad write transactions are appropriate for this small demo. Large datasets, cross-device synchronization, legal accounting verification and production authentication/audit tamper resistance are not claimed.
- Next: follow the user's next phase scope. Future module components should call the documented typed services, add narrowly scoped domain transaction commands as their workflows are implemented, and avoid direct IndexedDB or source-JSON access. Full module pages, live dashboard metrics, business execution/postings and formatted reports remain pending.

## Phase 03 — Authentication and registration

Status: complete (2026-10-22). Implemented frontend-only demo login, nullable sessions, account requests/review, logout and authenticated route/data access. Existing authentication layouts, fields, colors, typography, landing page and dashboard shell were preserved. No backend, production authentication or real password recovery was introduced.

### Implemented features and decisions

- Replaced the always-present Administrator/role preview with `user: User | null`, a hydrated AuthSession, explicit loading/authenticated/anonymous/error states and typed login/logout/refresh/switch operations. Old role preferences cannot create a session. The former preview service was removed; the static user factory remains only as a permission-test fixture.
- Added demo login by case-insensitive current username or email plus municipality. Validates required fields, account existence, the public demo password, Pending/disabled status, assigned department, municipality and loaded central/persisted grants. All 16 seeded identities remain available via an explicitly labeled credentials helper on Login. **The shared public password is `PPE-DEMO-2026`; no personal password is stored.** Login/register pages and the dashboard identify this as DEMO ONLY and do not claim security or production authentication.
- Remember Me unchecked stores only `{ version: 1, sessionId }` in sessionStorage (maximum 12 hours); checked uses localStorage (maximum 7 days). IndexedDB holds the mock session's user/municipality/role and expiry. Refresh validates the reference and reloads current account/permission data. Invalid, corrupt, expired, disabled/deleted or role-mismatched sessions never restore a default account.
- Logout immediately clears the rendered identity, revokes the IndexedDB session and removes local/tab references, including obsolete preview keys. Provider revision checks reject stale asynchronous results; the service serializes login/switch/logout so late work cannot undo logout. Focus, storage events, periodic checks and an expiry timer revalidate session state. Restoration failures show retry/clear-session actions while retaining no authenticated user.
- Added full name, username, email, municipality, active department, requested non-administrator role, demo password/confirmation and fictional-data acknowledgement to registration. Shared Zod schemas serve forms and service validation. Municipality changes clear the department selection. Usernames/emails are case-insensitively unique within a municipality; duplicates and concurrent submissions cannot create two records.
- A submitted account request is a `users` record with Pending status, not an AssetRegistration. Registration atomically writes that user, its self-submission audit and local Administrator notification; it never creates a session. The requested role is not usable while Pending. Public requests cannot choose Administrator or supply status/identity metadata.
- Added the minimum Administrator → Users review panel needed to complete this phase: scoped Pending list, applicant/department/role information, search, pagination, loading/error/reload states, approval and reasoned rejection. Only an authenticated local Administrator can review; approval requires an active department and changes status to active, rejection changes it to disabled. Reviews are version-checked and audited. This is account-request review only; broader administration remains future work.
- Added RequireSession and GuestOnly. Dashboard layout, home, direct child URLs and access-denied view require authentication. RequireRole and RequirePermission delegate to shared authenticated rules, checking role, municipality and loaded permissions before rendering. Unauthenticated visits return to Login with a safe internal dashboard destination; unauthorized authenticated visits go to access denied. Logged-in users visiting Login/Register return to the dashboard.
- Removed unrestricted role/municipality setters from runtime UI. Development builds offer an explicit switcher for active seeded accounts, rotating the session and loading the chosen account's own municipality/permissions. Production hides that UI and its service rejects switching. No cross-municipality administrator privilege was added.
- Protected data operations now require `RequestContext.sessionId`; canonical actor/role/scope checks alone no longer permit requests. Disabled users, revoked sessions, invented session IDs and expired references are rejected inside services. Role/status changes revoke affected sessions. Auth notices are displayed in the existing dashboard layout.
- Added Dexie schema v3: persisted usernames, scoped username uniqueness and technical sessions. Migrations backfill deterministic usernames without reseeding or replacing business records. Seed users now include usernames; legacy JSON envelopes lacking usernames are normalized before validation. Import/reset revokes the affected municipality's sessions and returns the current UI to Login with the committed operation notice. Archive identities get collision-free usernames so seed resets remain possible.
- Reused field components and added option value/label support, associated error descriptions, form-level announcements, disabled/loading states and clear errors/success notices. Forgot password now explains the public demo password and Administrator-review limitation; no password reset, email or external identity operation is simulated as a real service.

### Changed files

| Files | Purpose |
| --- | --- |
| `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`, `src/components/auth/TextField.tsx`, `src/components/auth/SelectField.tsx` | Working forms, public credential helper, scoped selections, demo notices, validation and accessibility |
| `src/context/CurrentUserContext.ts`, `src/context/CurrentUserProvider.tsx`, `src/hooks/useAuthenticatedUser.ts` | Nullable/authenticated state, refresh/expiry/logout behavior and scoped request context |
| `src/domain/auth.ts`, `src/domain/authAccess.ts`, `src/domain/models.ts` | Session/account contracts, lifetimes, shared route decisions, safe return URLs and usernames |
| `src/features/auth/validation.ts`, `RequireSession.tsx`, `GuestOnly.tsx`, `DemoAccountSwitcher.tsx`, `AccountRequests.tsx` | Shared input validation, guards, development switching and minimal account review |
| `src/App.tsx`, `src/config/navigation.ts`, `src/components/dashboard/RequireRole.tsx`, `src/features/access/RequirePermission.tsx` | Authentication gates and permission-loaded navigation/direct URL protection |
| `src/components/dashboard/Sidebar.tsx`, `Topbar.tsx`, `src/layouts/DashboardLayout.tsx`, `src/pages/dashboard/DashboardHome.tsx`, `ModulePage.tsx` | Nullable-state consumers, actual logout, scoped identity display, notices and review entry point |
| `src/services/authContracts.ts`, `authClient.ts`, `authService.ts`, `contracts.ts`, `errors.ts` | Typed lazy authentication services, registration/review operations, session serialization and structured errors |
| `src/mock/sessionRepository.ts`, `database.ts`, `unitOfWork.ts`, `demoIdentityRepository.ts`, `seeds/users.json`, `validation/usernames.ts`, `validation/schemas.ts`, `validation/dataset.ts` | Reference storage, schema v3, session authorization, username seeds/migrations/integrity and retired preview implementation |
| `src/services/demoIdentityService.ts` | Removed the obsolete default-Administrator preview service |
| `src/services/entityService.ts`, `datasetService.ts`, `mockDataService.ts`, `src/features/data/DemoDataTools.tsx` | Revocation on identity/status/replacement changes, department checks, archive-name compatibility and reauthentication after import/reset |
| `tests/auth.test.ts`, `tests/architecture.test.ts`, `tests/data.test.ts`, `package.json` | Authentication/access/migration coverage and previous tests updated to supply valid session fixtures |
| `README.md`, `src/services/README.md`, `DEVELOPMENT_PROGRESS.md` | Demo credentials, usage, scope decisions, API/session contract and phase results |

### Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS: strict application and Vite TypeScript compilation. |
| `npm run build` | PASS: production build; authentication/data/account-review code is split into appropriate chunks without size warnings. |
| `npm run lint` | PASS: no errors or warnings; React effect/purity findings encountered during development were corrected. |
| `npm test` | PASS: 76 tests across eight suites using real Dexie and fake-indexeddb. |
| `git diff --check` | PASS: no whitespace errors after removing two trailing blank lines. |
| Browser flow verification | Unavailable: the Browser runtime again reported no browser and discovery returned an empty list. No rendered login/register/approval/keyboard interaction claims are made. |

Test total: 17 retained role/route tests + 30 retained data/migration tests + 29 new authentication/route/migration tests. The three obsolete tests asserting default preview identities were removed because that behavior was explicitly replaced. Current tests cover all 16 logins, email/username normalization, required/invalid credentials, Pending and disabled accounts, options/department/municipality/permission loading, Remember Me modes, persisted refresh, logout/revocation, malformed references, expiry, storage and audit rollback, registration validation/duplicates/concurrency, local-only Administrator approval/rejection, stale reviews, development-only switching, switch/logout races, session-required business calls, safe direct URL decisions, schema migration, legacy import compatibility and reset/archive username collisions.

### Assumptions and remaining scope

- All accounts use one public demo password, including newly approved registrations. This avoids storing personal credentials and intentionally provides no production security. A username/email is unique within its municipality; the same fictional login can exist in both municipalities because Login requires the municipality.
- Account requests reuse User.status (`pending`, `active`, `disabled`). Rejection is represented by disabled status plus an audited reason; there is no new approval/account-request table or coupling to PPE asset registration.
- Browser stores cannot share an atomic transaction: if IndexedDB commit fails after the reference write, the reference cannot authorize access because its session row is absent; restoration clears it. Technical expired/revoked references are not exported. Dataset replacements deliberately require reauthentication.
- The minimal account-review panel is a Phase 03 dependency, not a full Users module. User editing, policy administration and all asset/construction/inventory/lifecycle/accounting/report screens remain for later explicit scopes.
- The five detailed flowcharts remain unavailable. No future business workflow or legally verified accounting policy was introduced. Browser visual/interaction verification remains outstanding because no browser connection was available.
- Next required task: follow the user's next phase instructions, reuse authenticated requestContext and typed services, and preserve municipality isolation and the current design.
