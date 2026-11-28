import type { UiLocale } from "@/lib/ui-i18n";
import { PUBLIC_OPERATIONAL_EVIDENCE } from "@/lib/public-operational-evidence";
import { IntakeCapture } from "./public-information/intake-capture";

/** A screenshot already used by the public demo; no live client data are fetched. */
export function PublicOperationalEvidence({ locale }: { locale: UiLocale }) {
  const copy = PUBLIC_OPERATIONAL_EVIDENCE[locale];

  return (
    <section className="info-row info-width" aria-labelledby="partner-evidence-title">
      <header>
        <h2 id="partner-evidence-title">{copy.title}</h2>
        <p>{copy.intro}</p>
      </header>
      <div>
        <figure className="info-evidence-figure">
          <IntakeCapture locale={locale} alt={copy.screenshotAlt} />
          <figcaption>{copy.screenshotCaption}</figcaption>
        </figure>
        <dl className="info-lines">
          {copy.scenarios.map((scenario) => (
            <div key={scenario.title}>
              <dt>{scenario.title}</dt>
              <dd>{scenario.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="info-note">{copy.limits}</p>
      </div>
    </section>
  );
}
