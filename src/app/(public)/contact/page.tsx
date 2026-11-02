import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import { publicContactDetails } from "@/lib/public-contact";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("contact", await getUiLocale());
}

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const ct = contentT(await getUiLocale());
  const { email, phone, address, officeHours, social } = publicContactDetails(settings);
  const hasDetails = Boolean(email || phone || address);

  return (
    <section className="public-interior contact-interior" aria-labelledby="contact-heading">
      <div className="interior-width contact-spread">
        <div className="contact-directory">
          <h1 id="contact-heading">{ct("Contact ESSAFARIA")}</h1>
          <p className="interior-lede">
            {ct(hasDetails
              ? "Partner agencies can reach case officers through the portal. For partnership enquiries, use the contact details below."
              : "Partner agencies can reach case officers through the portal. New agencies can apply for partnership online.")}
          </p>
          {hasDetails ? (
            <dl className="contact-records">
              {email ? <div>
                <dt>{ct("Email")}</dt>
                <dd><a href={`mailto:${email}`}><bdi dir="ltr">{email}</bdi></a>
                  <p className="interior-note">{ct("Partnership, operations and billing enquiries.")}</p></dd>
              </div> : null}
              {phone ? <div>
                <dt>{ct("Phone")}</dt>
                <dd><a href={`tel:${phone.replace(/\s/g, "")}`}><bdi dir="ltr">{phone}</bdi></a>
                  {officeHours ? <p className="interior-note">{officeHours}</p> : null}</dd>
              </div> : null}
              {address ? <div><dt>{ct("Office")}</dt><dd>{address}</dd></div> : null}
            </dl>
          ) : (
            <div className="interior-actions">
              <Link href="/agency/register" className="interior-button">{ct("Register your Agency")}</Link>
              <Link href="/login" className="interior-link">{ct("Sign in to your portal")}</Link>
            </div>
          )}
          {Object.entries(social).some(([, url]) => url) ? (
            <div className="contact-social">
              {Object.entries(social).filter(([, url]) => url).map(([name, url]) => (
                <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="interior-link">{name}</a>
              ))}
            </div>
          ) : null}
        </div>
        <figure className="interior-media contact-photo">
          <img data-cinematic-frame src="/images/essafaria-departure-editorial.webp" alt="" width="1672" height="941" fetchPriority="high" />
        </figure>
      </div>
    </section>
  );
}
