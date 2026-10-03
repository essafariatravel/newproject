import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const outDir = path.resolve("artifacts/ux-ui-browser");
fs.mkdirSync(outDir, { recursive: true });

const failures = [];
const results = [];
const screenshots = [];

const viewports = {
  mobile390: { width: 390, height: 844 },
  tablet768: { width: 768, height: 1024 },
  desktop1024: { width: 1024, height: 900 },
  desktop1440: { width: 1440, height: 1000 },
};

function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function setLocale(context, locale) {
  await context.addCookies([{
    name: "evos_ui_locale",
    value: locale,
    url: baseURL,
    sameSite: "Lax",
  }]);
}

async function keyboardSmoke(page, label) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 120),
      visible: r.width > 0 && r.height > 0,
      focusStyled: cs.outlineStyle !== "none" || cs.boxShadow !== "none",
    };
  });
  if (!focus?.visible) failures.push(label + ": keyboard Tab did not reach a visible control");
  if (!focus?.focusStyled) failures.push(label + ": first keyboard focus has no visible outline/ring");
  return focus;
}

async function inspectPage(context, route, label, locale, viewportName, options = {}) {
  const page = await context.newPage();
  await page.setViewportSize(viewports[viewportName]);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto(new URL(route, baseURL).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  try {
    await page.waitForLoadState("networkidle", { timeout: 3_000 });
  } catch {
    // Long-lived development connections are acceptable; DOM is already loaded.
  }

  const status = response?.status() ?? 0;
  if (status >= 400) failures.push(label + ": HTTP " + status);

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      dir: root.dir || getComputedStyle(root).direction,
      pageOverflow: root.scrollWidth > root.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
      width: root.clientWidth,
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
      h1: document.querySelectorAll("h1").length,
    };
  });

  const expectedDir = locale === "ar" ? "rtl" : "ltr";
  if (layout.dir !== expectedDir) failures.push(label + ": expected dir=" + expectedDir + ", got " + layout.dir);
  if (layout.pageOverflow) failures.push(label + ": page-level horizontal overflow " + layout.scrollWidth + " > " + layout.width);

  const axe = await new AxeBuilder({ page }).analyze();
  const severe = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  if (severe.length) {
    failures.push(label + ": axe serious/critical violations: " + severe.map((v) => v.id + "(" + v.nodes.length + ")").join(", "));
  }

  const focus = options.keyboard ? await keyboardSmoke(page, label) : null;

  const shotName = safeName(label + "-" + locale + "-" + viewportName) + ".png";
  await page.screenshot({ path: path.join(outDir, shotName), fullPage: true });
  screenshots.push(shotName);

  const ignoredConsole = consoleErrors.filter((m) =>
    !/favicon|Download the React DevTools|hydration/i.test(m)
  );
  if (ignoredConsole.length) failures.push(label + ": console error(s): " + ignoredConsole.slice(0, 3).join(" | "));
  if (pageErrors.length) failures.push(label + ": page error(s): " + pageErrors.slice(0, 3).join(" | "));

  results.push({
    label, route, locale, viewport: viewportName, status, layout, focus,
    axeSeriousCritical: severe.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    consoleErrors: ignoredConsole,
    pageErrors,
  });

  return page;
}

async function login(context, identifier, password, expectedPrefix) {
  const page = await context.newPage();
  await page.goto(new URL("/login", baseURL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(identifier);
  await page.locator("#password").fill(password);
  await page.locator("form button").filter({ hasText: /sign in|se connecter|تسجيل الدخول/i }).click();

  try {
    await page.waitForURL((url) => url.pathname.startsWith(expectedPrefix), { timeout: 30_000 });
  } catch (error) {
    const alert = await page.locator('[role="alert"]').first().textContent().catch(() => null);
    const currentURL = page.url();
    throw new Error(
      "Login failed for " + identifier +
      " (expected " + expectedPrefix + ", current " + currentURL + ")" +
      (alert ? ": " + alert.trim() : ""),
      { cause: error },
    );
  }
  await page.close();
}

async function firstDossierPath(context, listRoute, prefix) {
  const page = await context.newPage();
  await page.goto(new URL(listRoute, baseURL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  try { await page.waitForLoadState("networkidle", { timeout: 3_000 }); } catch {}
  const hrefs = await page.locator('a[href^="' + prefix + '"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")).filter(Boolean)
  );
  await page.close();
  return hrefs.find((href) => href !== prefix && !href.endsWith("/new")) ?? null;
}

const browser = await chromium.launch({ headless: true });
try {
  // Public — all three locales.
  for (const locale of ["en", "fr", "ar"]) {
    const context = await browser.newContext();
    await setLocale(context, locale);
    await inspectPage(context, "/", "public-home", locale, "mobile390", { keyboard: true });
    await inspectPage(context, "/login", "public-login", locale, "desktop1440", { keyboard: true });
    await inspectPage(context, "/agency/register", "public-register", locale, "mobile390", { keyboard: true });
    await context.close();
  }

  // Agency.
  const agency = await browser.newContext();
  await setLocale(agency, "en");
  await login(agency, "a-admin", "Test-Password-123", "/portal");
  for (const [route, label, viewport] of [
    ["/portal", "agency-dashboard", "mobile390"],
    ["/portal", "agency-dashboard", "desktop1440"],
    ["/portal/applications", "agency-applications", "mobile390"],
    ["/portal/applications", "agency-applications", "desktop1440"],
    ["/portal/wallet", "agency-wallet", "mobile390"],
    ["/portal/profile", "agency-profile", "desktop1024"],
  ]) await inspectPage(agency, route, label, "en", viewport, { keyboard: true });

  const agencyDossier = await firstDossierPath(agency, "/portal/applications", "/portal/applications/");
  if (!agencyDossier) failures.push("agency: seeded dossier link not found");
  else await inspectPage(agency, agencyDossier, "agency-dossier", "en", "desktop1440", { keyboard: true });

  await setLocale(agency, "fr");
  await inspectPage(agency, "/portal/applications", "agency-applications", "fr", "tablet768", { keyboard: true });
  await setLocale(agency, "ar");
  await inspectPage(agency, "/portal", "agency-dashboard", "ar", "mobile390", { keyboard: true });
  await inspectPage(agency, "/portal/applications", "agency-applications", "ar", "desktop1024", { keyboard: true });
  if (agencyDossier) await inspectPage(agency, agencyDossier, "agency-dossier", "ar", "mobile390", { keyboard: true });
  await agency.close();

  // Staff.
  const staff = await browser.newContext();
  await setLocale(staff, "en");
  await login(staff, "superadmin@test.example", "Test-Password-123", "/admin");
  for (const [route, label, viewport] of [
    ["/admin", "staff-dashboard", "desktop1440"],
    ["/admin/applications", "staff-applications", "desktop1440"],
    ["/admin/applications", "staff-applications", "tablet768"],
    ["/admin/agencies", "staff-agencies", "desktop1024"],
    ["/admin/billing", "staff-billing", "desktop1440"],
    ["/admin/reports", "staff-reports", "desktop1440"],
    ["/admin/audit", "staff-audit", "desktop1440"],
  ]) await inspectPage(staff, route, label, "en", viewport, { keyboard: true });

  const staffDossier = await firstDossierPath(staff, "/admin/applications", "/admin/applications/");
  if (!staffDossier) failures.push("staff: seeded dossier link not found");
  else await inspectPage(staff, staffDossier, "staff-dossier", "en", "desktop1440", { keyboard: true });

  await setLocale(staff, "fr");
  await inspectPage(staff, "/admin/applications", "staff-applications", "fr", "desktop1024", { keyboard: true });
  await setLocale(staff, "ar");
  await inspectPage(staff, "/admin", "staff-dashboard", "ar", "desktop1024", { keyboard: true });
  await inspectPage(staff, "/admin/applications", "staff-applications", "ar", "desktop1024", { keyboard: true });
  if (staffDossier) await inspectPage(staff, staffDossier, "staff-dossier", "ar", "desktop1440", { keyboard: true });
  await staff.close();
} finally {
  await browser.close();
}

const report = { baseURL, checked: results.length, screenshots, failures, results };
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(outDir, "summary.txt"), [
  "ESSAFARIA UX/UI Browser Smoke",
  "Pages checked: " + results.length,
  "Screenshots: " + screenshots.length,
  "Failures: " + failures.length,
  ...failures.map((f) => "- " + f),
].join("\n"));

console.log("Browser smoke pages checked:", results.length);
console.log("Browser smoke screenshots:", screenshots.length);
if (failures.length) {
  console.error("Browser smoke failures:", failures.length);
  for (const failure of failures) console.error("-", failure);
  process.exit(1);
}
console.log("Browser smoke PASS.");
