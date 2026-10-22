# Frontend mock data services

Use `mockDataServices` from `mockDataService.ts` in feature code. It exposes typed request/response interfaces; components must not import Dexie, the database singleton, or repositories. A later HTTP implementation can retain the contracts in `contracts.ts` and `dataContracts.ts` without exposing storage details to components.

```ts
import { mockDataServices } from './mockDataService'
import type { RequestContext } from './contracts'

// Protected components obtain requestContext from useAuthenticatedUser().
// It includes sessionId, actor and municipalityId; all three are checked in IDB.
async function loadAssets(context: RequestContext) {
  const result = await mockDataServices.entities.assets.getAll(context, {
    filters: { lifecycleStatus: 'in_service' },
    search: 'workstation',
    offset: 0,
    limit: 20,
  })
  if (!result.ok) return result.error.message
  return result.data
}

### Phase 04 dashboard read model

`createDashboardService(storage).getSnapshot(context)` returns `ServiceResult<DashboardSnapshot>` and requires a valid persisted authenticated session. The service authorizes the `dashboard:read` grant, scopes all queried records to the persisted actor's municipality and returns role-specific limited summary projections. Use `dashboardService` in the runtime app or inject a test `MockDatabase`; never read the raw IndexedDB tables in dashboard React components. Metrics refresh on an explicit request. The dashboard read model does not authorize changes to records or shortcut unfinished module workflows.

### Phase 07 central approval engine

`mockDataServices.approvals.overview(context)`, `.getById(context, id)` and
`.decide(context, { id, version, decision, remarks })` are scoped to a **valid
Approving Officer session**, an authorized municipality and live local approval
grants. Supported decisions: `review`, `approve`, `return`, `reject`. Return and
reject require a nonblank reason. Stale versions, self-approval, conflicting
originating records and repeated decisions fail closed. The engine writes the
originating status, approval status/history, audit entries and the requester
notification in one IndexedDB transaction. Historical submissions include a
snapshot of the request and attachment metadata (no Blob copy). The legacy
`changeStatus` entry point delegates to the exact same engine.

Asset registration approval additionally inserts a linked PPE registry asset
with `lifecycleStatus: idle`, `recognitionStatus: awaiting_recognition`,
then updates the approved registration's `recognizedAssetId` in that same
transaction. This property is a registry link, **not** an accounting posting.
The Property Officer registry renders Awaiting Recognition for this stage.
Final recognition, depreciation, capitalization posting, transfer execution,
maintenance, inventory and reconciliation changes are not executed by these
approval decisions; their feature-specific commands remain future work.

Per-type approval resources use the existing centrally allowed permission
matrix; municipality scoping and requester separation cannot be overridden by
permission editing. Legacy seeded submitted registrations have no attachment
Blobs and remain viewable and decidable as historical demo fixtures. Newly
submitted registrations are checked against the applicable municipal document
requirements at submission (Phase 06).
