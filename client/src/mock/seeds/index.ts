import municipalities from './municipalities.json' with { type: 'json' }
import departments from './departments.json' with { type: 'json' }
import users from './users.json' with { type: 'json' }
import permissions from './permissions.json' with { type: 'json' }
import assetCategories from './asset-categories.json' with { type: 'json' }
import assets from './assets.json' with { type: 'json' }
import registrations from './registration-requests.json' with { type: 'json' }
import documents from './documents.json' with { type: 'json' }
import projects from './construction-projects.json' with { type: 'json' }
import documentRouting from './document-routing.json' with { type: 'json' }
import cipCosts from './cip-costs.json' with { type: 'json' }
import inventorySessions from './inventory-sessions.json' with { type: 'json' }
import inventoryChecks from './inventory-checks.json' with { type: 'json' }
import discrepancies from './discrepancies.json' with { type: 'json' }
import transfers from './transfers.json' with { type: 'json' }
import maintenance from './maintenance.json' with { type: 'json' }
import disposals from './disposals.json' with { type: 'json' }
import accountingRecords from './accounting-records.json' with { type: 'json' }
import depreciationPolicies from './depreciation-policies.json' with { type: 'json' }
import reconciliations from './reconciliation.json' with { type: 'json' }
import approvals from './approvals.json' with { type: 'json' }
import notifications from './notifications.json' with { type: 'json' }
import auditLogs from './audit-logs.json' with { type: 'json' }
import settings from './settings.json' with { type: 'json' }
import { validateDataset } from '../validation/dataset.js'

/** JSON is initial input only. Never write to these files at runtime. */
export function originalDataset() {
  return validateDataset({ municipalities, departments, users, permissions, assetCategories, assets, registrations, documents, projects, documentRouting, cipCosts, inventorySessions, inventoryChecks, discrepancies, transfers, maintenance, disposals, accountingRecords, depreciationPolicies, reconciliations, approvals, notifications, auditLogs, settings })
}
