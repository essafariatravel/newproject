import { describe, expect, it,vi } from "vitest";
import { transactionalEmailReadiness,sendSecureAccessEmail } from "@/lib/transactional-email";

describe("transactional email readiness", () => {
  it("fails safely on rejection, timeout and malformed acceptance without logging secrets",async()=>{
    const previous={...process.env};const fetchSpy=vi.spyOn(globalThis,"fetch");const logs=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    Object.assign(process.env,{TRANSACTIONAL_EMAIL_PROVIDER:"brevo",BREVO_API_KEY:"synthetic-key-never-log",TRANSACTIONAL_EMAIL_FROM:"sender@example.test",TRANSACTIONAL_EMAIL_APP_ORIGIN:"https://visa.example.test"});
    const send=()=>sendSecureAccessEmail({to:"private-recipient@example.test",purpose:"PASSWORD_RESET",path:"/reset-password?token=synthetic-private-token",expiresAt:new Date(Date.now()+60000)});
    try{
      fetchSpy.mockResolvedValueOnce(new Response('{}',{status:503}));expect(await send()).toBe(false);
      fetchSpy.mockRejectedValueOnce(new DOMException("synthetic-private-token","TimeoutError"));expect(await send()).toBe(false);
      fetchSpy.mockResolvedValueOnce(new Response('{}',{status:201}));expect(await send()).toBe(false);
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({messageId:"synthetic-accepted-message"}),{status:201}));expect(await send()).toBe(true);
      expect(fetchSpy.mock.calls.every(([,options])=>options?.redirect==="error")).toBe(true);
      expect(JSON.stringify(logs.mock.calls)).not.toMatch(/synthetic-key|private-recipient|synthetic-private-token/);
    }finally{fetchSpy.mockRestore();logs.mockRestore();for(const name of Object.keys(process.env))if(!(name in previous))delete process.env[name];Object.assign(process.env,previous);}
  });
  it("fails closed when no provider is configured", () => {
    expect(transactionalEmailReadiness({ NODE_ENV: "test" })).toEqual({
      ready: false,
      provider: "disabled",
      missing: ["TRANSACTIONAL_EMAIL_PROVIDER=brevo"],
    });
  });

  it("requires the Brevo secret, verified sender and secure portal origin", () => {
    const result = transactionalEmailReadiness({
      NODE_ENV: "test",
      TRANSACTIONAL_EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "test-only",
      TRANSACTIONAL_EMAIL_FROM: "noreply@example.test",
      TRANSACTIONAL_EMAIL_APP_ORIGIN: "https://visa.example.test",
    });
    expect(result).toEqual({ ready: true, provider: "brevo", missing: [] });
  });
  it("rejects an insecure or malformed portal origin", () => {
    for (const origin of ["http://visa.example.test", "invalid", "https://user:password@visa.example.test"]) {
      expect(transactionalEmailReadiness({ TRANSACTIONAL_EMAIL_PROVIDER:"brevo",BREVO_API_KEY:"test-only",TRANSACTIONAL_EMAIL_FROM:"noreply@example.test",TRANSACTIONAL_EMAIL_APP_ORIGIN:origin }).ready).toBe(false);
    }
  });
});
