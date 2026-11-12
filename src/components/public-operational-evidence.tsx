import type { UiLocale } from "@/lib/ui-i18n";
import { PUBLIC_OPERATIONAL_EVIDENCE } from "@/lib/public-operational-evidence";

const CAPTURE_HEIGHTS: Record<UiLocale, { wide: number; small: number }> = {
  en: { wide: 394, small: 466 },
  fr: { wide: 426, small: 498 },
  ar: { wide: 392, small: 464 },
};

/** A screenshot already used by the public demo; no live client data are fetched. */
export function PublicOperationalEvidence({ locale }: { locale: UiLocale }) {
  const copy = PUBLIC_OPERATIONAL_EVIDENCE[locale];
  const heights = CAPTURE_HEIGHTS[locale];

  return (
    <section className="interior-width partner-evidence" aria-labelledby="partner-evidence-title">
      <div className="partner-evidence-copy">
        <p className="partner-evidence-kicker">{copy.kicker}</p>
        <h2 id="partner-evidence-title">{copy.title}</h2>
        <p className="partner-evidence-lede">{copy.intro}</p>
        <dl className="partner-evidence-scenarios">
          {copy.scenarios.map((scenario) => (
            <div key={scenario.title}>
              <dt>{scenario.title}</dt>
              <dd>{scenario.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="partner-evidence-limits">{copy.limits}</p>
      </div>
      <figure className="partner-evidence-figure">
        <picture>
          <source
            media="(max-width: 639px)"
            srcSet={`/images/workflow/intake-${locale}-small.webp`}
            width="686"
            height={heights.small}
          />
          <img
            src={`/images/workflow/intake-${locale}.webp`}
            alt={copy.screenshotAlt}
            width="1344"
            height={heights.wide}
            loading="lazy"
            decoding="async"
          />
        </picture>
        <figcaption>{copy.screenshotCaption}</figcaption>
      </figure>
    </section>
  );
}
