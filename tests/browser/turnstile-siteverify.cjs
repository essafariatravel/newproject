// Local QA process preload only. Never loaded by application code or a hosted build.
const assert = require('node:assert/strict');
assert.ok(!process.env.VERCEL && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(input?.url ?? input);
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    try {
      const token = new URLSearchParams(options.body).get('response');
      if (!token?.startsWith('local-qa.')) return Response.json({ success: false });
      const data = JSON.parse(Buffer.from(token.slice(9), 'base64url').toString());
      if (data.outcome === 'unavailable') return new Response('', { status: 503 });
      if (data.outcome === 'invalid') return Response.json({ success: false });
      return Response.json({ success: true, hostname: data.hostname, action: data.action, challenge_ts: data.challenge_ts });
    } catch { return Response.json({ success: false }); }
  }
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'QA forbids remote fetch');
  return original(input, options);
};
