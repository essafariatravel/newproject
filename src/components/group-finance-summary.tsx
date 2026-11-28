import {formatDZD} from "@/lib/format";
import {groupFinancialTotals} from "@/lib/group-policy";
import type {GroupFinance} from "@/lib/group-finance";
export function GroupFinanceSummary({rows,expected,locale}:{rows:GroupFinance[];expected:number;locale:"fr"|"en"|"ar"}){
 if(!rows.length)return null;
 const t={fr:{title:"Situation financière",charge:"Débits initiaux",extra:"Suppléments",discount:"Remises",refund:"Remboursements",net:"Net débité",invalid:"Écritures à rapprocher : consulter les dossiers."},en:{title:"Financial summary",charge:"Initial charges",extra:"Surcharges",discount:"Discounts",refund:"Refunds",net:"Net charged",invalid:"Ledger requires reconciliation: review individual cases."},ar:{title:"الوضع المالي",charge:"الخصومات الأولية",extra:"المبالغ الإضافية",discount:"التخفيضات",refund:"المبالغ المستردة",net:"صافي الخصم",invalid:"تحتاج القيود إلى مطابقة: راجع الطلبات."}}[locale];
 const totals=groupFinancialTotals(rows,expected);
 if(!totals)return <p role="status">{t.invalid}</p>;
 const sum=(key:keyof typeof totals)=>totals[key]/100;
 return <details className="group-finance-summary"><summary>{t.title} · <bdi>{formatDZD(sum("net"))}</bdi></summary><dl className="grid grid-cols-2 gap-2 text-sm">{([["charged",t.charge],["surcharge",t.extra],["discount",t.discount],["refund",t.refund],["net",t.net]] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd><bdi>{formatDZD(sum(key))}</bdi></dd></div>)}</dl></details>
}
