import { publicOrganizationJsonLd, type SeoRuntimeEnv } from "@/lib/seo";
import type { IndexablePublicSeoPage } from "@/lib/seo-manifest";

/** Public metadata only; this does not use a client component or any private data. */
export function PublicOrganizationData({
  page,
  env,
}: {
  page?: IndexablePublicSeoPage;
  env?: SeoRuntimeEnv;
}) {
  const jsonLd = publicOrganizationJsonLd(page, env);
  return jsonLd ? (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
  ) : null;
}
