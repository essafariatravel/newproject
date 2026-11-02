import type { UiLocale } from "@/lib/ui-i18n";

const chapters = {
  en: {
    title: "Inside a visa file",
    select: "Explore a stage of the application",
    stages: [
      ["Prepare the file", "Choose the destination and visa service, then enter the traveller’s details in the agency workspace."],
      ["Submit documents", "Use the dossier checklist to attach the requested documents. If another document is needed, the request stays with the file."],
      ["Follow the application", "Open the dossier to check its current status, read messages from the visa desk and see what needs attention."],
    ],
  },
  fr: {
    title: "Le parcours d’un dossier de visa",
    select: "Explorer une étape du dossier",
    stages: [
      ["Préparer le dossier", "Sélectionnez la destination et le type de visa, puis renseignez les informations du voyageur dans votre espace agence."],
      ["Transmettre les pièces", "Consultez la liste des justificatifs et joignez les pièces demandées. Toute demande complémentaire reste associée au dossier."],
      ["Suivre la demande", "Ouvrez le dossier pour consulter son statut, lire les messages du service visas et identifier la prochaine action."],
    ],
  },
  ar: {
    title: "مراحل ملف التأشيرة",
    select: "استعرضوا إحدى مراحل الطلب",
    stages: [
      ["إعداد الملف", "اختاروا الوجهة ونوع التأشيرة، ثم أدخلوا بيانات المسافر في مساحة الوكالة."],
      ["إرسال المستندات", "راجعوا قائمة الوثائق وأرفقوا المستندات المطلوبة. وأي طلب لوثيقة إضافية يبقى مرتبطاً بالملف."],
      ["متابعة الطلب", "افتحوا الملف للاطلاع على حالة الطلب ورسائل فريق التأشيرات ومعرفة الإجراء المطلوب."],
    ],
  },
} as const;

const images = [
  { file: "visa-intake", width: 1440, height: 960, small: true },
  { file: "visa-document-review", width: 1440, height: 960, small: true },
  { file: "essafaria-departure-editorial", width: 1672, height: 941 },
] as const;

export function PublicVisaChapters({ locale }: { locale: UiLocale }) {
  const copy = chapters[locale];
  return (
    <section id="visa-services" className="ess-container visa-chapters" aria-labelledby="chapter-title">

      <fieldset className="visa-chapter-spread">
        <legend className="sr-only">{copy.select}</legend>
        <div className="visa-chapter-controls">
          <h2 id="chapter-title">{copy.title}</h2>
          {copy.stages.map(([title, text], index) => (
            <div className="visa-chapter-row" key={title}>
              <input type="radio" name="visa-chapter" id={`visa-chapter-${index}`}
                defaultChecked={index === 0} aria-describedby={`visa-explanation-${index}`} />
              <label htmlFor={`visa-chapter-${index}`}>
                <span className="chapter-folio" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span>{title}</span>
              </label>
              <p id={`visa-explanation-${index}`}>{text}</p>
            </div>
          ))}
        </div>
        <div className="visa-chapter-window" aria-hidden="true">
          {images.map((image, index) => (
            <img key={image.file} className={`visa-scene visa-scene-${index}`}
              src={`/images/${image.file}.webp`}
              srcSet={"small" in image ? `/images/${image.file}-small.webp 720w, /images/${image.file}.webp ${image.width}w` : undefined}
              sizes="(max-width: 760px) 100vw, 54vw" width={image.width} height={image.height} alt="" loading="lazy" />
          ))}
        </div>
      </fieldset>
    </section>
  );
}
