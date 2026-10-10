# ESSAFARIA VISA OS — Access & Need-to-Know Register

Status: current technical permission model, reviewed 2026-10-03.

This register reports the code as implemented. It does not decide what the business **should** authorize.

## Current role model

Roles:
- SUPER_ADMIN
- ADMIN
- VISA_AGENT
- ACCOUNTING
- AGENCY_ADMIN
- AGENCY_USER

Agency roles are tenant-bound. Server services further restrict records by `agencyId`.

## Current effective Staff permissions

Important implementation fact: although `src/lib/rbac.ts` declares differentiated lists, V1 subsequently assigns ADMIN, VISA_AGENT and ACCOUNTING the same operational permission set derived from SUPER_ADMIN, excluding only:
- `users.manage`
- `recovery.manage`.

Therefore the **effective current implementation** is:

| Capability | SUPER_ADMIN | ADMIN | VISA_AGENT | ACCOUNTING |
| --- | --- | --- | --- | --- |
| Staff back office | Yes | Yes | Yes | Yes |
| Agency view/manage | Yes | Yes | Yes | Yes |
| Registration view/manage | Yes | Yes | Yes | Yes |
| User account management | Yes | No | No | No |
| Recovery link management | Yes | No | No | No |
| Config/CMS management | Yes | Yes | Yes | Yes |
| Audit/reports | Yes | Yes | Yes | Yes |
| All applications/applicants | Yes | Yes | Yes | Yes |
| Document view/review | Yes | Yes | Yes | Yes |
| Wallet view/adjust | Yes | Yes | Yes | Yes |
| Transactions | Yes | Yes | Yes | Yes |
| Communications | Yes | Yes | Yes | Yes |

Supporting constants in `src/lib/types.ts` also currently authorize all Staff roles for status changes, wallet management, document review, submission overrides and registration decisions.

## Agency roles

| Capability | AGENCY_ADMIN | AGENCY_USER |
| --- | --- | --- |
| Create own-tenant applications | Yes | Yes |
| View own-tenant applicants | Yes | Yes |
| Upload authorized own-tenant documents | Yes | Yes |
| View own-tenant documents | Yes | Yes |
| View own wallet | Yes | Yes |
| View own transactions | Yes | No |
| Post agency-visible communications | Yes | Yes |
| Agency notifications | Yes | Yes |
| Manage agency members | Yes, constrained to allowed agency-member operations | No |
| Staff/admin back office | No | No |

Service-layer tenant checks remain mandatory even where a broad permission exists.

## Sensitive access observations

Applicant/document/application access is broad across the current Staff perimeter.

Wallet mutation is also broad across the current Staff perimeter.

Audit visibility is broad across the current Staff perimeter.

SUPER_ADMIN remains uniquely privileged for account administration/recovery and, after the Legal/Privacy gate, legal-content publication.

## OWNER BUSINESS DECISION REQUIRED

Before pilot/go-live, Owner must explicitly decide one of these models:

1. **Keep V1 shared operational Staff access.**
   This preserves the existing operating model and tests.

2. **Introduce role separation.**
   Example questions to decide:
   - Should VISA_AGENT lose wallet adjustment?
   - Should ACCOUNTING lose document/applicant contents?
   - Should VISA_AGENT/ACCOUNTING lose agency-registration decisions?
   - Should CMS/config/audit access be ADMIN-only?
   - Which role may see top-up receipts?
   - Which role may export reports containing applicant/business data?

Engineering must not infer these business responsibilities.

If Owner selects role separation, treat it as a dedicated RBAC change with service/action/UI tests; do not implement it as a cosmetic menu restriction.

Legal/professional review may advise on minimization/need-to-know, but the operational role assignment itself is an Owner business decision.
