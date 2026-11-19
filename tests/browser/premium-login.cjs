// Visual and interaction checks on a locally served build with Turnstile enabled.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const origin = new URL(process.env.LOGIN_QA_URL || "http://127.0.0.1:4338");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
const folder = path.resolve(".screenshots", "qa");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dimensions = { desktop: [1440, 900], mobile: [390, 844] };
const titles = { fr: "Bienvenue à bord.", en: "Welcome aboard.", ar: "مرحباً بعودتكم." };

async function checkView(page, locale, size) {
  const [width, height] = dimensions[size];
  await page.setViewportSize({ width, height });
  const response = await page.goto(new URL("/login?lang=" + locale, origin).href);
  assert.equal(response.status(), 200);
  const screen = page.locator(".premium-login");
  await page.getByRole("heading", { level: 1, name: titles[locale] }).waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll(".premium-login img")].map(img => img.decode()));
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const geometry = await screen.evaluate(root => {
    const box = selector => root.querySelector(selector).getBoundingClientRect();
    return {
      language: root.lang,
      direction: getComputedStyle(root).direction,
      background: getComputedStyle(root).backgroundColor,
      emailDirection: getComputedStyle(root.querySelector("#email")).direction,
      windowLeft: box(".login-window").x,
      titleLeft: box("h1").x,
      titleTop: box("h1").top,
      formTop: box(".login-form").top,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.equal(geometry.language, locale);
  assert.equal(geometry.direction, locale === "ar" ? "rtl" : "ltr");
  assert.equal(geometry.emailDirection, "ltr");
  assert.equal(geometry.background, "rgb(255, 255, 255)");
  assert.equal(geometry.overflow, 0);
  assert.ok(geometry.titleTop < geometry.formTop);
  assert.equal(geometry.windowLeft < geometry.titleLeft, size === "desktop" ? locale !== "ar" : locale === "ar");
  assert.equal(await screen.locator(".login-verification input[name='cf-turnstile-response']").count(), 1);
  assert.equal(await page.locator(".premium-public-header").isVisible(), false);
  assert.equal(await screen.locator(".login-register a").getAttribute("href"), "/agency/register?lang=" + locale);
  assert.equal(await screen.locator(".login-recovery a").getAttribute("href"), "/forgot-password?lang=" + locale);
  const capture = path.join(folder, stamp + "-login-" + size + "-" + locale + ".png");
  await page.screenshot({ path: capture, fullPage: true });
  return path.basename(capture);
}

async function main() {
  await fs.mkdir(folder, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  try {
    const page = await browser.newPage();
    const captures = [];
    for (const size of Object.keys(dimensions)) {
      for (const locale of Object.keys(titles)) captures.push(await checkView(page, locale, size));
    }
    const email = page.locator("#email");
    const password = page.locator("#password");
    await email.fill("visual-review@example.invalid");
    await password.fill("visual-fixture");
    const eye = page.getByTestId("password-toggle");
    await eye.click();
    assert.equal(await password.getAttribute("type"), "text");
    await eye.click();
    assert.equal(await password.getAttribute("type"), "password");
    const before = await page.evaluate(() => performance.timeOrigin);
    const menu = page.locator(".login-languages-small");
    await menu.locator("summary").click();
    await menu.getByRole("button", { name: "Français" }).click();
    await page.getByRole("heading", { name: titles.fr }).waitFor();
    assert.equal(await page.evaluate(() => performance.timeOrigin), before);
    assert.equal(await email.inputValue(), "visual-review@example.invalid");
    assert.equal(await password.inputValue(), "visual-fixture");
    assert.equal(await menu.locator("details").getAttribute("open"), null);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(new URL("/login?lang=ar&reset=complete", origin).href);
    assert.equal(await page.locator(".premium-notice[data-tone=success]").isVisible(), true);
    assert.equal(await page.locator(".login-window").evaluate(el => getComputedStyle(el).animationName), "none");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    for (const locale of Object.keys(titles)) {
      await page.goto(new URL("/login?lang=" + locale, origin).href);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const readable = await page.evaluate(() => {
        const extent = selector => document.querySelector(selector).getBoundingClientRect();
        const letters = selector => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector(selector));
          return range.getBoundingClientRect();
        };
        const separate = (a, b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
        return document.documentElement.scrollWidth === innerWidth &&
          separate(letters(".login-intro h1"), extent(".login-window")) &&
          separate(letters(".login-brand span"), extent(".login-languages-small summary"));
      });
      assert.ok(readable, "200% text collision in " + locale);
    }
    await page.locator(".login-recovery a").click();
    await page.getByRole("heading", { name: "استعادة الوصول إلى الحساب" }).waitFor();
    await page.goto(new URL("/login?lang=fr&reason=session-expired", origin).href);
    assert.equal(await page.locator(".login-controls > [role=status]").isVisible(), true);
    await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
    await page.waitForURL(url => url.pathname === "/forgot-password");
    assert.equal(await page.locator(".premium-public-header").isVisible(), true);
    console.log(JSON.stringify({ captures, checked: ["native verification slot", "password visibility", "locale switch and input retention", "320px and 200% type", "motion preference", "notices", "recovery navigation"] }, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
