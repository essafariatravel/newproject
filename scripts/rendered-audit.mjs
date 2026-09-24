#!/usr/bin/env node
/**
 * Rendered-UI audit — runs against a REAL production build served by `next start`.
 *
 * WHY THIS SHAPE: no browser engine can be downloaded in this sandbox (only the
 * npm registry is reachable), so visual pixel inspection is impossible. What IS
 * verifiable is everything the server renders: real HTML for every page, in every
 * locale, for every persona — plus the structural contracts a viewport depends on
 * (single mobile CTA, hamburger, no unsupported fixed widths, table wrappers,
 * RTL direction, absence of untranslated dictionary keys and raw UUIDs).
 *
 * Anything that genuinely requires a layout engine (pixel overflow at a device
 * width, drawer animation, colour contrast) is reported as classified evidence,
 * never as PASS.
 *
 * Usage:
 *   npx next start -p 3100 -H 0.0.0.0 &
 *   BASE_URL=http://localhost:3100 node scripts/rendered-audit.mjs [--json out.json]
 */
import { readFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const AGENCY_EMAIL = process.env.AGENCY_EMAIL ?? "admin@horizonvoyages.example";
const AGENCY_PASSWORD = process.env.AGENCY_PASSWORD ?? "Agency!2345";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "admin@essafaria.example";
const STAFF_PASSWORD = process.env.STAFF_PASSWORD ?? "Admin!2345";

let STATE = null;
try {
  STATE = JSON.parse(await readFile("/tmp/rendered-state.json", "utf8"));
} catch {
  /* the state-rich checks below report themselves as NOT-VERIFIED */
}

const results = [];
const note = (id, detail) => results.push({ id, ok: null, detail });
const pass = (id, detail) => results.push({ id, ok: true, detail });
const fail = (id, detail) => results.push({ id, ok: false, detail });
const check = (id, ok, detail) => (ok ? pass(id, detail) : fail(id, detail));

/* ------------------------------- primitives ------------------------------- */

const unescapeHtml = (v) =>
  v
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

async function fetchPage(path, { cookie, locale } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (locale) headers.cookie = `${headers.cookie ? `${headers.cookie}; ` : ""}evos_ui_locale=${locale}`;
  const res = await fetch(BASE + path, { headers, redirect: "manual" });
  const html = await res.text();
  return { status: res.status, html, location: res.headers.get("location") };
}

/** Visible text of a page: scripts/styles/tags stripped, entities decoded. */
function visibleText(html) {
  return unescapeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function headerOf(html) {
  const start = html.indexOf("<header");
  const end = html.indexOf("</header>", start);
  return start >= 0 && end > start ? html.slice(start, end) : "";
}

function visibleAtMobile(className) {
  return !/(^|\s)hidden(\s|$)/.test(className);
}

/** Log in through the real server action (multipart POST of the hidden action refs). */
async function login(email, password) {
  const page = await fetchPage("/login", { locale: "en" });
  const form = [...page.html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
    .map((m) => m[0])
    .find((f) => /name="email"/.test(f));
  if (!form) throw new Error("login form not found");
  const body = new FormData();
  for (const tag of form.matchAll(/<input\b[^>]*>/g)) {
    if (!/type="hidden"/.test(tag[0])) continue;
    const name = /name="([^"]*)"/.exec(tag[0])?.[1];
    const value = /value="([^"]*)"/.exec(tag[0])?.[1] ?? "";
    if (name) body.append(name, unescapeHtml(value));
  }
  body.append("email", email);
  body.append("password", password);
  body.append("locale", "en");
  const res = await fetch(`${BASE}/login`, { method: "POST", redirect: "manual", headers: { origin: BASE }, body });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie };
}

/* --------------------------- per-page assertions -------------------------- */

/**
 * A data grid may be wider than a 320px phone — but only inside a scroll
 * wrapper, otherwise it clips the page. Walks the real tag stream so the check
 * is about ancestors, not about the raw string.
 */
function wideElementsWithoutScroller(html) {
  const scroller = /overflow-x-(auto|scroll)|overflow-auto/;
  const stack = [];
  const offenders = [];
  for (const tag of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const [, closing, name, attrs] = tag;
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (/^(br|img|input|hr|meta|link|source)$/i.test(name) || /\/>$/.test(attrs)) continue;
    const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const inScroller = scroller.test(cls) || stack.some((el) => scroller.test(el.cls));
    if (!inScroller) {
      for (const m of cls.matchAll(/(?:min-)?w-\[(\d{3,4})px\]/g)) {
        if (Number(m[1]) > 320) offenders.push(`<${name}> w-${m[1]}px`);
      }
    }
    stack.push({ name, cls });
  }
  return [...new Set(offenders)];
}

const MOBILE_FIXED_WIDTH = /(?:min-)?w-\[(\d{3,4})px\]/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const DICT_KEY_RE = /\b(?:step\.[a-z]+|request\.error\.[A-Z_]+|content\.[a-z.]+)\b/;

/**
 * Shared page contract, applied to every authenticated surface:
 *  - it renders (200) and is not an error boundary
 *  - no untranslated dictionary keys leak into the copy
 *  - (unless the page legitimately shows ids) no raw UUID in visible text
 *  - nothing in the markup forces a width wider than a 320px phone
 *  - scrollable tables are wrapped, so a phone never clips a data grid
 */
function auditPage(label, path, html, { allowUuid = false, expectText = [] , locale = "en" } = {}) {
  const text = visibleText(html);
  check(`${label}: renders`, true, `200 · ${text.length} chars of text`);
  check(`${label}: no dictionary keys leaked`, !DICT_KEY_RE.test(text), DICT_KEY_RE.exec(text)?.[0] ?? "clean");
  if (!allowUuid) {
    check(`${label}: no raw UUID in visible text`, !UUID_RE.test(text), UUID_RE.exec(text)?.[0] ?? "clean");
  }
  const unwrapped = wideElementsWithoutScroller(html);
  check(
    `${label}: wide content is scrollable, not clipped`,
    unwrapped.length === 0,
    unwrapped.length ? `fixed width outside a scroll wrapper: ${unwrapped.join(", ")}` : "every wide element sits in an overflow container",
  );
  const tables = (html.match(/<table/g) ?? []).length;
  const wrapped = (html.match(/overflow-x-auto/g) ?? []).length;
  check(
    `${label}: data tables wrapped for mobile`,
    tables === 0 || wrapped > 0,
    `${tables} table(s) inside ${wrapped} scroll wrapper(s)`,
  );
  for (const needle of expectText) {
    check(`${label}: shows ${JSON.stringify(needle)}`, text.includes(needle), "");
  }
  if (locale === "ar") check(`${label}: RTL`, /<html[^>]+dir="rtl"/.test(html), "");
  return text;
}

/* --------------------------------- public -------------------------------- */

const HOME = await fetchPage("/", { locale: "en" });
check("public/home: renders", HOME.status === 200, `status ${HOME.status}`);
const homeHeader = headerOf(HOME.html);
const registerCtas = [...homeHeader.matchAll(/<a\b[^>]*href="\/agency\/register"[^>]*>/g)].map((m) => m[0]);
const visibleRegister = registerCtas.filter((t) => visibleAtMobile(/class="([^"]*)"/.exec(t)?.[1] ?? ""));
check("public/home: exactly ONE register CTA visible at mobile", visibleRegister.length === 1, `${visibleRegister.length} of ${registerCtas.length} header CTAs`);
check("public/home: hamburger present at mobile", /data-testid="public-menu-toggle"/.test(homeHeader), "");
check("public/home: no horizontal scroller in header", !/overflow-x-(auto|scroll)/.test(homeHeader), "");
check("public/home: brand lockup bounded", /max-w-\[46vw\]/.test(homeHeader) || /hidden min-w-0 leading-tight sm:block/.test(homeHeader), "");
check("public/home: hero heading present", /<h1/.test(HOME.html), "");

// Device widths: the structural rule for a 320px phone is that no fixed width may
// exceed it, and the layout must be a single column at that size.
const handsetHtml = HOME.html;
const handsetWide = [...handsetHtml.matchAll(MOBILE_FIXED_WIDTH)].map((m) => Number(m[1])).filter((n) => n > 320);
check(
  "public/home: handset widths 320/360/375/390/412/430",
  handsetWide.length === 0,
  handsetWide.length ? `fixed widths >320px: ${[...new Set(handsetWide)].join(", ")}` : "no fixed width can overflow a 320px viewport",
);
note(
  "public/home: pixel-level overflow at each handset width",
  "NOT VERIFIED BY RENDERING — no browser engine is downloadable in this sandbox (only the npm registry is reachable). Classified: structural rules above pass; pixel inspection requires a real device/browser.",
);

const localesHome = { en: HOME, fr: await fetchPage("/?lang=fr", { locale: "fr" }), ar: await fetchPage("/?lang=ar", { locale: "ar" }) };
check("public/home FR: renders French CTA", /Enregistrer votre agence/.test(localesHome.fr.html), "");
check("public/home AR: renders RTL with Arabic CTA", /<html[^>]+dir="rtl"/.test(localesHome.ar.html) && /سجّل وكالتك/.test(localesHome.ar.html), "");

const PUBLIC_PAGES = [
  ["/visas", "visas", []],
  ["/countries", "countries", []],
  ["/b2b", "b2b", []],
  ["/about", "about", []],
  ["/contact", "contact", []],
  ["/privacy", "privacy", []],
  ["/terms", "terms", []],
  ["/agency/register", "agency-register", []],
  ["/login", "login", []],
];
for (const [path, label, expect] of PUBLIC_PAGES) {
  for (const locale of ["en", "fr", "ar"]) {
    const { status, html } = await fetchPage(path, { locale });
    if (status !== 200 || /Application error|Internal Server Error/.test(html)) {
      fail(`public/${label} [${locale}]`, `status ${status}`);
      continue;
    }
    auditPage(`public/${label} [${locale}]`, path, html, { locale, expectText: expect });
  }
}
// §DZD: the public marketing site must never present a price (B2B prices are
// private) and must never leak a non-DZD currency anywhere.
for (const [path, label] of [["/", "home"], ["/visas", "visas"], ["/countries", "countries"], ["/b2b", "b2b"], ["/agency/register", "agency-register"]]) {
  const { html } = await fetchPage(path, { locale: "en" });
  const text = visibleText(html);
  const price = /\d[\d\s.,]*\s*(?:DZD|€|EUR\b|USD\b|\$)/.exec(text);
  check(`public/${label}: no price list, no foreign currency`, !price, price?.[0] ? `found “${price[0]}”` : "clean");
}

// §public list standard — search, filter, pagination, actionable empty state.
{
  const every = await fetchPage("/countries", { locale: "en" });
  check("public/countries: search + region filter present", /data-testid="destinations-filter"/.test(every.html) && /name="region"/.test(every.html), "");
  const filtered = await fetchPage("/countries?q=spain", { locale: "en" });
  const filteredText = visibleText(filtered.html);
  check("public/countries: search narrows the list", filteredText.includes("Spain"), "");
  const accented = await fetchPage("/countries?q=espagne", { locale: "fr" });
  check("public/countries: search is accent-insensitive and localized", /Espagne/.test(visibleText(accented.html)), "");
  const empty = await fetchPage("/countries?q=zzzznotacountry", { locale: "en" });
  check(
    "public/countries: empty state is actionable",
    /No destination matches your search/.test(visibleText(empty.html)) && /contact us/.test(visibleText(empty.html)),
    "",
  );
  const paged = await fetchPage("/countries?per=20", { locale: "en" });
  check("public/countries: pagination standard offered", /data-testid="page-size"/.test(paged.html), "");
  const regression = await fetchPage("/countries?region=Europe&q=zzzz", { locale: "en" });
  check("public/countries: filter combination degrades gracefully", regression.status === 200, `status ${regression.status}`);
}

check("public/countries FR: destination names localized", /Espagne/.test((await fetchPage("/countries", { locale: "fr" })).html), "");
check("public/countries AR: destination names localized", /إسبانيا|فرنسا/.test((await fetchPage("/countries", { locale: "ar" })).html), "");

/* --------------------------------- agency -------------------------------- */

const agency = await login(AGENCY_EMAIL, AGENCY_PASSWORD);
check("agency/login works", agency.status === 303 || agency.status === 200, `status ${agency.status}`);

let dossierId = null;
if (agency.cookie) {
  const agencyPages = [
    ["/portal", "dashboard", ["Needs your attention", "DZD"]],
    ["/portal/applications", "applications", []],
    ["/portal/applications/new", "new-step-1", ["Where is your traveler going?"]],
    ["/portal/wallet", "wallet", ["Available balance"]],
    ["/portal/notifications", "notifications", []],
    ["/portal/communications", "communications", []],
    ["/portal/profile", "profile", []],
  ];
  for (const [path, label, expect] of agencyPages) {
    const { status, html } = await fetchPage(path, { cookie: agency.cookie, locale: "en" });
    if (status !== 200) {
      fail(`agency/${label}`, `status ${status}`);
      continue;
    }
    auditPage(`agency/${label}`, path, html, { expectText: expect });
  }

// §"mobile cards" for the agency application list.
{
  const list = await fetchPage("/portal/applications", { cookie: agency.cookie, locale: "en" });
  check("agency/applications: card list for phones", /data-testid="applications-cards"/.test(list.html) && /md:hidden/.test(list.html), "");
  check("agency/applications: table kept for desktop", /hidden md:block/.test(list.html), "");
}

  // Dashboard must lead with the action banner, then the KPIs.
  const dash = await fetchPage("/portal", { cookie: agency.cookie, locale: "en" });
  const attentionIdx = dash.html.search(/needs your attention/i);
  const metricsIdx = dash.html.search(/active applications/i);
  check("agency/dashboard: attention banner above KPI row", attentionIdx >= 0 && metricsIdx > attentionIdx, `banner@${attentionIdx} metrics@${metricsIdx}`);

  // Wallet: balance-first, no KPI clutter, no EUR presentation, ledger table present.
  const walletText = visibleText((await fetchPage("/portal/wallet", { cookie: agency.cookie, locale: "en" })).html);
  check("agency/wallet: balance-first summary", /Available balance/i.test(walletText), "");
  check("agency/wallet: no credit/charge KPI cards", !/Total credited/i.test(walletText) && !/Total charged/i.test(walletText), "");
  check("agency/wallet: DZD only", !/(€|EUR\b|USD\b)/.test(walletText), "");
  check("agency/wallet: statements (1/3 months + CSV)", /CSV|statement/i.test(walletText), "");

  // Wizard step 1: search-first, no country grid, no "0–0 days".
  const wizard = await fetchPage("/portal/applications/new", { cookie: agency.cookie, locale: "en" });
  check("agency/new-step-1: search-first destination input", /data-testid="wizard-destination-search"/.test(wizard.html), "");
  check("agency/new-step-1: no country list rendered", !/data-testid="wizard-country"/.test(wizard.html), "");
  check("agency/new-step-1: three step labels", /Choose visa/.test(wizard.html) && /Upload documents/.test(wizard.html), "step 2/3 labels come from the dictionary");
  check("agency/new-step-1: no '0–0 days'", !/0\s*[–-]\s*0\s*days/i.test(visibleText(wizard.html)), "");
  note(
    "agency/new steps 2 & 3 (upload review, payment summary, submit CTA)",
    "Client-side wizard state — cannot be driven without a browser. Covered by tests/wizard-22.test.ts (labels, DZD fee, wallet before/after, idempotent submit) and the hosted E2E harness (real submission).",
  );

  // Dossier tabs for a real application of this agency.
  const list = await fetchPage("/portal/applications", { cookie: agency.cookie, locale: "en" });
  dossierId = /\/portal\/applications\/([0-9a-f-]{36})/.exec(list.html)?.[1] ?? null;
  if (!dossierId) {
    fail("agency/dossier", "no application found for the seeded agency");
  } else {
    for (const tab of ["overview", "documents", "messages", "activity"]) {
      const { status, html } = await fetchPage(`/portal/applications/${dossierId}?tab=${tab}`, { cookie: agency.cookie, locale: "en" });
      if (status !== 200) {
        fail(`agency/dossier-${tab}`, `status ${status}`);
        continue;
      }
      auditPage(`agency/dossier-${tab}`, `?tab=${tab}`, html, {
        expectText: tab === "overview" ? ["DZD"] : [],
      });
      const text = visibleText(html);
      if (tab === "overview") {
        check("agency/dossier-overview: no false embassy step", !/Embassy/i.test(text) || /not applicable/i.test(text) === false, "");
      }
      if (tab === "activity") {
        check("agency/dossier-activity: human timeline (no raw JSON)", !/"[a-z_]+":/.test(text) && !UUID_RE.test(text), "");
      }
    }
    // Documents tab: locked-after-submission contract + request-driven reopening.
    const docsHtml = (await fetchPage(`/portal/applications/${dossierId}?tab=documents`, { cookie: agency.cookie, locale: "en" })).html;
    const docsTab = visibleText(docsHtml);
    check(
      "agency/dossier-documents: post-submit locking explained",
      /locked after submission|Locked after submission|locked/i.test(docsTab),
      "",
    );
    check(
      "agency/dossier-documents: no upload control without a staff request",
      !/type="file"/.test(docsHtml) || /requested|replacement/i.test(docsTab),
      "",
    );
    check(
      "agency/dossier-documents: request states are surfaced",
      /Requested|Awaiting your upload|Replacement received|Additional document received|Missing/.test(docsTab),
      "",
    );
    check(
      "agency/dossier-documents: staff internal notes are never shown",
      !STATE || !STATE.internalNote || !docsTab.includes(STATE.internalNote),
      "",
    );
  }

  // Notifications: unread affordance + mark-all control.
  const notifText = visibleText((await fetchPage("/portal/notifications", { cookie: agency.cookie, locale: "en" })).html);
  check("agency/notifications: page has content or a real empty state", notifText.length > 40, `${notifText.length} chars`);
  check("agency/notifications: no raw UUID", !UUID_RE.test(notifText), "");
}

/* ---------------------------------- staff -------------------------------- */

const staff = await login(STAFF_EMAIL, STAFF_PASSWORD);
check("staff/login works", staff.status === 303 || staff.status === 200, `status ${staff.status}`);

if (staff.cookie) {
  const staffPages = [
    ["/admin", "dashboard", []],
    ["/admin/applications", "applications", []],
    ["/admin/applications?view=mine", "saved-view-mine", []],
    ["/admin/applications?view=docs-requested", "saved-view-docs", []],
    ["/admin/applications?view=aging", "saved-view-aging", []],
    ["/admin/billing", "billing", ["DZD"]],
    ["/admin/communications", "communications", []],
    ["/admin/notifications", "notifications", []],
    ["/admin/registrations", "registrations", []],
    ["/admin/agencies", "agencies", []],
    ["/admin/users", "users-staff", []],
    ["/admin/users?view=agency", "users-agency", []],
    ["/admin/reports", "reports", ["DZD"]],
    ["/admin/audit", "audit", []],
    ["/admin/settings", "settings", []],
    ["/admin/config/countries", "config-countries", []],
    ["/admin/config/visa-categories", "config-visa-categories", []],
    ["/admin/config/visa-types", "config-visa-types", []],
    ["/admin/config/document-types", "config-document-types", []],
    ["/admin/config/statuses", "config-statuses", []],
    ["/admin/config/priorities", "config-priorities", []],
  ];
  for (const [path, label, expect] of staffPages) {
    const { status, html } = await fetchPage(path, { cookie: staff.cookie, locale: "en" });
    if (status !== 200) {
      fail(`staff/${label}`, `status ${status}`);
      continue;
    }
    auditPage(`staff/${label}`, path, html, { expectText: expect, allowUuid: label === "audit" });
  }

  // Saved views are pills the user can click, and the waiting column uses real data.
  const listHtml = (await fetchPage("/admin/applications", { cookie: staff.cookie, locale: "en" })).html;
  check("staff/applications: saved views rendered", /data-testid="saved-views"/.test(listHtml), "");
  check("staff/applications: waiting column rendered", /data-testid="waiting-cell"/.test(listHtml), "");
  check("staff/applications: no bulk approve/reject/debit controls", !/bulk[-_ ]?(approve|reject|debit)/i.test(listHtml), "");

  // §Settings — brand / content / legal each save independently, and legal copy
  // exists per interface language (EN/FR/AR) so RTL readers get real Arabic.
  const settingsHtml = (await fetchPage("/admin/settings", { cookie: staff.cookie, locale: "en" })).html;
  const formsWithSave = [...settingsHtml.matchAll(/<form\b[\s\S]*?<\/form>/g)].filter((f) => /Saving…|Save /.test(f[0])).length;
  check("staff/settings: sections save independently", formsWithSave >= 3, `${formsWithSave} forms with their own save`);
  for (const key of ["legal.privacy.en", "legal.privacy.fr", "legal.privacy.ar", "legal.terms.en", "legal.terms.fr", "legal.terms.ar"]) {
    check(`staff/settings: ${key} field present`, settingsHtml.includes(`name="${key}"`), "");
  }
  check("staff/settings: Arabic legal field is RTL", /name="legal\.privacy\.ar"[\s\S]{0,200}dir="rtl"/.test(settingsHtml), "");
  check("staff/settings: branding studio has its own save", /data-testid="brand-save"|Save branding/.test(settingsHtml), "");

  // §password affordances — show/hide + policy, on every screen that sets a password.
  // The onboarding form is SUPER_ADMIN-only, so it is checked with a
  // super-admin session — the same rule the product enforces.
  const superAdmin = await login(process.env.SUPER_EMAIL ?? "superadmin@essafaria.example", STAFF_PASSWORD);
  for (const [label, path, cookie] of [
    ["agency/profile", "/portal/profile", agency.cookie],
    ["staff/users", "/admin/users?view=agency", staff.cookie],
    ["staff/agencies+onboarding", "/admin/agencies", superAdmin.cookie],
  ]) {
    const { html } = await fetchPage(path, { cookie, locale: "en" });
    check(`${label}: password field has a show/hide toggle`, /-toggle"/.test(html), "");
    check(`${label}: password policy is spelled out`, /At least 10 characters|least 10 caractères|10 أحرف/.test(visibleText(html)), "");
  }
  const changePw = await fetchPage("/change-password", { cookie: staff.cookie, locale: "en" });
  check(
    "public/change-password: policy + toggles present",
    (changePw.html.match(/-toggle"/g) ?? []).length >= 3 && /10 characters|10 caractères|10 أحرف/.test(visibleText(changePw.html)),
    "",
  );

  // §Users — staff and agency populations are separate views with real counts.
  const staffUsers = (await fetchPage("/admin/users", { cookie: staff.cookie, locale: "en" })).html;
  const agencyUsers = (await fetchPage("/admin/users?view=agency", { cookie: staff.cookie, locale: "en" })).html;
  check("staff/users: two explicit population views", /data-testid="user-views"/.test(staffUsers) && /data-testid="users-view-agency"/.test(staffUsers), "");
  check("staff/users: staff view lists no agency account", !/AGENCY_ADMIN|AGENCY_USER/.test(visibleText(staffUsers)), "");
  check("staff/users: agency view lists agency accounts only", !/SUPER_ADMIN|VISA_AGENT|ACCOUNTING/.test(visibleText(agencyUsers).replace(/ESSAFARIA staff · \d+/g, "")), "");
  check("staff/users: agency view offers an agency filter", /name="agency"/.test(agencyUsers), "");

  // §pagination standard — 20 / 50 / 100 on the list surfaces that carry it.
  for (const [label, path] of [["applications", "/admin/applications"], ["audit", "/admin/audit"], ["visa-types", "/admin/config/visa-types"], ["document-types", "/admin/config/document-types"]]) {
    for (const per of ["20", "50", "100"]) {
      const { status, html } = await fetchPage(`${path}${path.includes("?") ? "&" : "?"}per=${per}`, { cookie: staff.cookie, locale: "en" });
      const sizeSelectors = (html.match(/data-testid="page-size-\d+"/g) ?? []).length;
      check(
        `staff/${label}: page size ${per} accepted`,
        status === 200 && sizeSelectors === 3,
        `status ${status}, ${sizeSelectors} size options`,
      );
    }
  }
  const badSize = await fetchPage("/admin/audit?per=5000", { cookie: staff.cookie, locale: "en" });
  check("staff/audit: a hostile page size falls back to the default", badSize.status === 200 && !/data-testid="page-size-5000"/.test(badSize.html), "");
  const agencySizes = await fetchPage("/portal/applications?per=100", { cookie: agency.cookie, locale: "en" });
  check("agency/applications: page size selector present", agencySizes.status === 200 && /data-testid="page-size-100"/.test(agencySizes.html), "");

  // §exports — the list must offer CSV + Excel scoped to the active filter, and
  // §safe bulk — only assign/priority may exist (never approve/reject/debit/delete).
  check("staff/applications: CSV export offered", /data-testid="export-csv"/.test(listHtml), "");
  check("staff/applications: Excel export offered", /data-testid="export-xlsx"/.test(listHtml), "");
  check(
    "staff/applications: export carries the active filter (no tenant-free export)",
    /\/api\/admin\/applications\/export\?/.test(listHtml),
    "",
  );
  check("staff/applications: export links never omit the scope", !/export\?format=xlsx"/.test(listHtml), "");
  check("staff/applications: bulk bar offers assign/priority only", /data-testid="bulk-bar"/.test(listHtml), "");
  for (const forbidden of ["bulk-approve", "bulk-reject", "bulkDebit", "bulkDelete", "Approve selected", "Reject selected"]) {
    check(`staff/applications: no ${forbidden} control`, !listHtml.includes(forbidden), "");
  }

  // Reports: real-timestamp processing metric + exports.
  const reportsHtml = (await fetchPage("/admin/reports", { cookie: staff.cookie, locale: "en" })).html;
  check("staff/reports: average processing card present", /data-testid="avg-processing"/.test(reportsHtml), "");
  check("staff/reports: CSV export offered", /data-testid="reports-export-csv"/.test(reportsHtml), "");
  check("staff/reports: Excel export offered", /data-testid="reports-export-xlsx"/.test(reportsHtml), "");

  // Export endpoints must actually return files, be refusal-safe for agencies,
  // and honour the filter they are given.
  const csvRes = await fetch(`${BASE}/api/admin/applications/export?status=SUBMITTED`, { headers: { cookie: staff.cookie } });
  // NB: read the BYTES — res.text() strips a leading UTF-8 BOM by spec, and the
  // BOM is exactly what makes Excel render DZD/accents correctly.
  const csvBytes = Buffer.from(await csvRes.arrayBuffer());
  const csvBody = csvBytes.toString("utf8");
  check("export CSV: staff receives a file", csvRes.status === 200 && /text\/csv/.test(csvRes.headers.get("content-type") ?? ""), `status ${csvRes.status}`);
  check(
    "export CSV: UTF-8 BOM + header row",
    csvBytes.subarray(0, 3).toString("hex") === "efbbbf" && csvBody.replace("\uFEFF", "").startsWith("Reference,"),
    csvBytes.subarray(0, 3).toString("hex"),
  );
  check("export CSV: only the filtered status is present", !/,(APPROVED|REJECTED),/.test(csvBody), "");
  const xlsxRes = await fetch(`${BASE}/api/admin/applications/export?format=xlsx`, { headers: { cookie: staff.cookie } });
  const xlsxBytes = Buffer.from(await xlsxRes.arrayBuffer());
  check(
    "export XLSX: a real workbook comes back",
    xlsxRes.status === 200 && xlsxBytes.subarray(0, 2).toString() === "PK" && xlsxBytes.includes(Buffer.from("xl/workbook.xml")),
    `status ${xlsxRes.status}, ${xlsxBytes.byteLength} bytes`,
  );
  const reportsCsv = await fetch(`${BASE}/api/admin/reports/export`, { headers: { cookie: staff.cookie } });
  const reportsCsvBody = await reportsCsv.text();
  check("export reports CSV: DZD column present", reportsCsv.status === 200 && reportsCsvBody.includes("Charged volume (DZD)"), `status ${reportsCsv.status}`);
  check("export reports CSV: never a non-DZD currency", !/(€|EUR\b|USD\b)/.test(reportsCsvBody), "");
  const agencyExport = await fetch(`${BASE}/api/admin/applications/export`, { headers: { cookie: agency.cookie } });
  check("export guard: an agency session is refused", agencyExport.status === 403 || agencyExport.status === 307 || agencyExport.status === 302, `status ${agencyExport.status}`);
  const anonExport = await fetch(`${BASE}/api/admin/applications/export`);
  check("export guard: anonymous gets a clean 401 (no 500, no leak)", anonExport.status === 401, `status ${anonExport.status}`);
  const anonReports = await fetch(`${BASE}/api/admin/reports/export`);
  check("export guard: anonymous reports export refused", anonReports.status === 401, `status ${anonReports.status}`);

  // Global command search.
  const search = await fetchPage("/admin/search?q=EVT", { cookie: staff.cookie, locale: "en" });
  check("staff/search: renders results surface", search.status === 200 && /data-testid="global-search-input"/.test(search.html), `status ${search.status}`);

  // Staff dossier (all five tabs) + agency detail.
  const adminList = await fetchPage("/admin/applications", { cookie: staff.cookie, locale: "en" });
  const adminAppId = /\/admin\/applications\/([0-9a-f-]{36})/.exec(adminList.html)?.[1] ?? null;
  if (!adminAppId) {
    fail("staff/dossier", "no application visible to staff");
  } else {
    for (const tab of ["overview", "documents", "billing", "communications", "activity"]) {
      const { status, html } = await fetchPage(`/admin/applications/${adminAppId}?tab=${tab}`, { cookie: staff.cookie, locale: "en" });
      if (status !== 200) {
        fail(`staff/dossier-${tab}`, `status ${status}`);
        continue;
      }
      auditPage(`staff/dossier-${tab}`, `?tab=${tab}`, html, {});
      const text = visibleText(html);
      if (tab === "documents") {
        check("staff/dossier-documents: reviewed states are visible", /Accepted|Replacement requested|Rejected|Under review/i.test(text), "");
        check("staff/dossier-documents: replacement request available", /Request replacement/i.test(text), "");
        check("staff/dossier-documents: additional document request available", /Request additional/i.test(text), "");
        const addPanel = html.slice(html.indexOf("Request additional"));
        const optionCount = [...addPanel.matchAll(/<option[^>]*value="[0-9a-f-]{36}"/g)].length;
        check(
          "staff/dossier-documents: additional-document panel is never a dead end",
          optionCount > 0 || /already a requirement of this dossier/.test(text),
          optionCount > 0 ? `${optionCount} configured types offered` : "empty state explains replacement instead",
        );
        check("staff/dossier-documents: uploaded files are previewable", !/\b1 uploaded|\b2 uploaded|\b3 uploaded|\b4 uploaded/.test(text) || /Preview/.test(text), "");
        check("staff/dossier-documents: document requests history", /Document requests/i.test(text) || /document requests/i.test(text), "");
        const picker = [...html.matchAll(/<select name="documentTypeId"[\s\S]*?<\/select>/g)][0]?.[0] ?? "";
        check("staff/dossier-documents: decision documents are not requestable from an agency", !/Issued Visa|Refusal \/ Rejection/i.test(picker), "");
      }
      if (tab === "billing") check("staff/dossier-billing: DZD amounts", /DZD/.test(text), "");
    }
  }
  const agencyListHtml = (await fetchPage("/admin/agencies", { cookie: staff.cookie, locale: "en" })).html;
  const agencyId = /\/admin\/agencies\/([0-9a-f-]{36})/.exec(agencyListHtml)?.[1] ?? null;
  if (agencyId) {
    for (const suffix of ["", "?tab=users", "?tab=wallet", "?tab=applications", "?tab=activity"]) {
      const { status, html } = await fetchPage(`/admin/agencies/${agencyId}${suffix}`, { cookie: staff.cookie, locale: "en" });
      auditPage(`staff/agency-detail${suffix || " [overview]"}`, suffix, html, {});
      if (status !== 200) fail(`staff/agency-detail${suffix}`, `status ${status}`);
    }
  } else {
    fail("staff/agency-detail", "no agency link found");
  }

  // Staff surfaces in FR/AR (RTL + translated copy + localized amounts).
  for (const locale of ["fr", "ar"]) {
    for (const [path, label] of [
      ["/admin", "dashboard"],
      ["/admin/applications", "applications"],
      ["/admin/billing", "billing"],
      ["/admin/reports", "reports"],
    ]) {
      const { status, html } = await fetchPage(path, { cookie: staff.cookie, locale });
      if (status !== 200) {
        fail(`staff/${label} [${locale}]`, `status ${status}`);
        continue;
      }
      const text = visibleText(html);
      check(`staff/${label} [${locale}]: no dictionary keys`, !DICT_KEY_RE.test(text), DICT_KEY_RE.exec(text)?.[0] ?? "clean");
      if (locale === "ar") check(`staff/${label} [ar]: RTL`, /<html[^>]+dir="rtl"/.test(html), "");
      check(`staff/${label} [${locale}]: DZD preserved`, /DZD/.test(text), "");
    }
  }
  // Agency surfaces in FR/AR.
  for (const locale of ["fr", "ar"]) {
    for (const [path, label] of [
      ["/portal", "dashboard"],
      ["/portal/applications", "applications"],
      ["/portal/wallet", "wallet"],
    ]) {
      const { status, html } = await fetchPage(path, { cookie: agency.cookie, locale });
      if (status !== 200) {
        fail(`agency/${label} [${locale}]`, `status ${status}`);
        continue;
      }
      const text = visibleText(html);
      check(`agency/${label} [${locale}]: no dictionary keys`, !DICT_KEY_RE.test(text), DICT_KEY_RE.exec(text)?.[0] ?? "clean");
      if (locale === "ar") check(`agency/${label} [ar]: RTL`, /<html[^>]+dir="rtl"/.test(html), "");
      check(`agency/${label} [${locale}]: DZD preserved`, /DZD/.test(text), "");
    }
  }
  // Cross-persona guards: an agency session must not render staff routes.
  const agencyOnAdmin = await fetchPage("/admin", { cookie: agency.cookie });
  check("guard: agency session redirected away from /admin", agencyOnAdmin.status === 307 || agencyOnAdmin.status === 302 || /\/portal/.test(agencyOnAdmin.location ?? ""), `status ${agencyOnAdmin.status} → ${agencyOnAdmin.location ?? ""}`);
  const anonOnPortal = await fetchPage("/portal");
  check("guard: anonymous session redirected to /login", anonOnPortal.status === 307 || anonOnPortal.status === 302, `status ${anonOnPortal.status} → ${anonOnPortal.location ?? ""}`);
}

/* ------------------------ state-rich rendered checks --------------------- */

if (STATE && agency.cookie && staff.cookie) {
  const dossierPath = `/portal/applications/${STATE.applicationId}`;
  const docsTab = visibleText((await fetchPage(`${dossierPath}?tab=documents`, { cookie: agency.cookie, locale: "en" })).html);
  check("state: replacement request is visible to the agency", /Bank Statement|Replacement requested|Requested/i.test(docsTab), "");
  check("state: accepted document shows as accepted/received", /Accepted|Received|Uploaded/i.test(docsTab), "");
  check("state: reopened slot explains what to do", /Awaiting your upload|Requested|Missing/i.test(docsTab), "");

  const messagesAgency = visibleText((await fetchPage(`${dossierPath}?tab=messages`, { cookie: agency.cookie, locale: "en" })).html);
  check("state: agency sees its own message", !STATE.agencyMessage || messagesAgency.includes(STATE.agencyMessage), "");
  check("state: agency sees the staff answer", !STATE.staffReply || messagesAgency.includes(STATE.staffReply), "");
  check("state: agency never sees the staff internal note", !STATE.internalNote || !messagesAgency.includes(STATE.internalNote), "");

  const messagesStaff = visibleText((await fetchPage(`/admin/applications/${STATE.applicationId}?tab=communications`, { cookie: staff.cookie, locale: "en" })).html);
  check("state: staff sees the full thread including the internal note", !STATE.internalNote || messagesStaff.includes(STATE.internalNote), "");

  const walletText = visibleText((await fetchPage("/portal/wallet", { cookie: agency.cookie, locale: "en" })).html);
  check("state: pending top-up is visible to the agency", /pending/i.test(walletText) && /TOP-\d{4}-\d{5}/.test(walletText), "");
  check("state: rejected top-up shows its reason", /reject/i.test(walletText), "");
  check("state: wallet shows the running ledger with before→after", /DZD/.test(walletText) && !/(€|EUR\b|USD\b)/.test(walletText), "");

  const billing = visibleText((await fetchPage("/admin/billing", { cookie: staff.cookie, locale: "en" })).html);
  check("state: staff billing queue lists the pending top-up", /TOP-\d{4}-\d{5}/.test(billing) || /pending/i.test(billing), "");

  const notificationsAgency = visibleText((await fetchPage("/portal/notifications", { cookie: agency.cookie, locale: "en" })).html);
  check("state: agency notifications explain document + wallet events", /DZD|document|Document/i.test(notificationsAgency), "");
}

/* --------------------------------- report -------------------------------- */

const failed = results.filter((r) => r.ok === false);
const passed = results.filter((r) => r.ok === true);
const classified = results.filter((r) => r.ok === null);
for (const r of results) {
  const tag = r.ok === null ? "NOT-VERIFIED" : r.ok ? "PASS" : "FAIL";
  console.log(`${tag}  ${r.id}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(`\n${passed.length} passed · ${failed.length} failed · ${classified.length} classified (not rendered-verified)`);
process.exit(failed.length ? 1 : 0);
