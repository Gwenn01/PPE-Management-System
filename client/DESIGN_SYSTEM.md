# PPE enterprise presentation

## Targeted UI recovery and dashboard correction — 2026-10-25

The public landing, login and registration presentations were restored to the exact recoverable versions in `HEAD`. Their current landing images and marketing copy are intact, and auth handlers, schemas, session behavior and route guards are preserved. Dashboard styles are scoped to the authenticated shell and dialog classes; the original public gray/mist palette and auth composition are retained.

The authenticated frame uses a 256px navy sidebar and one rounded white workspace that fills the remaining viewport. Its 64px breadcrumb/action header shares the workspace surface; the workspace scrolls independently. Dashboard home uses compact KPI cards and a 12-column asymmetric Bento layout. The Administrator view prioritizes pending account registrations, then compact administrative activity, user status and department panels, followed by searchable recent records. Other roles use read-only role-specific panels from authorized `dashboardService` projections. Limited recent-record samples are labeled as such.

Colors: Navy `#1F305E`, Charcoal `#2C2C2B`, Gray `#8B8B8B`, Mist `#F2F3F4`, White. Dashboard-derived surface/border colors remain local to authenticated controls. No dependency, seed, schema, permission or workflow transition changed.

## Reference and scope

The supplied SaaS dashboard (`b4220b8bde36dd8cc8338daf4fb5d6b0.jpg`) supplies the composition: a full-height navigation rail, connected rounded workspace, integrated compact header, compact KPIs, asymmetric primary/supporting panels and visible records. The supplied PPE palette supplies colors. The decorative reference frame and green accents are excluded.

The application remains frontend-only. This phase changes React presentation and CSS; existing services, seed JSON, database schema, authorization and accounting/workflow rules are retained.

## Reusable styles

- `workspace-page`: full available width, `min-width: 0`, consistent vertical spacing. Page roots do not have centered `max-w-*` caps. Text descriptions, fields, and dialogs may retain useful local constraints.
- `ui-panel`: white surface, subtle palette-derived border, 14px radius, minimal shadow.
- `ui-input`: full-width fields with consistent height, focus, error and disabled states.
- `ui-button` / `ui-button-secondary`: navy or neutral functional actions, consistent sizing, wrapping, focus and disabled states.
- `module-tabs`: operational views within a module; selection is driven by existing `aria-pressed` or `aria-current` state. Administrator cross-module navigation remains exclusively in the sidebar.
- `ui-dialog`: constrained dialog surface. Header/footer remain visible while long content scrolls; Escape, focus containment and focus restoration remain in `Modal`.
- `record-table`, `record-card`, `record-card-fields`, `record-card-actions`: shared desktop/mobile presentation. Both consume the same processed rows and pagination state.

Colors are defined in `src/index.css`; the current palette is listed above. `muted`, `line`, `chip` and `navy-soft` are derived tones. Validation/destructive states may retain semantic red.

## Shell and responsive behavior

- A viewport-height flex shell contains a flush 256px desktop sidebar and a directly connected rounded workspace with a 64px integrated topbar and independently scrolling content region.
- Sidebar branding/account areas do not participate in navigation scrolling. Navigation labels may wrap.
- Below 1024px, navigation uses the existing drawer, backdrop, Escape dismissal and focus handling. Opening it makes main content inert and locks main scrolling. Resizing to desktop closes the drawer.
- Main content padding is 16px on narrow screens and 24px on desktop.
- KPI cards stack below 768px, use two columns on tablets/laptops, and three or four columns from 1280px according to the metric count. The information panels become two columns from 1280px; records always occupy the full page width below them.
- Below 768px, shared record lists display five cards per page. Tablet containers narrower than 44rem also display cards. Desktop retains tables and each module's configured page size.
- Mobile card fields stack below 400px. Long titles/statuses/actions wrap, and additional fields remain available through the details disclosure.
- Form/dialog width constraints are independent of page width. Currency columns opt into right alignment; stored centavo calculations are unchanged.

## Role dashboard coverage

All eight roles use `DashboardHome` and authorized `dashboardService` projections. The service returns role-specific, read-only panel data. The Administrator view uses the full municipal pending-account list, latest audit events, account status totals and active departments. Property, accounting, inventory, approval, audit, engineering and budget panels use their scoped assets, postings, assigned inspections, approvals, audit events, project progress and document routing respectively. Recent record tables retain the service's 60-record cap and describe themselves as recent records; the dashboard does not present that sample as an all-time total or trend.

| Role | Overview presentation |
| --- | --- |
| Administrator | Pending account application queue; latest administrative timeline; user status; active department summary |
| Property Officer | Asset category distribution; registration/lifecycle request pipeline |
| Accounting Officer | Posted account balances in PHP; recognition, reconciliation and review workload |
| Inventory Personnel | Assigned session inspection progress using actual checked versus assigned assets; observed discrepancies |
| Approving Officer | Oldest pending approval requests; recorded approval state distribution |
| Auditor | Latest read-only audit/posting activity; audit event distribution by resource |
| Engineering Office | Recorded construction progress for assigned projects; engineering document routing |
| Budget Office | Received/routed project documents; processing-stage distribution |

## Feature route coverage

| Module family | Routes / views using the presentation system |
| --- | --- |
| Administration | Users, account requests, departments, permissions, settings, administrative audit history |
| Asset registry | Assets, registration requests and their forms/details/documents |
| Construction / Engineering | Construction projects, engineering documents, processing and monitoring |
| Budget / received documents | Budget processing, vouchers, routing, received Accounting packets |
| Accounting | Recognition, depreciation schedules, CIP costs/capitalization, accounting report views |
| Inventory | Physical inventory, asset monitoring, lookup, verification history, discrepancy investigation/reinspection |
| Lifecycle | Transfers, maintenance, disposal, Accounting disposal review and history |
| Reconciliation | Sessions, comparison, investigation, corrections, history and policy settings |
| Approvals | Pending/returned/history and registration, capitalization, correction and lifecycle categories |
| Reports / Auditor | Report preview/export controls, read-only accounting/audit categories and full stored-record details |

## Page-coverage and verification matrix

`Redesigned` means the route was included in the source review and uses the shared shell and module presentation classes. Functional verification is split between existing domain/service coverage and browser interaction; passing service tests do not establish that a rendered control was clicked successfully. Responsive behavior below was source-reviewed and remains unverified in a rendered browser because no browser was connected.

| Role | Page / route coverage | Main existing actions retained | Redesign status | Functional verification | Responsive verification |
| --- | --- | --- | --- | --- | --- |
| Administrator | `/dashboard`; `/dashboard/users`; `/dashboard/account-requests`; `/dashboard/departments`; `/dashboard/permissions`; `/dashboard/settings`; `/dashboard/audit-trail` | User create/edit/status changes; account review/decision; department editing; permission review; settings/data tools; audit search/details | Redesigned; source-reviewed | Typecheck, lint, build and domain tests pass; browser controls unverified | Responsive classes/source reviewed; viewport rendering unverified |
| Property Officer | `/dashboard`; `/dashboard/assets`; `/dashboard/asset-registration`; `/dashboard/construction-projects`; `/dashboard/discrepancies`; `/dashboard/transfers`; `/dashboard/maintenance`; `/dashboard/disposal` | Registry search/details; save/submit drafts; upload/preview evidence; project updates; discrepancy investigation; lifecycle requests and history | Redesigned; source-reviewed | Typecheck, lint, build and domain tests pass; browser controls unverified | Responsive classes/source reviewed; viewport rendering unverified |
| Accounting Officer | `/dashboard`; `/dashboard/assets`; `/dashboard/accounting-documents`; `/dashboard/recognition`; `/dashboard/depreciation`; `/dashboard/cip-costs`; `/dashboard/disposal-review`; `/dashboard/reconciliation`; `/dashboard/reports` | Packet review/receipt; recognition; depreciation preview/posting; CIP cost review; disposal accounting review; reconciliation workflow; report preview/export | Redesigned; source-reviewed | Typecheck, lint, build and domain tests pass; accounting/reconciliation service scenarios pass; browser controls unverified | Responsive classes/source reviewed; viewport rendering unverified |
| Inventory Personnel | `/dashboard`; `/dashboard/assets`; `/dashboard/physical-inventory`; `/dashboard/asset-monitoring` | Assigned session start/continue/inspect/complete; asset search/QR lookup; observations; results/history | Redesigned; source-reviewed | Typecheck, lint, build and domain tests pass; inventory service scenarios pass; browser controls unverified | Responsive classes/source reviewed; viewport rendering unverified |
| Approving Officer | `/dashboard`; `/dashboard/approvals`; `/dashboard/approvals/returned`; `/dashboard/approvals/history`; `/dashboard/approvals/registrations`; `/dashboard/approvals/capitalization`; `/dashboard/approvals/corrections`; `/dashboard/approvals/lifecycle`; `/dashboard/reports` | Review; supporting evidence; approve; return with reason; reject with reason; decision/history | Redesigned; source-reviewed | Typecheck, lint, build and domain tests pass; approval service scenarios pass; browser controls unverified | Responsive classes/source reviewed; viewport rendering unverified |
| Auditor | `/dashboard`; `/dashboard/assets`; `/dashboard/reports`; `/dashboard/audit-trail` | Search/filter; inspect records/events; preview/export permitted reports; read-only history | Redesigned; source-reviewed | Typecheck, lint, build and domain tests pass; permission tests confirm no write grant; browser controls unverified | Responsive classes/source reviewed; viewport rendering unverified |
| Engineering Office | `/dashboard`; `/dashboard/construction-projects`; `/dashboard/engineering` | Project/document review; technical updates; external-evidence recording; packet return/forward; completion/readiness evidence | Redesigned; source-reviewed | Typecheck, lint, build and domain tests pass; construction service scenarios pass; browser controls unverified | Responsive classes/source reviewed; viewport rendering unverified |
| Budget Office | `/dashboard`; `/dashboard/construction-projects`; `/dashboard/budget` | Receive packet; review completeness; save voucher/classification; return/mark ready; external Treasury evidence; forward and history | Redesigned; source-reviewed | Typecheck, lint, build and domain tests pass; Budget service scenarios pass; browser controls unverified | Responsive classes/source reviewed; viewport rendering unverified |
| Public / shared | `/`; `/login`; `/register`; `/dashboard/access-denied` | Landing navigation; demo sign-in; registration request; access-denied return navigation | Landing/auth presentation restored from `HEAD`; route source reviewed | Typecheck, lint, build and authentication/access service tests pass; browser controls unverified | Original responsive classes restored; viewport rendering unverified |

Detailed internal tabs and record detail states are included in the corresponding feature modules listed above. Exact permission allowlists remain defined in `tests/architecture.test.ts`; this matrix does not grant access beyond those rules.

The Auditor category list now uses the shared paginated table/cards. Full stored payloads remain available through View Record. Report previews retain whole-report totals and export behavior. Operational tabs, permission checkboxes, confirmations, uploads and workflow handlers are retained.

## Verification boundary

See `QA_CHECKLIST.md` for actual automated results and outstanding browser acceptance. Source/type/service checks do not establish rendered layout, browser downloads or keyboard behavior at every viewport.

## Changed files

- `client/QA_CHECKLIST.md`
- `client/src/components/dashboard/Sidebar.tsx`
- `client/src/components/dashboard/Topbar.tsx`
- `client/src/components/ui/ActivityTimeline.tsx`
- `client/src/components/ui/ConfirmDialog.tsx`
- `client/src/components/ui/DataTable.tsx`
- `client/src/components/ui/DocumentPreview.tsx`
- `client/src/components/ui/EmptyState.tsx`
- `client/src/components/ui/ErrorState.tsx`
- `client/src/components/ui/FileUpload.tsx`
- `client/src/components/ui/FilterBar.tsx`
- `client/src/components/ui/FormField.tsx`
- `client/src/components/ui/LoadingSkeleton.tsx`
- `client/src/components/ui/Modal.tsx`
- `client/src/components/ui/PageHeader.tsx`
- `client/src/components/ui/Pagination.tsx`
- `client/src/components/ui/RecordCard.tsx`
- `client/src/components/ui/SearchInput.tsx`
- `client/src/components/ui/StatCard.tsx`
- `client/src/components/ui/StatusBadge.tsx`
- `client/src/components/ui/Toast.tsx`
- `client/src/features/access/AccessDenied.tsx`
- `client/src/features/accounting/AccountingModule.tsx`
- `client/src/features/accounting/AccountingReportsModule.tsx`
- `client/src/features/accounting/CIPModule.tsx`
- `client/src/features/administration/AdministratorModule.tsx`
- `client/src/features/approvals/ApprovalManagementModule.tsx`
- `client/src/features/assets/AssetRegistryModule.tsx`
- `client/src/features/auth/AccountRequests.tsx`
- `client/src/features/budget/BudgetModule.tsx`
- `client/src/features/construction/ConstructionModule.tsx`
- `client/src/features/data/DemoDataTools.tsx`
- `client/src/features/inventory/DiscrepancyModule.tsx`
- `client/src/features/inventory/InventoryModule.tsx`
- `client/src/features/inventory/QRLookup.tsx`
- `client/src/features/lifecycle/LifecycleModule.tsx`
- `client/src/features/lifecycle/LifecyclePolicyEditor.tsx`
- `client/src/features/reconciliation/ReconciliationModule.tsx`
- `client/src/features/reconciliation/ReconciliationPolicyEditor.tsx`
- `client/src/features/reports/AuditorModule.tsx`
- `client/src/features/reports/ReportsModule.tsx`
- `client/src/index.css`
- `client/src/layouts/DashboardLayout.tsx`
- `client/src/pages/dashboard/DashboardHome.tsx`
- `client/src/services/dashboardService.ts`
- `client/DESIGN_SYSTEM.md`
- `client/src/pages/dashboard/ModulePage.tsx`
- `client/src/components/dashboard/DashboardOverview.tsx`
