# PPE Management System frontend

Accounting Information System for Property, Plant, and Equipment Management for Botolan and San Antonio, Zambales. Built with React 19, TypeScript, Vite, Tailwind CSS 4, React Router and Lucide React.

## Frontend-only development approach

Data operations run entirely in the browser through typed, replaceable frontend services and mock repositories. Local JSON files supply initial fictional data; Dexie/IndexedDB persists subsequent changes. Zod validates inputs and dataset relationships. The browser never writes changes to source JSON. localStorage/sessionStorage are reserved for demo sessions and lightweight preferences. No real backend or external database is called; installed Axios is unused.

Mock identities support eight internal roles with municipality-specific permissions. Authentication is a demo, and accounting policies are configurable DEMO settings, not legally verified rules. The data services check persisted identity, role, municipality, inputs, versions and allowed transitions; mutations and their audit entries commit atomically.

**Current status (Phase 02):** the existing branded UI has an eight-role, two-municipality preview and a persistent mock data layer with 24 JSON seed files, 406 fictional initial records and 16 demo accounts. Database creation seeds once; refresh/reopen preserves edits. All permissions are municipality-local, including Administrator permissions; there is no cross-municipality override. Select the municipality on dashboard home and the demo role in the topbar (on dashboard home on small screens).

Administrator → **System Settings** provides JSON export/import and a reset preview with an exact-phrase confirmation dialog. JSON exports omit attachment binaries. Reset restores the current municipality's seeds and removes its uploads while retaining audit history; the other municipality is preserved. Local document metadata and validated Blobs are stored separately in IndexedDB.

Login/registration still do not create sessions or accounts; direct dashboard access defaults to a Botolan Administrator preview. Preview preferences remain in localStorage. Data operations resolve the selected identity against persisted users. Full mock sessions, business module screens, asset recognition/lifecycle execution and accounting calculations remain for their authorized phases. The service foundation supports audited CRUD, request submission, approval status/history and atomic multi-record updates.

See [the service guide](./src/services/README.md) for typed usage, entity capabilities, schema/migration policy, permission assumptions and transfer/reset limits.

Run from `client/` after dependencies are installed with `npm ci`:

- `npm run dev` — start the development server.
- `npm run build` — run TypeScript compilation and create a production build.
- `npm run lint` — run ESLint.
- `npm run typecheck` — check application and Vite TypeScript projects (application strict mode enabled).
- `npm test` — compile and run role/access and mock-data tests using Node's built-in runner, real Dexie and fake-indexeddb.
- `npm run preview` — preview the production build.

Phase 02 typecheck, build, lint and all 50 tests passed. Tests cover initialization, persistence, CRUD, duplicates, permissions, approval history, transaction rollback, import/export, reset, file storage and migrations. Interactive browser verification was unavailable in this session. See [DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md) for the audit, phase results and remaining tasks. Implement only the phase explicitly requested, preserving the existing visual design.

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
