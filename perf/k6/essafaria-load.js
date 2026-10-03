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
if (!/^https?:\/\//i.test(BASE_URL)) throw new Error("BASE_URL must be an HTTP(S) origin.");
const BASE_HOST = BASE_URL.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
if (BASE_HOST === PROD_HOST) {
  throw new Error("The load harness refuses the Production hostname.");
}

const SESSION_FILE = __ENV.PERF_SESSION_FILE || "./perf/.runtime/sessions.json";
const sessionData = JSON.parse(open(SESSION_FILE));

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
      { duration: "30s", target: 50 },
      { duration: "10m", target: 50 },
      { duration: "1m", target: 0 },
    ], gracefulRampDown: "30s" };
  }
  if (profile === "soak-agency") {
    return { executor: "constant-vus", vus: 100, duration: "60m", gracefulStop: "30s" };
  }
  if (profile === "soak-mixed-short") {
    return { executor: "constant-vus", vus: 100, duration: "25m", gracefulStop: "30s" };
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
  scenarios: { workload: scenarioForProfile() },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: false }],
    unexpected_failure: [{ threshold: "rate<0.01", abortOnFail: false }],
    http_req_duration: ["p(95)<2000"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

function sessions(role) {
  const values = sessionData.roles?.[role];
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`No synthetic sessions available for ${role}.`);
  }
  return values;
}

function cookieFor(role) {
  const values = sessions(role);
  return values[(__VU - 1) % values.length];
}

function requestHeaders(role) {
  return {
    cookie: `${sessionData.cookieName || "evos_session"}=${cookieFor(role)}`,
    "user-agent": "essafaria-k6-performance-gate",
  };
}

function assertRead(res, label, trend) {
  trend.add(res.timings.duration);
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
  const ok = check(res, { "presence: HTTP 200": (r) => r.status === 200 });
  unexpectedFailure.add(!ok);
}

function pollNotifications(role) {
  const res = http.get(`${BASE_URL}/api/notifications`, {
    headers: requestHeaders(role),
    tags: { operation: "notifications_poll", persona: role, traffic: "background" },
  });
  backgroundRequests.add(1);
  const ok = check(res, { "notifications poll: HTTP 200": (r) => r.status === 200 });
  unexpectedFailure.add(!ok);
}

function checkSession(role) {
  const res = http.get(`${BASE_URL}/api/session`, {
    headers: requestHeaders(role),
    tags: { operation: "session_check", persona: role, traffic: "background" },
  });
  backgroundRequests.add(1);
  const ok = check(res, { "session check: HTTP 200": (r) => r.status === 200 });
  unexpectedFailure.add(!ok);
}

const AGENCY_USER_PATHS = [
  ["/portal", "agency_dashboard"],
  ["/portal/applications", "agency_applications"],
  ["/portal/notifications", "agency_notifications"],
  ["/portal/communications", "agency_communications"],
  ["/portal/documents", "agency_documents"],
  ["/portal/wallet", "agency_wallet"],
];

const AGENCY_ADMIN_PATHS = [
  ["/portal", "agency_admin_dashboard"],
  ["/portal/applications", "agency_admin_applications"],
  ["/portal/applications/new", "agency_new_application"],
  ["/portal/wallet", "agency_admin_wallet"],
  ["/portal/profile", "agency_profile"],
  ["/portal/notifications", "agency_admin_notifications"],
];

const VISA_AGENT_PATHS = [
  ["/admin", "staff_dashboard"],
  ["/admin/applications", "staff_applications"],
  ["/admin/documents", "staff_documents"],
  ["/admin/communications", "staff_communications"],
  ["/admin/notifications", "staff_notifications"],
];

const ACCOUNTING_PATHS = [
  ["/admin", "accounting_dashboard"],
  ["/admin/billing", "accounting_billing"],
  ["/admin/reports", "accounting_reports"],
  ["/admin/audit", "accounting_audit"],
  ["/admin/applications", "accounting_applications"],
];

const SUPER_ADMIN_PATHS = [
  ["/admin", "admin_dashboard"],
  ["/admin/agencies", "admin_agencies"],
  ["/admin/users", "admin_users"],
  ["/admin/reports", "admin_reports"],
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
  if (profile === "tier") return Number(__ENV.PERF_VUS || "10");
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

function pickPath(paths) {
  return paths[(__ITER + __VU) % paths.length];
}

const runtime = {};

export function setup() {
  const token = sessions("SUPER_ADMIN")[0];
  const res = http.get(`${BASE_URL}/api/health`, {
    headers: {
      cookie: `${sessionData.cookieName || "evos_session"}=${token}`,
      "user-agent": "essafaria-k6-safety-preflight",
    },
    redirects: 0,
  });
  if (res.status !== 200) throw new Error(`Authenticated health preflight returned HTTP ${res.status}.`);
  const health = res.json();
  if (health?.deployment?.environment === "production") throw new Error("Harness refuses a Production deployment.");
  if (health?.schema?.name !== EXPECTED_SCHEMA) throw new Error("Harness requires visa_os_preview.");
  if (health?.database?.intendedSupabaseProject !== true) throw new Error("Harness requires the recorded Supabase project.");
  if (health?.ok !== true) throw new Error("Preview health preflight is not ready.");
  if (health?.database?.host && !String(health.database.host).includes("supabase")) {
    throw new Error("Unexpected database host in authenticated health report.");
  }
  return { startedAt: Date.now(), expectedProject: EXPECTED_PROJECT };
}

export default function () {
  const role = pickPersona();
  let paths;
  let trend;
  if (role === "AGENCY_USER") { paths = AGENCY_USER_PATHS; trend = agencyLatency; }
  else if (role === "AGENCY_ADMIN") { paths = AGENCY_ADMIN_PATHS; trend = agencyLatency; }
  else if (role === "VISA_AGENT") { paths = VISA_AGENT_PATHS; trend = staffLatency; }
  else if (role === "ACCOUNTING") { paths = ACCOUNTING_PATHS; trend = accountingLatency; }
  else { paths = SUPER_ADMIN_PATHS; trend = adminLatency; }

  if (!runtime[__VU]) runtime[__VU] = { lastNotification: 0, lastPresence: 0, lastSession: 0 };
  const state = runtime[__VU];
  const now = Date.now();

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

  const [path, label] = pickPath(paths);
  get(role, path, label, trend);
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
