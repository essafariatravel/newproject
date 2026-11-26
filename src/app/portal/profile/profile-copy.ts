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
} as const;
export type ProfileCopy = { [K in keyof typeof copy]: string };
export function profileCopy(locale: UiLocale): ProfileCopy {
  const i = locale === "fr" ? 0 : locale === "ar" ? 2 : 1;
  return Object.fromEntries(Object.entries(copy).map(([k,v])=>[k,v[i]])) as ProfileCopy;
}
export function profileTab(value: unknown): "agency"|"account"|"team" {
  return value === "account" || value === "team" ? value : "agency";
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
