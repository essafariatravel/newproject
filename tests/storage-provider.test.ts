import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { storageProvider } from "@/lib/storage";

// Exercise the existing provider against real HTTP without permitting a test
// endpoint or an endpoint override in production code. Only fake keys are used.
const realFetch = globalThis.fetch;
const realTimeout = AbortSignal.timeout.bind(AbortSignal);
const approvedOrigin = "https://xgetzgixalrsmuvfthpf.supabase.co";
const fakeServiceKey = "synthetic-storage-test-key";
const fakeSecretKey = ['sb', 'secret', 'synthetic_private_qualification'].join('_');
let expectedOrigin=approvedOrigin;
const objectKey = "visa-documents/app-1/doc-1";
const objects = new Map<string, { data: Buffer; mimeType: string }>();
let override: ((req: IncomingMessage, res: ServerResponse) => boolean) | undefined;
let serviceOrigin: string;
let sinkOrigin: string;
let requests = 0;
let sinkRequests = 0;

function json(res: ServerResponse, status: number, code: string) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ code, message: "synthetic failure" }));
}

const service = createServer(async (req, res) => {
  requests++;
  if (!(req.headers.authorization === `Bearer ${fakeServiceKey}` || (req.headers.apikey===fakeSecretKey&&!req.headers.authorization))) return json(res, 401, "InvalidJWT");
  if (override?.(req, res)) return;
  const key = decodeURIComponent((req.url ?? "").replace("/storage/v1/object/visa-documents-preview/", ""));
  if (req.method === "POST") {
    const parts: Buffer[] = [];
    for await (const part of req) parts.push(Buffer.from(part));
    if (objects.has(key) && req.headers["x-upsert"] !== "true") return json(res, 400, "ResourceAlreadyExists");
    objects.set(key, { data: Buffer.concat(parts), mimeType: String(req.headers["content-type"]) });
    return json(res, 200, "created");
  }
  if (req.method === "GET") {
    const object = objects.get(key);
    if (!object) return json(res, 404, "NoSuchKey");
    res.writeHead(200, { "content-type": object.mimeType, "content-length": object.data.length });
    return res.end(object.data);
  }
  if (req.method === "DELETE") {
    if (!objects.delete(key)) return json(res, 404, "NoSuchKey");
    res.writeHead(204);
    return res.end();
  }
  json(res, 405, "InvalidRequest");
});
const sink = createServer((_req, res) => { sinkRequests++; res.end("unexpected credential target"); });

beforeAll(async () => {
  service.listen(0, "127.0.0.1");
  sink.listen(0, "127.0.0.1");
  await Promise.all([once(service, "listening"), once(sink, "listening")]);
  const address = service.address(), sinkAddress = sink.address();
  if (!address || typeof address === "string" || !sinkAddress || typeof sinkAddress === "string") throw new Error("Fixture did not bind loopback");
  serviceOrigin = `http://127.0.0.1:${address.port}`;
  sinkOrigin = `http://127.0.0.1:${sinkAddress.port}`;
});

beforeEach(() => {
  objects.clear(); requests = 0; sinkRequests = 0; override = undefined;
  expectedOrigin=approvedOrigin;
  vi.stubEnv("STORAGE_PROVIDER", "supabase");
  vi.stubEnv("SUPABASE_URL", approvedOrigin);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", fakeServiceKey);
  vi.stubEnv("SUPABASE_STORAGE_BUCKET", "visa-documents-preview");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const target = new URL(String(input));
    if (target.origin !== expectedOrigin) throw new Error("Test refuses non-approved outbound origin");
    return realFetch(`${serviceOrigin}${target.pathname}${target.search}`, init);
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(async () => {
  service.closeAllConnections(); sink.closeAllConnections();
  await Promise.all([new Promise<void>((resolve) => service.close(() => resolve())), new Promise<void>((resolve) => sink.close(() => resolve()))]);
});

describe("Supabase storage protocol", () => {
  it('uses a server secret as apikey without treating it as a JWT',async()=>{
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','');vi.stubEnv('SUPABASE_SECRET_KEY',fakeSecretKey);
    const data=Buffer.from('only synthetic bytes'),provider=storageProvider();
    await provider.put(objectKey,data,'application/pdf');expect((await provider.get(objectKey)).data).toEqual(data);await provider.delete(objectKey);
  });
  it('pins isolated Preview storage to its verified existing database/deployment context',async()=>{
    expectedOrigin='https://nqudhszgodmzckautrby.supabase.co';vi.stubEnv('SUPABASE_URL',expectedOrigin);
    vi.stubEnv('VERCEL','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_TARGET_ENV','preview');vi.stubEnv('VERCEL_PROJECT_ID','prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp');vi.stubEnv('VERCEL_GIT_COMMIT_REF','codex/isolated-clean-preview-2026-10-15');vi.stubEnv('DATABASE_SCHEMA','visa_os_preview');vi.stubEnv('DATABASE_URL','postgresql://postgres.nqudhszgodmzckautrby:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full');
    await storageProvider().put(objectKey,Buffer.from('fictional'),'application/pdf');
    vi.stubEnv('VERCEL_ENV','production');const before=requests;
    await expect(storageProvider().get(objectKey)).rejects.toMatchObject({code:'STORAGE_MISCONFIGURED'});expect(requests).toBe(before);
    vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('DATABASE_URL','postgresql://postgres.xgetzgixalrsmuvfthpf:synthetic@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full');
    await expect(storageProvider().get(objectKey)).rejects.toMatchObject({code:'STORAGE_MISCONFIGURED'});expect(requests).toBe(before);
  });
  it("roundtrips exact bytes and MIME then reports a deleted object as missing", async () => {
    const provider = storageProvider(), data = Buffer.from([0, 1, 128, 255]);
    await provider.put(objectKey, data, "application/pdf");
    expect(await provider.get(objectKey)).toEqual({ data, mimeType: "application/pdf" });
    await provider.delete(objectKey);
    await expect(provider.get(objectKey)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(provider.delete(objectKey)).resolves.toBeUndefined();
  });

  it.each([400,404])('recognizes the hosted object-not-found envelope at HTTP %s',async(status)=>{
    override=(_req,res)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({statusCode:'404',error:'not_found',message:'Object not found'}));return true;};
    await expect(storageProvider().get(objectKey)).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(storageProvider().delete(objectKey)).resolves.toBeUndefined();
  });

  it.each([
    {status:400,body:{statusCode:'404',error:'not_found',message:'Bucket not found'}},
    {status:400,body:{error:'not_found',message:'Object not found'}},
    {status:400,body:{statusCode:'403',error:'not_found',message:'Object not found'}},
    {status:400,body:{statusCode:'404',error:'AccessDenied',message:'Object not found'}},
    ...[401,403,429,500,503].map(status=>({status,body:{statusCode:'404',error:'not_found',message:'Object not found'}})),
  ])('does not turn HTTP $status / $body.message into false object absence',async({status,body})=>{
    override=(_req,res)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));return true;};
    await expect(storageProvider().get(objectKey)).rejects.toMatchObject({code:'STORAGE_READ_FAILED'});
    await expect(storageProvider().delete(objectKey)).rejects.toMatchObject({code:'STORAGE_DELETE_FAILED'});
  });

  it("cannot overwrite immutable bytes by uploading the same key twice", async () => {
    const provider = storageProvider();
    await provider.put(objectKey, Buffer.from("original"), "application/pdf");
    await expect(provider.put(objectKey, Buffer.from("replacement"), "image/png")).rejects.toMatchObject({ code: "STORAGE_WRITE_FAILED" });
    expect(await provider.get(objectKey)).toEqual({ data: Buffer.from("original"), mimeType: "application/pdf" });
  });

  it.each([401, 403, 429, 500, 503])("does not report HTTP %s reads as missing", async (status) => {
    override = (_req, res) => { json(res, status, "AccessDenied"); return true; };
    await expect(storageProvider().get(objectKey)).rejects.toMatchObject({ code: "STORAGE_READ_FAILED" });
  });

  it.each([401, 403, 429, 500, 503])("does not report HTTP %s deletion as success", async (status) => {
    override = (_req, res) => { json(res, status, "AccessDenied"); return true; };
    await expect(storageProvider().delete(objectKey)).rejects.toMatchObject({ code: "STORAGE_DELETE_FAILED" });
  });

  it.each(["NoSuchBucket", "TenantNotFound", "unrecognized"])("fails closed on a 404 %s rather than claiming object absence", async (code) => {
    override = (_req, res) => { json(res, 404, code); return true; };
    await expect(storageProvider().get(objectKey)).rejects.toMatchObject({ code: "STORAGE_READ_FAILED" });
    await expect(storageProvider().delete(objectKey)).rejects.toMatchObject({ code: "STORAGE_DELETE_FAILED" });
  });

  it("accepts 2 MiB but rejects a larger upload before sending bytes", async () => {
    await storageProvider().put(objectKey, Buffer.alloc(2 * 1024 * 1024), "application/pdf");
    expect((await storageProvider().get(objectKey)).data.length).toBe(2 * 1024 * 1024);
    const before = requests;
    await expect(storageProvider().put("visa-documents/app-1/large", Buffer.alloc(2 * 1024 * 1024 + 1), "application/pdf")).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(requests).toBe(before);
  });

  it.each(["get", "put", "delete"] as const)("refuses %s redirects without contacting the second origin", async (operation) => {
    override = (_req, res) => { res.writeHead(307, { location: `${sinkOrigin}/credential-sink` }); res.end(); return true; };
    const provider = storageProvider();
    const result = operation === "put" ? provider.put(objectKey, Buffer.from("x"), "application/pdf") : provider[operation](objectKey);
    await expect(result).rejects.toMatchObject({ code: `STORAGE_${operation === "put" ? "WRITE" : operation === "get" ? "READ" : "DELETE"}_FAILED` });
    expect(sinkRequests).toBe(0);
  });

  it.each(["get", "put", "delete"] as const)("bounds %s network stalls and returns a safe error", async (operation) => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(25));
    override = () => true;
    const provider = storageProvider();
    const result = operation === "put" ? provider.put(objectKey, Buffer.from("x"), "application/pdf") : provider[operation](objectKey);
    await expect(result).rejects.toMatchObject({ code: `STORAGE_${operation === "put" ? "WRITE" : operation === "get" ? "READ" : "DELETE"}_FAILED` });
    expect(timeout).toHaveBeenCalledWith(15_000);
  });

  it("bounds a response body that stalls after successful headers", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(25));
    override = (_req, res) => { res.writeHead(200, { "content-type": "application/pdf" }); res.write("prefix"); return true; };
    await expect(storageProvider().get(objectKey)).rejects.toMatchObject({ code: "STORAGE_READ_FAILED" });
  });

  it("rejects a successful response larger than the legacy 10 MiB ceiling", async () => {
    override = (_req, res) => { res.writeHead(200, { "content-type": "application/pdf", "content-length": 10 * 1024 * 1024 + 1 }); res.end(Buffer.alloc(10 * 1024 * 1024 + 1)); return true; };
    await expect(storageProvider().get(objectKey)).rejects.toMatchObject({ code: "STORAGE_READ_FAILED" });
  });

  it.each(["", "/absolute", "one//two", "../secret", "one/../secret", "one/./two", "one\\two", "one%2ftwo", "one?two", "one#two", "one\u0000two", "x".repeat(1025)])("rejects unsafe object key %j before the credentialed request", async (key) => {
    const provider = storageProvider();
    await expect(provider.get(key)).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    await expect(provider.put(key, Buffer.from("x"), "application/pdf")).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    await expect(provider.delete(key)).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    expect(requests).toBe(0);
  });

  it("does not silently route an unknown provider to database storage", () => {
    vi.stubEnv("STORAGE_PROVIDER", "supabsae");
    expect(() => storageProvider()).toThrow(expect.objectContaining({ code: "STORAGE_MISCONFIGURED" }));
  });
});
