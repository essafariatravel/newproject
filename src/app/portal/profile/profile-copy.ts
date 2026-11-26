import type { UiLocale } from "@/lib/ui-i18n";
const copy = {
  agency: ["Agence","Agency","الوكالة"], account: ["Mon compte","My account","حسابي"], team: ["Équipe","Team","الفريق"],
  identity: ["Identité professionnelle","Professional identity","الهوية المهنية"],
  contact: ["Coordonnées","Contact details","بيانات الاتصال"],
  billing: ["Facturation","Billing","الفوترة"],
  managed: ["Ces informations sont administrées par ESSAFARIA.","These details are managed by ESSAFARIA.","تدير ESSAFARIA هذه المعلومات."],
  missing: ["Non renseigné","Not provided","غير محدد"],
  complete: ["Complétez les coordonnées manquantes pour faciliter les échanges avec ESSAFARIA.","Complete missing contact details to make communication with ESSAFARIA easier.","أكمل بيانات الاتصال الناقصة لتسهيل التواصل مع ESSAFARIA."],
  edit: ["Modifier","Edit","تعديل"], cancel: ["Annuler","Cancel","إلغاء"], save: ["Enregistrer","Save","حفظ"],
  logo: ["Logo de l’agence","Agency logo","شعار الوكالة"], choose: ["Choisir un logo","Choose logo","اختر شعاراً"], replace: ["Remplacer le logo","Replace logo","استبدال الشعار"], remove: ["Retirer le logo","Remove logo","إزالة الشعار"],
  logoHint: ["PNG, JPEG ou WebP · 2 Mo maximum","PNG, JPEG or WebP · 2 MB maximum","PNG أو JPEG أو WebP · 2 ميغابايت كحد أقصى"],
  logoError: ["Choisissez une image PNG, JPEG ou WebP valide de 2 Mo maximum.","Choose a valid PNG, JPEG or WebP image up to 2 MB.","اختر صورة PNG أو JPEG أو WebP صالحة بحجم لا يتجاوز 2 ميغابايت."],
  removeConfirm: ["Retirer le logo de votre agence ?","Remove your agency logo?","هل تريد إزالة شعار وكالتك؟"],
  security: ["Sécurité du compte","Account security","أمان الحساب"], personal: ["Informations personnelles","Personal details","المعلومات الشخصية"],
  access: ["Accès de l’agence","Agency access","صلاحيات الوكالة"], you: ["Vous","You","أنت"],
  lastLogin: ["Dernière connexion","Last sign-in","آخر تسجيل دخول"], never: ["Aucune connexion enregistrée","No recorded sign-in","لا يوجد تسجيل دخول مسجل"],
  passwordHint: ["Gérez votre mot de passe personnel.","Manage your personal password.","إدارة كلمة المرور الشخصية."],
  sessions: ["Les anciennes sessions seront fermées. Votre session actuelle sera renouvelée.","Previous sessions will be signed out. Your current session will be renewed.","سيتم إنهاء الجلسات السابقة وتجديد جلستك الحالية."],
  length: ["Entre 12 et 200 caractères","Between 12 and 200 characters","من 12 إلى 200 حرف"],
  different: ["Différent du mot de passe actuel","Different from your current password","مختلفة عن كلمة المرور الحالية"],
  match: ["Confirmation identique","Passwords match","كلمتا المرور متطابقتان"],
  currentHint: ["Saisissez votre mot de passe actuel.","Enter your current password.","أدخل كلمة المرور الحالية."],
  back: ["Retour au compte","Back to account","العودة إلى الحساب"],
  login: ["Identifiant de connexion","Sign-in username","معرّف تسجيل الدخول"],
  password: ["Mot de passe","Password","كلمة المرور"],
  preview: ["Aperçu du logo","Logo preview","معاينة الشعار"],
  preferences: ["Préférences","Preferences","التفضيلات"],
  support: ["Assistance","Support","المساعدة"],
  workspace: ["Votre environnement de travail","Your workspace","مساحة عملك"],
  browser: ["Ces préférences sont mémorisées pour votre compte sur ce navigateur, pas sur vos autres appareils.","These preferences are saved for your account in this browser, not on other devices.","تُحفظ هذه التفضيلات لحسابك في هذا المتصفح، وليس على الأجهزة الأخرى."],
  nationality: ["Nationalité par défaut","Default nationality","الجنسية الافتراضية"],
  nationalityHint: ["Présélection uniquement : vérifiez la nationalité de chaque voyageur.","Preselection only: verify each traveller’s nationality.","اختيار مسبق فقط: تحقق من جنسية كل مسافر."],
  sort: ["Tri initial des dossiers","Default case sorting","الترتيب الافتراضي للطلبات"],
  recent: ["Dernière activité","Latest activity","آخر نشاط"],
  submitted: ["Date de soumission","Submission date","تاريخ الإرسال"],
  oldest: ["Plus anciens","Oldest first","الأقدم أولاً"],
  priority: ["Prioritaires","Priority first","الأولوية"],
  density: ["Densité des dossiers","Case list density","كثافة عرض الطلبات"],
  standard: ["Standard","Standard","عادي"],
  compact: ["Compacte","Compact","مضغوط"],
  favorites: ["Destinations favorites","Favourite destinations","الوجهات المفضلة"],
  favoritesHint: ["Jusqu’à quatre destinations dans les raccourcis de l’accueil.","Up to four destinations in home shortcuts.","حتى أربع وجهات في اختصارات الصفحة الرئيسية."],
  sound: ["Sons des notifications","Notification sounds","أصوات الإشعارات"],
  soundHint: ["Réglage de ce navigateur ; les notifications métier restent actives.","Browser setting; operational notifications remain active.","إعداد المتصفح؛ تبقى إشعارات العمل نشطة."],
  on: ["Activé","On","مفعّل"],
  off: ["Désactivé","Off","معطّل"],
  devices: ["Appareils et sessions","Devices and sessions","الأجهزة والجلسات"],
  current: ["Session actuelle","Current session","الجلسة الحالية"],
  disconnect: ["Déconnecter","Disconnect","قطع الاتصال"],
  disconnectAll: ["Déconnecter les autres sessions","Disconnect other sessions","إنهاء الجلسات الأخرى"],
  confirmSession: ["Confirmer la déconnexion ?","Confirm disconnect?","تأكيد قطع الاتصال؟"],
  noOther: ["Aucune autre session active identifiée.","No other active session identified.","لم يتم العثور على جلسات نشطة أخرى."],
  unknownDevice: ["Navigateur non identifié","Unidentified browser","متصفح غير معروف"],
  activity: ["Activité du compte","Account activity","نشاط الحساب"],
  noActivity: ["Aucune activité enregistrée dans cet historique.","No activity recorded in this history.","لا يوجد نشاط مسجل في هذا السجل."],
  lastActivity: ["Dernière activité","Last activity","آخر نشاط"],
  historyHint: ["Vos 12 dernières opérations enregistrées, sans données internes.","Your last 12 recorded actions, without internal data.","آخر 12 عملية مسجلة لك دون بيانات داخلية."],
  supportTitle: ["Service partenaires ESSAFARIA","ESSAFARIA partner service","خدمة شركاء ESSAFARIA"],
  supportBody: ["Pour une question administrative, commerciale ou technique, utilisez les coordonnées officielles.","For administrative, commercial or technical questions, use the official contact details.","للأسئلة الإدارية أو التجارية أو التقنية استخدم بيانات الاتصال الرسمية."],
  contactUs: ["Contacter ESSAFARIA","Contact ESSAFARIA","اتصل بـ ESSAFARIA"],
  caseMessages: ["Messages liés aux dossiers","Case-related messages","رسائل الطلبات"],
  teamHint: ["Pour toute modification de vos accès professionnels, contactez ESSAFARIA.","Contact ESSAFARIA to change your professional access.","اتصل بـ ESSAFARIA لتعديل صلاحياتك المهنية."],
  completeTitle: ["À compléter","To complete","بيانات للاستكمال"],
  editContact: ["Compléter les coordonnées","Complete contact details","أكمل بيانات الاتصال"],
  copyId: ["Copier l’identifiant","Copy username","نسخ المعرّف"],
  copied: ["Copié","Copied","تم النسخ"],
  showId: ["Afficher l’identifiant","Show username","عرض المعرّف"],
  hideId: ["Masquer l’identifiant","Hide username","إخفاء المعرّف"],
  unavailable: ["Information temporairement indisponible.","Information temporarily unavailable.","المعلومات غير متاحة مؤقتاً."],
  loginEvent: ["Connexion au compte","Account sign-in","تسجيل الدخول"],
  passwordEvent: ["Mot de passe modifié","Password changed","تم تغيير كلمة المرور"],
  sessionEvent: ["Sessions déconnectées","Sessions disconnected","تم إنهاء الجلسات"],
  contactEvent: ["Coordonnées modifiées","Contact details updated","تم تحديث بيانات الاتصال"],
  logoEvent: ["Logo importé","Logo uploaded","تم رفع الشعار"],
  logoRemoved: ["Logo retiré","Logo removed","تم إزالة الشعار"],
  hours: ["Horaires","Office hours","ساعات العمل"],
  language: ["Langue de l’interface","Interface language","لغة الواجهة"],
} as const;
export type ProfileCopy = { [K in keyof typeof copy]: string };
export function profileCopy(locale: UiLocale): ProfileCopy {
  const i = locale === "fr" ? 0 : locale === "ar" ? 2 : 1;
  return Object.fromEntries(Object.entries(copy).map(([k,v])=>[k,v[i]])) as ProfileCopy;
}
export function profileTab(value: unknown): "agency"|"account"|"team"|"preferences"|"support" {
  return value === "account" || value === "team" || value === "preferences" || value === "support" ? value : "agency";
}
export function validLogoFile(file: {type:string;size:number;name:string}): boolean {
  return ["image/png","image/jpeg","image/webp"].includes(file.type) && file.size > 0 && file.size <= 2*1024*1024 && file.name.length <= 200;
}
export function contactChanged(a: {phone:string;city:string;addressLine:string}, b: {phone:string;city:string;addressLine:string}) {
  return a.phone.trim()!==b.phone.trim() || a.city.trim()!==b.city.trim() || a.addressLine.trim()!==b.addressLine.trim();
}
export function passwordChecks(current:string,password:string,confirm:string) {
  return {length:password.length>=12 && password.length<=200,different:current.length>0 && password.length>0 && current!==password,match:password.length>0 && password===confirm};
}

export function firstMissingContactField(contact:{phone:string;city:string;addressLine:string}):"phone"|"city"|"addressLine" {
 return (["phone","city","addressLine"] as const).find(k=>!contact[k].trim())??"phone";
}
