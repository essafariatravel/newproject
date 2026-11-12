// Run from repository root with node --import tsx. Requires a local Playwright runtime.
// All fixture writes, HTTP requests and Siteverify simulations stay on loopback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');
const EmbeddedPostgres = require('embedded-postgres').default;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { applyMigrations } = require('../../scripts/lib/migrations.ts');
const { hashPassword, hashToken } = require('../../src/lib/crypto.ts');
const repo = process.cwd(), origin = 'http://127.0.0.1:3197';
const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54439/essafaria_bot_qa';
const password = crypto.randomBytes(20).toString('hex');
const accessToken = crypto.randomBytes(32).toString('base64url');
const activationToken = crypto.randomBytes(32).toString('base64url');
const date = new Date(), pad = value => String(value).padStart(2, '0');
const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
const reports = path.join(repo, '.screenshots', 'debug');
fs.mkdirSync(reports, { recursive: true });

const widgetScript = `window.qaWidgets=[]; window.qaOutcome='valid'; window.turnstile={
  render(el,opts){const id=String(window.qaWidgets.length); window.qaWidgets.push({opts,el}); this.reset(id); return id;},
  reset(id){const w=window.qaWidgets[Number(id)]; if(!w)return; setTimeout(()=>{w.opts.callback('local-qa.'+btoa(JSON.stringify({hostname:location.hostname,action:w.opts.action,challenge_ts:new Date().toISOString(),nonce:crypto.randomUUID(),outcome:window.qaOutcome})).replace(/=/g,''));},40);},
  remove(id){const w=window.qaWidgets[Number(id)]; if(w)w.el.innerHTML='';}
};`;

async function main() {
  assert.ok(!process.env.VERCEL, 'Local test only');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'essafaria-bot-browser-'));
  const pg = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password: 'postgres', port: 54439, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
  let pool, server, browser, serverLog;
  const evidence = [], browserErrors = [];
  try {
    await pg.initialise(); await pg.start(); await pg.createDatabase('essafaria_bot_qa');
    pool = new Pool({ connectionString: databaseUrl });
    const target = (await pool.query('select host(inet_server_addr()) ip,inet_server_port() port,current_database() db')).rows[0];
    assert.deepEqual(target, { ip: '127.0.0.1', port: 54439, db: 'essafaria_bot_qa' });
    await applyMigrations(pool, path.join(repo, 'migrations'));
    const agency = (await pool.query("insert into agencies(legal_name,trading_name,email) values('Synthetic QA','Synthetic QA','agency@example.test') returning id")).rows[0].id;
    const user = (await pool.query("insert into users(email,name,role,password_hash,agency_id) values('agent@example.test','Synthetic Agent','AGENCY_USER',$1,$2) returning id", [await hashPassword(password), agency])).rows[0].id;
    const staff = (await pool.query("insert into users(email,name,role,password_hash) values('staff@example.test','Synthetic Staff','VISA_AGENT',$1) returning id", [await hashPassword(password)])).rows[0].id;
    const activationUser = (await pool.query("insert into users(email,name,role,password_hash,agency_id,activation_pending) values('activation@example.test','Synthetic Activation','AGENCY_ADMIN',$1,$2,true) returning id", [await hashPassword(password), agency])).rows[0].id;
    await pool.query("insert into account_activation_tokens(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')", [activationUser, hashToken(activationToken)]);
    await pool.query("insert into users(email,name,role,password_hash,agency_id,must_change_password) values('first-password@example.test','Synthetic First Password','AGENCY_USER',$1,$2,true)", [await hashPassword(password), agency]);
    await pool.query("insert into account_access_tokens(user_id,token_hash,purpose,credential_version,expires_at,created_by) select id,$2,'PASSWORD_RESET',credential_version,now()+interval '1 hour',$3 from users where id=$1", [user, hashToken(accessToken), staff]);
    for (const locale of ['en', 'fr', 'ar']) for (const kind of ['terms', 'privacy']) {
      await pool.query('insert into legal_versions(kind,locale,version,body,effective_at,published_at,author_id) values($1,$2,1,$3,now(),now(),$4)', [kind, locale, 'Synthetic local acceptance fixture.', staff]);
    }
    serverLog = fs.openSync(path.join(reports, `${stamp}-bot-server.log`), 'w');
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3197'], {
      cwd: repo, windowsHide: true, stdio: ['ignore', serverLog, serverLog], env: {
        ...process.env, DATABASE_URL: databaseUrl, DATABASE_SCHEMA: 'public', STORAGE_PROVIDER: 'db', TRANSACTIONAL_EMAIL_PROVIDER: 'disabled',
        AUTH_LOGIN_COUNTER_SECRET: crypto.randomBytes(32).toString('base64url'),
        TURNSTILE_MODE: 'managed', TURNSTILE_SITE_KEY: 'synthetic_browser_site_key', TURNSTILE_SECRET: 'synthetic_browser_secret', TURNSTILE_HOSTNAMES: '127.0.0.1',
        NODE_OPTIONS: `--require "${path.join(repo, 'tests/browser/turnstile-siteverify.cjs').replaceAll('\\', '/')}"`,
      },
    });
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(origin + '/login')).ok) break; } catch {}
      if (i === 59) throw new Error('Local server did not become ready');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
    async function context(locale, width = 1440, failScript = false) {
      const ctx = await browser.newContext({ viewport: { width, height: 980 }, reducedMotion: 'reduce' });
      await ctx.addCookies([{ name: 'evos_ui_locale', value: locale, url: origin }]);
      let failures = failScript ? 1 : 0;
      await ctx.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'challenges.cloudflare.com') {
          if (failures-- > 0) return route.abort();
          return route.fulfill({ contentType: 'application/javascript', body: widgetScript });
        }
        if (url.hostname !== '127.0.0.1') return route.abort();
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on('pageerror', error => browserErrors.push(error.message));
      return { ctx, page };
    }
    const ready = page => page.waitForFunction(() => Boolean(document.querySelector('[name="cf-turnstile-response"]')?.value));
    const checkLayout = async (page, name) => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow: ${name}`);
      evidence.push(name);
    };

    // Loader outage -> accessible retry, credentials retained after failed login.
    {
      const { ctx, page } = await context('fr', 1440, true);
      await page.goto(origin + '/login');
      await page.locator('[name="identifier"]').fill('agent@example.test');
      await page.locator('[name="password"]').fill('Incorrect-Local-Password');
      await page.getByRole('button', { name: 'Relancer la vérification' }).click(); await ready(page);
      const before = await page.locator('[name="cf-turnstile-response"]').inputValue();
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click();
      await page.getByRole('alert').waitFor(); await ready(page);
      await page.waitForFunction(previous => {
        const value = document.querySelector('[name="cf-turnstile-response"]')?.value;
        return Boolean(value && value !== previous);
      }, before);
      assert.equal(await page.locator('[name="identifier"]').inputValue(), 'agent@example.test');
      assert.notEqual(await page.locator('[name="cf-turnstile-response"]').inputValue(), before);
      await checkLayout(page, 'login-fr-retry');
      // Direct HTTP replay of the real Next Server Action with no challenge.
      const manifest = JSON.parse(fs.readFileSync(path.join(repo, '.next/server/server-reference-manifest.json'), 'utf8'));
      const actions = Object.entries(manifest.node);
      const login = actions.find(([, value]) => value.exportedName === 'loginAction');
      assert.ok(login, 'Built login action found');
      const data = new FormData(); data.set('_1_identifier', 'agent@example.test'); data.set('_1_password', password); data.set('0', '[{},"$K1"]');
      const direct = await fetch(origin + '/login', { method: 'POST', headers: { 'Next-Action': login[0], Origin: origin, Accept: 'text/x-component' }, body: data, redirect: 'manual' });
      const body = await direct.text();
      assert.ok(body.includes('Security verification'), `Direct HTTP action must reject missing token (status ${direct.status}): ${body.slice(0, 900)}`);
      assert.ok(!direct.headers.get('set-cookie'), 'No direct HTTP login cookie');
      // A network failure also renews the same widget and preserves fields.
      await page.route('**/login', route => route.request().method() === 'POST' ? route.abort() : route.continue());
      const networkToken = await page.locator('[name="cf-turnstile-response"]').inputValue();
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click();
      await page.getByRole('alert').filter({ hasText: 'temporairement indisponible' }).waitFor(); await ready(page);
      await page.waitForFunction(previous => {
        const value = document.querySelector('[name="cf-turnstile-response"]')?.value;
        return Boolean(value && value !== previous);
      }, networkToken);
      assert.notEqual(await page.locator('[name="cf-turnstile-response"]').inputValue(), networkToken);
      assert.equal(await page.locator('[name="identifier"]').inputValue(), 'agent@example.test');
      await ctx.close();
    }
    for (const [locale, width] of [['en', 768], ['ar', 375]]) {
      const { ctx, page } = await context(locale, width); await page.goto(origin + '/login'); await ready(page);
      await page.evaluate(() => { window.qaWidgets[0].opts['expired-callback'](); });
      assert.ok(await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').isDisabled());
      await page.locator('form button[type="button"]').last().click(); await ready(page);
      await checkLayout(page, `login-${locale}-${width}`); await ctx.close();
    }
    {
      const { ctx, page } = await context('en'); await page.goto(origin + '/login'); await ready(page);
      await page.locator('[name="identifier"]').fill('staff@example.test');
      await page.locator('[name="password"]').fill(password);
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click();
      await page.waitForURL('**/mfa'); await ctx.close();
      evidence.push('staff-login-mfa-redirect');
    }
    // A verified agency login follows the unchanged session and tenant route.
    {
      const { ctx, page } = await context('en'); await page.goto(origin + '/login'); await ready(page);
      await page.locator('[name="identifier"]').fill('agent@example.test'); await page.locator('[name="password"]').fill(password);
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click(); await page.waitForURL('**/portal'); await ctx.close();
    }
    {
      const { ctx, page } = await context('fr', 375); await page.goto(origin + '/agency/register?lang=fr'); await ready(page);
      await page.locator('[name="legalName"]').fill('Agence fictive de recette');
      await page.locator('[name="contactFirstName"]').fill('Lina'); await page.locator('[name="email"]').fill('partner@example.test');
      await page.locator('[name="phone"]').fill('+213555123456');
      for (const name of ['terms', 'privacy', 'accuracy']) await page.locator(`[name="${name}"]`).check();
      await checkLayout(page, 'registration-fr-375'); await page.waitForTimeout(1600);
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click(); await page.waitForURL('**/agency/register/success?**'); await ctx.close();
    }
    {
      const { ctx, page } = await context('fr', 375); await page.goto(origin + '/forgot-password'); await ready(page);
      await page.locator('[name="identifier"]').fill('agent@example.test');
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click();
      await page.getByRole('status').filter({ hasText: 'Si ce compte' }).waitFor(); await ready(page);
      await checkLayout(page, 'recovery-fr-375'); await ctx.close();
    }
    {
      const { ctx, page } = await context('fr'); await page.goto(origin + '/reset-access/' + accessToken); await ready(page);
      await page.locator('[name="password"]').fill('New-Synthetic-Passphrase-872'); await page.locator('[name="confirm"]').fill('New-Synthetic-Passphrase-872');
      await checkLayout(page, 'reset-fr'); await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click();
      await page.waitForURL('**/login?reset=complete'); await ctx.close();
      assert.ok((await pool.query('select used_at from account_access_tokens where token_hash=$1', [hashToken(accessToken)])).rows[0].used_at);
    }
    {
      const { ctx, page } = await context('ar', 375); await page.goto(origin + '/activate/' + activationToken + '?lang=ar'); await ready(page);
      await page.locator('[name="password"]').fill('Activation-Synthetic-123');
      await page.locator('[name="passwordConfirm"]').fill('Activation-Synthetic-123');
      await checkLayout(page, 'activation-ar-375');
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click();
      await page.waitForURL('**/portal'); await ctx.close();
      assert.ok((await pool.query('select used_at from account_activation_tokens where token_hash=$1', [hashToken(activationToken)])).rows[0].used_at);
    }
    {
      const { ctx, page } = await context('en', 768); await page.goto(origin + '/login'); await ready(page);
      await page.locator('[name="identifier"]').fill('first-password@example.test');
      await page.locator('[name="password"]').fill(password);
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click();
      await page.waitForURL('**/change-password'); await ready(page);
      await page.locator('[name="current"]').fill(password);
      await page.locator('[name="password"]').fill('First-Synthetic-Password-123');
      await page.locator('[name="confirm"]').fill('First-Synthetic-Password-123');
      await checkLayout(page, 'first-password-en-768');
      await page.locator('form:has([name="cf-turnstile-response"]) button[type="submit"]').click();
      await page.waitForURL('**/portal?**'); await ctx.close();
      assert.equal((await pool.query("select must_change_password from users where email='first-password@example.test'")).rows[0].must_change_password, false);
    }
    const directApi = await fetch(origin + '/api/agency/requests', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.ok([401, 403].includes(directApi.status), 'Anonymous API request must be rejected by auth or Origin checks');
    // Next's standalone loopback server normalizes the Request URL to localhost.
    const sameOriginApi = await fetch(origin + '/api/agency/requests', { method: 'POST', headers: { Origin: 'http://localhost:3197', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(sameOriginApi.status, 401, 'Passing Origin validation must still require an Agency session');
    assert.equal((await fetch(origin + '/api/login', { method: 'POST', body: '{}' })).status, 404);
    assert.equal((await fetch(origin + '/api/health')).status, 200);
    assert.deepEqual(browserErrors, []);
    fs.writeFileSync(path.join(reports, `${stamp}-bot-evidence.json`), JSON.stringify({ passed: true, scope: 'loopback; simulated Siteverify and widget', evidence }, null, 2));
    console.log(JSON.stringify({ passed: true, evidence }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
    if (serverLog) fs.closeSync(serverLog);
    if (pool) await pool.end();
    await pg.stop();
    // This is the fresh mkdtemp directory from this run, never an input path.
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
