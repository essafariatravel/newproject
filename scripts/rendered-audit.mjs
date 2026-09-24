#!/usr/bin/env node
/**
 * Rendered-UI structural audit — runs against a REAL production build served by
 * `next start` (no browser automation is available in this sandbox).
 *
 * Method: fetch the server-rendered HTML of every public page in EN/FR/AR, then
 * assert the contracts that a browser would otherwise have to show:
 *   * locale cookie / ?lang= switches really change the rendered copy,
 *   * Arabic renders with dir="rtl",
 *   * the mobile header exposes EXACTLY ONE "Register your agency" CTA that is
 *     visible below the `sm` breakpoint (Tailwind `hidden` = invisible < 640px),
 *   * no horizontal scroller in the header, bounded brand lockup,
 *   * authenticated surfaces (agency dashboard / wallet / wizard) render for a
 *     seeded agency user and keep the balance-first, search-first contracts.
 *
 * Usage:
 *   npx next start -p 3100 -H 0.0.0.0 &
 *   node scripts/rendered-audit.mjs            # BASE_URL=http://localhost:3100
 *   BASE_URL=... AGENCY_EMAIL=... AGENCY_PASSWORD=... node scripts/rendered-audit.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const AGENCY_EMAIL = process.env.AGENCY_EMAIL ?? "admin@horizonvoyages.example";
const AGENCY_PASSWORD = process.env.AGENCY_PASSWORD ?? "Agency!2345";

const results = [];
const push = (id, ok, detail) => results.push({ id, ok, detail });

async function get(path, locale) {
  const res = await fetch(BASE + path, {
    headers: locale ? { cookie: `evos_ui_locale=${locale}` } : {},
    redirect: "manual",
  });
  const html = await res.text();
  return { status: res.status, html };
}

/** Tailwind mobile-first: `hidden` without a larger breakpoint = invisible < 640px. */
function visibleAtMobile(className) {
  return !/(^|\s)hidden(\s|$)/.test(className);
}

function headerOf(html) {
  const start = html.indexOf("<header");
  const end = html.indexOf("</header>", start);
  return start >= 0 && end > start ? html.slice(start, end) : "";
}

const unescapeHtml = (v) =>
  v
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Log in through the real server action (multipart form, hidden $ACTION refs). */
async function agencyLogin() {
  const login = await get("/login", "en");
  const form = [...login.html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
    .map((m) => m[0])
    .find((f) => /name="email"/.test(f));
  if (!form) throw new Error("login form not found in rendered HTML");
  const body = new FormData();
  for (const tag of form.matchAll(/<input\b[^>]*>/g)) {
    if (!/type="hidden"/.test(tag[0])) continue;
    const name = /name="([^"]*)"/.exec(tag[0])?.[1];
    const value = /value="([^"]*)"/.exec(tag[0])?.[1] ?? "";
    if (name) body.append(name, unescapeHtml(value));
  }
  body.append("email", AGENCY_EMAIL);
  body.append("password", AGENCY_PASSWORD);
  body.append("locale", "en");
  const res = await fetch(`${BASE}/login`, { method: "POST", redirect: "manual", headers: { origin: BASE }, body });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie };
}

const HOME = await get("/", "en");
push("home-renders", HOME.status === 200, `status ${HOME.status}`);
const header = headerOf(HOME.html);

const registerCtas = [...header.matchAll(/<a\b[^>]*href="\/agency\/register"[^>]*>/g)].map((m) => m[0]);
const visibleRegister = registerCtas.filter((tag) => visibleAtMobile(/class="([^"]*)"/.exec(tag)?.[1] ?? ""));
push(
  "mobile-single-register-cta",
  visibleRegister.length === 1,
  `${visibleRegister.length} visible below 640px (of ${registerCtas.length} in the header)`,
);
push("mobile-hamburger", /data-testid="public-menu-toggle"/.test(header), "menu toggle present");
push("no-horizontal-scroller", !/overflow-x-(auto|scroll)/.test(header), "header has no overflow-x scroller");
push(
  "brand-bounded",
  /max-w-\[46vw\]/.test(header) || (/h-9 w-9 shrink-0/.test(header) && /hidden min-w-0 leading-tight sm:block/.test(header)),
  "brand lockup bounded (or monogram only below sm)",
);

const FR = await get("/?lang=fr", "fr");
push("home-fr-renders", FR.status === 200, `status ${FR.status}`);
push("home-fr-french", /Enregistrer votre agence/.test(FR.html), "'Enregistrer votre agence' present");

const AR = await get("/?lang=ar", "ar");
push("home-ar-renders", AR.status === 200, `status ${AR.status}`);
push("home-ar-rtl", /<html[^>]+dir="rtl"/.test(AR.html), 'dir="rtl" on <html>');
push("home-ar-arabic-cta", /سجّل وكالتك/.test(AR.html), "Arabic CTA present");

for (const [path, label] of [
  ["/visas", "visas"],
  ["/countries", "countries"],
  ["/b2b", "b2b"],
  ["/about", "about"],
  ["/contact", "contact"],
  ["/privacy", "privacy"],
  ["/terms", "terms"],
  ["/agency/register", "agency-register"],
  ["/login", "login"],
]) {
  for (const locale of ["en", "fr", "ar"]) {
    const { status, html } = await get(path, locale);
    const errored = status >= 500 || /Application error|Internal Server Error/.test(html);
    push(`page-${label}-${locale}`, status === 200 && !errored, `status ${status}`);
  }
}

const countriesFr = await get("/countries", "fr");
push("countries-fr-localized", /Espagne/.test(countriesFr.html), "French locale shows 'Espagne'");
const countriesAr = await get("/countries", "ar");
push("countries-ar-localized", /إسبانيا|فرنسا/.test(countriesAr.html), "Arabic locale shows Arabic country names");

const login = await agencyLogin();
push("agency-login", login.status === 303 || login.status === 200, `status ${login.status}`);

if (login.cookie) {
  const headers = { cookie: login.cookie };

  const wizard = await fetch(`${BASE}/portal/applications/new`, { headers, redirect: "manual" });
  const wizardHtml = await wizard.text();
  push("wizard-renders", wizard.status === 200, `status ${wizard.status}`);
  push(
    "wizard-steps-labelled",
    /Step|Étape|خطوة|Choose visa|Choisir le visa|اختيار التأشيرة/.test(wizardHtml) &&
      !/step\.(choose|upload|preview)/.test(wizardHtml),
    "three step labels render as real copy (no i18n pseudo-keys)",
  );
  push(
    "wizard-search-first",
    /data-testid="wizard-destination-search"/.test(wizardHtml) && /Search a destination|Rechercher une destination/.test(wizardHtml),
    "search-first destination step rendered",
  );
  push("wizard-no-country-grid", !/data-testid="wizard-country"/.test(wizardHtml), "no giant country grid");

  const wallet = await fetch(`${BASE}/portal/wallet`, { headers, redirect: "manual" });
  const walletHtml = await wallet.text();
  push("wallet-renders", wallet.status === 200, `status ${wallet.status}`);
  push("wallet-available-balance", /Available balance/.test(walletHtml), "balance-first summary");
  push(
    "wallet-no-kpi-clutter",
    !/Total credited/i.test(walletHtml) && !/Total charged/i.test(walletHtml),
    "no credit/charge KPI cards",
  );
  push("wallet-no-eur", !/€|EUR/.test(walletHtml), "no EUR presentation (DZD only)");

  const dash = await fetch(`${BASE}/portal`, { headers, redirect: "manual" });
  const dashHtml = await dash.text();
  push("dashboard-renders", dash.status === 200, `status ${dash.status}`);
  const attentionIdx = dashHtml.search(/needs your attention/i);
  const metricsIdx = dashHtml.search(/active applications/i);
  push(
    "dashboard-needs-attention",
    attentionIdx >= 0 && metricsIdx >= 0 && attentionIdx < metricsIdx,
    `attention banner rendered before the KPI row (banner@${attentionIdx}, metrics@${metricsIdx})`,
  );
  push("dashboard-dzd", !/€|EUR/.test(dashHtml), "dashboard is DZD-only");
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} rendered checks passed`);
process.exit(failed.length ? 1 : 0);
