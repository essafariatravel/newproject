import type { UiLocale } from "@/lib/ui-locale-values";

type Guide = { id: string; title: string; intro: string; steps: readonly string[] };
type ResourceCopy = {
  nav: string; title: string; description: string; publisher: string;
  notice: string; partnership: string; faq: string; about: string;
  guides: readonly Guide[];
};

export const PUBLIC_RESOURCE_COPY: Record<UiLocale, ResourceCopy> = {
  fr: {
    nav: "Guides professionnels visa",
    title: "Gérer les dossiers visa en agence de voyages",
    description: "Méthodes de travail pour les agences algériennes : préparer les informations, contrôler les pièces et organiser le suivi sans multiplier les échanges.",
    publisher: "Ressources professionnelles · ESSAFARIA TRAVEL",
    notice: "Ces méthodes ne constituent pas une liste officielle de justificatifs. Les exigences dépendent du dossier et des autorités compétentes. Ne promettez ni décision favorable ni délai garanti.",
    partnership: "Découvrir le partenariat visa B2B",
    faq: "Consulter les questions fréquentes",
    about: "À propos de l’agence ESSAFARIA TRAVEL",
    guides: [
      { id: "resource-document-check", title: "Contrôler un dossier avant transmission",
        intro: "Un contrôle de cohérence avant l'envoi évite des corrections en aval. Utilisez une fiche de vérification interne et attribuez chaque contrôle à un collaborateur.",
        steps: [
          "Comparer les noms, prénoms et dates saisis avec les documents du voyageur, y compris les différences de translittération. Faire confirmer toute divergence avant de transmettre.",
          "Vérifier la lisibilité de chaque page utile : bords entiers, absence de reflet, orientation correcte et données non masquées. Ne jamais retoucher les informations du document.",
          "Identifier la catégorie de demande et consulter les exigences applicables au dossier. Ne pas extrapoler celles d'un ancien dossier ou d'une autre destination.",
          "Transmettre les pièces uniquement par le canal professionnel autorisé. Conserver un état interne des éléments reçus, manquants et à corriger, sans recopier inutilement les données personnelles."
        ] },
      { id: "resource-case-followup", title: "Organiser le suivi et les demandes complémentaires",
        intro: "Séparez la progression opérationnelle de la décision de l'autorité. Un dossier transmis ou contrôlé n'est pas nécessairement approuvé.",
        steps: [
          "Attribuer une référence interne non sensible et un responsable par dossier ; centraliser les échanges pour éviter les réponses contradictoires.",
          "Quand une pièce complémentaire est demandée, identifier précisément l'élément manquant et le transmettre dans l'espace autorisé. Éviter de créer un second dossier pour la même demande.",
          "Informer le voyageur sur le dernier statut effectivement confirmé. Distinguer les délais indicatifs de traitement des échéances de voyage et signaler les incertitudes.",
          "À la clôture, communiquer la décision selon les informations vérifiées et appliquer les règles de conservation et d'accès de votre agence."
        ] },
      { id: "resource-partner-selection", title: "Choisir un partenaire de sous-traitance visa",
        intro: "Comparez la qualité des processus et la répartition des responsabilités, plutôt que des promesses d'obtention.",
        steps: [
          "Vérifier l'identité de l'opérateur, ses coordonnées et sa capacité à expliquer son rôle. Une agence de voyages n'est pas une autorité consulaire.",
          "Demander comment les documents sont contrôlés, comment les anomalies sont remontées et qui assure les échanges avec votre équipe.",
          "Examiner les conditions professionnelles et les modalités de suivi dans un canal réservé. Ne pas publier les tarifs partenaires ou les documents clients.",
          "Définir les responsabilités de votre équipe et du prestataire avant de transmettre un dossier ; garder un interlocuteur désigné pour les demandes de clarification."
        ] }
    ],
  },
  en: {
    nav: "Professional visa guides",
    title: "Managing visa files at a travel agency",
    description: "Practical methods for travel agencies in Algeria: organize information, review documents and coordinate case follow-up without unnecessary exchanges.",
    publisher: "Professional resources · ESSAFARIA TRAVEL",
    notice: "These methods are not an official checklist of documents. Requirements depend on the individual case and competent authorities. Do not promise approval or a guaranteed processing time.",
    partnership: "Explore B2B visa partnerships",
    faq: "Read frequently asked questions",
    about: "About ESSAFARIA TRAVEL",
    guides: [
      { id: "resource-document-check", title: "Review a file before submission",
        intro: "A consistency check before transmission can reduce avoidable corrections. Use an internal checklist and assign responsibility for each check.",
        steps: [
          "Compare entered names and dates with the traveller's documents, including transliteration differences. Clarify any discrepancy before transmission.",
          "Check that every relevant page is legible, complete, correctly oriented and free of glare or obscured information. Never alter document details.",
          "Identify the application category and review the requirements for that particular case. Do not assume that a previous application or another destination has identical requirements.",
          "Send documents only through the authorized professional channel. Maintain an internal record of received, missing and incorrect items without unnecessarily duplicating personal data."
        ] },
      { id: "resource-case-followup", title: "Coordinate case tracking and additional documents",
        intro: "Keep operational progress separate from the authority's decision. A submitted or reviewed file is not necessarily approved.",
        steps: [
          "Assign a non-sensitive internal reference and an owner to each case; consolidate communications to avoid conflicting responses.",
          "If an additional document is requested, identify the missing item and provide it through the authorized workspace. Avoid creating a duplicate application.",
          "Inform the traveller of the latest confirmed status. Distinguish indicative processing times from travel deadlines and communicate uncertainty.",
          "When the case is closed, communicate the verified outcome and follow your agency's retention and access rules."
        ] },
      { id: "resource-partner-selection", title: "Select a B2B visa outsourcing partner",
        intro: "Compare process quality and responsibilities rather than promises of visa approval.",
        steps: [
          "Verify the operator's identity, contact details and ability to explain its role. A travel agency is not a consular authority.",
          "Ask how documents are reviewed, how exceptions are communicated and who handles coordination with your team.",
          "Review professional terms and tracking arrangements in an appropriate private channel. Do not publish partner prices or client documents.",
          "Define the responsibilities of the agency and partner before sending a case; designate a contact for clarification requests."
        ] }
    ],
  },
  ar: {
    nav: "أدلة مهنية للتأشيرات",
    title: "إدارة ملفات التأشيرات في وكالات السفر",
    description: "طرق عمل عملية لوكالات السفر في الجزائر لتنظيم المعلومات ومراجعة الوثائق ومتابعة الطلبات دون مراسلات غير ضرورية.",
    publisher: "موارد مهنية · ESSAFARIA TRAVEL",
    notice: "هذه الطرق ليست قائمة رسمية بالمستندات المطلوبة. تختلف المتطلبات حسب الملف والسلطات المختصة. لا تعدوا المسافر بالموافقة أو بمدة معالجة مضمونة.",
    partnership: "التعرّف على الشراكة المهنية للتأشيرات",
    faq: "قراءة الأسئلة الشائعة",
    about: "عن وكالة ESSAFARIA TRAVEL",
    guides: [
      { id: "resource-document-check", title: "مراجعة الملف قبل الإرسال",
        intro: "يساعد التحقق من تطابق المعلومات قبل الإرسال على تقليل التصحيحات غير الضرورية. اعتمدوا قائمة مراجعة داخلية وحددوا مسؤول كل خطوة.",
        steps: [
          "طابقوا الأسماء والتواريخ المدخلة مع وثائق المسافر، بما في ذلك اختلاف كتابة الأسماء بالحروف اللاتينية. تحققوا من أي اختلاف قبل الإرسال.",
          "تحققوا من وضوح كل صفحة واكتمالها واتجاهها الصحيح وعدم وجود انعكاس أو معلومات محجوبة. لا تعدّلوا بيانات الوثيقة الأصلية.",
          "حددوا فئة الطلب وراجعوا المتطلبات الخاصة بالملف المعني. لا تفترضوا أن متطلبات طلب سابق أو وجهة أخرى مطابقة.",
          "أرسلوا المستندات فقط عبر القناة المهنية المصرح بها. احتفظوا بسجل داخلي للوثائق المستلمة والناقصة والتي تحتاج إلى تصحيح دون تكرار البيانات الشخصية بلا داع."
        ] },
      { id: "resource-case-followup", title: "تنظيم المتابعة وطلبات الوثائق الإضافية",
        intro: "ميّزوا بين تقدم معالجة الملف وقرار الجهة المختصة. إرسال الملف أو مراجعته لا يعني بالضرورة الموافقة عليه.",
        steps: [
          "خصصوا مرجعاً داخلياً غير حساس ومسؤولاً لكل ملف، واجمعوا المراسلات لتجنب الردود المتعارضة.",
          "عند طلب وثيقة إضافية، حددوا المستند الناقص وأرسلوه عبر المساحة المصرح بها. تجنبوا إنشاء طلب مكرر لنفس الملف.",
          "أبلغوا المسافر بآخر حالة مؤكدة فعلياً، وميّزوا بين المدد التقديرية للمعالجة ومواعيد السفر، ووضحوا ما لم يتم تأكيده.",
          "عند إغلاق الملف، أبلغوا المسافر بالنتيجة التي تم التحقق منها واتبعوا قواعد حفظ الوثائق والوصول إليها في وكالتكم."
        ] },
      { id: "resource-partner-selection", title: "اختيار شريك مهني لخدمات التأشيرات",
        intro: "قارنوا جودة إجراءات العمل وتوزيع المسؤوليات بدلاً من وعود الحصول على التأشيرة.",
        steps: [
          "تحققوا من هوية مقدم الخدمة وبيانات التواصل وقدرته على شرح دوره. وكالة السفر ليست سلطة قنصلية.",
          "استفسروا عن كيفية مراجعة الوثائق والإبلاغ عن النواقص والمسؤول عن التنسيق مع فريقكم.",
          "راجعوا الشروط المهنية وآليات المتابعة عبر قناة خاصة مناسبة. لا تنشروا أسعار الشركاء أو وثائق العملاء.",
          "حددوا مسؤوليات الوكالة والشريك قبل إرسال الملف، وعيّنوا جهة اتصال لطلبات التوضيح."
        ] }
    ],
  },
};
