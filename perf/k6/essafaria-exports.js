import http from "k6/http";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";

const PROD_HOST = "visa.essafariavoyages.com";
const EXPECTED_SCHEMA = "visa_os_preview";
if (__ENV.PERF_ACK_NONPROD !== "YES") throw new Error("PERF_ACK_NONPROD=YES is required.");
if (!__ENV.BASE_URL) throw new Error("BASE_URL is required.");

const BASE_URL = String(__ENV.BASE_URL).trim().replace(/\/+$/, "");
const host = BASE_URL.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
if (host === PROD_HOST) throw new Error("Export harness refuses Production.");

const sessionData = JSON.parse(open(__ENV.PERF_SESSION_FILE || "./perf/.runtime/sessions.json"));
const BUDGETS = JSON.parse(open("../budgets.json"));
const operationTrends = {
  applications_export_csv: new Trend("op_applications_export_csv", true),
  applications_export_xlsx: new Trend("op_applications_export_xlsx", true),
  reports_export_csv: new Trend("op_reports_export_csv", true),
  reports_export_xlsx: new Trend("op_reports_export_xlsx", true),
};
const tokens = sessionData.roles?.SUPER_ADMIN;
if (!Array.isArray(tokens) || !tokens.length) throw new Error("SUPER_ADMIN synthetic session is required.");

const exportBytes = new Trend("export_bytes");
const exportLatency = new Trend("export_latency", true);
const exportFailure = new Rate("export_failure");
const iterations = Number(__ENV.PERF_EXPORT_ITERATIONS || "8");
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) throw new Error("PERF_EXPORT_ITERATIONS must be 1..100.");

export const options = {
  scenarios: {
    exports: {
      executor: "shared-iterations",
      vus: Math.min(4, tokens.length),
      iterations,
      maxDuration: "10m"
    }
  },
  thresholds: {
    export_failure: [`rate<${BUDGETS.global.errorRateMax}`],
    export_latency: ["p(95)<5000", "p(99)<10000"]
  },
  summaryTrendStats: ["avg","med","p(90)","p(95)","p(99)","max"]
};

function headers() {
  return {
    cookie: `${sessionData.cookieName || "evos_session"}=${tokens[(__VU - 1) % tokens.length]}`,
    "user-agent": "essafaria-k6-export-gate"
  };
}

function hit(path, operation) {
  const res = http.get(`${BASE_URL}${path}`, { headers: headers(), redirects: 0, tags: { operation } });
  exportLatency.add(res.timings.duration, { operation });
  operationTrends[operation]?.add(res.timings.duration);
  const length = typeof res.body === "string" ? res.body.length : 0;
  exportBytes.add(length, { operation });
  const ok = check(res, { [`${operation}: HTTP 200`]: (r) => r.status === 200 });
  exportFailure.add(!ok, { operation });
}

export function setup() {
  const res = http.get(`${BASE_URL}/api/health`, { headers: headers(), redirects: 0 });
  if (res.status !== 200) throw new Error(`Health preflight returned ${res.status}.`);
  const health = res.json();
  if (health?.deployment?.environment === "production") throw new Error("Export harness refuses Production deployment.");
  if (health?.schema?.name !== EXPECTED_SCHEMA || health?.database?.intendedSupabaseProject !== true || health?.ok !== true) {
    throw new Error("Export harness requires healthy ESSAFARIA Preview.");
  }
}

export default function () {
  const slot = (__ITER + __VU) % 4;
  if (slot === 0) hit("/api/admin/applications/export?q=PERF", "applications_export_csv");
  else if (slot === 1) hit("/api/admin/applications/export?q=PERF&format=xlsx", "applications_export_xlsx");
  else if (slot === 2) hit("/api/admin/reports/export?from=2026-01-01&to=2026-12-31", "reports_export_csv");
  else hit("/api/admin/reports/export?from=2026-01-01&to=2026-12-31&format=xlsx", "reports_export_xlsx");
}

export function handleSummary(data) {
  const target = __ENV.PERF_SUMMARY || "perf/results/k6-exports-summary.json";
  return { [target]: JSON.stringify(data, null, 2) };
}
