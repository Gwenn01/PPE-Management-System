# PPE Management System frontend

Accounting Information System for Property, Plant, and Equipment Management for Botolan and San Antonio, Zambales. Built with React 19, TypeScript, Vite, Tailwind CSS 4, React Router and Lucide React.

## Frontend-only development approach

Data operations run entirely in the browser through typed, replaceable frontend services and mock repositories. Local JSON files supply initial fictional data; Dexie/IndexedDB persists subsequent changes. Zod validates inputs and dataset relationships. The browser never writes changes to source JSON. localStorage/sessionStorage are reserved for demo sessions and lightweight preferences. No real backend or external database is called; installed Axios is unused.

Mock identities support eight internal roles with municipality-specific permissions. Authentication is a demo, and accounting policies are configurable DEMO settings, not legally verified rules. The data services check persisted identity, role, municipality, inputs, versions and allowed transitions; mutations and their audit entries commit atomically.

**Current status (Phase 03):** the existing branded UI has nullable demo authentication, protected dashboard routes, Pending account registration and municipal Administrator review, backed by the persistent mock data layer. Its 24 JSON seed files contain 406 fictional initial records and 16 demo accounts. Database creation seeds once; refresh/reopen preserves edits. All permissions are municipality-local, including Administrator permissions; there is no cross-municipality override.

Administrator → **System Settings** provides JSON export/import and a reset preview with an exact-phrase confirmation dialog. JSON exports omit attachment binaries. Reset restores the current municipality's seeds and removes its uploads while retaining audit history; the other municipality is preserved. Local document metadata and validated Blobs are stored separately in IndexedDB.

**DEMO ONLY — not secure or production authentication.** Choose Botolan or San Antonio on Login. Use username `administrator` (or `admin@example.com`) with the public password **`PPE-DEMO-2026`**. The Login page's demo-credentials selector fills accounts for all eight roles in both municipalities. Use fictional registration details; every account uses this shared public password and no personal password is stored.

Registration saves a Pending user with a username, email, municipality, department and requested non-administrator role. Sign in as that municipality's Administrator and open **Users** to approve or reject it; Pending and rejected/disabled users cannot sign in. Usernames and emails are case-insensitively unique within a municipality. Forgot password shows a demo limitation; no recovery service or email is sent.

Unchecked Remember Me stores only a session reference in sessionStorage (up to 12 hours); checked uses localStorage (up to 7 days). Refresh validates the reference against IndexedDB, current account status, role, municipality, department and permissions. Logout revokes the session and clears references. Missing/invalid sessions redirect to Login; unauthorized modules show access denied. Import/reset revokes sessions in the affected municipality and requires signing in again. Development builds offer an explicit seeded-account switcher; production builds hide it and reject that operation.

Database schema v3 adds usernames and sessions without reseeding or discarding earlier edits. Legacy JSON exports backfill missing usernames on import. The retired role-preview preferences never create an authenticated session. Full business module screens, asset recognition/lifecycle execution and accounting calculations remain for their authorized phases.

See [the service guide](./src/services/README.md) for typed usage, entity capabilities, schema/migration policy, permission assumptions and transfer/reset limits.

Run from `client/` after dependencies are installed with `npm ci`:

- `npm run dev` — start the development server.
- `npm run build` — run TypeScript compilation and create a production build.
- `npm run lint` — run ESLint.
- `npm run typecheck` — check application and Vite TypeScript projects (application strict mode enabled).
- `npm test` — compile and run role/access, mock-data and authentication tests using Node's built-in runner, real Dexie and fake-indexeddb.
- `npm run preview` — preview the production build.

Phase 03 typecheck, build, lint and all 76 tests passed. Tests cover the prior data/access foundation plus login failures/success, all 16 accounts, pending review, duplicate registration, session restoration/expiry/logout, Remember Me, development switching, authenticated access rules and migration compatibility. Interactive browser verification was unavailable in this session. See [DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md) for the audit, phase results and remaining tasks. Implement only the phase explicitly requested, preserving the existing visual design.

## Original Vite template reference

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])


## Phase 04 — Role dashboards and shared UI

Dashboard home now requests one municipality-scoped, session-authorized projection from `src/services/dashboardService.ts`. The eight roles have distinct live-from-IndexedDB stats and searchable/filterable/sortable read-only activity tables. The `src/components/ui/` primitives are available for later module screens. See `DEVELOPMENT_PROGRESS.md` for exact metric definitions, security constraints and verification status.

Only finished module actions are linked as functioning quick actions (Administrator Users account review and Settings demo-data tools). Other business modules remain visibly unimplemented; there are no simulated approval, voucher or posting actions. Source exports of this phase omit the original image binaries: apply the changed-files patch to the existing local project to preserve the landing/auth imagery. Run `npm ci && npm run build && npm run lint && npm test` in the original project with registry access.


### Phase 05 Administrator modules (source implementation)

The six Administrator destinations now include local-user administration, separate account requests, departments, stored role-permission matrix, demo settings/categories/accounting policies, and an append-only audit history view. The account review service from Phase 03 remains authoritative. Only current-municipality users, settings, assets and audit entries are accessible. User moves between municipalities and permission escalation beyond the centrally approved allowlist are intentionally disabled. Core permissions cannot be revoked. Confirm significant changes; all writes are version checked, auditable IndexedDB transactions. Check `DEVELOPMENT_PROGRESS.md` for verification limitations and remaining dependencies.

### Phase 06 — Asset registry and registration

Sign in as a municipality's **Property Officer**. Open **Assets** to search/sort/filter existing PPE records and inspect linked registration/document details; open **Asset Registration** to create an intake draft, upload its classified supporting documents, submit for approval, and review decisions or resubmit a returned request. Validation and permissions are enforced in IndexedDB service transactions. Admins can configure *municipality-specific demo* supporting-document requirements in **System Settings**; do not treat these as government-prescribed requirements. A submitted request does **not** create an active asset, depreciation calculation or recognition posting. See `DEVELOPMENT_PROGRESS.md` and `APPLY_PPE_PHASE06.md` for compatibility and verification notes.


### Phase 09 - Construction and Engineering

Property Officer: open Construction Projects, register a demo project with assigned Engineering/Budget officers, upload MPDO proposal and simulated Mayor authorization evidence, and record those external steps. Engineering: receive the assigned project, upload/review construction and Availability of Fund documents, record progress with a progress report, upload an Engineering report and forward to Budget. Budget can inspect and return the packet for correction. Property can record monitoring, upload completion/acceptance evidence and complete an eligible project at 100% progress. All parties share the project timeline and document/forwarding history. External stages are simulations only, not real Mayor approval; no automatic capitalization occurs. See DEVELOPMENT_PROGRESS.md for evidence rules and verification.


### Phase 10 - Budget vouchers and document routing

After Engineering forwards a tracked project, its assigned Budget Officer opens Budget Workspace, receives the packet, saves voucher details and Regular/Trust Fund classification, uploads voucher and Budget review evidence, and marks the requirements ready. Regular Fund packets forward directly to the assigned Accounting Officer. Trust Fund packets first enter an external Treasury demo stage; upload a separate demo confirmation file and use the explicitly labeled simulation action before forwarding to Accounting. The Accounting Officer opens Received Project Documents to acknowledge receipt or return documents. Processing history retains voucher snapshots, external-stage evidence, dates and prior returned handoffs. These are local document simulations only, with no Treasury login, payment, fund transfer, capitalization or financial posting. See DEVELOPMENT_PROGRESS.md for validation rules and test results.


### Phase 11 - CIP accounting and capitalization

After acknowledging the processed Budget packet, Accounting opens CIP Costs, uploads CIP supporting files, records eligible expenditures and explicitly reviews each qualifying cost. Approved costs post to CIP; exclusions retain history and reverse any prior CIP debit. Property completes the project with acceptance evidence and confirms ready for intended use in Construction Projects. Accounting then prepares the qualifying-cost/property/depreciation snapshot and submits capitalization. The Approving Officer reviews it through the existing capitalization queue. Returns allow correction/resubmission; rejection retains CIP. Approval atomically creates recognized PPE and transfers qualifying CIP to PPE, without starting depreciation on unfinished construction. Reports and Reconciliation source views reflect the postings, while the Depreciation module shows the saved-policy schedule. These remain local demonstration accounting operations, not real government financial transactions.
