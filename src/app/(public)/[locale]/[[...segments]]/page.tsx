import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomePage from "../../page";
import B2BPage from "../../b2b/page";
import AboutPage from "../../about/page";
import ContactPage from "../../contact/page";
import FaqPage from "../../faq/page";
import { buildPublicMetadata } from "@/lib/seo";
import {
  seoIndexablePageForPath,
  type IndexablePublicSeoPage,
} from "@/lib/seo-manifest";
import type { UiLocale } from "@/lib/ui-locale-values";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; segments?: string[] }>;
type Props = { params: Params };

const PAGE_COMPONENTS = {
  home: HomePage,
  b2b: B2BPage,
  about: AboutPage,
  contact: ContactPage,
  faq: FaqPage,
} satisfies Record<IndexablePublicSeoPage, typeof HomePage>;

async function resolvePublicPage(params: Params): Promise<{
  locale: UiLocale;
  page: IndexablePublicSeoPage;
}> {
  const { locale, segments } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  if (segments && segments.length > 1) notFound();
  const page = seoIndexablePageForPath(segments?.length ? `/${segments[0]}` : "/");
  if (!page) notFound();
  return { locale, page };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await resolvePublicPage(params);
  return buildPublicMetadata(page, locale);
}

export default async function LocalizedPublicPage({ params }: Props) {
  const { page } = await resolvePublicPage(params);
  const Component = PAGE_COMPONENTS[page];
  return <Component />;
}
