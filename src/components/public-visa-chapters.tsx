import { ActivityTimeline } from "@/components/application-detail";
import { DocStatusBadge } from "@/components/badges";
import { Progress } from "@/components/ui";
import { PublicVisaIntake } from "@/components/public-visa-intake";
import { publicVisaTourCopy } from "@/lib/public-visa-tour-copy";
import type { UiLocale } from "@/lib/ui-locale-values";

// Illustrative events for the public preview. No agency records are queried.
const sampleHistory = [
  { history: { id: "review", reason: null, createdAt: new Date("2026-05-12T09:30:00Z") }, toStatus: { code: "DOCUMENTS_CHECKING", name: "Documents checking" } },
  { history: { id: "submission", reason: "Request submitted", createdAt: new Date("2026-05-12T09:05:00Z") }, toStatus: { code: "SUBMITTED", name: "Submitted" } },
];

export function PublicVisaChapters({ locale }: { locale: UiLocale }) {
  const copy = publicVisaTourCopy[locale];
  return (
    <PublicVisaIntake locale={locale}>
      <details className="visa-tour-history">
        <summary>{copy.history}</summary>
        <div className="visa-tour-history-grid">
          <dl className="proof-record">
            <div><dt>{copy.requirements[0]}</dt><dd><DocStatusBadge status="ACCEPTED" /></dd></div>
            <div><dt>{copy.requirements[1]}</dt><dd><DocStatusBadge status="UNDER_REVIEW" /></dd></div>
            <div><dt>{copy.accepted}</dt><dd><Progress done={1} total={2} /></dd></div>
          </dl>
          <ActivityTimeline locale={locale} history={sampleHistory} />
        </div>
      </details>
    </PublicVisaIntake>
  );
}
