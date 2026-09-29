import { chromium } from "playwright";
import fs from "node:fs";
import pg from "pg";

const base = "http://127.0.0.1:3000";
const label = process.env.QA_LABEL ?? "after";
const seed = fs.readFileSync("scripts/seed.ts", "utf8");
const adminPassword = seed.match(/adminPassword = process\.env\.SEED_ADMIN_PASSWORD \?\? "([^"]+)"/)?.[1];
const agencyPassword = seed.match(/agencyPassword = process\.env\.SEED_AGENCY_PASSWORD \?\? "([^"]+)"/)?.[1];
if (!adminPassword || !agencyPassword) throw new Error("Could not resolve demo passwords from seed source.");

const browser = await chromium.launch({ headless: true });
const report = [];

async function login(context, email, password) {
  const page = await context.newPage();
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const loginForm = page.locator("form").filter({ has: page.locator("#email") }).first();
  const expected = email.includes("@essafaria.example") ? /\/admin(?:\/|$)/ : /\/portal(?:\/|$)/;
  await loginForm.locator('button[type="submit"]').first().click();
  await page.waitForURL(expected, { timeout: 30000 });
  await page.close();
}

async function snap(context, route, name) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  const started = Date.now();
  const response = await page.goto(base + route, { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    direction: getComputedStyle(document.documentElement).direction,
    cards: document.querySelectorAll(".card").length,
    badges: document.querySelectorAll(".badge").length,
    headings: document.querySelectorAll("h1,h2,h3").length,
  }));
  const row = {
    name,
    route,
    status: response?.status() ?? null,
    elapsedMs: Date.now() - started,
    overflow: metrics.scrollWidth > metrics.width + 1,
    errors,
    ...metrics,
  };
  report.push(row);
  await page.screenshot({ path: `visual-qa/${label}-${name}.png`, fullPage: true });
  await page.close();
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const appQuery = await pool.query("select id from applications where reference = $1 limit 1", ["EVT-DEMO-0001"]);
await pool.end();
const appId = appQuery.rows[0]?.id;
if (!appId) throw new Error("Seeded EVT-DEMO-0001 application was not found in the local QA database.");
const dossierHref = `/portal/applications/${appId}`;

const agency = await browser.newContext({ viewport: { width: 390, height: 844 } });
await login(agency, "admin@horizonvoyages.example", agencyPassword);

await snap(agency, "/portal", "agency-dashboard-mobile");
await snap(agency, "/portal/applications", "agency-applications-mobile");
await snap(agency, dossierHref, "agency-dossier-mobile");
await snap(agency, "/portal/documents", "agency-documents-mobile");
await snap(agency, "/portal/notifications", "agency-notifications-mobile");
await snap(agency, "/portal/applications/new", "agency-wizard-step1-mobile");

const staff = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await login(staff, "admin@essafaria.example", adminPassword);
await snap(staff, "/admin", "staff-dashboard-desktop");
await snap(staff, "/admin/applications", "staff-applications-desktop");
const staffDossierHref = dossierHref.replace("/portal/", "/admin/");
await snap(staff, staffDossierHref, "staff-dossier-desktop");

const rtl = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-DZ" });
await login(rtl, "admin@horizonvoyages.example", agencyPassword);
await rtl.addCookies([{ name: "evos_ui_locale", value: "ar", domain: "127.0.0.1", path: "/" }]);
await snap(rtl, "/portal", "agency-dashboard-ar");
await snap(rtl, dossierHref, "agency-dossier-ar");

for (const width of [320, 360, 430, 768]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await login(ctx, "admin@horizonvoyages.example", agencyPassword);
  await snap(ctx, "/portal", `agency-dashboard-${width}`);
  await snap(ctx, "/portal/applications", `agency-applications-${width}`);
  await snap(ctx, dossierHref, `agency-dossier-${width}`);
  await ctx.close();
}

const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
await login(reduced, "admin@horizonvoyages.example", agencyPassword);
const motionPage = await reduced.newPage();
await motionPage.goto(base + "/portal/applications/new", { waitUntil: "networkidle" });
const reducedMotion = await motionPage.evaluate(() => {
  const panel = document.querySelector(".wizard-panel");
  const style = panel ? getComputedStyle(panel) : null;
  return {
    animationDuration: style?.animationDuration ?? null,
    transitionDuration: style?.transitionDuration ?? null,
  };
});
report.push({ name: "reduced-motion", reducedMotion });
await motionPage.close();
await reduced.close();

fs.writeFileSync(`visual-qa/${label}-report.json`, JSON.stringify(report, null, 2));
await browser.close();
