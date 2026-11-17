import { afterEach, describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { createSession } from "./helpers/authenticated-session";
import { userByEmail } from "./helpers/fixtures";
import { GET, POST, DELETE } from "../src/app/api/push/route";
import { POST as SEND_TEST } from "../src/app/api/push/test/route";

suiteSetup();

const base = "https://visa.essafariavoyages.com/api/push";
async function useIdentity(email: string) {
  const user = await userByEmail(email);
  const session = await createSession(user.id);
  request.cookie = session.token;
}
function req(method: "POST"|"DELETE", origin = "https://visa.essafariavoyages.com") {
  return new Request(base, {
    method, headers: { "Origin": origin, "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: "https://web.push.apple.com/abc" }),
  });
}
afterEach(() => { request.cookie = ""; });

describe("Web Push API: authenticated staff only", () => {
  it("rejects anonymous device listings and mutations", async () => {
    request.cookie = "";
    expect((await GET()).status).toBe(403);
    expect((await POST(req("POST"))).status).toBe(403);
    expect((await DELETE(req("DELETE"))).status).toBe(403);
    expect((await SEND_TEST(req("POST"))).status).toBe(403);
  });

  it("rejects all agency user push endpoints with HTTP 403", async () => {
    await useIdentity("a-user@test.example");
    expect((await GET()).status).toBe(403);
    expect((await POST(req("POST"))).status).toBe(403);
    expect((await DELETE(req("DELETE"))).status).toBe(403);
    expect((await SEND_TEST(req("POST"))).status).toBe(403);
  });

  it("rejects origin-forged requests even for valid internal staff", async () => {
    await useIdentity("admin@test.example");
    expect((await POST(req("POST", "https://evil.example"))).status).toBe(403);
    expect((await DELETE(req("DELETE", "https://evil.example"))).status).toBe(403);
    expect((await SEND_TEST(req("POST", "https://evil.example"))).status).toBe(403);
  });

  it("serves only own device metadata to valid staff account", async () => {
    await useIdentity("admin@test.example");
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ devices: 0, registeredHashes: [] });
    expect(data).not.toHaveProperty("privateKey");
  });
});
