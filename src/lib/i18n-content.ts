/**
 * Page-content dictionary (platform-owned UI copy that lives below the
 * navigation chrome): dashboards, cards, tables, forms, marketing sections.
 *
 * Keyed by the EN source string — translations must register here for every
 * locale; tests guard completeness. Database/user-provided values (agency
 * names, references, applicant names, free-text notes) are NEVER translated.
 */
import type { UiLocale } from "@/lib/ui-i18n";

type Entry = { fr: string; ar: string };

const CONTENT: Record<string, Entry> = {
  /* ------------------------------ greetings ------------------------------ */
  "morning": { fr: "Bonjour", ar: "صباح الخير" },
  "afternoon": { fr: "Bon après-midi", ar: "مساء النور" },
  "evening": { fr: "Bonsoir", ar: "مساء الخير" },

  /* --------------------------- admin dashboard -------------------------- */
  "Operational overview of the ESSAFARIA visa desk.": { fr: "Vue opérationnelle du desk visa ESSAFARIA.", ar: "نظرة تشغيلية على مكتب التأشيرات التابع لـ ESSAFARIA." },
  "Total applications": { fr: "Total des dossiers", ar: "إجمالي الطلبات" },
  "Pending intake": { fr: "Dossiers en attente", ar: "الطلبات قيد الاستلام" },
  "In processing": { fr: "En traitement", ar: "قيد المعالجة" },
  "Documents in review": { fr: "Documents en vérification", ar: "المستندات قيد الفحص" },
  "Missing documents": { fr: "Documents manquants", ar: "مستندات ناقصة" },
  "Completed / approved": { fr: "Terminés / approuvés", ar: "مكتملة / مقبولة" },
  "Rejected": { fr: "Refusés", ar: "مرفوضة" },
  "Active agencies": { fr: "Agences actives", ar: "الوكالات النشطة" },
  "Agency registrations": { fr: "Inscriptions d'agences", ar: "تسجيلات الوكالات" },
  "Recent applications": { fr: "Dossiers récents", ar: "أحدث الطلبات" },
  "Wallet activity": { fr: "Activité des portefeuilles", ar: "حركة المحافظ" },
  "Ledger": { fr: "Grand livre", ar: "دفتر القيود" },
  "Pipeline by status": { fr: "Entonnoir par statut", ar: "خط المعالجة حسب الحالة" },
  "Recent activity": { fr: "Activité récente", ar: "النشاط الأخير" },
  "Audit log": { fr: "Journal d'audit", ar: "سجل التدقيق" },
  "No applications yet": { fr: "Aucun dossier pour l'instant", ar: "لا توجد طلبات حتى الآن" },
  "Applications submitted by partner agencies will appear here.": { fr: "Les dossiers soumis par les agences partenaires apparaîtront ici.", ar: "ستظهر هنا الطلبات المقدمة من الوكالات الشريكة." },
  "Submitted · Docs required · Under review": { fr: "Soumis · Doc. requis · En examen", ar: "مقدَّم · مستندات مطلوبة · قيد المراجعة" },
  "Processing · Embassy · Awaiting decision": { fr: "Traitement · Ambassade · Décision", ar: "معالجة · السفارة · بانتظار القرار" },
  "Uploaded / under review": { fr: "Téléversés / en examen", ar: "مرفوعة / قيد المراجعة" },
  "in the last 30 days": { fr: "sur les 30 derniers jours", ar: "خلال آخر 30 يومًا" },
  "View all": { fr: "Voir tout", ar: "عرض الكل" },
  "Credited": { fr: "Crédité", ar: "إيداعات" },
  "Charged": { fr: "Débité", ar: "سحوبات" },
  "Balances": { fr: "Soldes", ar: "الأرصدة" },
  "No applications yet.": { fr: "Aucun dossier pour l'instant.", ar: "لا توجد طلبات حتى الآن." },

  /* --------------------------- table headers ---------------------------- */
  "Reference": { fr: "Référence", ar: "المرجع" },
  "Agency": { fr: "Agence", ar: "الوكالة" },
  "Visa": { fr: "Visa", ar: "التأشيرة" },
  "Status": { fr: "Statut", ar: "الحالة" },
  "Created": { fr: "Créé le", ar: "تاريخ الإنشاء" },
  "Applicants": { fr: "Voyageurs", ar: "مقدمو الطلبات" },
  "Date": { fr: "Date", ar: "التاريخ" },
  "Type": { fr: "Type", ar: "النوع" },
  "Amount": { fr: "Montant", ar: "المبلغ" },
  "Customer": { fr: "Client", ar: "العميل" },
  "Applicant": { fr: "Demandeur", ar: "مقدم الطلب" },
  "Country": { fr: "Pays", ar: "البلد" },
  "Actions": { fr: "Actions", ar: "الإجراءات" },
  "Name": { fr: "Nom", ar: "الاسم" },
  "Email": { fr: "E-mail", ar: "البريد الإلكتروني" },
  "Description": { fr: "Description", ar: "الوصف" },
  "Reason": { fr: "Motif", ar: "السبب" },
  "Application": { fr: "Dossier", ar: "الملف" },
  "Balance before → after": { fr: "Solde avant → après", ar: "الرصيد قبل ← بعد" },

  /* ----------------------- admin application detail ---------------------- */
  "Visa type": { fr: "Type de visa", ar: "نوع التأشيرة" },
  "Category": { fr: "Catégorie", ar: "الفئة" },
  "Fee (snapshot)": { fr: "Frais (instantané)", ar: "الرسوم (عند الإنشاء)" },
  "Processing time": { fr: "Délai de traitement", ar: "مدة المعالجة" },
  "Submitted": { fr: "Soumis le", ar: "تاريخ التقديم" },
  "Documents": { fr: "Documents", ar: "المستندات" },
  "Gate": { fr: "Pré-requis", ar: "شرط الإرسال" },
  "Ready (all required documents present)": { fr: "Prêt (tous les documents requis sont présents)", ar: "جاهز (جميع المستندات المطلوبة موجودة)" },
  "Blocked — missing:": { fr: "Bloqué — manquants :", ar: "محظور — المستندات الناقصة:" },
  "Workflow": { fr: "Flux de traitement", ar: "سير العمل" },
  "Status changes are validated, logged and notify the agency.": { fr: "Les changements de statut sont validés, journalisés et notifiés à l'agence.", ar: "تتوالى جميع تغييرات الحالة مُوثقة ومُسجلة مع إشعار الوكالة." },
  "Change status to": { fr: "Changer le statut vers", ar: "تغيير الحالة إلى" },
  "Reason (recommended)": { fr: "Motif (recommandé)", ar: "السبب (مُستحسن)" },
  "Why is the status changing?": { fr: "Pourquoi ce changement de statut ?", ar: "لماذا تتغير الحالة؟" },
  "Update status": { fr: "Mettre à jour le statut", ar: "تحديث الحالة" },
  "No routine transitions available": { fr: "Aucune transition courante disponible", ar: "لا توجد انتقالات عادية متاحة" },
  "Submission gate override": { fr: "Contournement du pré-requis d'envoi", ar: "تجاوز شرط الإرسال" },
  "The agency cannot submit while documents are missing. Staff may override with a mandatory reason.": { fr: "L'agence ne peut pas soumettre tant que des documents manquent. Le personnel peut contourner avec un motif obligatoire.", ar: "لا تستطيع الوكالة الإرسال قبل استكمال المستندات. يمكن للموظفين التجاوز مع سبب إلزامي." },
  "Override reason (mandatory, min 10 chars)": { fr: "Motif du contournement (obligatoire, min. 10 caractères)", ar: "سبب التجاوز (إلزامي، 10 أحرف على الأقل)" },
  "Submit with override": { fr: "Soumettre avec contournement", ar: "إرسال مع التجاوز" },
  "Final decision": { fr: "Décision finale", ar: "القرار النهائي" },
  "Upload the embassy outcome and record it atomically: accepted document + status change + agency notification. This is the only path to approved/refused/rejected.": { fr: "Téléversez la décision de l'ambassade et enregistrez-la de façon atomique : document accepté + changement de statut + notification à l'agence. Seule voie vers approuvé/refusé.", ar: "ارفع نتيجة السفارة وسجّلها بشكل ذرّي: مستند مقبول + تغيير الحالة + إشعار الوكالة. هذا هو المسار الوحيد المؤدي إلى قبول أو رفض." },
  "No decision document recorded yet.": { fr: "Aucun document de décision enregistré pour l'instant.", ar: "لم يتم تسجيل أي وثيقة قرار حتى الآن." },
  "Outcome": { fr: "Issue", ar: "النتيجة" },
  "Decision document (PDF/JPG/PNG, mandatory)": { fr: "Document de décision (PDF/JPG/PNG, obligatoire)", ar: "وثيقة القرار (PDF/JPG/PNG، إلزامية)" },
  "Record decision": { fr: "Enregistrer la décision", ar: "تسجيل القرار" },
  "The file is closed — no further decision can be recorded.": { fr: "Le dossier est clôturé — aucune autre décision ne peut être enregistrée.", ar: "الملف مُقفل — لا يمكن تسجيل أي قرار إضافي." },
  "Decisions unlock once the file is in Processing / Awaiting Decision. Approvals are double-gated: move the file to Awaiting Decision first.": { fr: "Les décisions se débloquent lorsque le dossier est En traitement / En attente de décision. Les approbations requièrent un double contrôle : passez d'abord le dossier en En attente de décision.", ar: "تُتاح القرارات عندما يكون الملف قيد المعالجة / بانتظار القرار. القبول محكوم ببوابتين: انقل الملف أولًا إلى بانتظار القرار." },
  "Internal notes": { fr: "Notes internes", ar: "ملاحظات داخلية" },
  "Never visible to the agency.": { fr: "Jamais visible par l'agence.", ar: "غير مرئية للوكالة أبدًا." },
  "Save notes": { fr: "Enregistrer les notes", ar: "حفظ الملاحظات" },
  "Case-officer notes…": { fr: "Notes du gestionnaire du dossier…", ar: "ملاحظات الموظف المسؤول عن الملف…" },
  "Why is this file allowed through without all documents?": { fr: "Pourquoi ce dossier est-il autorisé sans tous les documents ?", ar: "لماذا يُسمح بهذا الملف دون استكمال جميع المستندات؟" },
  "Download PDF/document": { fr: "Télécharger le PDF / document", ar: "تنزيل الملف (PDF)" },

  /* --------------------------- portal dashboard -------------------------- */
  "Agency dashboard": { fr: "Tableau de bord de l'agence", ar: "لوحة تحكم الوكالة" },
  "Active applications": { fr: "Dossiers actifs", ar: "الطلبات النشطة" },
  "Submitted and in progress": { fr: "Soumis et en cours", ar: "مقدَّمة وقيد المعالجة" },
  "Completed": { fr: "Terminés", ar: "المكتملة" },
  "Action required": { fr: "Action requise", ar: "إجراء مطلوب" },
  "Wallet balance": { fr: "Solde du portefeuille", ar: "رصيد المحفظة" },
  "Drafts": { fr: "Brouillons", ar: "المسودات" },
  "Total files": { fr: "Total des dossiers", ar: "إجمالي الملفات" },
  "Notifications": { fr: "Notifications", ar: "الإشعارات" },
  "Create application": { fr: "Créer un dossier", ar: "إنشاء طلب" },
  "Recent wallet activity": { fr: "Activité récente du portefeuille", ar: "أحدث حركات المحفظة" },
  "Applications": { fr: "Dossiers", ar: "الطلبات" },
  "Your agency's visa files.": { fr: "Les dossiers visa de votre agence.", ar: "ملفات التأشيرات الخاصة بوكالتكم." },
  "+ New application": { fr: "+ Nouveau dossier", ar: "+ طلب جديد" },
  "No applications found": { fr: "Aucun dossier trouvé", ar: "لم يتم العثور على طلبات" },

  "Visa / Country": { fr: "Visa / Pays", ar: "التأشيرة / البلد" },
  "Fee": { fr: "Frais", ar: "الرسوم" },
  "Submit your first visa application to see it tracked here.": { fr: "Soumettez votre première demande de visa pour la suivre ici.", ar: "قدّم أول طلب تأشيرة لتتابعه هنا." },
  /* ----------------------------- portal wallet --------------------------- */
  "Wallet & Transactions": { fr: "Portefeuille & Transactions", ar: "المحفظة والمعاملات" },
  "Current balance": { fr: "Solde actuel", ar: "الرصيد الحالي" },
  "Transactions": { fr: "Transactions", ar: "المعاملات" },
  "Total credited": { fr: "Total crédité", ar: "إجمالي الإيداعات" },
  "Total charged": { fr: "Total débité", ar: "إجمالي السحوبات" },
  "No transactions yet": { fr: "Aucune transaction pour l'instant", ar: "لا توجد معاملات حتى الآن" },
  "Wallet credits and application charges will appear here.": { fr: "Les rechargements du portefeuille et les débits des dossiers apparaîtront ici.", ar: "ستظهر هنا شحنات المحفظة ورسوم الطلبات." },
  "prepaid balance and complete ledger.": { fr: "solde prépayé et grand livre complet.", ar: "الرصيد المدفوع مسبقًا ودفتر القيود الكامل." },
  "Download wallet statement (PDF)": { fr: "Télécharger le relevé du portefeuille (PDF)", ar: "تنزيل كشف المحفظة (PDF)" },
  "Professional statement for a chosen period: opening balance, credits, debits and closing balance, derived directly from the immutable ledger.": { fr: "Relevé professionnel sur une période choisie : solde d'ouverture, crédits, débits et solde de clôture, calculés directement depuis le grand livre immuable.", ar: "كشف احترافي لفترة محددة: رصيد الافتتاح والإيداعات والسحوبات ورصيد الإغلاق، مستخرج مباشرة من دفتر القيود الثابت." },
  "From": { fr: "Du", ar: "من" },
  "To": { fr: "Au", ar: "إلى" },
  "Generate PDF": { fr: "Générer le PDF", ar: "إنشاء PDF" },

  /* ---------------------- portal application detail ---------------------- */
  "Official decision": { fr: "Décision officielle", ar: "القرار الرسمي" },
  "Issued after submission and review — the embassy outcome, accepted and downloadable as PDF.": { fr: "Émise après dépôt et examen — la décision de l'ambassade, acceptée et téléchargeable en PDF.", ar: "صدر بعد التقديم والمراجعة — نتيجة السفارة، مقبولة وقابلة للتنزيل بصيغة PDF." },
  "Download": { fr: "Télécharger", ar: "تنزيل" },
  "Your notes": { fr: "Vos notes", ar: "ملاحظاتكم" },
  "Required documents": { fr: "Documents requis", ar: "المستندات المطلوبة" },
  "provided": { fr: "fournis", ar: "مُقدمة" },
  "Review & submit": { fr: "Vérifier et soumettre", ar: "المراجعة والإرسال" },
  "Verify everything below. Submitting charges your wallet once and starts ESSAFARIA processing.": { fr: "Vérifiez tout ci-dessous. La soumission débite votre portefeuille une fois et lance le traitement ESSAFARIA.", ar: "تحققوا من كل شيء أدناه. الإرسال يخصم من محفظتكم مرة واحدة ويطلق معالجة ESSAFARIA." },

  "Cancel application": { fr: "Annuler le dossier", ar: "إلغاء الطلب" },
  "Drafts can be cancelled free of charge. Cancelled files cannot be reopened.": { fr: "Les brouillons s’annulent gratuitement. Les dossiers annulés ne peuvent pas être rouverts.", ar: "يمكن إلغاء المسودات مجانًا. الملفات الملغاة لا يمكن إعادة فتحها." },
  "Add applicant": { fr: "Ajouter un voyageur", ar: "إضافة مسافر" },
  "Current wallet": { fr: "Portefeuille actuel", ar: "المحفظة الحالية" },
  "Documents needing attention": { fr: "Documents à traiter", ar: "مستندات تتطلب الانتباه" },
  "No documents uploaded": { fr: "Aucun document téléversé", ar: "لا توجد مستندات مرفوعة" },
  "Client cancelled the trip": { fr: "Le client a annulé le voyage", ar: "ألغى العميل الرحلة" },
  "New application": { fr: "Nouveau dossier", ar: "طلب جديد" },
  "Visa programme *": { fr: "Programme de visa *", ar: "برنامج التأشيرة *" },
  "Select country and visa…": { fr: "Sélectionner pays et visa…", ar: "اختر البلد والتأشيرة…" },
  "Priority": { fr: "Priorité", ar: "الأولوية" },
  "Notes for ESSAFARIA (optional)": { fr: "Notes pour ESSAFARIA (facultatif)", ar: "ملاحظات لـ ESSAFARIA (اختياري)" },
  "Travel dates, group context, special requests…": { fr: "Dates de voyage, contexte de groupe, demandes spéciales…", ar: "تواريخ السفر وسياق المجموعة والطلبات الخاصة…" },
  "Create draft application": { fr: "Créer le dossier (brouillon)", ar: "إنشاء طلب (مسودة)" },
  "No documents found": { fr: "Aucun document trouvé", ar: "لم يتم العثور على مستندات" },
  "All documents uploaded by your agency.": { fr: "Tous les documents téléversés par votre agence.", ar: "جميع المستندات المرفوعة من وكالتكم." },
  "Create your first visa application to get going.": { fr: "Créez votre première demande de visa pour démarrer.", ar: "أنشئ أول طلب تأشيرة لبدء العمل." },
  "Step 1 — choose the visa. Applicants, documents, review and submission follow on the application page.": { fr: "Étape 1 — choisir le visa. Voyageurs, documents, vérification et soumission suivent sur la page du dossier.", ar: "الخطوة 1 — اختيار التأشيرة. يتبع ذلك المسافرون والمستندات والمراجعة والإرسال في صفحة الطلب." },
  "Travellers on your agency's applications.": { fr: "Voyageurs de vos dossiers.", ar: "المسافرون في طلبات وكالتكم." },
  "Latest agency-visible messages on your applications.": { fr: "Derniers messages visibles par l'agence sur vos dossiers.", ar: "أحدث الرسائل المرئية للوكالة بشأن طلباتكم." },
  "Communications": { fr: "Communications", ar: "المراسلات" },
  "No messages yet": { fr: "Aucun message pour l'instant", ar: "لا توجد رسائل حتى الآن" },
  "Open an application and post a message — ESSAFARIA case officers will reply in the same thread.": { fr: "Ouvrez un dossier et postez un message — les gestionnaires ESSAFARIA répondent dans le même fil.", ar: "افتح طلبًا وأرسل رسالة — سيرد موظفو ESSAFARIA في نفس المحادثة." },
  "Profile": { fr: "Profil", ar: "الملف الشخصي" },
  "Your agency account and team.": { fr: "Votre compte agence et votre équipe.", ar: "حساب وكالتكم وفريقكم." },
  "No applicants yet": { fr: "Aucun voyageur pour l'instant", ar: "لا يوجد مسافرون حتى الآن" },
  "Register your agency": { fr: "Enregistrer votre agence", ar: "سجّل وكالتك" },
  "Select a valid period (from ≤ to).": { fr: "Sélectionnez une période valide (du ≤ au).", ar: "اختر فترة صالحة (من ≤ إلى)." },
  "Generating…": { fr: "Génération en cours…", ar: "جارٍ الإنشاء…" },
  "No notifications": { fr: "Aucune notification", ar: "لا توجد إشعارات" },
  "Events on your applications will appear here.": { fr: "Les événements de vos dossiers apparaîtront ici.", ar: "ستظهر هنا الأحداث المتعلقة بطلباتكم." },
  "Mark all as read": { fr: "Tout marquer lu", ar: "تعليم الكل كمقروء" },
  "Mark read": { fr: "Marquer lu", ar: "تعليم كمقروء" },
  "Open": { fr: "Ouvrir", ar: "فتح" },
  "Please choose both a 'from' and a 'to' date.": { fr: "Choisissez une date de début et une date de fin.", ar: "يرجى اختيار تاريخي البداية والنهاية." },
  "The 'from' date must not be after the 'to' date.": { fr: "La date de début ne peut pas être postérieure à la date de fin.", ar: "يجب ألا يكون تاريخ البداية بعد تاريخ النهاية." },
  "All visa applications across partner agencies.": { fr: "Tous les dossiers de visa des agences partenaires.", ar: "جميع طلبات التأشيرات عبر الوكالات الشريكة." },
  "Search": { fr: "Rechercher", ar: "بحث" },
  "Reference, applicant, passport…": { fr: "Référence, demandeur, passeport…", ar: "المرجع، مقدم الطلب، جواز السفر…" },
  "Try adjusting the filters, or wait for agencies to submit applications.": { fr: "Ajustez les filtres ou attendez que les agences soumettent des dossiers.", ar: "عدّل الفلاتر أو انتظر تقديم الوكالات للطلبات." },
  /* ------------------------------- public -------------------------------- */
  "B2B Visa Processing Platform": { fr: "Plateforme B2B de traitement des visas", ar: "منصة B2B لمعالجة التأشيرات" },
  "The operating system for": { fr: "Le système d'exploitation du", ar: "نظام التشغيل لـ" },
  "professional visa processing": { fr: "traitement professionnel des visas", ar: "المعالجة المهنية للتأشيرات" },
  "Register your Agency": { fr: "Enregistrer votre agence", ar: "سجّل وكالتك" },
  "Explore visa services": { fr: "Découvrir nos services visa", ar: "استكشف خدمات التأشيرات" },
  "Built for professional visa operations": { fr: "Conçu pour les opérations visa professionnelles", ar: "مصمم لعمليات التأشيرات الاحترافية" },
  "Checklists": { fr: "Listes de contrôle", ar: "قوائم التحقق" },
  "Destination-accurate document lists per traveller.": { fr: "Listes de documents exactes par destination et par voyageur.", ar: "قوائم مستندات دقيقة لكل وجهة وكل مسافر." },
  "Embassy desk": { fr: "Desk ambassades", ar: "مكتب السفارات" },
  "Submission, appointments and follow-up handled.": { fr: "Dépôts, rendez-vous et suivis gérés pour vous.", ar: "التقديم والمواعيد والمتابعة منظومة بالكامل." },
  "Live tracking": { fr: "Suivi en direct", ar: "تتبع مباشر" },
  "Every file visible through the full pipeline.": { fr: "Chaque dossier visible sur toute la chaîne de traitement.", ar: "كل ملف مرئي طوال مراحل المعالجة." },
  "Partner billing": { fr: "Facturation partenaires", ar: "فوترة الشركاء" },
  "Transparent prepaid wallet per agency.": { fr: "Portefeuille prépayé transparent par agence.", ar: "محفظة مدفوعة مسبقًا شفافة لكل وكالة." },
  "Catalogue and partner pricing are served live inside the Agency Portal.": { fr: "Le catalogue et les tarifs partenaires sont servis en direct dans le Portail Agence.", ar: "يتم توفير الكتالوج وأسعار الشركاء مباشرة داخل بوابة الوكالة." },
  "runs visa operations for travel agencies, wholesalers and tour operators — one platform for applications, documents, checklists, wallets and embassy workflows.": { fr: "orchestré les opérations visa des agences de voyage, grossistes et tour-opérateurs — une seule plateforme pour les dossiers, documents, checklists, portefeuilles et workflows ambassades.", ar: "يدير عمليات التأشيرات لوكالات السفر وجهات الجملة ومنظمي الرحلات — منصة واحدة للطلبات والمستندات وقوائم التحقق والمحافظ وسير عمل السفارات." },
  "Coverage across four regions": { fr: "Couverture sur quatre régions", ar: "تغطية عبر أربع مناطق" },
  "From checklist to passport stamp": { fr: "De la checklist au tampon sur le passeport", ar: "من قائمة التحقق إلى ختم جواز السفر" },

  /* ---------------------------- public visas ----------------------------- */
  "Visa services for professional partners": { fr: "Services visa pour partenaires professionnels", ar: "خدمات التأشيرات للشركاء المحترفين" },
  "Services we deliver": { fr: "Services que nous délivrons", ar: "الخدمات التي نقدمها" },
  "Everything we handle": { fr: "Tout ce que nous prenons en charge", ar: "كل ما نتولاه" },
  "Catalogue access is reserved for partner agencies.": { fr: "L'accès au catalogue est réservé aux agences partenaires.", ar: "الوصول إلى الكتالوج مخصص للوكالات الشريكة." },
  "Talk to our partnerships team": { fr: "Échanger avec l'équipe partenariats", ar: "تواصل مع فريق الشراكات" },
  "Tourist & visitor visas": { fr: "Visas touristiques & visiteurs", ar: "تأشيرات سياحية وللزيارة" },
  "Business travel": { fr: "Voyages d'affaires", ar: "سفر الأعمال" },
  "Family & group files": { fr: "Dossiers famille & groupes", ar: "ملفات العائلات والمجموعات" },
  "Medical & long-stay support": { fr: "Accompagnement médical & long séjour", ar: "دعم العلاج والإقامة الطويلة" },
  "Document checklists": { fr: "Checklists documentaires", ar: "قوائم التحقق من المستندات" },
  "Embassy workflows": { fr: "Workflows ambassades", ar: "سير عمل السفارات" },
  "Live status tracking": { fr: "Suivi de statut en direct", ar: "تتبع الحالة مباشرة" },
  "Quality review": { fr: "Contrôle qualité", ar: "مراجعة الجودة" },
  "Generated per destination and per traveller, so your files arrive complete the first time.": { fr: "Générées par destination et par voyageur pour des dossiers complets du premier coup.", ar: "مُولدة لكل وجهة ولكل مسافر حتى تصل ملفاتكم مكتملة من أول مرة." },
  "Appointments, submission windows and follow-ups run by our operations team end-to-end.": { fr: "Rendez-vous, fenêtres de dépôt et suivis pilotés de bout en bout par notre équipe opérationnelle.", ar: "المواعيد وفترات التقديم والمتابعات يديرها فريق العمليات من البداية إلى النهاية." },
  "Every file moves through a transparent pipeline you and your client can monitor in real time.": { fr: "Chaque dossier avance dans un pipeline transparent que vous et votre client suivez en temps réel.", ar: "كل ملف يمر عبر خط معالجة شفاف يمكنك ومتابعك مراقبته في الوقت الفعلي." },
  "Experienced visa officers review every dossier before it reaches an embassy counter.": { fr: "Des agents visa expérimentés vérifient chaque dossier avant son arrivée au guichet de l'ambassade.", ar: "موظفو تأشيرات ذوو خبرة يراجعون كل ملف قبل وصوله إلى مكتب السفارة." },


  "What working with us looks like": { fr: "Travailler avec nous, concrètement", ar: "شكل العمل معنا" },
  "What we operate": { fr: "Ce que nous opérons", ar: "ما نشغّله" },
  "ESSAFARIA runs complete visa operations for travel agencies, wholesalers and tour operators: document preparation, embassy workflows and transparent tracking — all through one partner platform.": { fr: "ESSAFARIA opère l'intégralité du traitement des visas pour agences de voyage, grossistes et tour-opérateurs : préparation documentaire, workflows ambassades et suivi transparent — tout via une plateforme partenaire unique.", ar: "تدير ESSAFARIA عمليات التأشيرات الكاملة لوكالات السفر وجهات الجملة ومنظمي الرحلات: إعداد المستندات وسير عمل السفارات والتتبع الشفاف — كل ذلك عبر منصة شركاء واحدة." },
  "A named operations desk owns your files from submission to decision.": { fr: "Un desk opérations dédié pilote vos dossiers du dépôt à la décision.", ar: "مكتب عمليات مخصص يتولى ملفاتكم من التقديم إلى القرار." },
  "Multi-destination short-stay processing with destination-specific checklists, form preparation and embassy submission.": { fr: "Traitement de courts séjours multi-destinations avec checklists spécifiques, préparation des formulaires et dépôt en ambassade.", ar: "معالجة الإقامات القصيرة متعددة الوجهات مع قوائم تحقق خاصة بكل وجهة وتجهيز النماذج والتقديم في السفارة." },
  "Corporate itineraries, conference and trade travel with priority handling and dedicated case officers.": { fr: "Itinéraires d'entreprise, conférences et voyages d'affaires avec traitement prioritaire et gestionnaires dédiés.", ar: "برامج سفر الشركات والمؤتمرات ورحلات الأعمال مع معالجة ذات أولوية وموظفين مخصصين." },
  "Coordinated multi-applicant dossiers with shared prerequisite tracking so families move through review together.": { fr: "Dossiers multi-voyageurs coordonnés avec suivi partagé des prérequis pour que les familles avancent ensemble.", ar: "ملفات متعددة المتقدمين منسقة مع تتبع مشترك للمتطلبات حتى تمر العائلات بالمراجعة معًا." },
  "Sensitive long-stay, treatment and study files prepared with the extra evidence those destinations require.": { fr: "Dossiers sensibles long séjour, soins et études préparés avec les justificatifs supplémentaires exigés.", ar: "ملفات الإقامة الطويلة والعلاج والدراسة الحساسة مُعدّة مع الأدلة الإضافية التي تتطلبها تلك الوجهات." },
  "Qualified case officers handle your files end to end, with named escalation contacts for urgent departures.": { fr: "Des gestionnaires qualifiés traitent vos dossiers de bout en bout, avec des relais désignés pour les départs urgents.", ar: "موظفون مؤهلون يعالجون ملفاتكم من البداية إلى النهاية مع جهات تصعيد مسماة للمغادرات العاجلة." },
  "Partner pricing on every programme in the catalogue, settled transparently through your prepaid wallet.": { fr: "Tarifs partenaires sur chaque programme du catalogue, réglés en toute transparence via votre portefeuille prépayé.", ar: "أسعار الشركاء على كل برنامج في الكتالوج تُسوّى بشفافية عبر محفظتكم المدفوعة مسبقًا." },
  "Your team works in a clean, fast portal: applications, checklists, documents, status and billing in one place.": { fr: "Votre équipe travaille dans un portail clair et rapide : dossiers, checklists, documents, statuts et facturation au même endroit.", ar: "يعمل فريقكم في بوابة سريعة وواضحة: الطلبات وقوائم التحقق والمستندات والحالة والفوترة في مكان واحد." },
  "Immutable audit logs on every action — built for agencies that answer to corporate clients and regulators.": { fr: "Journaux d'audit immuables sur chaque action — conçu pour les agences redevables envers clients entreprises et régulateurs.", ar: "سجلات تدقيق ثابتة لكل إجراء — مصمّمة للوكالات المسؤولة أمام عملاء الشركات والجهات الرقابية." },
  "For the travel trade": { fr: "Pour le secteur du voyage", ar: "لقطاع السفر" },
  "Run your entire visa desk on": { fr: "Pilotez tout votre desk visa sur", ar: "أدر مكتب التأشيرات بالكامل عبر" },
  "Travel agencies, wholesalers, tour operators and corporate travel partners use ESSAFARIA VISA OS to submit, track and bill visa applications at scale — with a dedicated processing team behind every file.": { fr: "Agences de voyage, grossistes, tour-opérateurs et partenaires corporate utilisent ESSAFARIA VISA OS pour soumettre, suivre et facturer des dossiers de visa à grande échelle — avec une équipe de traitement dédiée derrière chaque dossier.", ar: "تستخدم وكالات السفر وجهات الجملة ومنظمو الرحلات وشركاء سفر الشركات منصة ESSAFARIA VISA OS لتقديم طلبات التأشيرات وتتبعها وفوترتها على نطاق واسع — مع فريق معالجة مخصص لكل ملف." },
  "Online partnership application — reviewed by ESSAFARIA before any access is activated.": { fr: "Demande de partenariat en ligne — instruite par ESSAFARIA avant toute activation d'accès.", ar: "طلب شراكة عبر الإنترنت — تراجعه ESSAFARIA قبل تفعيل أي وصول." },
  /* --------------------- countries / about / contact --------------------- */
  "Our company": { fr: "Notre entreprise", ar: "شركتنا" },
  "Destinations we operate": { fr: "Destinations où nous opérons", ar: "الوجهات التي نعمل فيها" },
  "ESSAFARIA maintains visa operations for the following destinations. Programmes and partner pricing for each destination are available inside the Agency Portal.": { fr: "ESSAFARIA gère les opérations visa pour les destinations suivantes. Les programmes et tarifs partenaires de chaque destination sont disponibles dans le Portail Agence.", ar: "تدير ESSAFARIA عمليات التأشيرات للوجهات التالية. البرامج وأسعار الشركاء لكل وجهة متاحة داخل بوابة الوكالة." },
  "Destinations temporarily unavailable": { fr: "Destinations temporairement indisponibles", ar: "الوجهات غير متاحة مؤقتًا" },
  "We cannot reach the live destinations list right now. Please try again in a few moments.": { fr: "Impossible de joindre la liste des destinations pour l'instant. Veuillez réessayer dans quelques instants.", ar: "لا يمكن الوصول إلى قائمة الوجهات حاليًا. يرجى المحاولة مرة أخرى بعد قليل." },
  "No destinations published yet": { fr: "Aucune destination publiée pour l'instant", ar: "لا توجد وجهات منشورة حتى الآن" },
  "is a professional visa-processing house built for the travel trade. We are not a consumer visa shop: our platform, pricing and service levels are designed for agencies, wholesalers and tour operators that move meaningful passenger volumes and need an operational partner they can hold accountable.": { fr: "est une maison de traitement de visas professionnelle, conçue pour le secteur du voyage. Nous ne sommes pas un comptoir grand public : notre plateforme, nos tarifs et nos niveaux de service sont pensés pour les agences, grossistes et tour-opérateurs qui traitent des volumes significatifs et exigent un partenaire opérationnel fiable.", ar: "هي دار محترفة لمعالجة التأشيرات مبنية لقطاع السفر. نحن لسنا متجر تأشيرات للأفراد: منصتنا وأسعارنا ومستويات خدمتنا مصممة للوكالات وجهات الجملة ومنظمي الرحلات الذين يعالجون أحجامًا كبيرة من المسافرين ويحتاجون شريكًا تشغيليًا موثوقًا." },
  "Every file on ESSAFARIA VISA OS — our operations platform — follows a controlled workflow: document checklists generated from current embassy rules, review by qualified case officers, controlled status transitions, and a complete audit trail from submission to decision. Agencies see everything their clients ask about: live status, document feedback and billing.": { fr: "Chaque dossier sur ESSAFARIA VISA OS — notre plateforme opérationnelle — suit un workflow maîtrisé : checklists générées depuis les règles d'ambassade en vigueur, revue par des gestionnaires qualifiés, transitions de statut contrôlées et piste d'audit complète du dépôt à la décision. Les agences voient tout ce que leurs clients demandent : statut en direct, retours documents et facturation.", ar: "كل ملف على منصة ESSAFARIA VISA OS — منصة العمليات لدينا — يتبع سير عمل مضبوط: قوائم مستندات مولدة وفق قواعد السفارات الحالية، ومراجعة من موظفين مؤهلين، وانتقالات حالة مضبوطة، ومسار تدقيق كامل من التقديم إلى القرار. ترى الوكالات كل ما يسأل عنه عملاؤها: الحالة المباشرة وملاحظات المستندات والفوترة." },
  "We deliberately run a prepaid wallet model: your agency funds its balance once, and application charges are settled automatically against a full ledger. Finance teams get clean reconciliation; operations teams never wait on invoices.": { fr: "Nous opérons volontairement un portefeuille prépayé : votre agence crédite son solde une fois et les frais de dossiers sont réglés automatiquement sur un grand livre complet. Les équipes financières obtiennent une réconciliation propre ; les équipes opérationnelles n'attendent jamais de factures.", ar: "نعتمد عمدًا نموذج المحفظة المدفوعة مسبقًا: تشحن وكالتكم رصيدها مرة واحدة وتُسوّى رسوم الطلبات تلقائيًا مقابل دفتر قيود كامل. تحصل فرق المالية على تسوية نظيفة ولا تنتظر فرق العمليات الفواتير أبدًا." },
  "Registered office:": { fr: "Siège social :", ar: "المقر المسجل:" },
  "Operations-first": { fr: "Opérations d'abord", ar: "العمليات أولًا" },
  "Built by visa professionals, for visa professionals — not adapted from generic CRM software.": { fr: "Conçu par des professionnels du visa, pour des professionnels du visa — pas un simple CRM générique adapté.", ar: "بناه محترفو تأشيرات لمحترفي التأشيرات — وليس برنامج CRM عامًا مُكيَّفًا." },
  "Config-driven": { fr: "Piloté par la configuration", ar: "قائم على الإعدادات" },
  "Embassy rule changes are applied centrally; your quotes and checklists stay current.": { fr: "Les changements de règles d'ambassade sont appliqués centralement ; vos devis et checklists restent à jour.", ar: "تُطبق تغييرات قواعد السفارات مركزيًا؛ فتبقى عروض أسعاركم وقوائم التحقق محدثة." },
  "Audited by design": { fr: "Audité par conception", ar: "مُدقَّق بالتصميم" },
  "Wallet movements, status changes and document reviews are logged immutably.": { fr: "Mouvements de portefeuille, changements de statut et revues de documents sont journalisés de façon immuable.", ar: "حتى مشيّة المحفظة وتغييرات الحالة ومراجعات المستندات مسجلة بشكل ثابت." },
  "Partner with us": { fr: "Devenez partenaire", ar: "شراكتنا معك" },
  "Contact ESSAFARIA": { fr: "Contacter ESSAFARIA", ar: "تواصل مع ESSAFARIA" },
  "Partnership, operations and billing enquiries.": { fr: "Demandes de partenariat, d'opérations et de facturation.", ar: "استفسارات الشراكة والعمليات والفوترة." },

  /* ------------------------------- login -------------------------------- */
  "Sign in to your account": { fr: "Connectez-vous à votre compte", ar: "سجّل الدخول إلى حسابك" },
  "Agency partners sign in with the email registered during onboarding; ESSAFARIA staff use their internal credentials.": { fr: "Les agences partenaires se connectent avec l'e-mail enregistré lors de l'intégration ; l'équipe ESSAFARIA utilise ses identifiants internes.", ar: "تسجل الوكالات الشريكة الدخول بالبريد المسجل أثناء الانضمام؛ ويستخدم موظفو ESSAFARIA بيانات اعتمادهم الداخلية." },
  "Password": { fr: "Mot de passe", ar: "كلمة المرور" },
  "Sign in": { fr: "Se connecter", ar: "تسجيل الدخول" },
  "Signing in": { fr: "Connexion en cours", ar: "جارٍ تسجيل الدخول" },
  "New agency?": { fr: "Nouvelle agence ?", ar: "وكالة جديدة؟" },
  "Apply for partnership": { fr: "Postuler au partenariat", ar: "قدّم طلب شراكة" },

  "One platform for your entire": { fr: "Une plateforme pour toute votre", ar: "منصة واحدة لكل" },
  "visa operation": { fr: "opération visa", ar: "عمليات التأشيرات" },
  "Agency partners manage applications, documents and wallets. Staff process files from the central Back Office.": { fr: "Les agences partenaires gèrent dossiers, documents et portefeuilles. L'équipe traite les dossiers depuis le Back Office central.", ar: "تدير الوكالات الشريكة الطلبات والمستندات والمحافظ. ويعالج الموظفون الملفات من المكتب الخلفي المركزي." },
  "Access is restricted to authorized users. All activity is logged and audited.": { fr: "Accès réservé aux utilisateurs autorisés. Toute activité est journalisée et auditée.", ar: "الوصول مقصور على المستخدمين المخولين. جميع الأنشطة مسجلة ومُدققة." },
  "Agency portal and Back Office access.": { fr: "Accès au Portail Agence et au Back Office.", ar: "الدخول إلى بوابة الوكالة والمكتب الخلفي." },
  "Agency access is provisioned. Forgotten credentials? Contact your account manager.": { fr: "L'accès agence est provisionné. Identifiants oubliés ? Contactez votre chargé de compte.", ar: "يتم توفير وصول الوكالة من الإدارة. نسيت بيانات الاعتماد؟ تواصل مع مدير حسابك." },
  /* ------------------------------ public b2b ----------------------------- */
  "Dedicated operations desk": { fr: "Desk opérations dédié", ar: "مكتب عمليات مخصص" },
  "Wholesale fee structure": { fr: "Structure tarifaire de gros", ar: "هيكل رسوم الجملة" },
  "Your branded portal": { fr: "Votre portail à votre marque", ar: "بوابتكم بعلامتكم التجارية" },
  "Compliance & audit": { fr: "Conformité & audit", ar: "الامتثال والتدقيق" },
  "How onboarding works": { fr: "Comment se passe l'intégration", ar: "كيف تجري عملية الانضمام" },

  /* ---------------------------- public countries ------------------------- */
  "Destinations we serve": { fr: "Destinations que nous desservons", ar: "الوجهات التي نخدمها" },
  "Coverage": { fr: "Couverture", ar: "التغطية" },
  "Programmes, checklists and partner pricing are accessible after agency onboarding — inside your Agency Portal.": { fr: "Programmes, checklists et tarifs partenaires accessibles après intégration — dans votre Portail Agence.", ar: "البرامج وقوائم التحقق وأسعار الشركاء متاحة بعد الانضمام — داخل بوابة الوكالة." },

  /* ------------------------------ public about --------------------------- */
  "About": { fr: "À propos", ar: "حول" },
};

/** All registered content keys (guard-test target). */
export const REGISTERED_CONTENT_KEYS: string[] = Object.keys(CONTENT);

/** Translate registered page content; unknown strings pass through (EN). */
export function contentT(locale: UiLocale): (s: string) => string {
  return (s: string) => {
    if (locale === "en") return s;
    const entry = CONTENT[s];
    if (!entry) return s;
    return locale === "fr" ? entry.fr : entry.ar;
  };
}

/** Localized greeting for a day-part (admin dashboards). */
export function localizedGreeting(kind: "morning" | "afternoon" | "evening", locale: UiLocale): string {
  const map = CONTENT[kind];
  if (!map || locale === "en") return kind === "morning" ? "morning" : kind === "afternoon" ? "afternoon" : "evening";
  return locale === "fr" ? map.fr : map.ar;
}

/** True when a content key carries an explicit translation in both locales. */
export function contentHas(key: string): boolean {
  return key in CONTENT;
}
