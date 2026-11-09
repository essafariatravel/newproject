import type { UiLocale } from "@/lib/ui-i18n";

type PublicPartnerGuide = {
  audienceTitle: string;
  audienceBody: string;
  stepsTitle: string;
  steps: Array<{ title: string; body: string }>;
  limitationsTitle: string;
  limitationsBody: string;
  faqLink: string;
  contactLink: string;
};

/** Editorial guidance only: no visa catalogue, rates, or client details belong here. */
export const PARTNER_PUBLIC_GUIDE: Record<UiLocale, PublicPartnerGuide> = {
  en: {
    audienceTitle: "Visa operations for professional travel agencies in Algeria",
    audienceBody:
      "ESSAFARIA VISA OS is a B2B workspace for travel agencies that arrange visa services for their clients in Algeria. Agencies can coordinate applications with the ESSAFARIA team, share case documents and follow the progress of submitted requests from one professional account. It is not an individual traveller visa application website.",
    stepsTitle: "How an agency partnership works",
    steps: [
      {
        title: "Request professional access",
        body: "An agency applies for a partner account. ESSAFARIA reviews the registration before granting access to the professional workspace.",
      },
      {
        title: "Prepare the traveller’s case",
        body: "An authorized agency enters the traveller’s details, chooses an available service inside the portal and uploads the documents required for that request.",
      },
      {
        title: "Coordinate document review",
        body: "The ESSAFARIA team examines the submitted information and can ask the agency for clarification or missing supporting documents through the case workflow.",
      },
      {
        title: "Follow the request",
        body: "The agency consults the case status and related updates in its secure workspace and contacts the team when an operational follow-up is needed.",
      },
    ],
    limitationsTitle: "A dedicated partner service, with clear responsibilities",
    limitationsBody:
      "Visa rules, document requirements and processing times depend on the destination and the individual application. The relevant authorities retain responsibility for visa decisions; no approval is guaranteed. Service availability and commercial conditions are shared with verified partners in their private workspace.",
    faqLink: "Read the questions agencies ask",
    contactLink: "Contact our visa team",
  },
  fr: {
    audienceTitle: "Un accompagnement visa B2B pour les agences de voyages en Algérie",
    audienceBody:
      "ESSAFARIA VISA OS est un espace professionnel destiné aux agences de voyages qui prennent en charge les démarches de visa de leurs clients en Algérie. La plateforme permet de coordonner les demandes avec l’équipe ESSAFARIA, de transmettre les pièces du dossier et de suivre les étapes de traitement depuis un compte agence. Ce service B2B n’est pas un formulaire de visa destiné aux voyageurs particuliers.",
    stepsTitle: "Comment fonctionne le partenariat agence",
    steps: [
      {
        title: "Demander un accès professionnel",
        body: "L’agence transmet sa demande d’inscription. ESSAFARIA vérifie les informations communiquées avant d’autoriser l’accès à l’espace partenaires.",
      },
      {
        title: "Préparer le dossier du voyageur",
        body: "Une fois habilitée, l’agence renseigne les données du voyageur, sélectionne un service disponible dans le portail et joint les documents requis.",
      },
      {
        title: "Coordonner le contrôle documentaire",
        body: "L’équipe ESSAFARIA examine les informations transmises et peut demander des précisions ou des pièces complémentaires dans le suivi du dossier.",
      },
      {
        title: "Suivre l’avancement de la demande",
        body: "L’agence consulte les statuts et les mises à jour disponibles dans son espace sécurisé et échange avec l’équipe si un suivi opérationnel est nécessaire.",
      },
    ],
    limitationsTitle: "Un service professionnel avec des responsabilités définies",
    limitationsBody:
      "Les formalités, les justificatifs et les délais varient selon la destination et la situation du demandeur. La décision d’accorder un visa appartient aux autorités compétentes : aucune délivrance n’est garantie. Les disponibilités et les conditions commerciales sont communiquées uniquement aux partenaires validés dans leur espace privé.",
    faqLink: "Consulter les questions des agences",
    contactLink: "Contacter notre équipe visas",
  },
  ar: {
    audienceTitle: "خدمات التأشيرات المهنية لوكالات السفر في الجزائر",
    audienceBody:
      "ESSAFARIA VISA OS مساحة عمل مهنية مخصصة لوكالات السفر التي تتولى ملفات تأشيرات زبائنها في الجزائر. تتيح المنصة تنسيق الطلبات مع فريق ESSAFARIA وإرسال وثائق الملف ومتابعة مراحل المعالجة من حساب الوكالة. هذه خدمة موجهة للشركاء المهنيين وليست موقعاً لتقديم طلبات التأشيرة الفردية مباشرة.",
    stepsTitle: "كيف تعمل الشراكة مع الوكالات؟",
    steps: [
      {
        title: "طلب حساب مهني",
        body: "تقدّم وكالة السفر طلب التسجيل كشريك. ويراجع فريق ESSAFARIA بيانات التسجيل قبل منح الوصول إلى المساحة المهنية.",
      },
      {
        title: "تحضير ملف المسافر",
        body: "تُدخل الوكالة المخوّلة بيانات المسافر وتختار الخدمة المتاحة داخل البوابة ثم تُرفق الوثائق المطلوبة للطلب المعني.",
      },
      {
        title: "تنسيق مراجعة الوثائق",
        body: "يفحص فريق ESSAFARIA المعلومات المقدمة، ويمكنه طلب توضيحات أو وثائق تكميلية من الوكالة عبر مسار متابعة الملف.",
      },
      {
        title: "متابعة تقدّم الطلب",
        body: "تطّلع الوكالة على حالة الملف والتحديثات المتاحة في مساحتها الآمنة، وتتواصل مع الفريق عند الحاجة إلى متابعة عملية.",
      },
    ],
    limitationsTitle: "خدمة للشركاء مع توضيح المسؤوليات",
    limitationsBody:
      "تختلف شروط التأشيرة والوثائق المطلوبة ومدد المعالجة حسب الوجهة وحالة صاحب الطلب. ويعود قرار منح التأشيرة إلى السلطات المختصة، ولا يمكن ضمان الموافقة. تُعرض الخدمات المتاحة والشروط التجارية للشركاء المعتمدين فقط داخل المساحة الخاصة بهم.",
    faqLink: "الاطلاع على أسئلة وكالات السفر",
    contactLink: "التواصل مع فريق التأشيرات",
  },
};
