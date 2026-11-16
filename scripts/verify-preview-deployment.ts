import { assertApprovedPreviewRedirect, validatePreviewOrigin } from "./lib/preview-verifier-target";

/**
 * Verify a deployed Preview without exposing secrets or business identifiers.
 *
 * Required:
 *   PREVIEW_BASE_URL=https://...vercel.app
 *   HEALTHCHECK_TOKEN                - verifies protected operator endpoints
 *   EXPECTED_RELEASE_SHA             - verifies deep-health release metadata
 *
 * Optional:
 *   VERCEL_AUTOMATION_BYPASS_SECRET - for Vercel Deployment Protection
 */
const baseUrl = process.env.PREVIEW_BASE_URL?.trim();
if (!baseUrl) {
  throw new Error("PREVIEW_BASE_URL is required.");
}

const parsed = validatePreviewOrigin(baseUrl);
const hostname = parsed.hostname.toLowerCase();
if (process.env.TARGET_ENVIRONMENT && process.env.TARGET_ENVIRONMENT !== "preview") {
  throw new Error("Refusing: deployment verification is Preview-only.");
}

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const healthToken = process.env.HEALTHCHECK_TOKEN?.trim();
const expectedReleaseSha = process.env.EXPECTED_RELEASE_SHA?.trim();

function headers(extra: Record<string, string> = {}): HeadersInit {
  const out: Record<string, string> = { ...extra };
  if (bypass) {
    out["x-vercel-protection-bypass"] = bypass;
    out["x-vercel-set-bypass-cookie"] = "true";
  }
  return out;
}

async function request(path: string, extra: Record<string, string> = {}) {
  let target = new URL(path, parsed);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    assertApprovedPreviewRedirect(target, hostname);

    const response = await fetch(target, {
      redirect: "manual",
      headers: headers(extra),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Preview returned a redirect without a Location header.");
      }
      if (redirectCount === 3) {
        throw new Error("Preview verification exceeded the redirect limit.");
      }
      target = new URL(location, target);
      continue;
    }

    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { response, text, json };
  }

  throw new Error("Preview verification redirect loop.");
}

function assertNoSensitiveDiagnostics(value: unknown, label: string) {
  const serialized = JSON.stringify(value ?? "");
  const forbidden = [
    /postgres(?:ql)?:\/\//i,
    /authorization/i,
    /cookie/i,
    /password/i,
    /service[_-]?role/i,
    /database[_-]?url/i,
    /signed[_-]?url/i,
    /passport/i,
    /storage[_-]?key/i,
    /request[_-]?body/i,
    /response[_-]?body/i,
    /@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(serialized)) {
      throw new Error(`${label} exposed a forbidden diagnostic field/value.`);
    }
  }
}

async function verifyPublic(path: string) {
  const { response, json } = await request(path);
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `${path} is blocked by deployment protection. Configure VERCEL_AUTOMATION_BYPASS_SECRET for Preview verification.`,
    );
  }
  if (response.status !== 200) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }
  if (!json || typeof json !== "object") {
    throw new Error(`${path} returned an unexpected health payload.`);
  }

  const payload = json as Record<string, unknown>;
  // Preview safety comes from the validated origin and same-host redirect rules.
  // Release identity is checked only through protected deep health.
  if (payload.status !== "healthy" || payload.service !== "essafaria-visa-os") {
    throw new Error(`${path} returned an unexpected health payload.`);
  }
  if (JSON.stringify(Object.keys(payload).sort()) !== JSON.stringify(["service", "status"])) {
    throw new Error(`${path} public health payload is no longer minimal.`);
  }

  if (!response.headers.get("cache-control")?.toLowerCase().includes("no-store")) {
    throw new Error(`${path} must disable caching.`);
  }
  assertNoSensitiveDiagnostics(json, path);
  return { path, status: response.status, result: "pass" };
}

async function verifyInternal(path: string) {
  if (!healthToken) {
    throw new Error("HEALTHCHECK_TOKEN is required for protected Preview runtime verification.");
  }

  if (Buffer.byteLength(healthToken, "utf8") < 32) {
    throw new Error("HEALTHCHECK_TOKEN supplied to verification is weaker than 32 bytes.");
  }
  const unauthenticated = await request(path);
  if (unauthenticated.response.status !== 401) {
    throw new Error(
      `${path} must reject missing operator authorization with 401; received ${unauthenticated.response.status}.`,
    );
  }

  const authorized = await request(path, {
    authorization: `Bearer ${healthToken}`,
  });
  if (authorized.response.status !== 200) {
    throw new Error(`${path} authorized request returned HTTP ${authorized.response.status}.`);
  }
  assertNoSensitiveDiagnostics(authorized.json, path);

  if (path.endsWith("/deep")) {
    const body = authorized.json as {
      releaseSha?: string | null;
      releaseProtections?: { status?: string };
    };
    if (body.releaseSha !== expectedReleaseSha) {
      throw new Error("Deep health release SHA does not match EXPECTED_RELEASE_SHA.");
    }
    if (body.releaseProtections?.status !== "healthy") {
      throw new Error("Deep health reports release protections are not healthy.");
    }
  }

  if (path.endsWith("/integrity")) {
    const body = authorized.json as {
      status?: string;
      cutoverAt?: string | null;
    };
    if (body.status === "violation" || body.status === "unavailable") {
      throw new Error(`Integrity endpoint reports ${body.status}.`);
    }
    if (!body.cutoverAt) {
      throw new Error("Integrity endpoint did not report its effective cutoverAt.");
    }
  }

  return {
    path,
    status: authorized.response.status,
    result: "pass",
    ...(path.endsWith("/deep") ? { releaseSha: (authorized.json as { releaseSha: string }).releaseSha } : {}),
  };
}

async function main() {
  const publicResults = [];
  for (const path of ["/api/health/live", "/api/health/ready", "/api/health"]) {
    publicResults.push(await verifyPublic(path));
  }

  if (!healthToken) {
    throw new Error("HEALTHCHECK_TOKEN is required for protected Preview runtime verification.");
  }
  if (!expectedReleaseSha) {
    throw new Error("EXPECTED_RELEASE_SHA is required for protected release verification.");
  }

  const internalResults = [];
  for (const path of [
    "/api/internal/health/deep",
    "/api/internal/health/database",
    "/api/internal/health/integrity",
  ]) {
    internalResults.push(await verifyInternal(path));
  }

  process.stdout.write(
    `${JSON.stringify({
      gate: "preview-runtime-verification",
      status: "pass",
      host: parsed.hostname,
      public: publicResults,
      internal: internalResults,
      releaseVerified: true,
      releaseSha: internalResults.find((item) => item.path.endsWith("/deep"))?.releaseSha,
      generatedAt: new Date().toISOString(),
    })}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Preview runtime verification failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
