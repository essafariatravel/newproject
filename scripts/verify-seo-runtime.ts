import {
  SEO_INDEXABLE_PUBLIC_ENTRIES,
  SEO_NOINDEX_PUBLIC_ENTRIES,
  SEO_PRODUCTION_ORIGIN,
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
    const { response, body } = await request(entry.path);
    assert(response.status === 200, `${entry.path} returned ${response.status}, expected 200`);
    const forbidden = forbiddenMetadataHost(body);
    assert(!forbidden, `${entry.path} leaked non-Production metadata host ${forbidden}`);

    if (mode === "preview") {
      assert(xRobots(response).includes("noindex"), `${entry.path} Preview response lacks X-Robots-Tag noindex`);
      assert(canonicalFromHtml(body) === null, `${entry.path} Preview must not emit a canonical`);
      assert(ogUrlFromHtml(body) === null, `${entry.path} Preview must not emit og:url`);
    } else {
      const expectedCanonical = new URL(entry.path, SEO_PRODUCTION_ORIGIN).toString();
      assert(!xRobots(response).includes("noindex"), `${entry.path} Production-sim public response is noindex`);
      assert(!htmlHasNoindex(body), `${entry.path} Production-sim public HTML is noindex`);
      assert(canonicalFromHtml(body) === expectedCanonical, `${entry.path} canonical mismatch`);
      assert(ogUrlFromHtml(body) === expectedCanonical, `${entry.path} og:url mismatch`);
    }

    console.log(`PASS public ${entry.path}`);
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
    const expected = SEO_INDEXABLE_PUBLIC_ENTRIES.map((entry) =>
      new URL(entry.path, SEO_PRODUCTION_ORIGIN).toString(),
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
