import type { UiLocale } from "@/lib/ui-i18n";

type ReadinessCopy = { title: string; intro: string; checks: Array<{ title: string; text: string }>; aboutLink: string };

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
