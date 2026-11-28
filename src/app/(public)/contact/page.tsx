import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import { publicContactDetails } from "@/lib/public-contact";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";
import { PUBLIC_COMPANY_FACTS } from "@/lib/public-company-identity";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";

const paths = {
  fr: { partner: "Déjà partenaire", access: "Connexion agence", partnerBody: "Retrouvez vos dossiers et contactez votre interlocuteur depuis votre espace agence.", join: "Devenir partenaire", register: "Inscrire votre agence", joinBody: "Présentez votre agence à l’équipe chargée des partenariats.", channels: "Coordonnées", office: "Siège de l’opérateur", identity: "Identité de l’opérateur", hours: "Horaires", social: "Réseaux sociaux" },
  en: { partner: "Existing partner", access: "Agency sign-in", partnerBody: "Open your workspace to find your cases and reach your case officer.", join: "Become a partner", register: "Register your agency", joinBody: "Introduce your agency to the partnerships team.", channels: "Contact details", office: "Operator’s office", identity: "Operator identity", hours: "Office hours", social: "Social channels" },
  ar: { partner: "وكالة شريكة", access: "دخول الوكالة", partnerBody: "ادخلوا مساحة وكالتكم للاطلاع على الملفات والتواصل مع المسؤول عنها.", join: "طلب الشراكة", register: "تسجيل وكالتكم", joinBody: "عرّفوا فريق الشراكات بوكالتكم.", channels: "بيانات الاتصال", office: "مقر المشغّل", identity: "هوية المشغّل", hours: "ساعات العمل", social: "شبكات التواصل" },
} as const;

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("contact", await getUiLocale());
}

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const locale = await getUiLocale();
  const ct = contentT(locale);
  const labels = paths[locale];
  const { email, phone, address, officeHours, social } = publicContactDetails(settings);
  const hasDetails = Boolean(email || phone || address);
  const socialLinks = Object.entries(social);

  return (
    <section className="public-front-page info-page" aria-labelledby="contact-heading">
      <div className="info-width">
        <header className="info-contact-intro info-hero-copy">
          <h1 id="contact-heading">{ct("Contact ESSAFARIA")}</h1>
          <p className="info-lead">
            {ct(hasDetails
              ? "Partner agencies can reach case officers through the portal. For partnership enquiries, use the contact details below."
              : "Partner agencies can reach case officers through the portal. New agencies can apply for partnership online.")}
          </p>
        </header>
        <div className="info-paths">
          <section><h2>{labels.partner}</h2><p>{labels.partnerBody}</p>
            <Link className="info-link" href={`/login?lang=${locale}`}>{labels.access}</Link></section>
          <section><h2>{labels.join}</h2><p>{labels.joinBody}</p>
            <Link className="info-link" href={`/agency/register?lang=${locale}`}>{labels.register}</Link></section>
        </div>
      </div>
      {(email || phone) && <section className="info-width info-row">
            <h2>{labels.channels}</h2>
            <dl className="info-records">
              {email ? <div>
                <dt>{ct("Email")}</dt>
                <dd><a href={`mailto:${email}`}><bdi dir="ltr">{email}</bdi></a>
                  <p className="info-note">{ct("Partnership, operations and billing enquiries.")}</p></dd>
              </div> : null}
              {phone ? <div>
                <dt>{ct("Phone")}</dt>
                <dd><a href={`tel:${phone.replace(/\s/g, "")}`}><bdi dir="ltr">{phone}</bdi></a></dd>
              </div> : null}
            </dl>
      </section>}
      <section className="info-width info-row">
        <h2>{labels.office}</h2>
        <div>
          <address className="info-address">{address || PUBLIC_COMPANY_FACTS.fallbackAddress}</address>
          {officeHours && <p className="info-hours"><strong>{labels.hours}</strong> {officeHours}</p>}
          <Link className="info-link" href={seoLocalizedPublicPath("about", locale)}>{labels.identity}</Link>
        </div>
      </section>
      {socialLinks.length > 0 && <section className="info-width info-row">
        <h2>{labels.social}</h2>
        <div className="info-actions">{socialLinks.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="info-link">{name}</a>)}</div>
      </section>}
    </section>
  );
}
