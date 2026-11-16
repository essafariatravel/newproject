import { ActivityTimeline } from "@/components/application-detail";
import { DocStatusBadge } from "@/components/badges";
import { Progress } from "@/components/ui";
import { contentT } from "@/lib/i18n-content";
import type { UiLocale } from "@/lib/ui-i18n";

const copy = {
  en: {
    title: "Agency workspace",
    select: "Explore the agency workspace", sample: "Sample dossier", file: "Visa application", intakeImage: "The visa application form showing the three steps and destination search.",
    passport: "Passport copy", supporting: "Supporting document", accepted: "Documents accepted",
    tabs: [
      ["Application intake", "Choose the visa service and record traveller details before submitting the file."],
      ["Document review", "See which documents have been accepted and which are still under review."],
      ["Case tracking", "Follow status changes and read the history of the dossier in one place."],
    ],
  },
  fr: {
    title: "Espace agence",
    select: "Découvrir l’espace agence", sample: "Dossier de démonstration", file: "Demande de visa", intakeImage: "Le formulaire de visa présente ses trois étapes et la recherche de destination.",
    passport: "Copie du passeport", supporting: "Justificatif", accepted: "Pièces acceptées",
    tabs: [
      ["Préparation du dossier", "Choisissez le service visa et renseignez les informations du voyageur avant l’envoi."],
      ["Contrôle des pièces", "Distinguez les documents acceptés de ceux qui restent en cours de vérification."],
      ["Suivi de la demande", "Consultez les changements de statut et retrouvez l’historique du dossier."],
    ],
  },
  ar: {
    title: "مساحة عمل الوكالة",
    select: "استكشفوا مساحة الوكالة", sample: "ملف توضيحي", file: "طلب تأشيرة", intakeImage: "نموذج طلب التأشيرة مع مراحله الثلاث وحقل البحث عن الوجهة.",
    passport: "نسخة جواز السفر", supporting: "وثيقة داعمة", accepted: "الوثائق المقبولة",
    tabs: [
      ["إعداد الطلب", "اختاروا خدمة التأشيرة وأدخلوا بيانات المسافر قبل إرسال الملف."],
      ["مراجعة الوثائق", "اطّلعوا على الوثائق المقبولة وتلك التي لا تزال قيد المراجعة."],
      ["متابعة الملف", "تابعوا تغيّر حالة الطلب وراجعوا سجلّ الملف في مكان واحد."],
    ],
  },
} as const;

const tabIcons = [
  "M3 7h6l2 2h10v10H3z M4 7V4h5l2 2h8v3",
  "M15 3H5v18h14V7l-4-4z M14 3v5h5 M8 14l2 2 5-5",
  "M3 12a9 9 0 1 0 3-7 M3 3v5h5 M12 7v6l4 2",
] as const;

// Illustrative events for the public preview. No agency records are queried.
const sampleHistory = [
  { history: { id: "review", reason: null, createdAt: new Date("2026-05-12T09:30:00Z") }, toStatus: { code: "DOCUMENTS_CHECKING", name: "Documents checking" } },
  { history: { id: "submission", reason: "Request submitted", createdAt: new Date("2026-05-12T09:05:00Z") }, toStatus: { code: "SUBMITTED", name: "Submitted" } },
];

// Heights of the 1344px and 686px form captures vary with the translated copy.
const captureHeights = { en: [394, 466], fr: [426, 498], ar: [392, 464] } as const;

export function PublicVisaChapters({ locale }: { locale: UiLocale }) {
  const labels = copy[locale];
  const ct = contentT(locale);
  const [wideHeight, smallHeight] = captureHeights[locale];
  return (
    <section id="visa-services" className="platform-width workspace-tour" aria-labelledby="chapter-title">
      <header className="tour-heading">
        <h2 id="chapter-title">{labels.title}</h2>
        <p className="sample-reference">{labels.sample}<bdi dir="ltr">DEMO-001</bdi></p>
      </header>
      <fieldset className="tour-selector">
        <legend className="sr-only">{labels.select}</legend>
        {labels.tabs.map(([title], i) => (
          <div key={title} className="tour-choice">
            <input id={`visa-chapter-${i}`} name="visa-chapter" type="radio" defaultChecked={i === 0}
              aria-controls={`visa-explanation-${i}`} />
            <label htmlFor={`visa-chapter-${i}`}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={tabIcons[i]} />
              </svg>
              <span>{title}</span>
            </label>
          </div>
        ))}
        <div className="product-proof">
          <div className="proof-body">
            <section id="visa-explanation-0" className="proof-pane">
              <div className="proof-intro">
                <h3>{labels.file}</h3>
                <p>{labels.tabs[0][1]}</p>
              </div>
              <picture className="proof-screen">
                <source media="(max-width: 639px)" srcSet={`/images/workflow/intake-${locale}-small.webp`} width="686" height={smallHeight} />
                <img src={`/images/workflow/intake-${locale}.webp`} alt={labels.intakeImage} width="1344" height={wideHeight} loading="lazy" />
              </picture>
            </section>
            <section id="visa-explanation-1" className="proof-pane">
              <div className="proof-intro">
                <h3>{ct("Documents")}</h3>
                <p>{labels.tabs[1][1]}</p>
              </div>
              <dl className="proof-record">
                <div><dt>{labels.passport}</dt><dd><DocStatusBadge status="ACCEPTED" /></dd></div>
                <div><dt>{labels.supporting}</dt><dd><DocStatusBadge status="UNDER_REVIEW" /></dd></div>
                <div><dt>{labels.accepted}</dt><dd><Progress done={1} total={2} /></dd></div>
              </dl>
            </section>
            <section id="visa-explanation-2" className="proof-pane">
              <div className="proof-intro">
                <h3>{ct("Activity timeline")}</h3>
                <p>{labels.tabs[2][1]}</p>
              </div>
              <ActivityTimeline locale={locale} history={sampleHistory} />
            </section>
          </div>
        </div>
      </fieldset>
    </section>
  );
}
