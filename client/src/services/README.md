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
```

All results are `{ ok: true, data }` or `{ ok: false, error: { code, message, fields? } }`. Data codes are `validation`, `not_found`, `forbidden`, `invalid_transition`, `duplicate`, `conflict` (stale version), and `storage_unavailable`; authentication adds `invalid_credentials`, `account_pending` and `account_disabled`. A business mutation resolves successfully only after its IndexedDB transaction commits. Validation messages can contain fictional record identifiers; keep them in the current user's interface.

## Demo authentication and account registration

Use the typed `authClient` from `authClient.ts` in browser features. It lazily composes `createAuthService` with the shared database and Web Storage adapters. Public `getOptions()` returns municipality/active-department choices and seeded demo-account descriptors. Public `register(request)` accepts fictional details, a requested non-administrator role, active same-municipality department, the shared `PPE-DEMO-2026` demo password/confirmation and explicit demo acknowledgement. It saves a Pending User plus audit/administrator notification together; it never stores a password or opens a session. There is no separate asset-registration record for an account request.

`login({ login, password, municipalityId, remember })` accepts the current username or email, checks active status and loads municipality, department and central/persisted permissions. All demo accounts use the public password above. Usernames/emails are unique within each municipality, so municipality is required. `reviewAccount(context, userId, expectedVersion, decision, reason)` is limited to that municipality's active Administrator and Pending users; reject requires a reason and disables the account, approve requires an active requested department. Audit records retain reviewer/reason. The Users screen exposes this minimal review workflow; broader user administration is future work.

`restore()` returns a freshly hydrated AuthSession or null; it never invents a default user. A Web Storage value contains only `{ version: 1, sessionId }`, referencing an IndexedDB session row with user ID, municipality, role, issue time, expiry and Remember Me mode. Unchecked uses sessionStorage with a 12-hour maximum; checked uses localStorage with a 7-day maximum. Corrupt/unknown/expired references, disabled/deleted accounts and changed roles cannot restore a session. Missing permission/municipality/department data fails closed. Browser storage is not production authentication or a security boundary.

`logout(sessionId?)` revokes the known/current mock session and clears local/tab references. Session-changing operations are serialized so a late development switch cannot undo logout. CurrentUserProvider also discards stale asynchronous results, revalidates on focus/storage changes and periodically, and schedules an expiry check. Error states retain no authenticated user and offer retry or clearing the session.

`switchAccount(userId)` requires an existing valid session and the development flag; it selects only active seeded accounts, rotates the session and reloads the target municipality/permissions. The browser adapter passes Vite's development flag; production uses false. Generic role/municipality setters no longer exist. There is no password-reset/email service; the Login page explains the public demo password and account-review limitation.

All protected data services now require `RequestContext.sessionId` in addition to the actor and municipality. They verify the stored session's subject, role, scope and expiry before accepting the actor, then apply the existing action permissions. Navigation/guards also check loaded grants. No backend requests are made.

## Entity capabilities

Every entity exposes `getAll(context, query?)` and `getById(context, id)`. Queries support equality filters on declared scalar fields, case-insensitive text search, offset and optional limit (1–1,000). They never override municipality scope. Results are ordered by ID. Without a limit, getAll returns all matching scoped records. Reference-data access permits internal users to read their municipality's demo user/department directory without granting administrative write access or exposing the administration routes.

| Entity collection | Additional public operations |
| --- | --- |
| departments, users, assetCategories, depreciationPolicies, settings | create, update |
| registrations, projects, documentRouting, cipCosts, inventorySessions, discrepancies, transfers, maintenance, disposals, reconciliations | create, update, submit, changeStatus |
| inventoryChecks | create, update; observer and check time are service-stamped |
| municipalities, permissions, assets, documents, accountingRecords, approvals, notifications, auditLogs | Read only through generic entity services |

Capability availability is distinct from authorization: roles still require the explicit action grant. For example, only Administrator can create departments, while Property Officer creates registrations. Auditor has no mutation grants. Administrator can manage demo datasets within its municipality, including exporting a full local dataset, but cannot read another municipality or use implicit business-approval privileges. Depreciation policies are configurable by Accounting or local Administration through their explicit configuration grants.

IDs, municipality, version, timestamps, requester identity, submission state, document links, derived accounting links and execution fields are service-managed. Unknown fields or attempts to patch protected fields fail validation. New requests start in draft. Update only draft/returned workflows; submit only draft/returned requests; cancel only draft/returned/submitted requests with a reason. Non-request entities use their dedicated operations instead:

- `approvals.changeStatus(context, id, expectedVersion, status, reason)` reviews, approves, rejects or returns an approval. It checks the subject-specific permission, prohibits self-approval, and updates approval history and the subject's status together. Return/rejection requires a reason. Approved/rejected/cancelled requests cannot be reopened through this primitive.
- `users.changeStatus(context, id, expectedVersion, status)` manages demo account activation. It cannot disable the last local active Administrator.
- `notifications.markRead(context, id, expectedVersion)` updates only the recipient's own notification. Other users' notifications do not appear in getAll/getById.
- `documents.upload(context, { fileName, file, entityType, entityId })` saves a validated Blob, metadata, parent document link and audit entries together. `documents.download(context, id)` returns the metadata and Blob after checking both scope and linked-record visibility.
- `batch(context, commands)` executes 1–100 typed create/update commands in one transaction, including their audits. A failed command rolls back every preceding command and audit in the batch. This is not an unrestricted database callback.

For every update/status command, supply the version returned by the last read. Import/reset also advance versions when replacing changed records. Retry a conflict only after reloading and reviewing the current record.

Approval primitives maintain requests and approval history; they do not execute future asset recognition, capitalization, depreciation, transfers, maintenance completion or disposal postings. Those commands need the detailed flowcharts and their authorized module phases. Asset lifecycle remains separate from request approval state.

## JSON initialization, transfers and reset

The `ppe-demo` database uses Dexie schema versions 1, 2 and 3. Version 1 defines entity/index tables; version 2 adds Blob storage and the audit transaction index; version 3 backfills deterministic, collision-free usernames and adds a scoped unique username index and technical session store. Existing record IDs, business edits and revision metadata are preserved without reseeding. Initial data still has seed version 1. The creation-only populate transaction validates all 24 JSON arrays and their relationships before storing the fictional dataset. Reopening an existing database never reapplies JSON, even if tables are empty or metadata is missing. Missing metadata produces an error; it is not an invitation to overwrite records. Legacy v1 transfer envelopes without usernames are normalized before validation/import. Technical sessions are not included in exports.

The two municipalities have 16 seeded demo accounts in total, one per role per municipality. IDs follow `demo-{municipalityId}-{role}` and initial usernames match the role identifiers. Email addresses are fictional and unique within each municipality; some role emails repeat across municipalities. Registration can add more Pending accounts. Only public demonstration credentials are supported; personal passwords are never stored.

- `dataset.exportJson(context)` returns a JSON string, suggested filename and exported row count. The versioned `ppe-demo` envelope contains exactly the current municipality. Transfer size is limited to 10 MiB. Blob binaries are omitted (`attachmentsIncluded: false`). This is a records export, not a full attachment backup.
- `dataset.importJson(context, json)` validates the complete envelope, every entity, IDs, unique keys, references, approval histories, monetary integers and the central permission snapshot. It atomically replaces only the current municipality. The importing Administrator must remain active. Existing audit events cannot be rewritten; removed historical actors are retained as disabled archive identities so their audit references remain resolvable. Identical local Blobs remain available only when document ID, storage key, size and type still match; unmatched Blobs are removed. Metadata imported into another browser may have no associated file, and download then returns an explicit not-found response.
- `dataset.prepareReset(context)` returns a single-use confirmation ID, exact required phrase, expiry, current record/file counts and a loss warning. No record changes occur during preview.
- `dataset.reset(context, { confirmationId, confirmationText })` requires the same actor/municipality, exact phrase, a preview younger than five minutes and an unchanged database revision. It restores original scoped JSON records and removes uploaded files. Other municipalities are preserved. Existing audit history and disabled historical actor identities survive, so a reset does not erase the audit trail or necessarily reproduce the initial total row count.

Both import and reset revoke all sessions in the affected municipality because identity/policy records may have changed. The settings controls clear the current reference and return to Login with the committed result notice. Other municipalities' sessions remain intact. Archived historical actors receive collision-free archive usernames so restored seed names can be reused safely.

Permission JSON is a validated snapshot of `domain/permissions.ts`, not a second editable policy engine. Imports cannot add/remove grants. If later phases change policy/schema, add an explicit versioned migration for existing databases and update seed snapshots; do not reseed on refresh.

## Transactions and validation

Mutations validate the mock session, resolve the active persisted actor, check central and persisted role/action grants, and validate scope inside the transaction. Related records, approval history, event notifications and audit entries commit together. Full-dataset relationship validation runs before commit; any exception aborts the IndexedDB transaction. Session references are written synchronously inside session-creation transactions; Web Storage cannot join an IndexedDB transaction, so a failed commit can leave an invalid reference which restore rejects and clears. This favors clarity and consistency for a small demo over large-dataset throughput.

All money is integer Philippine centavos within JavaScript's safe integer range. Percentages are not monetary amounts. Demo policies are explicitly marked `isDemo: true` and are not legally verified. Document uploads accept nonempty PDF, PNG, JPEG or text files up to 5 MiB, with filename, extension, MIME and basic signature checks. Those checks are not malware scanning. Blob reads complete before the write transaction starts.

The implementation follows [Dexie's transaction/population model](https://dexie.org/docs/Transaction/Transaction.html), [versioned upgrades](https://dexie.org/docs/Version/Version.upgrade()) and [Zod's strict schema validation](https://zod.dev/api). Tests use the real Dexie implementation with fake-indexeddb and Node's built-in test runner. Storage remains origin/profile-local; there is no backend, multi-device synchronization, production authentication or tamper-proof audit storage.
