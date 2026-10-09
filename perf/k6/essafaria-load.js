import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

const PROD_HOST = "visa.essafariavoyages.com";
const EXPECTED_PROJECT = "xgetzgixalrsmuvfthpf";
const EXPECTED_SCHEMA = "visa_os_preview";

if (__ENV.PERF_ACK_NONPROD !== "YES") {
  throw new Error("PERF_ACK_NONPROD=YES is required.");
}
if (!__ENV.BASE_URL) throw new Error("BASE_URL is required.");

const BASE_URL = String(__ENV.BASE_URL).trim().replace(/\/+$/, "");
if (__ENV.VERCEL_AUTOMATION_BYPASS_SECRET && BASE_URL !== String(__ENV.CONSOLIDATION_PREVIEW_URL || "").replace(/\/+$/, "")) throw new Error("Bypass secret requires the independently recorded exact Preview origin.");
const bypassHeaders=__ENV.VERCEL_AUTOMATION_BYPASS_SECRET?{"x-vercel-protection-bypass":__ENV.VERCEL_AUTOMATION_BYPASS_SECRET}:{};
if (!/^https?:\/\//i.test(BASE_URL)) throw new Error("BASE_URL must be an HTTP(S) origin.");
const BASE_HOST = BASE_URL.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
if (BASE_HOST === PROD_HOST) {
  throw new Error("The load harness refuses the Production hostname.");
}
if (String(__ENV.DATABASE_SCHEMA || "").trim() !== EXPECTED_SCHEMA) {
  throw new Error("DATABASE_SCHEMA=visa_os_preview is required.");
}

// k6 open() resolves relative paths from this script's perf/k6 directory.
const SESSION_FILE = __ENV.PERF_SESSION_FILE || "../.runtime/sessions.json";
const sessionData = JSON.parse(open(SESSION_FILE));
const APPLICATION_MANIFEST_FILE = __ENV.PERF_APPLICATION_MANIFEST || "../.runtime/application-manifest.json";
const applicationManifest = JSON.parse(open(APPLICATION_MANIFEST_FILE));
const BUDGETS = JSON.parse(open("../budgets.json"));
const operationTrends = Object.fromEntries(
  Object.keys(BUDGETS.operations || {}).map((operation) => [operation, new Trend(`op_${operation}`, true)]),
);

const unexpectedFailure = new Rate("unexpected_failure");
const backgroundRequests = new Counter("background_requests");
const agencyLatency = new Trend("agency_latency", true);
const staffLatency = new Trend("staff_latency", true);
const accountingLatency = new Trend("accounting_latency", true);
const adminLatency = new Trend("admin_latency", true);

const profile = (__ENV.PERF_PROFILE || "smoke").toLowerCase();

function duration(value, fallback) {
  return value && /^\d+(ms|s|m|h)$/.test(value) ? value : fallback;
}

function scenarioForProfile() {
  if (profile === "normal") {
    return { executor: "ramping-vus", startVUs: 0, stages: [
      { duration: "5m", target: 50 }, { duration: "15m", target: 50 }, { duration: "2m", target: 0 },
    ], gracefulRampDown: "30s" };
  }
  if (profile === "peak") {
    // Keep the pure-HTTP mixed run below the 30-minute Staff idle policy.
    return { executor: "ramping-vus", startVUs: 0, stages: [
      { duration: "5m", target: 100 }, { duration: "20m", target: 100 }, { duration: "2m", target: 0 },
    ], gracefulRampDown: "30s" };
  }
  if (profile === "spike") {
    return { executor: "ramping-vus", startVUs: 0, stages: [
      { duration: "5m", target: 50 },
      { duration: "30s", target: 250 },
      { duration: "5m", target: 250 },
      { duration: "30s", target: 10 },
      { duration: "10m", target: 10 },
      { duration: "1m", target: 0 },
    ], gracefulRampDown: "30s" };
  }
  if (profile === "soak-agency") {
    return { executor: "constant-vus", vus: 100, duration: "60m", gracefulStop: "30s" };
  }
  if (profile === "soak-mixed-short") {
    return { executor: "constant-vus", vus: 100, duration: "25m", gracefulStop: "30s" };
  }
  if (profile === "recovery") {
    return { executor: "constant-vus", vus: 10, duration: duration(__ENV.PERF_HOLD, "10m"), gracefulStop: "30s" };
  }
  if (profile === "polling-only") {
    const vus = Number(__ENV.PERF_VUS || "100");
    if (![10, 50, 100, 250, 500, 1000].includes(vus)) {
      throw new Error("PERF_VUS must be one of 10,50,100,250,500,1000.");
    }
    return { executor: "constant-vus", vus, duration: duration(__ENV.PERF_HOLD, "10m"), gracefulStop: "30s" };
  }
  if (profile === "tier") {
    const vus = Number(__ENV.PERF_VUS || "10");
    if (![10, 50, 100, 250, 500, 1000].includes(vus)) {
      throw new Error("PERF_VUS must be one of 10,50,100,250,500,1000.");
    }
    return { executor: "ramping-vus", startVUs: 0, stages: [
      { duration: duration(__ENV.PERF_RAMP, vus <= 10 ? "1m" : vus <= 100 ? "5m" : "10m"), target: vus },
      { duration: duration(__ENV.PERF_HOLD, vus <= 10 ? "5m" : "15m"), target: vus },
      { duration: "1m", target: 0 },
    ], gracefulRampDown: "30s" };
  }
  return { executor: "ramping-vus", startVUs: 0, stages: [
    { duration: "1m", target: 10 }, { duration: "5m", target: 10 }, { duration: "1m", target: 0 },
  ], gracefulRampDown: "30s" };
}

export const options = {
  maxRedirects:0,
  scenarios: { workload: scenarioForProfile() },
  thresholds: {
    http_req_failed: [{ threshold: `rate<${BUDGETS.global.errorRateMax}`, abortOnFail: false }],
    unexpected_failure: [{ threshold: `rate<${BUDGETS.global.unexpectedFailureRateMax}`, abortOnFail: false }],
    http_req_duration: [`p(95)<${BUDGETS.global.p95Ms}`],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

function recordOperation(label, durationMs) {
  if (operationTrends[label]) operationTrends[label].add(durationMs);
}

function sessions(role) {
  const values = sessionData.roles?.[role];
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`No synthetic sessions available for ${role}.`);
  }
  return values;
}

function sessionIndexForVu(role, vu) {
  let index = 0;
  for (let candidate = 1; candidate < vu; candidate++) {
    if (personaForVu(candidate) === role) index++;
  }
  return index;
}

function tokenForVu(role, vu) {
  const values = sessions(role);
  const index = sessionIndexForVu(role, vu);
  if (index >= values.length) {
    throw new Error(`No distinct synthetic session available for ${role} VU ${vu}.`);
  }
  return values[index];
}

function cookieFor(role) {
  return tokenForVu(role, __VU);
}

function requestHeaders(role) {
  return {
    ...bypassHeaders,
    cookie: `${sessionData.cookieName || "evos_session"}=${cookieFor(role)}`,
    "user-agent": "essafaria-k6-performance-gate",
  };
}

function assertRead(res, label, trend) {
  trend.add(res.timings.duration);
  recordOperation(label, res.timings.duration);
  const ok = check(res, { [`${label}: HTTP 200`]: (r) => r.status === 200 });
  unexpectedFailure.add(!ok);
}

function get(role, path, label, trend) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: requestHeaders(role),
    tags: { operation: label, persona: role },
    redirects: 0,
  });
  assertRead(res, label, trend);
  return res;
}

function postPresence(role) {
  const headers = requestHeaders(role);
  headers.Origin = BASE_URL;
  const res = http.post(`${BASE_URL}/api/presence`, null, {
    headers,
    tags: { operation: "presence", persona: role, traffic: "background" },
  });
  backgroundRequests.add(1);
  recordOperation("presence", res.timings.duration);
  const ok = check(res, { "presence: HTTP 200": (r) => r.status === 200 });
  unexpectedFailure.add(!ok);
}

function pollNotifications(role) {
  const res = http.get(`${BASE_URL}/api/notifications`, {
    headers: requestHeaders(role),
    tags: { operation: "notifications_poll", persona: role, traffic: "background" },
  });
  backgroundRequests.add(1);
  recordOperation("notifications_poll", res.timings.duration);
  const ok = check(res, { "notifications poll: HTTP 200": (r) => r.status === 200 });
  unexpectedFailure.add(!ok);
}

function checkSession(role) {
  const res = http.get(`${BASE_URL}/api/session`, {
    headers: requestHeaders(role),
    tags: { operation: "session_check", persona: role, traffic: "background" },
  });
  backgroundRequests.add(1);
  recordOperation("session_check", res.timings.duration);
  const ok = check(res, { "session check: HTTP 200": (r) => r.status === 200 });
  unexpectedFailure.add(!ok);
}

function discoverActivityAction() {
  // Use the deployed reference instead of persisting a build-specific action ID.
  const page = http.get(`${BASE_URL}/portal`, {
    headers: requestHeaders("AGENCY_ADMIN"), redirects: 0,
    tags: { operation: "setup_activity_discovery", persona: "AGENCY_ADMIN" },
  });
  if (page.status !== 200) throw new Error("Session activity discovery requires an authenticated portal.");
  const chunks = [...new Set([...String(page.body || "").matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map(match => match[1]).filter(url => /^\/_next\/static\/[a-zA-Z0-9_./-]+\.js(?:\?[^#]*)?$/.test(url)))];
  if (!chunks.length || chunks.length > 50) throw new Error("Session activity discovery assets are missing or unbounded.");
  const references = new Set();
  for (const chunk of chunks) {
    const response = http.get(BASE_URL + chunk, {
      headers: bypassHeaders, redirects: 0, tags: { operation: "setup_activity_discovery" },
    });
    if (response.status !== 200) throw new Error("Session activity discovery asset failed.");
    for (const match of String(response.body || "").matchAll(/createServerReference\)\("([a-f0-9]{40,64})"(?:(?!createServerReference)[\s\S]){0,350}?"touchSessionAction"/g)) {
      references.add(match[1]);
    }
  }
  if (references.size !== 1) throw new Error("Session activity action reference is missing or ambiguous.");
  return [...references][0];
}

function recordUserInteraction(role, actionId) {
  if (!/^[a-f0-9]{40,64}$/.test(actionId || "")) throw new Error("Verified session activity action required.");
  const route = role === "AGENCY_USER" || role === "AGENCY_ADMIN" ? "/portal" : "/admin";
  const response = http.post(BASE_URL + route, "[]", {
    headers: { ...requestHeaders(role), Origin: BASE_URL, "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8" },
    redirects: 0, tags: { operation: "session_activity", persona: role, traffic: "interaction" },
  });
  recordOperation("session_activity", response.timings.duration);
  const accepted = check(response, {
    "user interaction: current session accepted": result => result.status === 200 &&
      String(result.body || "").split("\n").some(line => {
        const packet = line.match(/^[a-f0-9]+:(\{.*\})$/);
        if (!packet) return false;
        try { const value = JSON.parse(packet[1]); return Object.keys(value).length === 1 && value.expired === false; }
        catch { return false; }
      }),
  });
  unexpectedFailure.add(!accepted);
  if (!accepted) throw new Error("Session activity failed; stop this active navigation rather than masking expiry.");
}

const AGENCY_USER_PATHS = [
  ["/portal", "agency_dashboard"],
  ["/portal/applications", "agency_applications"],
  ["/portal/applications?q=PERF", "agency_search"],
  ["/portal/applications?queue=active&per=50", "agency_active_queue"],
  ["/portal/notifications", "agency_notifications"],
  ["/portal/communications", "agency_communications"],
  ["/portal/documents", "agency_documents"],
  ["/portal/wallet", "agency_wallet"],
];

const AGENCY_ADMIN_PATHS = [
  ["/portal", "agency_admin_dashboard"],
  ["/portal/applications", "agency_admin_applications"],
  ["/portal/applications?q=PERF&per=50", "agency_admin_search"],
  ["/portal/applications/new", "agency_new_application"],
  ["/portal/wallet", "agency_admin_wallet"],
  ["/portal/profile", "agency_profile"],
  ["/portal/notifications", "agency_admin_notifications"],
];

const VISA_AGENT_PATHS = [
  ["/admin", "staff_dashboard"],
  ["/admin/applications", "staff_applications"],
  ["/admin/applications?q=PERF&per=50", "staff_search"],
  ["/admin/applications?assigned=unassigned&per=50", "staff_unassigned"],
  ["/admin/applications?aging=7&per=50", "staff_aging"],
  ["/admin/documents", "staff_documents"],
  ["/admin/communications", "staff_communications"],
  ["/admin/notifications", "staff_notifications"],
];

const ACCOUNTING_PATHS = [
  ["/admin", "accounting_dashboard"],
  ["/admin/billing", "accounting_billing"],
  ["/admin/billing?page=2", "accounting_billing_deep_page"],
  ["/admin/reports", "accounting_reports"],
  ["/admin/reports?from=2026-01-01&to=2026-12-31", "accounting_reports_date_filter"],
  ["/admin/audit", "accounting_audit"],
  ["/admin/applications", "accounting_applications"],
];

const SUPER_ADMIN_PATHS = [
  ["/admin", "admin_dashboard"],
  ["/admin/agencies", "admin_agencies"],
  ["/admin/users", "admin_users"],
  ["/admin/reports", "admin_reports"],
  ["/admin/reports?from=2026-01-01&to=2026-12-31", "admin_reports_date_filter"],
  ["/admin/audit", "admin_audit"],
  ["/admin/config/visa-types", "admin_visa_types"],
];

function personaForVu(vu) {
  if (profile === "soak-agency") return "AGENCY_USER";
  // 37 is coprime with 100, so each 100-VU block exactly matches the target mix
  // while small smoke tiers are distributed instead of becoming all Agency users.
  const slot = ((vu * 37) % 100) + 1;
  if (slot <= 45) return "AGENCY_USER";
  if (slot <= 65) return "AGENCY_ADMIN";
  if (slot <= 90) return "VISA_AGENT";
  if (slot <= 97) return "ACCOUNTING";
  return "SUPER_ADMIN";
}

function pickPersona() {
  return personaForVu(__VU);
}

function maximumVus() {
  if (profile === "normal") return 50;
  if (profile === "peak") return 100;
  if (profile === "spike") return 250;
  if (profile === "soak-agency" || profile === "soak-mixed-short") return 100;
  if (profile === "recovery") return 10;
  if (profile === "polling-only" || profile === "tier") return Number(__ENV.PERF_VUS || (profile === "polling-only" ? "100" : "10"));
  return 10;
}

function assertUniqueSessionCapacity() {
  const required = {};
  for (let vu = 1; vu <= maximumVus(); vu++) {
    const role = personaForVu(vu);
    required[role] = (required[role] || 0) + 1;
  }
  for (const [role, count] of Object.entries(required)) {
    if (sessions(role).length < count) {
      throw new Error(`Need at least ${count} distinct ${role} sessions for this profile; found ${sessions(role).length}.`);
    }
  }
}

assertUniqueSessionCapacity();

function validateSyntheticSessions() {
  for (let vu = 1; vu <= maximumVus(); vu++) {
    const role = personaForVu(vu);
    const token = tokenForVu(role, vu);
    const res = http.get(`${BASE_URL}/api/session`, {
      headers: {
        ...bypassHeaders,
        cookie: `${sessionData.cookieName || "evos_session"}=${token}`,
        "user-agent": "essafaria-k6-session-preflight",
      },
      redirects: 0,
      tags: { operation: "setup_session_preflight", persona: role },
    });
    if (res.status !== 200) {
      throw new Error(
        `Synthetic session preflight failed for ${role} VU ${vu} with HTTP ${res.status}. ` +
        "Regenerate fresh Preview performance sessions before running the tier."
      );
    }
  }
}

function pickPath(paths) {
  return paths[(__ITER + __VU) % paths.length];
}

const runtime = {};

function extractApplicationIds(body, prefix) {
  const regex = new RegExp(prefix.replace(/\\//g, "\\\\/") + "/([0-9a-fA-F-]{36})", "g");
  const ids = [];
  let match;
  while ((match = regex.exec(body)) !== null && ids.length < 50) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

function discoverApplications(role, path, prefix) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: requestHeaders(role),
    redirects: 0,
    tags: { operation: "setup_discovery", persona: role },
  });
  if (res.status !== 200) throw new Error(`Application discovery ${path} returned HTTP ${res.status}.`);
  return extractApplicationIds(res.body || "", prefix);
}

export function setup() {
  validateSyntheticSessions();

  const token = sessions("SUPER_ADMIN")[0];
  const res = http.get(`${BASE_URL}/api/health`, {
    headers: {
      ...bypassHeaders,
      cookie: `${sessionData.cookieName || "evos_session"}=${token}`,
      "user-agent": "essafaria-k6-safety-preflight",
    },
    redirects: 0,
  });
  if (res.status !== 200) throw new Error(`Authenticated health preflight returned HTTP ${res.status}.`);
  const health = res.json();
  if (health?.status !== "healthy" || health?.service !== "essafaria-visa-os") {
    throw new Error("Preview health preflight is not ready.");
  }

  if (profile === "polling-only") {
    return { startedAt: Date.now(), expectedProject: EXPECTED_PROJECT, agencyApplicationIds: [], staffApplicationIds: [] };
  }

  const agencyApplicationIds = Array.isArray(applicationManifest.agencyApplicationIds)
    ? applicationManifest.agencyApplicationIds.filter((id) => typeof id === "string")
    : [];
  const staffApplicationIds = Array.isArray(applicationManifest.staffApplicationIds)
    ? applicationManifest.staffApplicationIds.filter((id) => typeof id === "string")
    : [];
  const requestedDatasetId = String(__ENV.PERF_DATASET_ID || "").trim().toLowerCase();
  const manifestDatasetId = String(applicationManifest.datasetId || "").trim().toLowerCase();
  if (requestedDatasetId && manifestDatasetId !== requestedDatasetId) {
    throw new Error("Application manifest dataset does not match PERF_DATASET_ID.");
  }
  if (agencyApplicationIds.length === 0) throw new Error("No synthetic Agency application links discovered. Seed scale data first.");
  if (staffApplicationIds.length === 0) throw new Error("No synthetic Staff application links discovered. Seed scale data first.");

  return {
    startedAt: Date.now(),
    expectedProject: EXPECTED_PROJECT,
    agencyApplicationIds,
    staffApplicationIds,
    activityAction: discoverActivityAction(),
  };
}
export default function (setupData) {
  const role = pickPersona();
  let paths;
  let trend;
  if (role === "AGENCY_USER") { paths = AGENCY_USER_PATHS; trend = agencyLatency; }
  else if (role === "AGENCY_ADMIN") { paths = AGENCY_ADMIN_PATHS; trend = agencyLatency; }
  else if (role === "VISA_AGENT") { paths = VISA_AGENT_PATHS; trend = staffLatency; }
  else if (role === "ACCOUNTING") { paths = ACCOUNTING_PATHS; trend = accountingLatency; }
  else { paths = SUPER_ADMIN_PATHS; trend = adminLatency; }

  if (!runtime[__VU]) runtime[__VU] = { lastNotification: 0, lastPresence: 0, lastSession: 0, lastInteraction: 0 };
  const state = runtime[__VU];
  const now = Date.now();

  // Navigating users produce trusted pointer/keyboard activity in the real UI.
  // Model that existing call at its 60s cadence; passive polling must stay idle.
  if (profile !== "polling-only" && now - state.lastInteraction >= 60000) {
    recordUserInteraction(role, setupData.activityAction);
    state.lastInteraction = now;
  }

  if (now - state.lastNotification >= 15000) {
    pollNotifications(role);
    state.lastNotification = now;
  }
  if (now - state.lastPresence >= 45000) {
    postPresence(role);
    state.lastPresence = now;
  }
  if (now - state.lastSession >= 60000) {
    checkSession(role);
    state.lastSession = now;
  }

  if (profile === "polling-only") {
    sleep(1);
    return;
  }

  // Exercise dossier details regularly, while keeping this profile read-heavy.
  if (__ITER % 4 === 0 && (role === "AGENCY_USER" || role === "AGENCY_ADMIN")) {
    const ids = setupData.agencyApplicationIds || [];
    const id = ids[(__ITER + __VU) % ids.length];
    get(role, `/portal/applications/${id}`, "agency_dossier_detail", trend);
  } else if (__ITER % 4 === 0 && (role === "VISA_AGENT" || role === "SUPER_ADMIN")) {
    const ids = setupData.staffApplicationIds || [];
    const id = ids[(__ITER + __VU) % ids.length];
    get(role, `/admin/applications/${id}`, "staff_dossier_detail", trend);
  } else {
    const [path, label] = pickPath(paths);
    get(role, path, label, trend);
  }
  sleep(2 + Math.random() * 4);
}

export function handleSummary(data) {
  const target = __ENV.PERF_SUMMARY || `perf/results/k6-${profile}-summary.json`;
  return {
    stdout: JSON.stringify({
      profile,
      baseUrl: BASE_URL,
      checks: data.metrics.checks?.values || {},
      httpReqFailed: data.metrics.http_req_failed?.values || {},
      httpReqDuration: data.metrics.http_req_duration?.values || {},
      iterations: data.metrics.iterations?.values || {},
      backgroundRequests: data.metrics.background_requests?.values || {},
    }, null, 2) + "\n",
    [target]: JSON.stringify(data, null, 2),
  };
}
