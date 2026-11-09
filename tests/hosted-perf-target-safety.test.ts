import { describe, expect, it } from "vitest";
import { assertHostedTestTarget } from "../perf/hosted/target-safety.js";

const known = {
  baseUrl: "https://essafaria-visa-os-capacity-test-abc123.vercel.app",
  approvedOrigin: "https://essafaria-visa-os-capacity-test-abc123.vercel.app",
  deploymentProjectId: "prj_distinctPerformanceTest123",
  approvedVercelProjectId: "prj_distinctPerformanceTest123",
  supabaseProjectRef: "abcdeffedcbaabcdefff",
  approvedSupabaseRef: "abcdeffedcbaabcdefff",
  gitBranch: "codex/isolated-capacity-test-20261109",
  vercelEnv: "preview",
  databaseSchema: "visa_os_preview",
};

describe("hosted capacity runner's independent target guard", () => {
  it("accepts only an exact, preapproved, isolated Vercel and Supabase TEST pairing", () => {
    expect(assertHostedTestTarget(known)).toBe(known.baseUrl);
  });

  it.each([
    { baseUrl: "https://visa.essafariavoyages.com" },
    { baseUrl: "https://newproject-1nf6quacs-essafaria-travel-s-projects.vercel.app" },
    { baseUrl: "http://essafaria-visa-os-capacity-test-abc123.vercel.app" },
    { baseUrl: "https://essafaria-visa-os-capacity-test-abc123.vercel.app/" },
    { baseUrl: "https://essafaria-visa-os-capacity-test-abc123.vercel.app@visa.essafariavoyages.com" },
    { baseUrl: "https://essafaria-visa-os-capacity-test-abc123.vercel.app:443" },
    { baseUrl: "https://essafaria-visa-os-capacity-test-abc123.vercel.app?redirect=https://visa.essafariavoyages.com" },
    { baseUrl: "https://essafaria-visa-os-capacity-test-abc123.vercel.app.evil.example" },
    { baseUrl: "https://ESSAFARIA-visa-os-capacity-test-abc123.vercel.app" },
    { baseUrl: "https://essafaria-visa-os-capacity-test-abc123.vercel.app%2f@evil.example" },
    { approvedOrigin: "https://visa.essafariavoyages.com", baseUrl: "https://visa.essafariavoyages.com" },
    { approvedVercelProjectId: "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp", deploymentProjectId: "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp" },
    { supabaseProjectRef: "xgetzgixalrsmuvfthpf", approvedSupabaseRef: "xgetzgixalrsmuvfthpf" },
    { supabaseProjectRef: "ridoyedqgiavgcwnpubq", approvedSupabaseRef: "ridoyedqgiavgcwnpubq" },
    { supabaseProjectRef: "vwixmkzgpmzgwbshzxji", approvedSupabaseRef: "vwixmkzgpmzgwbshzxji" },
    { gitBranch: "main" },
    { vercelEnv: "production" },
    { databaseSchema: "visa_os" },
    { approvedOrigin: "https://other.vercel.app" },
    { approvedSupabaseRef: "zzzzzzzzzzzzzzzzzzzz" },
  ])("rejects unsafe or unapproved hosted routing %#", (patch) => {
    expect(() => assertHostedTestTarget({ ...known, ...patch })).toThrow();
  });
});
