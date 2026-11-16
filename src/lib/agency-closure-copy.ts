import type { UiLocale } from "./ui-i18n";

const copy = {
  title: ["Permanently close agency access", "Clôturer définitivement l’agence", "إغلاق وصول الوكالة نهائياً"],
  obligationsHint:["Outstanding obligations are retained for ESSAFARIA. This action cancels no dossier, credit, refund or payment. Authorized Staff can continue existing open dossiers; the closed wallet cannot receive new movements.","Les obligations restent à la charge d’ESSAFARIA. Aucun dossier, crédit, remboursement ou paiement n’est annulé. Le Staff habilité peut poursuivre les dossiers en cours ; le Wallet clôturé ne reçoit aucun nouveau mouvement.","تبقى الالتزامات على عاتق ESSAFARIA. لا يُلغى أي ملف أو رصيد أو استرداد أو دفع. يمكن للموظفين المخولين متابعة الملفات الجارية، دون حركات مالية جديدة للمحفظة المغلقة."],
  acceptObligations:["I explicitly assume responsibility for ESSAFARIA's retained outstanding obligations.","Je confirme explicitement la prise en charge par ESSAFARIA des obligations conservées.","أؤكد صراحةً تحمل ESSAFARIA مسؤولية الالتزامات المحفوظة."],
  responsibilityNote:["ESSAFARIA contact and planned follow-up (maximum 2,000 characters)","Responsable ESSAFARIA et actions de suivi prévues (2 000 caractères maximum)","مسؤول ESSAFARIA وإجراءات المتابعة المقررة (2000 حرف كحد أقصى)"],
  obligationError:["Refresh the summary, check the responsibility confirmation and describe who at ESSAFARIA will handle the remaining obligations (maximum 2,000 characters).","Actualisez le récapitulatif, cochez la prise en charge et précisez qui, chez ESSAFARIA, traitera les obligations restantes et comment (2 000 caractères maximum).","حدّث الملخص وأكد تحمل المسؤولية ووضح المسؤول في ESSAFARIA وكيفية معالجة الالتزامات المتبقية (2000 حرف كحد أقصى)."],
  integrityError:["Financial reconciliation is required. No amount was changed.","Un rapprochement financier est nécessaire. Aucun montant n’a été modifié.","تلزم مطابقة السجلات المالية. لم يتغير أي مبلغ."],
  showPassword:["Show","Afficher","إظهار"],hidePassword:["Hide","Masquer","إخفاء"],
  consequence: ["The agency will leave the active list. Its access, sessions and pending invitations will be revoked. Dossiers, documents, wallet balances, receipts and history remain available to authorized ESSAFARIA Staff. A later registration creates independent access and does not restore old rights.", "L’agence sera retirée des listes actives. Ses accès, sessions et invitations en attente seront révoqués. Les dossiers, documents, soldes Wallet, justificatifs et historiques restent accessibles au personnel ESSAFARIA habilité. Une réinscription ultérieure crée un accès indépendant sans restaurer les anciens droits.", "ستُزال الوكالة من القوائم النشطة ويُلغى الوصول والجلسات والدعوات المعلقة. تبقى الملفات والمستندات وأرصدة المحفظة والإيصالات والسجلات متاحة لموظفي ESSAFARIA المخولين. ينشئ التسجيل اللاحق وصولاً مستقلاً دون استعادة الحقوق القديمة."],
  users: ["Users affected", "Utilisateurs concernés", "المستخدمون المعنيون"],
  open: ["Open dossiers", "Dossiers en cours", "الملفات الجارية"],
  completed: ["Completed dossiers retained", "Dossiers terminés conservés", "الملفات المكتملة المحفوظة"],
  wallet: ["Wallet balance", "Solde du portefeuille", "رصيد المحفظة"],
  confirmation: ["Type the exact legal agency name", "Saisissez le nom légal exact de l’agence", "أدخل الاسم القانوني الكامل للوكالة"],
  password: ["Your current password to confirm closure", "Votre mot de passe actuel pour confirmer la clôture", "كلمة مرورك الحالية لتأكيد الإغلاق"],
  archiveNotice: ["This closes portal access only. No archive is erased and no retention period is changed. Any physical erasure is a separate operation governed by applicable retention rules and legal holds.", "Cette clôture concerne uniquement l’accès au portail. Aucune archive n’est effacée et aucune durée de conservation n’est modifiée. Un éventuel effacement physique relève d’une procédure distincte, soumise aux règles de conservation et aux obligations légales applicables.", "يخص هذا الإغلاق الوصول إلى البوابة فقط. لا يُمحى أي أرشيف ولا تتغير مدد الاحتفاظ. أي محو فعلي يخضع لإجراء مستقل وقواعد الاحتفاظ والالتزامات القانونية المطبقة."],
  blockedTarget: ["The secure execution environment could not be verified. No closure was performed.", "L’environnement sécurisé d’exécution n’a pas pu être vérifié. Aucune clôture n’a été effectuée.", "تعذر التحقق من بيئة التنفيذ الآمنة. لم يتم إغلاق أي وكالة."],
  pending: ["Closing access…", "Clôture des accès…", "جارٍ إغلاق الوصول…"],
  closed: ["Agency closed. Operational access has been revoked; historical records remain available to authorized Staff.", "Agence clôturée. Les accès sont révoqués ; les archives restent consultables par le Staff habilité.", "أُغلقت الوكالة وأُلغي الوصول. يبقى السجل متاحاً للموظفين المخولين."],
  failure: ["Closure was not confirmed. Refresh and verify the agency status before retrying; contact the owner if the result is uncertain.", "La clôture n’a pas été confirmée. Actualisez et vérifiez le statut avant de réessayer ; contactez le propriétaire si le résultat reste incertain.", "لم يُؤكد الإغلاق. حدّث الصفحة وتحقق من الحالة قبل إعادة المحاولة؛ تواصل مع المالك إذا بقيت النتيجة غير مؤكدة."],
  verification: ["Verification failed. Check your current session, password and typed agency name.", "Vérification refusée. Contrôlez votre session, votre mot de passe actuel et le nom saisi.", "تعذر التحقق. راجع الجلسة وكلمة المرور الحالية واسم الوكالة المدخل."],
  nameError: ["Type the exact legal agency name shown above to confirm closure.", "Recopiez exactement le nom légal de l’agence affiché ci-dessus pour confirmer la clôture.", "انسخ الاسم القانوني للوكالة المعروض أعلاه كما هو لتأكيد الإغلاق."],
  inputError: ["The agency reference is invalid. Reload its page before confirming closure.", "La référence de l’agence est invalide. Rechargez sa fiche avant de confirmer la clôture.", "مرجع الوكالة غير صالح. أعد تحميل صفحتها قبل تأكيد الإغلاق."],
  BALANCE_NOT_ZERO: ["The remaining credit is preserved and must be handled by ESSAFARIA.", "Le crédit restant est conservé et doit être traité par ESSAFARIA.", "يُحفظ الرصيد المتبقي وتبقى معالجته على عاتق ESSAFARIA."],
  WALLET_RECONCILIATION_REQUIRED: ["Reconcile the wallet with its immutable ledger.", "Rapprochez le portefeuille et son journal immuable.", "طابق المحفظة مع سجلها المالي الثابت."],
  CURRENCY_REVIEW_REQUIRED: ["The wallet currency requires review.", "La devise du portefeuille doit être vérifiée.", "تحتاج عملة المحفظة إلى مراجعة."],
  OPEN_APPLICATIONS: ["Open dossiers remain the responsibility of ESSAFARIA; their status is unchanged.", "Les dossiers en cours restent à traiter par ESSAFARIA ; leurs statuts sont inchangés.", "تبقى الملفات الجارية على عاتق ESSAFARIA دون تغيير حالتها."],
  PENDING_TOPUPS: ["Pending top-ups and receipts are retained for explicit financial follow-up.", "Les recharges en attente et leurs justificatifs sont conservés pour un suivi financier explicite.", "تُحفظ طلبات الشحن المعلقة ومستنداتها للمتابعة المالية الصريحة."],
  archives: ["Closed agencies", "Agences clôturées", "الوكالات المغلقة"],
  current: ["Current agencies", "Agences actuelles", "الوكالات الحالية"],
  closedLabel: ["Closed", "Clôturée", "مغلقة"],
} as const;
export type ClosureCopyKey = keyof typeof copy;
export function agencyClosureCopy(locale: UiLocale) {
  return (key: ClosureCopyKey) => copy[key][locale === "fr" ? 1 : locale === "ar" ? 2 : 0];
}
