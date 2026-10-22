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

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
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

```
