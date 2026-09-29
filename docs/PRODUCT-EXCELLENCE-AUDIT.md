# ESSAFARIA product excellence: discovery and implementation map

## Authority and baseline

The user explicitly adopts the Master Prompt for behavior and acceptance. The attached boards are visual references only; their sample people, numbers, fields and charts are not requirements or data. The palette/component board supplies brand language; the operational board supplies workspace hierarchy. Existing business capabilities must remain.

Repository: essafariatravel/newproject. Existing redesign branch is clean locally at 679867a; its corresponding published commit is 279d0d39a9941ef49ef59362ec4e13bbfd860a8b (same final change, different publication history). Work continues in an isolated local checkout on codex/essafaria-product-excellence. No main merge or Production operations are authorized.

## Existing component map

| Reference concept | Existing implementation | Direction |
| --- | --- | --- |
| Navy sidebar, quiet header | AppShell, NavList, StaffSearch | Keep navigation; fix active matching, keyboard mobile drawer, localized roles, add notification affordance |
| Ivory canvas, white panels | globals.css, Card, CardHeader | Shared spacing, subtle borders, 12–16px panels |
| Operational typography | PageHeader, KeyValue, shared sans tokens | Applicant first, reference secondary, compact staff density |
| Premium tables | TableWrap, th/td, FilterBar, Pagination | Consistent header/row rhythm and contained scrolling |
| Semantic badges | StatusBadge, DocStatusBadge, ActiveBadge | Retain server codes and localized display; restrained color |
| Three-step flow | RequestWizard + atomic submitVisaRequest | Preserve ephemeral files, one traveller and authoritative debit; refine labels and safe load errors |
| Attention panel | PortalDashboard + agencyDashboard | Replace status-only detection with shared open-request predicate |
| Application workspace | Existing portal/admin application details | Preserve documents, decisions, billing, messages and history; document-specific deep links |
| Finance | topup, wallet, statement, tabular-export | Preserve immutable ledger and permissions; fix delimiter interoperability |
| EN/FR/AR | ui-i18n, i18n-content, country-names | Extend source dictionaries and logical-direction controls |

## Audit findings

1. Attention panel and KPI only count DOCUMENTS_REQUESTED; requestDocumentReplacement creates an OPEN request without changing application status. Existing list filtering already supports open requests, but agency list does not thread that filter.
2. CSV always uses commas despite French Excel locale; BOM and formula protection already exist. XLSX already exists.
3. Sidebar parent matching highlights both dashboard and descendant routes. Mobile checkbox drawer lacks native focus containment and Escape behavior. Role badge exposes internal role codes.
4. Notification page has unlocalized system copy and no category filters. No live notification or presence mechanism exists in current source.
5. Existing atomic submission, wallet locking, tenant/RBAC, document request, export and workflow tests must be preserved. Baseline database tests cannot start under sandbox because embedded PostgreSQL calls OS user lookup (uv_os_get_passwd ENOMEM); recover environment before drawing product conclusions.
6. Build script disables automatic database steps only for the old redesign branch. Continuation must also suppress remote migration/seed before any Preview publication.
7. Vercel connector rejects team scope; authenticated browser access works. Mobbin connection requires a paid plan; approved user boards remain sufficient.

## Execution and evidence

Discover → audit → map (this document) → implement reliability and workflow fixes → shared visual changes → test → render EN/FR/AR desktop/mobile → abuse/regression → Preview → evidence report. Use local disposable fixture data only for mutations until a nonproduction remote database boundary is verified. Record actual results and any unmet acceptance items; compilation alone is not completion.
