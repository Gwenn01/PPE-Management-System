# PPE Management System

Frontend-only municipal Property, Plant and Equipment demonstration for Botolan and San Antonio, Zambales. The existing React application integrates registration, approvals, accounting, construction/CIP, inventory, lifecycle, reconciliation, reporting and administration. No backend was added.

## Setup and local run

Use Node.js 22.12 or newer and npm. Verification used Node 22.16.0 and npm 10.9.2. From the repository root:

```powershell
cd client
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). Browser IndexedDB must be enabled. To preview a production build, run `npm run build`, then `npm run preview`. Deploy `client/dist` to a static host with all application routes rewritten to index.html. Use a stable origin: changing host/port creates a separate browser database.

## Mock data architecture

React screens call typed services in `src/services`. Domain rules validate actions, persisted identities, municipal scope, record versions and workflow transitions. Dexie repositories persist records, attachment Blobs, sessions and audit events in IndexedDB; related mutations commit in transactions. Zod checks input and imported relationships. JSON in `src/mock/seeds` seeds a new database once; refreshing does not overwrite edits. Schema version 3 retains migration support. Source JSON is never modified by the application.

Session references use sessionStorage (unchecked Remember Me, up to 12 hours) or localStorage (checked, up to seven days). The saved identity and grants are revalidated. Logout, identity changes and municipal import/reset can invalidate sessions. No email, external login, real payment or external document processing occurs.

All amounts are integer centavos. Currency formatting divides by 100; depreciation uses recorded demo policy snapshots. Forecast depreciation is distinct from posted accounting balances. Reports expose their period/status filters and use the same authorized snapshot shape for preview and export.

## Seeded test accounts and role/module matrix

Use the municipality-specific seeded accounts below to test each role. The listed usernames are the same in Botolan and San Antonio; select the intended municipality on Login and enter the username manually. All 16 active seeded accounts use the shared test password **PPE-DEMO-2026**. Authentication and client-side permissions are browser-local mock behavior and are not production security controls. To change accounts, sign out and use the Login page; the development account-switching utility is not rendered in the application.

| Role | Username | Modules/responsibilities |
| --- | --- | --- |
| Administrator | administrator | Users/account requests, departments, permitted role grants, demo settings/policies, audit trail, JSON tools |
| Property Officer | property_officer | PPE registry, registration, construction, discrepancies, transfer, maintenance, disposal |
| Accounting Officer | accounting_officer | Registry, received project documents, recognition, depreciation, CIP, disposal review, reconciliation, reports |
| Inventory Personnel | inventory_personnel | Registry, physical inventory, asset monitoring/lookup |
| Approving Officer | approving_officer | Pending/returned/history queues; registration, capitalization, correction and lifecycle decisions; reports |
| Auditor | auditor | Read-only registry, reports and audit workspace |
| Engineering Office | engineering_office | Assigned construction projects, Engineering documentation/progress and forwarding |
| Budget Office | budget_office | Assigned construction projects, voucher/fund classification and document routing |

Every role has a municipality-specific dashboard. Administrator has no automatic business-approval override or cross-municipality access. Stored grants can narrow the central role allowlist. Auditor mutations are forbidden. Use the regular sign-out and sign-in flow when changing identities.

## Workflow walkthroughs

A. Register a fictional non-administrator user using the public demo password. The municipal Administrator approves the Pending request in Users/account requests. Approval activates the account; sign in as that user. Rejected, Pending and disabled accounts cannot log in. There is no activation email.

B. Property creates an Asset Registration draft, supplies the configured documents, and submits it. Approving reviews and approves, returns or rejects the request. Approval creates the Accounting handoff; Accounting explicitly recognizes the asset using a demo policy and treatment. Registry and reports read the resulting persisted records; registration submission alone does not recognize PPE.

C. Property registers a construction project and records external MPDO/Mayor simulation evidence. Assigned Engineering receives it, reviews/uploads documents and records progress before forwarding to Budget. Budget records voucher details, evidence and Regular/Trust Fund routing. Regular Fund forwards to Accounting; Trust Fund requires a separately evidenced external Treasury simulation first. Accounting acknowledges receipt, records/reviews supported CIP costs and posts eligible costs. Property records completion at 100%, acceptance evidence and readiness for intended use. Accounting prepares capitalization; Approving approval transfers qualifying CIP to a recognized PPE asset atomically. Returns/rejections preserve history and do not capitalize unfinished work.

D. Inventory opens a physical inventory session and records observations. Discrepancies pass to Property for investigation and an evidenced correction proposal. Approving reviews the correction; the controlled workflow updates the official asset and retains before/after history. Observations alone never overwrite registry values.

E. Property prepares transfer, maintenance or disposal requests and supporting evidence. Use the applicable submission/review/approval stages; disposal includes Accounting review. Explicit completion records the authorized result and asset history. Disposal accounting distinguishes posted balances from forecast depreciation; approvals alone do not prove physical execution.

F. Accounting creates a reconciliation period/category scope and captures source balances or imports comparison data. Investigate differences, attach evidence and submit a justified correction. Approving decides it; the controlled correction applies once, with balanced postings where applicable. Refresh the comparison and complete the session only after differences are resolved or explicitly approved exceptions are accounted for. Reports/Auditor views expose completed captures; imported originals and earlier decisions remain retained.

Exact five source flowchart diagrams were not present in the workspace/session. These walkthroughs describe the implemented transitions and the six requested summary flows; exact conformance to the absent diagrams is unverified.

## Import, export and reset

Administrator opens System Settings to export the current municipality as JSON, validate/import a compatible file, or preview reset. JSON contains metadata/records, **not attachment binaries or a portable authenticated session**. Import enforces schema, relationships and workflow-history protections; it is not an unrestricted rollback or substitute for authorized approval/posting. A modified or older dataset can be rejected when it would rewrite protected history.

Reset displays affected records/files and requires the exact displayed phrase. Its confirmation expires and becomes stale if records change. It restores that municipality's fictional seeds and removes its uploads, retaining audit history and the other municipality. Import/reset revoke affected sessions; sign in again afterward. Clearing browser site data is outside this controlled reset and can erase everything. Excel/PDF reports are available to reporting roles; audit/workflow retention remains browser-local and editable by someone controlling the browser.

## Verification

Run from client:

| Command | Purpose |
| --- | --- |
| npm test | Compile and execute Node unit/service integration tests using real Dexie and fake-indexeddb |
| npm run typecheck | Application and Vite TypeScript checks |
| npm run lint | ESLint including React hooks |
| npm run build | TypeScript and Vite production bundle |
| npm run dev / npm run preview | Local development / production preview servers |

Phase 16: 143 tests passed, zero failed/skipped/todo. Lint and typecheck passed with no diagnostics. The production build is recorded in IMPLEMENTATION_SUMMARY.md. No automated browser E2E runner is configured; no connected browser was available. **Every button/dialog, actual download, real-browser refresh, mobile rendering, contrast and assistive-technology behavior have not been exhaustively verified.** Service tests include workflow transitions, denied actions/scope, transactions, dataset reset/import, persistence and calculations. See [QA_CHECKLIST.md](./QA_CHECKLIST.md) for the remaining interactive acceptance work.

## Frontend-only limitations and backend handoff

Browser storage is device/profile/origin-local, subject to quota, eviction, manual edits and deletion. Seed attachments can be metadata-only. Uploaded evidence is local; no malware scanning, trusted signatures or durable shared document store exists. There is no real Treasury/Mayor integration, email delivery, password recovery, multi-device synchronization or legally validated accounting policy. Client-side mock sessions, permissions and audit history are not trustworthy production controls. Large exports and datasets still operate in browser memory; production bundle warnings are documented rather than treated as failures.

Replace service implementations behind existing DTOs with authenticated APIs. Enforce authorization, municipal ownership, approval segregation, optimistic concurrency and atomic accounting/audit writes on the server. Provide database migrations, durable file/object storage and backup/restore, server sessions/password handling, immutable audit retention, validated accounting policies, pagination/aggregate queries and idempotent commands. Confirm the source flowcharts, external-office responsibilities, retention policy and accounting rules with stakeholders. Run real-browser E2E/accessibility and multi-user concurrency tests before any production rollout.

See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md), [DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md) and the [service guide](./src/services/README.md).
