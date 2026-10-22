# PPE Management System frontend

Accounting Information System for Property, Plant, and Equipment Management for Botolan and San Antonio, Zambales. Built with React 19, TypeScript, Vite, Tailwind CSS 4, React Router and Lucide React.

## Frontend-only development approach

Business operations will run entirely in the browser through typed, replaceable frontend services and mock repositories. Local JSON files will supply initial seed data; IndexedDB will persist subsequent changes. The browser will never write changes to source JSON. localStorage/sessionStorage are reserved for demo sessions and lightweight preferences. No real backend or external database will be called; installed Axios is currently unused.

Mock identities support eight internal roles with municipality-specific permissions. Authentication is a demo, and accounting policies will be configurable DEMO settings, not legally verified rules. Future workflow transitions, related-record updates, approval histories and audit events must be validated by the mock service layer as well as route guards.

**Current status (Phase 01):** the existing branded UI now has an eight-role, two-municipality preview, centralized resource/action permissions, route guards, domain models and typed service contracts. All permissions are municipality-local, including Administrator permissions; there is no cross-municipality override. Select the demo municipality on dashboard home and the demo role in the topbar (on dashboard home on small screens). Denied routes show an access message.

Login/registration still do not create sessions or accounts; direct dashboard access defaults to a Botolan Administrator preview. Preview preferences are stored in localStorage through a typed demo identity service, and switching municipality selects a distinct mock identity rather than extending access. Business module pages, JSON domain seeds, IndexedDB, real mock session handling and workflow operations remain for later authorized phases.

Run from `client/` after dependencies are installed with `npm ci`:

- `npm run dev` — start the development server.
- `npm run build` — run TypeScript compilation and create a production build.
- `npm run lint` — run ESLint.
- `npm run typecheck` — check application and Vite TypeScript projects (application strict mode enabled).
- `npm test` — compile and run architecture unit tests using Node's built-in test runner, without additional packages.
- `npm run preview` — preview the production build.

Phase 01 typecheck, build, lint and all 20 unit tests passed. Tests cover role completeness, scoped identities, permission denials and route allowlists for both municipalities. See [DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md) for the audit, phase results, architectural decisions and remaining tasks. Implement only the phase explicitly requested, preserving the existing visual design.

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
