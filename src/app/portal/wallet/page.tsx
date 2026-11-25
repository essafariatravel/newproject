import { businessReason } from "@/lib/business-labels";
import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { getBalance } from "@/lib/wallet";
import { listWalletTransactions } from "@/lib/queries";
import { listTopupRequestsForAgency } from "@/lib/topup";
import { requestTopupAction } from "@/app/actions/topup";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount, formatDateTime } from "@/lib/format";
import { resolveLedgerPeriod } from "@/lib/ledger-filters";
import { EmptyState, Flash } from "@/components/ui";
import { WalletStatementForm } from "@/components/wallet-statement-form";
import { TopupRequestForm } from "@/components/topup";
import { BankAccountDirectory } from "@/components/bank-accounts";
import { listBankAccounts } from "@/lib/bank-accounts";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

import { WalletDrawer, WalletFilters, WalletCopy } from "./wallet-interactions";

export const dynamic = "force-dynamic";

/** Balance below which we proactively suggest a top-up (a typical visa fee). */
const LOW_BALANCE_HINT_DZD = 15000;

export default async function PortalWalletPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const uiLocale = await getUiLocale(raw);
  const ct = contentT(uiLocale);
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = typeof v === "string" ? v : undefined;
  const user = await portalPageUser();
  const copy = {
    fr:{title:"Portefeuille",transactions:"Transactions",recharges:"Recharges",bank:"Coordonnées bancaires",fund:"Recharger",track:"Suivre ma recharge",pending:"Recharge en attente",notCredited:"Non créditée",history:"Historique des transactions",search:"Référence, dossier, motif ou montant…",export:"Exporter",close:"Fermer",details:"Détails",before:"Solde avant",after:"Solde après",period:"Période",month:"Ce mois",previousMonth:"Mois précédent",three:"3 mois calendaires",custom:"Dates personnalisées",all:"Depuis le début",exportLimit:"CSV et Excel : filtres actifs, 100 transactions maximum par export.",pdfScope:"Le PDF couvre toutes les opérations de la période choisie, indépendamment des filtres de type et de recherche.",noResults:"Aucune transaction ne correspond aux filtres.",adminOnly:"Votre administrateur agence gère les recharges.",confirmed:"Crédit uniquement après confirmation des fonds.",noBank:"Aucun compte bancaire configuré. Contactez ESSAFARIA avant tout virement.",estimated:"Montant en attente, hors solde disponible."},
    en:{title:"Wallet",transactions:"Transactions",recharges:"Top-ups",bank:"Bank details",fund:"Top up",track:"Track my top-up",pending:"Pending top-up",notCredited:"Not credited",history:"Transaction history",search:"Reference, application, reason or amount…",export:"Export",close:"Close",details:"Details",before:"Balance before",after:"Balance after",period:"Period",month:"This month",previousMonth:"Previous month",three:"3 calendar months",custom:"Custom dates",all:"All time",exportLimit:"CSV and Excel: active filters, up to 100 transactions per export.",pdfScope:"The PDF includes all movements in the selected period, regardless of type and search filters.",noResults:"No transactions match these filters.",adminOnly:"Your agency administrator manages top-ups.",confirmed:"Funds are credited only after confirmation.",noBank:"No bank account configured. Contact ESSAFARIA before transferring funds.",estimated:"Pending funds are excluded from the available balance."},
    ar:{title:"المحفظة",transactions:"المعاملات",recharges:"طلبات الشحن",bank:"البيانات البنكية",fund:"شحن المحفظة",track:"متابعة طلب الشحن",pending:"طلب شحن قيد الانتظار",notCredited:"لم يضف للرصيد",history:"سجل المعاملات",search:"المرجع أو الطلب أو السبب أو المبلغ…",export:"تصدير",close:"إغلاق",details:"التفاصيل",before:"الرصيد السابق",after:"الرصيد اللاحق",period:"الفترة",month:"هذا الشهر",previousMonth:"الشهر السابق",three:"3 أشهر تقويمية",custom:"تواريخ مخصصة",all:"منذ البداية",exportLimit:"CSV وExcel: الفلاتر النشطة، 100 معاملة كحد أقصى لكل تصدير.",pdfScope:"يشمل PDF جميع العمليات خلال الفترة المختارة بغض النظر عن فلاتر النوع والبحث.",noResults:"لا توجد معاملات تطابق الفلاتر.",adminOnly:"مسؤول الوكالة يدير طلبات الشحن.",confirmed:"يضاف الرصيد بعد تأكيد الأموال فقط.",noBank:"لا يوجد حساب بنكي مهيأ. اتصلوا بالسفارية قبل التحويل.",estimated:"المبلغ المعلق غير مدرج في الرصيد المتاح."}
  }[uiLocale];

  if (!hasPermission(user,"transactions.view.own")) {
    const [balance, bankAccounts] = await Promise.all([getBalance(user.agencyId), listBankAccounts(user)]);
    return <section className="essafaria-wallet" dir={uiLocale==="ar"?"rtl":"ltr"}><style>{walletCss}</style><h1>{copy.title}</h1><div className="wallet-balance"><div><p>{ct("Available balance")}</p><strong><bdi>{formatAmount(balance.balance,"DZD",uiLocale)}</bdi></strong></div></div><p>{ct("Your Agency Admin manages wallet funding and transactions.")}</p><BankAccountDirectory accounts={bankAccounts} locale={uiLocale}/></section>;
  }
  const flash = flashFrom(sp);
  const page = Math.min(100000, Math.max(1, Math.floor(Number(sp.page) || 1)));
  const range = resolveLedgerPeriod({ period: sp.period, from: sp.from, to: sp.to });
  const typeFilter = sp.type && typeFilterOptions(ct).some((o) => o.value === sp.type) ? sp.type : undefined;
  const q = sp.q?.trim() || undefined;

  const [balance, ledger, topups, bankAccounts] = await Promise.all([
    getBalance(user.agencyId),
    listWalletTransactions({
      agencyId: user.agencyId, // tenant scope from the session only
      type: typeFilter,
      q,
      from: range.from,
      to: range.to,
      page,
      pageSize: 8,
    }),
    listTopupRequestsForAgency(user.agencyId),
    listBankAccounts(user),
  ]);

  const pendingTopup = topups.find((t) => t.status === "PENDING") ?? null;
  const balanceValue = Number(balance.balance);
  const lowBalance = balanceValue < LOW_BALANCE_HINT_DZD;
  const query: Record<string, string | undefined> = {
    period: sp.period,
    from: sp.from,
    to: sp.to,
    type: typeFilter,
    q,
    lang: uiLocale,
  };
  const exportQuery = new URLSearchParams();
  exportQuery.set("lang", uiLocale);
  for (const [k, v] of Object.entries(query)) if (v) exportQuery.set(k, v);

  const tab=sp.tab==="recharges"?"recharges":sp.tab==="bank"?"bank":"transactions";
  const walletUrl=(changes:Record<string,string|undefined>={})=>{const p=new URLSearchParams();for(const [k,v] of Object.entries({...query,...changes}))if(v)p.set(k,v);return "/portal/wallet"+(p.size?"?"+p.toString():"")};
  const tabs=[["transactions",copy.transactions],["recharges",copy.recharges],["bank",copy.bank]] as const;
  const periodOptions=[{value:"all",label:copy.all},{value:"this_month",label:copy.month},{value:"last_month",label:copy.previousMonth},{value:"last_3_months",label:copy.three},{value:"custom",label:copy.custom}];
  const today=new Date().toISOString().slice(0,10);
  const statementTo=range.to?new Date(range.to.getTime()-86400000).toISOString().slice(0,10):today;
  const pdfTo=statementTo>today?today:statementTo;
  const filtered=Boolean(q||typeFilter||range.period!=="all");
  const smart={fr:{today:"Aujourd’hui",yesterday:"Hier",more:"Autres types",loading:"Actualisation…",copy:"Copier la référence",copied:"Référence copiée",failed:"Copie indisponible",view:"Voir le dossier",recorded:"Mouvement enregistré",range:"Transactions",of:"sur",help:"À propos",low:"Solde potentiellement insuffisant",linked:"Dossier ou recharge"},en:{today:"Today",yesterday:"Yesterday",more:"Other types",loading:"Updating…",copy:"Copy reference",copied:"Reference copied",failed:"Copy unavailable",view:"View application",recorded:"Recorded movement",range:"Transactions",of:"of",help:"About",low:"Potentially insufficient balance",linked:"Application or top-up"},ar:{today:"اليوم",yesterday:"أمس",more:"أنواع أخرى",loading:"جارٍ التحديث…",copy:"نسخ المرجع",copied:"تم نسخ المرجع",failed:"النسخ غير متاح",view:"عرض الطلب",recorded:"حركة مسجلة",range:"المعاملات",of:"من",help:"حول المحفظة",low:"قد يكون الرصيد غير كافٍ",linked:"الطلب أو الشحن"}}[uiLocale];
  const dateKey=(value:Date|string)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Africa/Algiers",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
  const timeLabel=(value:Date|string)=>new Intl.DateTimeFormat(uiLocale,{timeZone:"Africa/Algiers",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));
  const dateLabel=(value:Date|string)=>{const key=dateKey(value);return key===dateKey(new Date())?smart.today:key===dateKey(new Date(Date.now()-86400000))?smart.yesterday:new Intl.DateTimeFormat(uiLocale,{timeZone:"Africa/Algiers",day:"numeric",month:"long",year:"numeric"}).format(new Date(value))};
  const pageLink=(value:number)=>walletUrl({page:value>1?String(value):undefined});
  const firstResult=ledger.rows.length?(ledger.page-1)*8+1:0;
  const lastResult=firstResult?firstResult+ledger.rows.length-1:0;
  return <section id="wallet" className="essafaria-wallet" dir={uiLocale==="ar"?"rtl":"ltr"}>
    <style>{walletCss}</style>
    <h1>{copy.title}</h1>
    <Flash {...flash}/>
    <div className="wallet-overview" data-pending={Boolean(pendingTopup)}><div className="wallet-balance"><div><p>{ct("Available balance")}</p><strong><bdi>{formatAmount(balance.balance,"DZD",uiLocale)}</bdi></strong>{lowBalance?<small className="wallet-warning" title={ct("Your wallet balance may be insufficient for a new application.")}>● {smart.low}</small>:null}</div>
      {pendingTopup?null:user.role==="AGENCY_ADMIN"?<WalletDrawer id="topup" title={copy.fund} trigger={copy.fund} close={copy.close} openFromHash>
        <p className="wallet-muted">{ct("Tell ESSAFARIA how much you need in your wallet. Your balance is credited once the funds are confirmed — no online payment is taken here.")}</p>
        <BankAccountDirectory accounts={bankAccounts} locale={uiLocale}/>
        <TopupRequestForm
            smart
            action={requestTopupAction}
            back="/portal/wallet"
            currentBalance={balance.balance}
            locale={uiLocale}
            disabled={Boolean(pendingTopup)}
            disabledReason={ct("You already have a pending top-up request.")}
            copy={{
              amountLabel: ct("Amount to fund (DZD)"),
              amountPlaceholder: "50000",
              noteLabel: ct("Optional note (payment reference, transfer date…)"),
              notePlaceholder: ct("Bank transfer #1234"),
              submit: ct("Send top-up request"),
              sending: ct("Sending…"),
              resultingBalance: ct("Resulting balance"),
              currentBalance: ct("Current balance"),
              creditLabel: ct("Credit wallet"),
              rejectLabel: ct("Reject request"),
              reasonLabel: ct("Reason (sent to the agency)"),
              reasonPlaceholder: ct("e.g. bank transfer received 23 Sep"),
              confirmCredit: ct("Credit and close"),
              confirmReject: ct("Confirm rejection"),
              processing: ct("Processing…"),
              requestedAmount: ct("Requested amount (DZD)"),
              creditedAmount: ct("Amount to fund (DZD)"),
              maxNote: ct("Credit amounts above the requested value are not allowed — use a manual adjustment instead."),
            }}
          />
      </WalletDrawer>:<small>{copy.adminOnly}</small>}
    </div>
    {pendingTopup?<div id="topup" className="wallet-pending"><div><small className="wallet-warning">● {copy.pending}</small><strong className="wallet-pending-amount"><bdi>{formatAmount(pendingTopup.amount,"DZD",uiLocale)}</bdi></strong><small><bdi>{pendingTopup.reference}</bdi> · {formatDateTime(pendingTopup.createdAt,uiLocale)}</small></div><div><small>{copy.notCredited}</small><Link className="btn-primary" href={walletUrl({tab:"recharges"})}>{copy.track}</Link></div></div>:null}</div>
    <nav className="wallet-tabs" aria-label={copy.title}>{tabs.map(([key,label])=><Link key={key} href={walletUrl({tab:key==="transactions"?undefined:key})} aria-current={tab===key?"page":undefined}>{label}</Link>)}</nav>
    {tab==="transactions"?<>
      <WalletFilters q={q??""} type={typeFilter??""} period={range.period} from={sp.from??""} to={sp.to??""} types={[{value:"",label:ct("All")},...typeFilterOptions(ct)]} periods={periodOptions} locale={uiLocale} labels={{search:copy.search,type:ct("Type"),period:copy.period,reset:ct("Reset"),from:ct("From"),to:ct("To"),apply:ct("Filter"),loading:smart.loading,all:copy.all,more:smart.more}} exportControl={<WalletDrawer id="wallet-exports" title={copy.export} trigger={copy.export+" ↓"} close={copy.close} className="btn-secondary">
        <p className="wallet-muted">{copy.exportLimit}</p>
        <div className="wallet-export-links"><a className="btn-secondary" href={"/api/agency/wallet/export?"+exportQuery.toString()}>{ct("Export CSV")}</a><a className="btn-secondary" href={"/api/agency/wallet/export?"+exportQuery.toString()+"&format=xlsx"}>{ct("Export Excel")}</a></div>
        {user.role==="AGENCY_ADMIN"?<><p className="wallet-muted">{copy.pdfScope}</p><WalletStatementForm
            locale={uiLocale}
            copy={{
              title: ct("Download wallet statement (PDF)"),
              body: ct("Professional statement for a chosen period: opening balance, credits, debits and closing balance, derived directly from the immutable ledger. DZD only."),
              from: ct("From"),
              to: ct("To"),
              generate: ct("Generate PDF"),
              alertMissing: ct("Please choose both a 'from' and a 'to' date."),
              alertInverted: ct("The 'from' date must not be after the 'to' date."),
            }}
            today={pdfTo}
            defaultFrom={range.fromIso??new Date(Date.now()-30*86400000).toISOString().slice(0,10)}
          /></>:null}
      </WalletDrawer>}/>
      <div className="wallet-ledger-summary"><h2>{copy.history}</h2><small data-testid="wallet-period-range">{range.period==="all"?copy.all:copy.period+" : "+(range.fromIso??"…")+" — "+(range.to?new Date(range.to.getTime()-86400000).toISOString().slice(0,10):"…")}</small></div>
      {ledger.rows.length===0?<EmptyState title={filtered?copy.noResults:ct("No transactions yet")} body={filtered?undefined:ct("Wallet credits and application charges will appear here. DZD only.")}/>:<>
        <div className="wallet-ledger-list" aria-label={copy.history}>
        {ledger.rows.map(({tx,applicationReference,topupRequestId,topupReference},index)=>{
          const creditEffect=Number(tx.balanceAfter)>Number(tx.balanceBefore);
          const typeLabel=tx.type==="COMMERCIAL_DISCOUNT"?ct("Commercial discount/refund"):tx.type==="COMMERCIAL_SURCHARGE"?ct("Commercial surcharge"):tx.type==="APPLICATION_CHARGE"?ct("Application charge"):tx.type==="CREDIT"?ct("Credit"):tx.type==="DEBIT"?ct("Debit"):tx.type.replaceAll("_"," ");
          const reason=businessReason(tx.reason,tx.type,applicationReference,uiLocale);
          const amount=(creditEffect?"+":"−")+formatAmount(tx.amount,"DZD",uiLocale);
          const prior=ledger.rows[index-1];
          const newDay=!prior||dateKey(prior.tx.createdAt)!==dateKey(tx.createdAt);
          return <div className="wallet-ledger-item" key={tx.id}>{newDay?<h3 className="wallet-date-group">{dateLabel(tx.createdAt)}</h3>:null}
          <WalletDrawer id={"tx-"+tx.id} title={copy.details} close={copy.close} className="wallet-ledger-trigger" trigger={<><span className="wallet-movement" data-credit={creditEffect} aria-hidden="true">{creditEffect?"↓":"↑"}</span><span className="wallet-ledger-title"><strong>{typeLabel}</strong><small><bdi>{tx.reference??"—"}</bdi> · {timeLabel(tx.createdAt)}</small></span><span className="wallet-ledger-context" title={reason}><strong><bdi>{applicationReference??topupReference??reason}</bdi></strong>{applicationReference||topupReference?<small>{reason}</small>:null}</span><span className="wallet-ledger-values"><strong className="wallet-money" data-credit={creditEffect}><bdi>{amount}</bdi></strong><small>{copy.after}: <bdi>{formatAmount(tx.balanceAfter,"DZD",uiLocale)}</bdi></small></span><span className="wallet-ledger-chevron" aria-hidden="true">›</span></>}>
            <div className="wallet-detail-hero"><small>{typeLabel}</small><strong className="wallet-money" data-credit={creditEffect}><bdi>{amount}</bdi></strong><small>{smart.recorded} · {formatDateTime(tx.createdAt,uiLocale)}</small></div>
            <dl className="wallet-detail-list"><div><dt>{ct("Reference")}</dt><dd><bdi>{tx.reference??"—"}</bdi></dd></div><div><dt>{copy.before}</dt><dd><bdi>{formatAmount(tx.balanceBefore,"DZD",uiLocale)}</bdi></dd></div><div><dt>{copy.after}</dt><dd><bdi>{formatAmount(tx.balanceAfter,"DZD",uiLocale)}</bdi></dd></div><div><dt>{ct("Reason")}</dt><dd>{reason}</dd></div>{applicationReference||topupReference?<div><dt>{smart.linked}</dt><dd><bdi>{applicationReference??topupReference}</bdi></dd></div>:null}</dl>
            {applicationReference&&tx.applicationId?<Link className="btn-primary" href={"/portal/applications/"+tx.applicationId}>{smart.view} · {applicationReference}</Link>:null}{topupRequestId?<Link className="btn-secondary" href={"/api/topups/"+topupRequestId+"/proof"}>{ct("View receipt")}</Link>:null}{tx.reference?<WalletCopy value={tx.reference} label={smart.copy} done={smart.copied} failed={smart.failed}/>:null}
          </WalletDrawer></div>
        })}</div>
        <div className="wallet-ledger-pagination"><small><bdi>{firstResult}–{lastResult}</bdi> {smart.of} <bdi>{ledger.total}</bdi> · {smart.range}</small>{ledger.pageCount>1?<nav aria-label={ct("page")}><span>{ledger.page}/{ledger.pageCount}</span>{ledger.page>1?<Link href={pageLink(ledger.page-1)} scroll={false} aria-label={ct("Previous")} className="wallet-page-button"><span className="directional">‹</span></Link>:<span className="wallet-page-button" aria-disabled="true">‹</span>}{ledger.page<ledger.pageCount?<Link href={pageLink(ledger.page+1)} scroll={false} aria-label={ct("Next")} className="wallet-page-button"><span className="directional">›</span></Link>:<span className="wallet-page-button" aria-disabled="true">›</span>}</nav>:null}</div>
      </>}
    </>:tab==="recharges"?<><h2>{ct("Top-up requests")}</h2>{topups.length===0?<p className="wallet-muted">{ct("Top-up requests you send to ESSAFARIA appear here with their status.")}</p>:<div className="wallet-topup-list">{topups.map(t=><div className="wallet-topup-row" key={t.id}><div><strong><bdi>{formatAmount(t.amount,"DZD",uiLocale)}</bdi></strong><small><bdi>{t.reference}</bdi> · {formatDateTime(t.createdAt,uiLocale)}</small>{t.proofFilename?<Link href={"/api/topups/"+t.id+"/proof"}>{ct("Open bank transfer receipt")}</Link>:null}</div><span className="wallet-status" data-status={t.status}>● {ct(topupStatusLabel(t.status))}</span><div><small>{ct("Wallet transaction")}</small><bdi>{t.walletReference??"—"}</bdi></div></div>)}</div>}<p className="wallet-muted">{copy.confirmed}</p></>:<BankAccountDirectory accounts={bankAccounts} locale={uiLocale}/>}
    <details className="wallet-info"><summary>{ct("About your wallet")}</summary><p>{ct("Your wallet is prepaid and denominated in Algerian dinars (DZD) only. Every movement is written to an immutable ledger with a numbered reference, a before/after balance and a reason — nothing can be edited or deleted, corrections are made with compensating entries.")}</p></details>
  </section>;
}
function topupStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "PROCESSED":
      return "Processed";
    case "REJECTED":
      return "Rejected";
    default:
      return "Cancelled";
  }
}

function typeFilterOptions(ct: (s: string) => string) {
  return [
    { value: "CREDIT", label: ct("Credit") },
    { value: "DEBIT", label: ct("Debit") },
    { value: "APPLICATION_CHARGE", label: ct("Application charge") },
    { value: "COMMERCIAL_DISCOUNT", label: ct("Commercial discount/refund") },
    { value: "COMMERCIAL_SURCHARGE", label: ct("Commercial surcharge") },
  ];
}

const walletCss = "/* ESSAFARIA 2.1: exact dashboard chrome, scoped to the case list only. */\n.workspace-agency.workspace-agency:has(.essafaria-wallet){\n --agency-paper:#fff;--agency-ink:#0b1c30;--agency-muted:#344457;--agency-rule:#e2e5e9;--agency-hover:#f5f7fa;\n background:#fff;color:#0b1c30;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif;\n}\nhtml[lang=\"ar\"] .workspace-agency.workspace-agency:has(.essafaria-wallet){font-family:\"Plex Arabic\",Barlow,Arial,sans-serif}\n.workspace-agency.workspace-agency:has(.essafaria-wallet) #workspace-main{background:#fff;padding-block-start:24px}\n.workspace-agency.workspace-agency:has(.essafaria-wallet) .workspace-header-context{display:none}\n.workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation a[href=\"/portal/notifications\"] .badge{display:none}\n.workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-header-brand small{font-size:15px;letter-spacing:normal}\n.workspace-agency.workspace-agency:has(.essafaria-wallet) .workspace-topbar button,.workspace-agency.workspace-agency:has(.essafaria-wallet) .workspace-topbar summary{font-family:inherit}\n.workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation .workspace-nav-link{font-size:16px;font-weight:500}\n.workspace-agency.workspace-agency:has(.essafaria-wallet) :is(.workspace-topbar,.agency-desktop-navigation) :is(a,button,summary):focus-visible{outline:2px solid #304b64;outline-offset:3px}\n@media(min-width:1280px){\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .workspace-topbar{flex-shrink:0}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation{position:sticky;top:64px;z-index:29;flex-shrink:0;background:white}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation a:is([href=\"/portal/notifications\"],[href=\"/portal/profile\"]){display:none}\n}\n@media(min-width:1600px){\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .workspace-topbar{height:68px;padding-inline:24px}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .workspace-topbar > div:last-child > span.hidden{display:none}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .account-menu-identity{display:none}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation{top:0;z-index:31;align-self:center;width:calc(100% - 480px);min-height:68px;height:68px;margin-block-start:-68px;padding:0;gap:8px;justify-content:center;border:0;background:transparent}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation .workspace-nav-link{padding:8px 12px;min-height:44px;white-space:nowrap;border-radius:6px}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation .workspace-nav-link:not([href=\"/portal/applications/new\"]) .workspace-nav-icon{display:none}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation .workspace-nav-link[aria-current]:not([href=\"/portal/applications/new\"]){background:transparent;box-shadow:inset 0 -2px #0b1c30;border-radius:0;color:#0b1c30;font-weight:600}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation .workspace-nav-link:hover:not([href=\"/portal/applications/new\"]){background:#f5f7fa}\n .workspace-agency.workspace-agency:has(.essafaria-wallet) .agency-desktop-navigation a[href=\"/portal/applications/new\"]{margin-inline:6px}\n}\n.essafaria-wallet{display:grid;gap:18px;min-width:0;color:#0b1c30;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif;font-size:16px;line-height:1.5}\n.essafaria-wallet[dir=rtl]{font-family:\"Plex Arabic\",Barlow,Arial,sans-serif}\n.essafaria-wallet h1{font-size:34px;font-weight:600;line-height:1.2;letter-spacing:-.025em;margin:0}\n.essafaria-wallet[dir=rtl] h1{letter-spacing:normal}\n.essafaria-wallet h2{font-size:20px;font-weight:600;margin:0}\n.essafaria-wallet small,.essafaria-wallet .wallet-muted{font-size:15px;color:#647182;line-height:1.45}\n.essafaria-wallet small{display:block;overflow-wrap:anywhere}\n.essafaria-wallet :is(button,input,select){font-family:inherit}\n.essafaria-wallet :is(.btn-primary,.btn-secondary,.input){min-height:44px;border-radius:6px;font-size:15px}\n.essafaria-wallet :is(button,a,input,select,summary):focus-visible{outline:2px solid #285582;outline-offset:3px}\n.wallet-balance{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-block:6px 20px;border-bottom:1px solid #e2e5e9}\n.wallet-balance p{color:#647182;font-size:15px;margin:0}\n.wallet-balance strong{display:block;font-size:clamp(32px,4vw,48px);font-weight:600;line-height:1.25;letter-spacing:-.025em;font-variant-numeric:tabular-nums;margin-block:3px 8px}\n.essafaria-wallet .wallet-warning{color:#85551c}\n.wallet-pending{display:flex;justify-content:space-between;gap:16px;padding-block:8px 18px;border-bottom:1px solid #e2e5e9}\n.wallet-pending>div:last-child{text-align:end}\n.wallet-pending strong{font-weight:600;font-variant-numeric:tabular-nums}\n.wallet-tabs{display:flex;gap:28px;overflow:auto;border-bottom:1px solid #e2e5e9}\n.wallet-tabs a{display:flex;align-items:center;white-space:nowrap;min-height:46px;border-bottom:2px solid transparent;color:#647182}\n.wallet-tabs a[aria-current]{color:#0b1c30;font-weight:600;border-color:#0b1c30}\n.wallet-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}\n.wallet-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.wallet-search{flex:1 1 240px;min-width:0}.wallet-search input{width:100%}\n.wallet-filters select{max-width:100%}\n.wallet-period-control{position:relative;display:flex;align-items:center;min-height:44px;border:1px solid #a7b1bd;border-radius:6px;padding:0 28px 0 12px;white-space:nowrap}\n.wallet-period-control select{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}\n.wallet-period-control::after{content:\"⌄\";position:absolute;inset-inline-end:9px;pointer-events:none}\n.wallet-period-control:focus-within{outline:2px solid #285582;outline-offset:2px}\n.wallet-custom-range{display:flex;align-items:end;gap:8px;flex-wrap:wrap;flex:1 1 100%;order:1}.wallet-custom-range label{display:grid;gap:3px;font-size:15px;min-width:0}\n.wallet-reset,.wallet-application a,.wallet-topup-row a{color:#285582;text-decoration:underline;text-underline-offset:3px}\n.wallet-ledger{min-width:0;border-block:1px solid #e2e5e9}\n.wallet-row{display:grid;grid-template-columns:minmax(0,2.1fr) minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr) auto;gap:12px;align-items:center;padding-block:13px;border-bottom:1px solid #e2e5e9;min-width:0}\n.wallet-row:last-child{border-bottom:0}.wallet-row>div{min-width:0;overflow-wrap:anywhere}\n.wallet-table-head{color:#647182;font-size:15px;padding-block:10px}\n.wallet-table-head>span:nth-child(3),.wallet-table-head>span:nth-child(4){text-align:end}\n.wallet-transaction{display:flex;gap:12px;align-items:center}\n.wallet-transaction>div{min-width:0}.wallet-transaction strong{font-weight:600}\n.wallet-movement{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:50%;background:#f3f5f7;color:#0b1c30;font-size:20px}\n.wallet-movement[data-credit=true],.wallet-money[data-credit=true]{color:#21684f}\n.wallet-money,.wallet-after{text-align:end;font-variant-numeric:tabular-nums}\n.wallet-money{font-weight:600}.wallet-after{color:#344457}\n.wallet-detail-button{font-size:14px;color:#285582;min-height:44px;white-space:nowrap}\n.wallet-row:not(.wallet-table-head):hover{background:#f8fafb}\n.wallet-topup-list{border-block:1px solid #e2e5e9}\n.wallet-topup-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;padding-block:15px;border-bottom:1px solid #e2e5e9}\n.wallet-topup-row:last-child{border:0}.wallet-topup-row strong{font-weight:600}\n.wallet-topup-row a{font-size:15px}\n.wallet-status{color:#647182;font-size:15px}.wallet-status[data-status=PENDING]{color:#85551c}.wallet-status[data-status=PROCESSED]{color:#21684f}\n.wallet-info{border-top:1px solid #e2e5e9;padding-block:12px;color:#647182;font-size:15px}.wallet-info summary{cursor:pointer;color:#344457}.wallet-info p{max-width:75ch;margin-top:8px}\n.essafaria-wallet [data-testid=agency-bank-accounts]{background:white;border:0;padding:0}\n.essafaria-wallet [data-testid=agency-bank-accounts]>div>div{background:white;border:1px solid #e2e5e9}\n.essafaria-wallet .wallet-drawer{position:fixed;inset-block:0;inset-inline-start:auto;inset-inline-end:0;margin:0;width:min(560px,100vw);height:100dvh;max-height:100dvh;max-width:100vw;border:0;background:white;color:#0b1c30;overflow:auto;padding:24px;box-shadow:-8px 0 32px #0b1c3014}\n.essafaria-wallet .wallet-drawer::backdrop{background:#0b1c3055}\n.wallet-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e5e9;padding-bottom:14px;margin-bottom:18px}\n.wallet-close{width:44px;height:44px;display:grid;place-items:center;font-size:26px;color:#647182}\n.wallet-drawer-body{display:grid;gap:18px;min-width:0}.wallet-drawer-body>*{min-width:0}\n.wallet-drawer-body .card{border:0;padding:0;background:white;box-shadow:none}\n.wallet-drawer-body form#topup>div:first-of-type{grid-template-columns:minmax(0,1fr)}\n.wallet-drawer-body form#topup dl{grid-template-columns:minmax(0,1fr);background:#f3f5f7;border:0}\n.wallet-drawer-body form#topup button[type=submit]{width:100%}\n.wallet-quick-amounts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}\n.wallet-quick-amounts button{border:1px solid #d8dfe6;border-radius:5px;padding:7px 9px;font-size:13px;color:#344457}\n.wallet-quick-amounts button[aria-pressed=true]{border-color:#0b1c30;color:#0b1c30;background:#f3f5f7}\n.wallet-proof{position:relative;border:1px dashed #a7b1bd;border-radius:8px}\n.wallet-proof-picker{display:grid;gap:5px;padding:18px;text-align:center;cursor:pointer;overflow-wrap:anywhere}\n.wallet-proof-picker strong{font-weight:600}.wallet-proof-picker span{font-size:14px;color:#647182}\n.wallet-proof-input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}\n.wallet-proof:focus-within{outline:2px solid #285582;outline-offset:2px}\n.wallet-export-links{display:flex;gap:8px;flex-wrap:wrap}\n.wallet-detail-list{display:grid;gap:12px}.wallet-detail-list>div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e5e9;padding-bottom:10px}.wallet-detail-list dt{color:#647182;flex:1}.wallet-detail-list dd{margin:0;max-width:65%;text-align:end;overflow-wrap:anywhere}\n@media(max-width:760px){.wallet-row{grid-template-columns:minmax(0,1fr) auto;gap:6px 12px}.wallet-table-head{display:none}.wallet-row .wallet-transaction{grid-column:1;grid-row:1}.wallet-row .wallet-money{grid-column:2;grid-row:1}.wallet-row .wallet-application{grid-column:1;grid-row:2;padding-inline-start:46px}.wallet-row .wallet-after{grid-column:2;grid-row:2;font-size:14px}.wallet-row>div:last-child{grid-column:2;justify-self:end}.wallet-topup-row{grid-template-columns:minmax(0,1fr) auto}.wallet-topup-row>div:last-child{grid-column:1/-1}.wallet-balance{flex-wrap:wrap}.wallet-tabs{gap:20px}.essafaria-wallet h1{font-size:28px}.wallet-drawer{padding:16px!important}}\n@media(prefers-reduced-motion:no-preference){.wallet-row,.wallet-tabs a,.wallet-quick-amounts button{transition:background-color 160ms ease,color 160ms ease}}\n\n/* Revision 02 — Smart Ledger */\n.essafaria-wallet{gap:12px}\n.essafaria-wallet h1{font-size:32px}\n.wallet-overview{display:grid;grid-template-columns:minmax(0,1fr);border-bottom:1px solid #e2e5e9;padding-block:8px 14px;gap:20px}\n.wallet-overview[data-pending=true]{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}\n.wallet-overview .wallet-balance{border:0;padding:0;min-width:0}\n.wallet-overview .wallet-balance strong{font-size:clamp(30px,3vw,42px);margin:2px 0 4px}\n.wallet-overview .wallet-pending{border:0;border-inline-start:1px solid #e2e5e9;padding:0 0 0 24px;gap:12px;align-items:center}\n.essafaria-wallet[dir=rtl] .wallet-overview .wallet-pending{padding:0 24px 0 0}\n.wallet-overview .wallet-pending-amount{display:block;font-size:26px;line-height:1.25;margin:4px 0}\n.wallet-overview .wallet-pending>div:last-child{display:grid;gap:6px;justify-items:end}\n.wallet-overview .wallet-pending .btn-primary{white-space:nowrap}\n.wallet-tabs a{min-height:42px}\n.wallet-smart-controls{display:grid;gap:8px;min-width:0}\n.wallet-control-top,.wallet-control-bottom{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}\n.wallet-smart-search{flex:1 1 280px;min-width:0;display:flex;align-items:center;gap:10px;border:1px solid #d8dfe6;border-radius:7px;min-height:42px;padding-inline:12px}\n.wallet-smart-search svg{width:20px;height:20px;color:#647182;flex:none}\n.wallet-smart-search input{width:100%;min-width:0;border:0;background:transparent;font-size:15px;outline:none!important;padding:7px 0}\n.wallet-smart-search:focus-within{outline:2px solid #285582;outline-offset:2px}\n.wallet-control-actions,.wallet-chips{display:flex;gap:8px;align-items:center;flex-wrap:wrap}\n.wallet-control,.wallet-more,.wallet-chips>button{font-size:15px;min-height:36px;padding:6px 12px;border-radius:6px;white-space:nowrap;color:#344457;display:inline-flex;align-items:center;gap:8px}\n.wallet-control{min-height:42px;border:1px solid #d8dfe6}\n.wallet-chips>button[aria-pressed=true],.wallet-more[aria-pressed=true]{background:#eaf0f5;color:#0b1c30;font-weight:600}\n.wallet-chips>button:hover,.wallet-more:hover,.wallet-control:hover{background:#f3f5f7}\n.wallet-menu-anchor{position:relative;min-width:0}\n.wallet-menu{position:absolute;inset-inline-end:0;top:calc(100% + 5px);z-index:40;min-width:220px;width:max-content;max-width:min(320px,85vw);background:white;border:1px solid #d8dfe6;border-radius:8px;padding:4px;box-shadow:0 8px 24px #0b1c3014}\n.wallet-menu button{width:100%;display:flex;justify-content:space-between;gap:10px;min-height:40px;padding:8px 10px;font-size:15px;text-align:start;border-radius:5px;white-space:normal}\n.wallet-menu button:is(:hover,[aria-pressed=true]){background:#f3f5f7;color:#0b1c30}\n.wallet-clear{color:#647182;font-size:14px;text-decoration:underline;text-underline-offset:3px}\n.wallet-ledger-summary{display:flex;align-items:center;justify-content:space-between;gap:12px}\n.wallet-ledger-summary h2{font-size:17px}\n.wallet-ledger-list{border-block:1px solid #e2e5e9;min-width:0}\n.wallet-date-group{font-size:13px;font-weight:600;color:#647182;padding:6px 0 3px;margin:0;background:#fff}\n.wallet-ledger-trigger{display:grid;grid-template-columns:30px minmax(0,1.1fr) minmax(0,1fr) minmax(0,auto) 14px;align-items:center;gap:10px;text-align:start;min-width:0;width:100%;padding:5px 4px;min-height:48px;border-bottom:1px solid #edf0f3;background:white}\n.wallet-ledger-trigger:hover,.wallet-ledger-trigger:focus-visible{background:#f5f7fa}\n.wallet-ledger-trigger .wallet-movement{width:28px;height:28px;font-size:17px}\n.wallet-ledger-title,.wallet-ledger-context,.wallet-ledger-values{display:grid;min-width:0;gap:0}\n.wallet-ledger-title strong,.wallet-ledger-context strong,.wallet-ledger-values strong{font-size:15px;line-height:1.3;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.wallet-ledger-context strong{font-weight:500;color:#344457}\n.wallet-ledger-trigger small{font-size:13px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.wallet-ledger-values{text-align:end}\n.wallet-ledger-chevron{color:#647182;font-size:20px}\n.essafaria-wallet[dir=rtl] .wallet-ledger-chevron{transform:rotate(180deg)}\n.wallet-ledger-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px}\n.wallet-ledger-pagination nav{display:flex;align-items:center;gap:6px;font-size:14px;color:#647182}\n.wallet-page-button{display:grid;place-items:center;width:34px;height:34px;border:1px solid #d8dfe6;border-radius:6px;font-size:21px;color:#0b1c30}\n.wallet-page-button[aria-disabled=true]{opacity:.35}\n.wallet-detail-hero{display:grid;gap:4px;padding-block:8px 20px;border-bottom:1px solid #e2e5e9}\n.wallet-detail-hero strong{font-size:36px;text-align:start;font-variant-numeric:tabular-nums}\n.wallet-info{padding-block:8px}\n@media(max-width:760px){.wallet-overview[data-pending=true]{grid-template-columns:minmax(0,1fr);gap:14px}.wallet-overview .wallet-pending,.essafaria-wallet[dir=rtl] .wallet-overview .wallet-pending{border-inline-start:0;border-top:1px solid #e2e5e9;padding:10px 0 0}.wallet-overview .wallet-pending .btn-primary{white-space:normal}.wallet-ledger-trigger{grid-template-columns:26px minmax(0,1fr) minmax(0,auto) 10px;gap:2px 8px;padding-block:7px}.wallet-ledger-title{grid-column:2;grid-row:1}.wallet-ledger-context{grid-column:2;grid-row:2}.wallet-ledger-context small{display:none}.wallet-ledger-values{grid-column:3;grid-row:1/3}.wallet-ledger-chevron{grid-column:4;grid-row:1/3}.wallet-ledger-trigger .wallet-movement{grid-row:1/3;width:26px;height:26px}.wallet-ledger-title strong,.wallet-ledger-values strong{font-size:14px}.wallet-ledger-context strong{font-size:13px}.wallet-ledger-trigger small{font-size:12px}.wallet-control-actions{justify-content:flex-end;flex:1}.wallet-smart-search{flex-basis:100%}.wallet-menu-anchor .wallet-menu{inset-inline-start:0;inset-inline-end:auto}.wallet-ledger-summary{flex-wrap:wrap}}\n@media(prefers-reduced-motion:no-preference){.wallet-ledger-trigger,.wallet-chips button{transition:background-color 150ms ease,color 150ms ease}}\n";
