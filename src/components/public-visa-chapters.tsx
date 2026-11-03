import { ActivityTimeline } from "@/components/application-detail";
import { DocStatusBadge } from "@/components/badges";
import { Progress } from "@/components/ui";
import { contentT } from "@/lib/i18n-content";
import type { UiLocale } from "@/lib/ui-i18n";

const copy = {
  en: {
    title: "The agency workspace", intro: "See how your team prepares a file, checks the documents and follows a traveller’s application.",
    select: "Explore the agency workspace", sample: "Sample dossier", file: "Visa application", intakeImage: "The visa application form showing the three steps and destination search.",
    passport: "Passport copy", supporting: "Supporting document", accepted: "Documents accepted",
    tabs: [
      ["Application intake", "Choose the visa service and record traveller details before submitting the file."],
      ["Document review", "See which documents have been accepted and which are still under review."],
      ["Case tracking", "Follow status changes and read the history of the dossier in one place."],
    ],
  },
  fr: {
    title: "L’espace de travail de votre agence", intro: "Découvrez comment préparer un dossier, vérifier ses pièces et suivre la demande d’un voyageur.",
    select: "Découvrir l’espace agence", sample: "Dossier de démonstration", file: "Demande de visa", intakeImage: "Le formulaire de visa présente ses trois étapes et la recherche de destination.",
    passport: "Copie du passeport", supporting: "Justificatif", accepted: "Pièces acceptées",
    tabs: [
      ["Préparation du dossier", "Choisissez le service visa et renseignez les informations du voyageur avant l’envoi."],
      ["Contrôle des pièces", "Distinguez les documents acceptés de ceux qui restent en cours de vérification."],
      ["Suivi de la demande", "Consultez les changements de statut et retrouvez l’historique du dossier."],
    ],
  },
  ar: {
    title: "مساحة عمل الوكالة", intro: "اكتشفوا كيف يُعدّ فريقكم ملف المسافر، ويراجع وثائقه، ويتابع طلب التأشيرة.",
    select: "استكشفوا مساحة الوكالة", sample: "ملف توضيحي", file: "طلب تأشيرة", intakeImage: "نموذج طلب التأشيرة مع مراحله الثلاث وحقل البحث عن الوجهة.",
    passport: "نسخة جواز السفر", supporting: "وثيقة داعمة", accepted: "الوثائق المقبولة",
    tabs: [
      ["إعداد الطلب", "اختاروا خدمة التأشيرة وأدخلوا بيانات المسافر قبل إرسال الملف."],
      ["مراجعة الوثائق", "اطّلعوا على الوثائق المقبولة وتلك التي لا تزال قيد المراجعة."],
      ["متابعة الملف", "تابعوا تغيّر حالة الطلب وراجعوا سجلّ الملف في مكان واحد."],
    ],
  },
} as const;

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
    <section id="visa-services" className="travel-measure workspace-tour" aria-labelledby="chapter-title">
      <header className="tour-heading">
        <h2 id="chapter-title">{labels.title}</h2>
        <p>{labels.intro}</p>
      </header>
      <fieldset className="tour-selector">
        <legend className="sr-only">{labels.select}</legend>
        {labels.tabs.map(([title, description], i) => (
          <div key={title} className="tour-choice">
            <input id={`visa-chapter-${i}`} name="visa-chapter" type="radio" defaultChecked={i === 0}
              aria-controls={`visa-explanation-${i}`} />
            <label htmlFor={`visa-chapter-${i}`}>
              <span className="tour-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span><strong>{title}</strong><small>{description}</small></span>
            </label>
          </div>
        ))}
        <div className="product-proof">
          <div className="proof-body">
            <div className="proof-identity"><strong>{labels.sample}</strong><bdi dir="ltr">DEMO-001</bdi></div>
            <section id="visa-explanation-0" className="proof-pane">
              <h3>{labels.file}</h3>
              <picture className="proof-screen">
                <source media="(max-width: 639px)" srcSet={`/images/workflow/intake-${locale}-small.webp`} width="686" height={smallHeight} />
                <img src={`/images/workflow/intake-${locale}.webp`} alt={labels.intakeImage} width="1344" height={wideHeight} loading="lazy" />
              </picture>
            </section>
            <section id="visa-explanation-1" className="proof-pane">
              <h3>{ct("Documents")}</h3>
              <dl className="proof-record">
                <div><dt>{labels.passport}</dt><dd><DocStatusBadge status="ACCEPTED" /></dd></div>
                <div><dt>{labels.supporting}</dt><dd><DocStatusBadge status="UNDER_REVIEW" /></dd></div>
                <div><dt>{labels.accepted}</dt><dd><Progress done={1} total={2} /></dd></div>
              </dl>
            </section>
            <section id="visa-explanation-2" className="proof-pane">
              <h3>{ct("Activity timeline")}</h3>
              <ActivityTimeline locale={locale} history={sampleHistory} />
            </section>
          </div>
        </div>
      </fieldset>
    </section>
  );
}
