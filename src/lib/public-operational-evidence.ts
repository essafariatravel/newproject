import type { UiLocale } from "@/lib/ui-i18n";

/**
 * Public editorial examples of the existing agency workflow.
 * These are not client cases, visa instructions, SLAs or performance claims.
 */
export const PUBLIC_OPERATIONAL_EVIDENCE: Record<UiLocale, {
  kicker: string;
  title: string;
  intro: string;
  screenshotCaption: string;
  screenshotAlt: string;
  scenarios: Array<{ title: string; detail: string }>;
  limits: string;
}> = {
  en: {
    kicker: "Inside the professional workspace",
    title: "From an agency file to a documented follow-up",
    intro: "Here is how the same professional workflow helps an agency prepare a request, respond to a document query and follow the information available for a case. The illustration below uses a fictional demonstration file.",
    screenshotCaption: "Illustrative screenshot of the existing agency interface. Demo file only; no traveller or partner records are shown.",
    screenshotAlt: "Demonstration of the agency visa intake form, with the service selection and traveller details steps.",
    scenarios: [
      {
        title: "When a document is missing or unclear",
        detail: "The ESSAFARIA team can request a clarification or an additional supporting document during its review. The agency checks the request and provides the appropriate file through its authorized workspace.",
      },
      {
        title: "When an agency needs a status update",
        detail: "Its authorized users consult the case status and available activity history in the portal, rather than relying on a public page. The visible status records the operational follow-up; it does not constitute a consular decision.",
      },
      {
        title: "Before sending a new request",
        detail: "The agency selects an available service in the private catalogue, verifies the traveller information and required attachments, and can check its agency wallet balance before submission.",
      },
    ],
    limits: "The relevant consular or immigration authority alone decides whether to grant a visa. Requirements, service availability and processing times vary by case; ESSAFARIA does not guarantee approval.",
  },
  fr: {
    kicker: "Au sein de l’espace professionnel",
    title: "Du dossier préparé par l’agence au suivi documenté",
    intro: "Voici comment le parcours professionnel permet à une agence de préparer une demande, de répondre à une question documentaire et de consulter les informations de suivi disponibles. L’illustration utilise uniquement un dossier fictif de démonstration.",
    screenshotCaption: "Capture illustrative de l’interface agence existante. Dossier de démonstration uniquement, sans données de voyageurs ni de partenaires.",
    screenshotAlt: "Démonstration du formulaire agence pour préparer une demande de visa, avec les étapes de sélection du service et de saisie du voyageur.",
    scenarios: [
      {
        title: "Lorsqu’une pièce manque ou doit être clarifiée",
        detail: "Pendant le contrôle du dossier, l’équipe ESSAFARIA peut demander un justificatif complémentaire ou une précision. L’agence consulte cette demande et transmet le document approprié dans son espace autorisé.",
      },
      {
        title: "Lorsqu’une agence souhaite connaître l’avancement",
        detail: "Ses utilisateurs habilités consultent le statut du dossier et l’historique disponible dans le portail. Ce suivi indique une étape opérationnelle, mais ne représente pas une décision consulaire.",
      },
      {
        title: "Avant l’envoi d’une nouvelle demande",
        detail: "L’agence choisit un service disponible dans le catalogue privé, vérifie les informations du voyageur et les pièces requises, puis peut contrôler le solde de son portefeuille agence avant la soumission.",
      },
    ],
    limits: "Seule l’autorité consulaire ou migratoire compétente décide de la délivrance du visa. Les justificatifs, disponibilités et délais varient selon les dossiers ; ESSAFARIA ne garantit pas l’obtention du visa.",
  },
  ar: {
    kicker: "داخل المساحة المهنية",
    title: "من إعداد ملف الوكالة إلى متابعة موثّقة",
    intro: "يوضح هذا المثال كيف تُحضّر الوكالة الطلب، وتستجيب لطلب وثيقة إضافية، وتراجع معلومات المتابعة المتاحة في حسابها المهني. الصورة مأخوذة من واجهة توضيحية لملف افتراضي فقط.",
    screenshotCaption: "لقطة توضيحية من واجهة الوكالات الحالية، باستخدام ملف تجريبي من دون أي بيانات حقيقية للمسافرين أو الشركاء.",
    screenshotAlt: "واجهة تجريبية لإعداد طلب تأشيرة في حساب الوكالة، تتضمن اختيار الخدمة وإدخال بيانات المسافر.",
    scenarios: [
      {
        title: "عند نقص وثيقة أو الحاجة إلى توضيح",
        detail: "يمكن لفريق ESSAFARIA طلب مستند داعم إضافي أو توضيح أثناء مراجعة الملف. تطّلع الوكالة على الطلب وترسل الوثيقة المناسبة داخل مساحتها المصرّح بها.",
      },
      {
        title: "عندما تحتاج الوكالة إلى معرفة حالة الملف",
        detail: "يراجع المستخدمون المخوّلون حالة الطلب وسجلّ النشاط المتاح في البوابة. تعكس هذه المعلومات المتابعة التشغيلية ولا تُعدّ قراراً قنصلياً.",
      },
      {
        title: "قبل إرسال طلب جديد",
        detail: "تختار الوكالة خدمة متاحة من الفهرس الخاص، وتراجع بيانات المسافر والوثائق المطلوبة، ويمكنها التحقق من رصيد محفظتها قبل تقديم الطلب.",
      },
    ],
    limits: "قرار منح التأشيرة يعود حصراً إلى السلطات القنصلية أو المختصة بالهجرة. تختلف المتطلبات وتوفر الخدمات ومدد المعالجة بحسب الملف، ولا تضمن ESSAFARIA الموافقة على التأشيرة.",
  },
};
