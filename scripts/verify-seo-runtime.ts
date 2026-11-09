import {
  SEO_INDEXABLE_PUBLIC_ENTRIES,
  SEO_NOINDEX_PUBLIC_ENTRIES,
  SEO_PUBLIC_LOCALES,
  SEO_PRODUCTION_ORIGIN,
  seoLocalizedPublicPath,
} from "../src/lib/seo-manifest";

type Mode = "preview" | "production-sim";

const baseRaw = process.env.SEO_VERIFY_BASE_URL;
const mode = (process.env.SEO_VERIFY_MODE ?? "preview") as Mode;

if (!baseRaw) {
  throw new Error("SEO_VERIFY_BASE_URL is required.");
}
if (mode !== "preview" && mode !== "production-sim") {
  throw new Error("SEO_VERIFY_MODE must be preview or production-sim.");
}

const base = new URL(baseRaw);
if (
  base.origin === SEO_PRODUCTION_ORIGIN &&
  process.env.SEO_VERIFY_ALLOW_PRODUCTION !== "1"
) {
  throw new Error(
    "Refusing to probe the real Production host without SEO_VERIFY_ALLOW_PRODUCTION=1.",
  );
}

function fail(message: string): never {
  throw new Error(`SEO runtime verification failed: ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

async function request(path: string, redirect: RequestRedirect = "follow") {
  const url = new URL(path, base);
  const response = await fetch(url, {
    redirect,
    headers: { "user-agent": "ESSAFARIA-SEO-Gate/1.0" },
  });
  const body = await response.text();
  return { response, body, url };
}

function xRobots(response: Response): string {
  return response.headers.get("x-robots-tag")?.toLowerCase() ?? "";
}

function htmlHasNoindex(html: string): boolean {
  return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) ||
    /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(html);
}

function canonicalFromHtml(html: string): string | null {
  const match =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return match?.[1] ?? null;
}

function normalizedUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function htmlAttribute(html: string, attribute: "lang" | "dir"): string | null {
  const openingTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  return openingTag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"))?.[1] ?? null;
}

function hreflangLinks(html: string): Record<string, string> {
  const head = html.split("</head>", 1)[0] ?? "";
  const result: Record<string, string> = {};
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel=["']alternate["']/i.test(tag)) continue;
    const locale = tag.match(/\bhreflang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (locale && href) result[locale] = href;
  }
  return result;
}

function ogUrlFromHtml(html: string): string | null {
  const match =
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
  return match?.[1] ?? null;
}

function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

function forbiddenMetadataHost(html: string): string | null {
  const head = html.split("</head>", 1)[0] ?? html;
  for (const pattern of [/https?:\/\/[^"'<>\s]*\.vercel\.app/i, /https?:\/\/localhost(?::\d+)?/i, /https?:\/\/127\.0\.0\.1(?::\d+)?/i]) {
    const match = head.match(pattern);
    if (match) return match[0];
  }
  return null;
}

async function verifyPublicPages() {
  for (const entry of SEO_INDEXABLE_PUBLIC_ENTRIES) {
    for (const locale of SEO_PUBLIC_LOCALES) {
    const path = seoLocalizedPublicPath(entry.key, locale);
    const { response, body } = await request(path);
    assert(response.status === 200, `${path} returned ${response.status}, expected 200`);
    assert(htmlAttribute(body, "lang") === locale, `${path} served the wrong html language`);
    assert(htmlAttribute(body, "dir") === (locale === "ar" ? "rtl" : "ltr"), `${path} has the wrong text direction`);
    const localizedB2b = seoLocalizedPublicPath("b2b", locale);
    assert(body.includes(`href="${localizedB2b}"`), `${path} navigation does not preserve its public locale`);
    const forbidden = forbiddenMetadataHost(body);
    assert(!forbidden, `${path} leaked non-Production metadata host ${forbidden}`);

    if (mode === "preview") {
      assert(xRobots(response).includes("noindex"), `${path} Preview response lacks X-Robots-Tag noindex`);
      assert(canonicalFromHtml(body) === null, `${path} Preview must not emit a canonical`);
      assert(ogUrlFromHtml(body) === null, `${path} Preview must not emit og:url`);
      assert(Object.keys(hreflangLinks(body)).length === 0, `${path} Preview must not emit hreflang`);
    } else {
      const expectedCanonical = new URL(path, SEO_PRODUCTION_ORIGIN).toString();
      assert(!xRobots(response).includes("noindex"), `${path} Production-sim public response is noindex`);
      assert(!htmlHasNoindex(body), `${path} Production-sim public HTML is noindex`);
      assert(normalizedUrl(canonicalFromHtml(body)) === expectedCanonical, `${path} canonical mismatch`);
      assert(normalizedUrl(ogUrlFromHtml(body)) === expectedCanonical, `${path} og:url mismatch`);
      const expectedHreflang = Object.fromEntries([
        ...SEO_PUBLIC_LOCALES.map((language) => [
          language,
          new URL(seoLocalizedPublicPath(entry.key, language), SEO_PRODUCTION_ORIGIN).toString(),
        ]),
        ["x-default", new URL(seoLocalizedPublicPath(entry.key, "en"), SEO_PRODUCTION_ORIGIN).toString()],
      ]);
      const actualHreflang = Object.fromEntries(
        Object.entries(hreflangLinks(body)).map(([language, url]) => [language, normalizedUrl(url)]),
      );
      assert(JSON.stringify(actualHreflang) === JSON.stringify(expectedHreflang), `${path} hreflang mismatch`);
    }

    console.log(`PASS public ${path}`);
    }
  }
}

async function verifySitemapAndRobots() {
  const sitemap = await request("/sitemap.xml");
  assert(sitemap.response.status === 200, `/sitemap.xml returned ${sitemap.response.status}`);
  const locs = sitemapLocs(sitemap.body);

  const robots = await request("/robots.txt");
  assert(robots.response.status === 200, `/robots.txt returned ${robots.response.status}`);

  if (mode === "preview") {
    assert(locs.length === 0, `Preview sitemap exposed ${locs.length} URL(s)`);
    assert(!/\bSitemap:/i.test(robots.body), "Preview robots.txt must not advertise a sitemap");
  } else {
    const expected = SEO_INDEXABLE_PUBLIC_ENTRIES.flatMap((entry) =>
      SEO_PUBLIC_LOCALES.map((locale) =>
        new URL(seoLocalizedPublicPath(entry.key, locale), SEO_PRODUCTION_ORIGIN).toString(),
      ),
    );
    assert(JSON.stringify(locs) === JSON.stringify(expected), `Production-sim sitemap mismatch: ${JSON.stringify(locs)}`);
    assert(
      robots.body.includes(`Sitemap: ${SEO_PRODUCTION_ORIGIN}/sitemap.xml`),
      "Production-sim robots.txt does not advertise the Production sitemap",
    );
  }

  console.log("PASS sitemap + robots");
}

async function verifyNoIndexSurfaces() {
  const representative = [
    "/login",
    "/countries",
    "/visas",
    "/admin",
    "/portal",
    "/api/session",
  ];

  for (const path of representative) {
    const { response, body } = await request(path, "manual");
    assert(
      xRobots(response).includes("noindex") || htmlHasNoindex(body),
      `${path} lacks noindex defense`,
    );
    console.log(`PASS noindex ${path} (${response.status})`);
  }

  for (const entry of SEO_NOINDEX_PUBLIC_ENTRIES.filter((item) => !item.path.includes("[token]"))) {
    const { response } = await request(entry.path, "manual");
    assert(xRobots(response).includes("noindex"), `${entry.path} lacks route-level X-Robots-Tag noindex`);
  }
}

async function verify404() {
  const { response, body } = await request("/seo-gate-definitely-missing-404");
  assert(response.status === 404, `missing route returned ${response.status}, expected 404`);
  if (mode === "production-sim") {
    assert(htmlHasNoindex(body), "Production-sim 404 HTML lacks noindex");
  } else {
    assert(xRobots(response).includes("noindex"), "Preview 404 response lacks noindex header");
  }
  console.log("PASS 404");
}

async function main() {
  console.log(`SEO runtime gate: mode=${mode} base=${base.origin}`);
  await verifyPublicPages();
  await verifySitemapAndRobots();
  await verifyNoIndexSurfaces();
  await verify404();
  console.log("SEO_RUNTIME_GATE_PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
