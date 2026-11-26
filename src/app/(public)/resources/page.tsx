import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { buildPublicMetadata } from "@/lib/seo";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";
import { PUBLIC_RESOURCE_COPY } from "@/lib/public-resources";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("resources", await getUiLocale());
}

export default async function ResourcesPage() {
  const locale = await getUiLocale();
  const copy = PUBLIC_RESOURCE_COPY[locale];
  return (
    <section className="public-interior partner-interior" aria-labelledby="resource-heading">
      <div className="partner-guide">
        <div className="interior-width partner-guide-intro">
          <header>
            <p className="mb-3 text-sm font-semibold">{copy.publisher}</p>
            <h1 id="resource-heading">{copy.title}</h1>
          </header>
          <div>
            <p className="interior-lede">{copy.description}</p>
            <nav aria-label={copy.nav} className="mt-5 grid gap-3">
              {copy.guides.map((guide) => <a key={guide.id} className="interior-link" href={`#${guide.id}`}>{guide.title}</a>)}
            </nav>
          </div>
        </div>
        {copy.guides.map((guide) => (
          <section key={guide.id} id={guide.id} className="interior-width partner-guide-process scroll-mt-24" aria-labelledby={`${guide.id}-heading`}>
            <h2 id={`${guide.id}-heading`}>{guide.title}</h2>
            <div>
              <p className="mb-6 leading-relaxed">{guide.intro}</p>
              <ol className="partner-guide-steps">
                {guide.steps.map((step) => <li key={step}><p>{step}</p></li>)}
              </ol>
            </div>
          </section>
        ))}
        <div className="interior-width partner-guide-limits">
          <p className="leading-relaxed">{copy.notice}</p>
          <nav aria-label={copy.nav} className="grid gap-3">
            <a className="interior-link" href={seoLocalizedPublicPath("b2b", locale)}>{copy.partnership}</a>
            <a className="interior-link" href={seoLocalizedPublicPath("faq", locale)}>{copy.faq}</a>
            <a className="interior-link" href={seoLocalizedPublicPath("about", locale)}>{copy.about}</a>
          </nav>
        </div>
      </div>
    </section>
  );
}
