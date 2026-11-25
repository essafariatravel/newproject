import Link from "next/link";
import type { UiLocale } from "@/lib/ui-i18n";
import type { BankAccount } from "@/lib/bank-accounts";
import { bankAccountCopy } from "@/lib/bank-accounts-copy";
import { addBankAccountAction, removeBankAccountAction } from "@/app/actions/bank-accounts";
import { CopyRibButton, RemoveBankAccountForm } from "@/components/bank-accounts-client";
import { SubmitButton } from "@/components/forms";

function groupedRib(rib: string): string {
  return rib.replace(/^(\d{3})(\d{5})(\d{10})(\d{2})$/, "$1 $2 $3 $4");
}

export function BankAccountDirectory({
  accounts, locale, smart=false,
}: { accounts: BankAccount[]; locale: UiLocale; smart?:boolean }) {
  const t = bankAccountCopy(locale);
  const polish={fr:{title:"Coordonnées bancaires",empty:"Coordonnées bancaires indisponibles",contact:"Contacter ESSAFARIA",account:"Compte de virement · DZD",intro:"Utilisez uniquement les coordonnées affichées ici, puis transmettez votre justificatif de virement. Le crédit intervient après confirmation des fonds."},en:{title:"Bank details",empty:"Bank details unavailable",contact:"Contact ESSAFARIA",account:"Transfer account · DZD",intro:"Use only the details displayed here, then submit your transfer receipt. Funds are credited after confirmation."},ar:{title:"البيانات البنكية",empty:"البيانات البنكية غير متاحة",contact:"التواصل مع السفارية",account:"حساب التحويل · DZD",intro:"استخدموا فقط البيانات المعروضة هنا ثم أرسلوا إيصال التحويل. يضاف الرصيد بعد تأكيد الأموال."}}[locale];
  const bankIcon=<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 9 9-5 9 5M4 10h16M6 11v7m4-7v7m4-7v7m4-7v7M3 20h18"/></svg>;
  if(smart)return <section className="wallet-bank-directory" data-testid="agency-bank-accounts" aria-label={polish.title}>
    <h2>{polish.title}</h2>
    {accounts.length===0?<div className="wallet-bank-empty" role="status"><span className="wallet-bank-icon">{bankIcon}</span><strong>{polish.empty}</strong><p>{t.none}</p><Link className="btn-secondary" href="/portal/messages">{polish.contact}</Link></div>:<>
      <p className="wallet-muted">{polish.intro}</p>
      <div className="wallet-bank-grid">{accounts.map(account=><article key={account.id} className="wallet-bank-account"><div className="wallet-bank-name"><span className="wallet-bank-icon">{bankIcon}</span><div><h3><bdi>{account.bankName}</bdi></h3><small>{polish.account}</small></div></div><dl><div><dt>{t.beneficiary}</dt><dd><bdi>{account.holderName}</bdi></dd></div><div><dt>{t.rib}</dt><dd dir="ltr" className="wallet-bank-rib">{groupedRib(account.rib)}</dd></div></dl><CopyRibButton rib={account.rib} label={t.copy} copiedLabel={t.copied}/></article>)}</div>
    </>}
  </section>;
  return (
    <section className="rounded-lg border border-line/80 bg-white p-4 sm:p-5" aria-label={t.title} data-testid="agency-bank-accounts">
      <h3 className="text-lg font-semibold tracking-tight text-navy-900">{t.title}</h3>
      <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600">{t.intro}</p>
      {accounts.length === 0 ? (
        <p className="mt-4 text-base text-slate-600" role="status">{t.none}</p>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-lg border border-line/80 bg-ivory-50/40 p-4">
              <p className="text-base font-semibold text-navy-900">{account.bankName}</p>
              <dl className="mt-3 space-y-3 text-base">
                <div>
                  <dt className="text-xs text-slate-500">{t.beneficiary}</dt>
                  <dd className="mt-1 font-semibold text-navy-900"><bdi>{account.holderName}</bdi></dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{t.rib}</dt>
                  <dd className="mt-1 break-all font-mono text-base font-semibold tabular-nums text-navy-900" dir="ltr">
                    {groupedRib(account.rib)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <CopyRibButton rib={account.rib} label={t.copy} copiedLabel={t.copied} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function BankAccountsAdmin({
  accounts, locale,
}: { accounts: BankAccount[]; locale: UiLocale }) {
  const t = bankAccountCopy(locale);
  return (
    <section className="card mt-8 p-5 sm:p-6" aria-label={t.adminTitle} data-testid="admin-bank-accounts">
      <h2 className="font-serif text-lg text-navy-900">{t.adminTitle}</h2>
      <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600">{t.adminIntro}</p>

      {accounts.length ? (
        <ul className="mt-5 divide-y divide-line/80 border-y border-line/80">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="font-semibold text-navy-900">{account.bankName} · <bdi>{account.holderName}</bdi></p>
                <p className="mt-1 break-all font-mono text-xs tabular-nums text-slate-600" dir="ltr">
                  {groupedRib(account.rib)}
                </p>
              </div>
              <RemoveBankAccountForm
                id={account.id}
                action={removeBankAccountAction}
                label={t.remove}
                confirmMessage={t.confirmRemove}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-base text-slate-500">{t.adminEmpty}</p>
      )}

      <form action={addBankAccountAction} className="mt-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="bank-account-bank">{t.bank} *</label>
            <input
              id="bank-account-bank" name="bankName" className="input" type="text"
              maxLength={120} minLength={2} placeholder={t.bankPlaceholder}
              required autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="bank-account-holder">{t.beneficiary} *</label>
            <input
              id="bank-account-holder" name="holderName" className="input" type="text"
              maxLength={160} minLength={2} placeholder={t.holderPlaceholder}
              required autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="bank-account-rib">{t.rib} *</label>
            <input
              id="bank-account-rib" name="rib" className="input font-mono tabular-nums"
              type="text" dir="ltr" inputMode="numeric" maxLength={32}
              placeholder={t.ribPlaceholder} required autoComplete="off"
            />
          </div>
        </div>
        <SubmitButton className="btn-primary btn-sm" pendingLabel="…">{t.add}</SubmitButton>
      </form>
    </section>
  );
}
