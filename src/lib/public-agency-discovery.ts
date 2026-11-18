import type { UiLocale } from "@/lib/ui-i18n";
import type { IndexablePublicSeoPage } from "@/lib/seo-manifest";
type LinkItem = { page: Exclude<IndexablePublicSeoPage, "home">; title: string; summary: string };
type DiscoveryCopy = { title: string; intro: string; items: LinkItem[] };
type ReadinessCopy = { title: string; intro: string; checks: Array<{ title: string; text: string }>; aboutLink: string };
/** Factual B2B service model: no prices, client files or private visa catalogue. */
export const PUBLIC_AGENCY_DISCOVERY: Record<UiLocale, DiscoveryCopy> = {
  en: {
    title: "B2B visa support for travel agencies across Algeria",
    intro: "ESSAFARIA helps professional travel agencies coordinate visa and eVisa cases. The agency remains the traveller's point of contact; the ESSAFARIA team helps with document checks and operational follow-up through a secure partner workspace.",
    items: [
      { page: "b2b", title: "Visa outsourcing for agencies in Algeria", summary: "Understand the B2B partnership, how cases are prepared and which information is available inside the agency portal." },
      { page: "faq", title: "Visa documents, case tracking and consular decisions", summary: "Answers to practical questions about missing documents, case progress and the limits of the service." },
      { page: "about", title: "The operator behind ESSAFARIA VISA OS", summary: "Review ESSAFARIA TRAVEL's professional identity and responsibilities." },
      { page: "contact", title: "Contact the B2B visa team in Algiers", summary: "Ask about the agency partnership or contact ESSAFARIA for professional enquiries." },
    ],
  },
  fr: {
    title: "Sous-traitance de visas B2B pour les agences en Algérie",
    intro: "ESSAFARIA accompagne les agences de voyages dans la préparation et le suivi des demandes de visa et eVisa. L'agence conserve la relation avec son voyageur ; l'équipe ESSAFARIA coordonne le contrôle documentaire et le suivi opérationnel via un espace partenaire sécurisé.",
    items: [
      { page: "b2b", title: "Découvrir la sous-traitance visa pour agences", summary: "Comprendre le partenariat B2B, les étapes d'un dossier et les informations disponibles dans le portail professionnel." },
      { page: "faq", title: "Documents, suivi et décisions consulaires", summary: "Retrouver les réponses sur les pièces manquantes, l'avancement et les responsabilités de chacun." },
      { page: "about", title: "Identifier ESSAFARIA TRAVEL et son rôle", summary: "Consulter l'identité professionnelle et les responsabilités de l'opérateur du portail." },
      { page: "contact", title: "Contacter le service visas B2B à Alger", summary: "Obtenir des renseignements pour devenir partenaire ou échanger avec l'équipe." },
    ],
  },
  ar: {
    title: "خدمات معالجة التأشيرات B2B لوكالات السفر في الجزائر",
    intro: "تساعد ESSAFARIA وكالات السفر في الجزائر على تحضير طلبات التأشيرات الإلكترونية والتأشيرات الأخرى ومتابعتها. تحافظ الوكالة على علاقتها بالمسافر، بينما ينسق فريق ESSAFARIA مراجعة الوثائق والمتابعة التشغيلية عبر مساحة شركاء آمنة.",
    items: [
      { page: "b2b", title: "خدمات التأشيرات B2B لوكالات السفر الجزائرية", summary: "تعرّفوا على نموذج الشراكة ومراحل إعداد الملف ومعلومات المتابعة المتاحة داخل البوابة." },
      { page: "faq", title: "الوثائق ومتابعة الملفات والقرارات القنصلية", summary: "إجابات عملية عن الوثائق الناقصة وحالة الطلب وحدود الخدمة ومسؤوليات الأطراف." },
      { page: "about", title: "التعرّف على ESSAFARIA TRAVEL ودورها", summary: "اطّلعوا على هوية المؤسسة المهنية ومسؤوليات الجهة المشغلة للبوابة." },
      { page: "contact", title: "التواصل مع فريق التأشيرات B2B في الجزائر", summary: "استفسروا عن الانضمام كشريك أو تواصلوا مع فريق ESSAFARIA." },
    ],
  },
};
export const PUBLIC_AGENCY_READINESS: Record<UiLocale, ReadinessCopy> = {
  en: {
    title: "Before your agency submits a visa case",
    intro: "These practical checks may reduce avoidable clarification requests. Requirements vary by destination, service and traveller: review the information available for the actual case inside your authorized account.",
    checks: [
      { title: "Match the traveller's details to supporting documents", text: "Confirm names, dates and identifying information with the traveller before submitting a request. Do not assume a previous application can be reused unchanged." },
      { title: "Review the available service and its documents", text: "Choose the relevant visa or eVisa service in the private workspace and review its current supporting-document requirements. Partner-only availability and commercial terms are not public." },
      { title: "Answer document queries within the secure portal", text: "When ESSAFARIA requests clarification, provide the relevant information through the authorized account. A case status describes operational follow-up, not a visa approval by the authority." },
    ],
    aboutLink: "Who operates the ESSAFARIA partner service?",
  },
  fr: {
    title: "Avant de confier un dossier de visa à ESSAFARIA",
    intro: "Ces vérifications peuvent limiter les allers-retours inutiles. Les formalités varient selon la destination, le service et le voyageur : consultez les exigences du dossier concerné dans votre espace autorisé.",
    checks: [
      { title: "Comparer les données du voyageur à ses justificatifs", text: "Vérifiez les noms, dates et données d'identité avec les documents fournis avant de renseigner le dossier. Ne réutilisez pas automatiquement une ancienne demande." },
      { title: "Vérifier le service et les pièces du dossier", text: "Dans le portail privé, choisissez un service visa ou eVisa disponible et consultez les justificatifs exigés. Les disponibilités et conditions commerciales restent réservées aux partenaires." },
      { title: "Répondre aux demandes depuis le compte sécurisé", text: "Si ESSAFARIA demande une précision ou une pièce complémentaire, transmettez-la dans le portail. Le statut du dossier décrit le suivi opérationnel et ne constitue pas une décision consulaire." },
    ],
    aboutLink: "Connaître ESSAFARIA et ses responsabilités",
  },
  ar: {
    title: "قبل تكليف ESSAFARIA بمتابعة ملف التأشيرة",
    intro: "قد تساعد هذه المراجعات على تقليل طلبات التوضيح غير الضرورية. تختلف المتطلبات حسب الوجهة والخدمة وحالة المسافر؛ راجعوا شروط الطلب المعني داخل حساب الوكالة المصرح به.",
    checks: [
      { title: "مطابقة بيانات المسافر مع المستندات", text: "راجعوا الأسماء والتواريخ وبيانات الهوية مع الوثائق المقدمة قبل إدخال الملف، ولا تعتمدوا تلقائياً على بيانات طلب سابق." },
      { title: "مراجعة الخدمة والوثائق الخاصة بالطلب", text: "اختاروا خدمة التأشيرة أو التأشيرة الإلكترونية المتاحة داخل البوابة الخاصة وتحققوا من مستنداتها. الخدمات والشروط التجارية الخاصة لا تظهر في الموقع العام." },
      { title: "إرسال التوضيحات عبر الحساب الآمن", text: "عندما يطلب فريق ESSAFARIA مستنداً إضافياً، أرسلوه من الحساب المصرّح به. تعبّر حالة الطلب عن المتابعة التشغيلية ولا تمثل قراراً قنصلياً." },
    ],
    aboutLink: "التعرّف على ESSAFARIA ومسؤولياتها",
  },
};
