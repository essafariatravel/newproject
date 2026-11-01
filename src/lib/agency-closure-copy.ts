import type { UiLocale } from "./ui-i18n";

const copy = {
  title: ["Permanently remove the agency", "Supprimer intégralement l'agence", "حذف الوكالة بالكامل من البوابة"],
  obligationsHint:["Outstanding obligations are retained for ESSAFARIA. This action cancels no dossier, credit, refund or payment. Authorized Staff can continue existing open dossiers; the closed wallet cannot receive new movements.","Les obligations restent à la charge d’ESSAFARIA. Aucun dossier, crédit, remboursement ou paiement n’est annulé. Le Staff habilité peut poursuivre les dossiers en cours ; le Wallet clôturé ne reçoit aucun nouveau mouvement.","تبقى الالتزامات على عاتق ESSAFARIA. لا يُلغى أي ملف أو رصيد أو استرداد أو دفع. يمكن للموظفين المخولين متابعة الملفات الجارية، دون حركات مالية جديدة للمحفظة المغلقة."],
  acceptObligations:["I explicitly assume responsibility for ESSAFARIA's retained outstanding obligations.","Je confirme explicitement la prise en charge par ESSAFARIA des obligations conservées.","أؤكد صراحةً تحمل ESSAFARIA مسؤولية الالتزامات المحفوظة."],
  responsibilityNote:["Responsibility and follow-up reference","Responsable et référence de suivi","المسؤول ومرجع المتابعة"],
  obligationError:["Refresh the summary, confirm ESSAFARIA's responsibility and provide its follow-up reference.","Actualisez le récapitulatif, confirmez la prise en charge par ESSAFARIA et indiquez la référence de suivi.","حدّث الملخص وأكد تحمل ESSAFARIA للمسؤولية وأدخل مرجع المتابعة."],
  integrityError:["Financial reconciliation is required. No amount was changed.","Un rapprochement financier est nécessaire. Aucun montant n’a été modifié.","تلزم مطابقة السجلات المالية. لم يتغير أي مبلغ."],
  showPassword:["Show","Afficher","إظهار"],hidePassword:["Hide","Masquer","إخفاء"],
  consequence: ["All agency access, sessions and pending invitations will be revoked. Authorized Staff keep historical dossiers under the approved retention policy. This operation cannot reactivate the old account.", "Les accès, sessions et invitations en attente seront révoqués. Le Staff habilité conserve les dossiers historiques selon la politique approuvée. Cette opération ne permet pas de réactiver l’ancien compte.", "سيُلغى الوصول والجلسات والدعوات المعلّقة. يحتفظ الموظفون المخولون بالملفات التاريخية وفق سياسة الاحتفاظ المعتمدة. لا يمكن إعادة تفعيل الحساب القديم."],
  users: ["Users affected", "Utilisateurs concernés", "المستخدمون المعنيون"],
  open: ["Open dossiers", "Dossiers en cours", "الملفات الجارية"],
  completed: ["Completed dossiers retained", "Dossiers terminés conservés", "الملفات المكتملة المحفوظة"],
  wallet: ["Wallet balance", "Solde du portefeuille", "رصيد المحفظة"],
  confirmation: ["Type the exact legal agency name", "Saisissez le nom légal exact de l’agence", "أدخل الاسم القانوني الكامل للوكالة"],
  password: ["Verify your current password", "Vérifiez votre mot de passe actuel", "تحقق من كلمة مرورك الحالية"],
  policy: ["Approved retention policy reference", "Référence de la politique de conservation approuvée", "مرجع سياسة الاحتفاظ المعتمدة"],
  until: ["Archive retention end date under this policy", "Fin de conservation des archives selon cette politique", "تاريخ انتهاء الاحتفاظ بالأرشيف وفق السياسة"],
  policyHint: ["Use an existing approved policy and its applicable duration. Closure retains history; it does not authorize a data purge.", "Utilisez une politique déjà approuvée et sa durée applicable. La clôture conserve l’historique et n’autorise aucune purge.", "استخدم سياسة معتمدة ومدتها المطبقة. يحتفظ الإغلاق بالسجل ولا يسمح بمحو البيانات."],
  blockedTarget: ["The secure execution environment could not be verified. No closure was performed.", "L’environnement sécurisé d’exécution n’a pas pu être vérifié. Aucune clôture n’a été effectuée.", "تعذر التحقق من بيئة التنفيذ الآمنة. لم يتم إغلاق أي وكالة."],
  pending: ["Closing access…", "Clôture des accès…", "جارٍ إغلاق الوصول…"],
  closed: ["Agency closed. Operational access has been revoked; historical records remain available to authorized Staff.", "Agence clôturée. Les accès sont révoqués ; les archives restent consultables par le Staff habilité.", "أُغلقت الوكالة وأُلغي الوصول. يبقى السجل متاحاً للموظفين المخولين."],
  failure: ["Closure was not confirmed. Refresh and verify the agency status before retrying; contact the owner if the result is uncertain.", "La clôture n’a pas été confirmée. Actualisez et vérifiez le statut avant de réessayer ; contactez le propriétaire si le résultat reste incertain.", "لم يُؤكد الإغلاق. حدّث الصفحة وتحقق من الحالة قبل إعادة المحاولة؛ تواصل مع المالك إذا بقيت النتيجة غير مؤكدة."],
  verification: ["Verification failed. Check your current session, password and typed agency name.", "Vérification refusée. Contrôlez votre session, votre mot de passe actuel et le nom saisi.", "تعذر التحقق. راجع الجلسة وكلمة المرور الحالية واسم الوكالة المدخل."],
  policyError: ["Provide the approved policy reference and a valid future retention end date.", "Indiquez la référence approuvée et une date de fin de conservation valide et future.", "أدخل مرجع السياسة المعتمدة وتاريخ انتهاء صالحاً ومستقبلياً."],
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
