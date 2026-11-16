import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTION_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getSessionUser: vi.fn(),
  hashToken: vi.fn((token: string) => `hash:${token}`),
  touchPresence: vi.fn(),
  onlineUserCount: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/crypto", () => ({ hashToken: mocks.hashToken }));
vi.mock("@/lib/presence", () => ({
  touchPresence: mocks.touchPresence,
  onlineUserCount: mocks.onlineUserCount,
}));

import { POST } from "@/app/api/presence/route";

const endpoint = "https://visa.essafariavoyages.com/api/presence";
const origin = "https://visa.essafariavoyages.com";
const staff = { id: "staff-1", agencyId: null, role: "SUPER_ADMIN", mustChangePassword: false };
const agency = { id: "agency-1", agencyId: "tenant-1", role: "AGENCY_USER", mustChangePassword: false };

function setCookies(values: Record<string, string>) {
  mocks.cookies.mockResolvedValue({
    get: (name: string) => values[name] ? { value: values[name] } : undefined,
  });
}

function request(requestOrigin = origin) {
  return new Request(endpoint, { method: "POST", headers: { origin: requestOrigin } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue(staff);
  mocks.touchPresence.mockResolvedValue(undefined);
  mocks.onlineUserCount.mockResolvedValue(2);
});
afterEach(() => vi.unstubAllEnvs());

describe("presence route — Production cookie and cross-browser visibility", () => {
  it("recognizes the secure Production cookie and displays distinct online users to Staff", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCookies({ [PRODUCTION_SESSION_COOKIE]: "prod-session", [SESSION_COOKIE]: "obsolete-session" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ online: 2 });
    expect(mocks.touchPresence).toHaveBeenCalledWith(staff.id, "hash:prod-session");
    expect(mocks.onlineUserCount).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("records an agency's secure Production session without revealing the staff-only count", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getSessionUser.mockResolvedValue(agency);
    setCookies({ [PRODUCTION_SESSION_COOKIE]: "agency-prod-session" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(mocks.touchPresence).toHaveBeenCalledWith(agency.id, "hash:agency-prod-session");
    expect(mocks.onlineUserCount).not.toHaveBeenCalled();
  });

  it("retains the legacy cookie outside Production and as a Production fallback", async () => {
    vi.stubEnv("NODE_ENV", "test");
    setCookies({ [SESSION_COOKIE]: "preview-session" });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.touchPresence).toHaveBeenLastCalledWith(staff.id, "hash:preview-session");
    vi.stubEnv("NODE_ENV", "production");
    setCookies({ [SESSION_COOKIE]: "legacy-session" });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.touchPresence).toHaveBeenLastCalledWith(staff.id, "hash:legacy-session");
  });

  it("rejects unauthenticated or cross-origin requests without recording presence", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCookies({});
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("https://attacker.example"))).status).toBe(403);
    expect(mocks.touchPresence).not.toHaveBeenCalled();
  });

  it("keeps a database presence failure isolated from session and dossier operations", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCookies({ [PRODUCTION_SESSION_COOKIE]: "prod-session" });
    mocks.touchPresence.mockRejectedValueOnce(new Error("presence store unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.onlineUserCount).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
