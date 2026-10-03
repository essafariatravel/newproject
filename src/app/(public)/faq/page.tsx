import type { Metadata } from "next";
import { getUiLocale, type UiLocale } from "@/lib/ui-i18n";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("faq", await getUiLocale());
}

const FAQ_COPY: Record<
  UiLocale,
  {
    title: string;
    intro: string;
    items: Array<{ question: string; answer: string }>;
  }
> = {
  en: {
    title: "Frequently asked questions",
    intro: "Practical information for travel agencies considering or using ESSAFARIA's B2B services.",
    items: [
      {
        question: "Who is ESSAFARIA Visa OS for?",
        answer:
          "ESSAFARIA Visa OS is designed for travel agencies and authorized professional partners using ESSAFARIA's B2B services.",
      },
      {
        question: "How can an agency request access?",
        answer:
          "An interested agency can use the agency registration process or contact ESSAFARIA. Account opening remains subject to the applicable professional partner review.",
      },
      {
        question: "How is a visa request submitted?",
        answer:
          "After signing in to its secure workspace, an authorized agency can create a request and provide the information and documents required for the relevant service.",
      },
      {
        question: "How are documents submitted?",
        answer:
          "Requested case documents are provided through the secure professional workspace. Client documents are not published on the public website.",
      },
      {
        question: "How can an agency follow a request?",
        answer:
          "Authorized users can review available status information in their professional workspace and use the communication channels provided by ESSAFARIA.",
      },
      {
        question: "Does the public website show every visa service currently available?",
        answer:
          "No. The public website presents ESSAFARIA and its services at a general level. Operational availability, commercial conditions and partner-only information remain inside the professional workspace.",
      },
    ],
  },
  fr: {
    title: "Questions fréquentes",
    intro: "Informations pratiques pour les agences de voyages qui souhaitent travailler avec les services B2B d’ESSAFARIA.",
    items: [
      {
        question: "À qui s’adresse ESSAFARIA Visa OS ?",
        answer:
          "ESSAFARIA Visa OS est destiné aux agences de voyages et partenaires professionnels autorisés qui utilisent les services B2B d’ESSAFARIA.",
      },
      {
        question: "Comment une agence peut-elle demander un accès ?",
        answer:
          "Une agence intéressée peut utiliser le parcours d’inscription agence ou contacter ESSAFARIA. L’ouverture d’un compte reste soumise au processus de validation applicable aux partenaires professionnels.",
      },
      {
        question: "Comment soumettre une demande de visa ?",
        answer:
          "Après connexion à son espace sécurisé, une agence autorisée peut créer une demande et fournir les informations et documents requis pour le service concerné.",
      },
      {
        question: "Comment les documents sont-ils transmis ?",
        answer:
          "Les documents demandés pour un dossier sont transmis dans l’espace professionnel sécurisé. Les documents clients ne sont pas publiés sur le site public.",
      },
      {
        question: "Comment suivre une demande ?",
        answer:
          "Les utilisateurs autorisés peuvent consulter les informations de suivi disponibles dans leur espace professionnel et utiliser les canaux de communication prévus par ESSAFARIA.",
      },
      {
        question: "Le site public présente-t-il tous les services visa actuellement disponibles ?",
        answer:
          "Non. Le site public présente ESSAFARIA et ses services de manière générale. Les disponibilités opérationnelles, conditions commerciales et informations réservées aux partenaires restent dans l’espace professionnel.",
      },
    ],
  },
  ar: {
    title: "الأسئلة الشائعة",
    intro: "معلومات عملية لوكالات السفر التي ترغب في استخدام خدمات ESSAFARIA بنظام B2B.",
    items: [
      {
        question: "لمن صُممت منصة ESSAFARIA Visa OS؟",
        answer:
          "صُممت ESSAFARIA Visa OS لوكالات السفر والشركاء المهنيين المعتمدين الذين يستخدمون خدمات ESSAFARIA بنظام B2B.",
      },
      {
        question: "كيف يمكن للوكالة طلب الوصول إلى المنصة؟",
        answer:
          "يمكن للوكالة المهتمة استخدام مسار تسجيل الوكالات أو التواصل مع ESSAFARIA. ويظل فتح الحساب خاضعاً لإجراءات اعتماد الشركاء المهنيين المعمول بها.",
      },
      {
        question: "كيف يتم تقديم طلب تأشيرة؟",
        answer:
          "بعد تسجيل الدخول إلى المساحة الآمنة، يمكن للوكالة المخولة إنشاء طلب وتقديم المعلومات والوثائق المطلوبة للخدمة المعنية.",
      },
      {
        question: "كيف يتم إرسال الوثائق؟",
        answer:
          "تُرسل الوثائق المطلوبة للملف عبر المساحة المهنية الآمنة، ولا يتم نشر وثائق العملاء على الموقع العام.",
      },
      {
        question: "كيف يمكن متابعة الطلب؟",
        answer:
          "يمكن للمستخدمين المخولين الاطلاع على معلومات المتابعة المتاحة داخل المساحة المهنية واستخدام قنوات التواصل التي توفرها ESSAFARIA.",
      },
      {
        question: "هل يعرض الموقع العام جميع خدمات التأشيرات المتاحة حالياً؟",
        answer:
          "لا. يعرض الموقع العام ESSAFARIA وخدماتها بصورة عامة، بينما تبقى التوفرات التشغيلية والشروط التجارية والمعلومات المخصصة للشركاء داخل المساحة المهنية.",
      },
    ],
  },
};

export default async function FaqPage() {
  const locale = await getUiLocale();
  const copy = FAQ_COPY[locale];

  return (
    <section className="ess-container max-w-4xl py-14 sm:py-20">
      <p className="travel-eyebrow text-gold-700">ESSAFARIA</p>
      <h1 className="mt-3 font-serif text-4xl text-navy-900 sm:text-5xl">{copy.title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">{copy.intro}</p>
      <div className="mt-10 divide-y divide-line border-y border-line">
        {copy.items.map((item) => (
          <article key={item.question} className="py-6">
            <h2 className="font-serif text-xl text-navy-900">{item.question}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
