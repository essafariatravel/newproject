import {spawnSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';

describe('private external recovery operator guards',()=>{
 it.each([
  {EXTERNAL_STORAGE_READ_TOKEN:'synthetic-token',EXTERNAL_STORAGE_SIGNED_URLS_JSON:'["synthetic-private-url"]',reason:'BLOCKED_AMBIGUOUS_PRIVATE_STORAGE_READ_CREDENTIAL'},
  {EXTERNAL_STORAGE_SIGNED_URLS_JSON:'{"private":"synthetic-private-url"}',reason:'BLOCKED_PRIVATE_SIGNED_LINKS_FORMAT'},
 ])('rejects ambiguous or malformed private input before connecting ($reason)',({reason,...credential})=>{
  const env:NodeJS.ProcessEnv={NODE_ENV:'test',...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SystemRoot|WINDIR|TEMP|TMP)$/i.test(k))),EXTERNAL_STORAGE_AUTHORIZATION:'OWNER_PHASE2B0',DATABASE_URL:'intentionally-invalid-never-connected',...credential};
  const r=spawnSync(process.execPath,['--import','tsx','scripts/external-storage-backup.ts'],{env,encoding:'utf8',shell:false,timeout:30000});
  expect(r.status).not.toBe(0);expect(r.stdout+r.stderr).toContain(reason);expect(r.stdout+r.stderr).not.toContain('synthetic-private-url');expect(r.stdout+r.stderr).not.toContain('synthetic-token');expect(r.stdout+r.stderr).not.toContain('intentionally-invalid-never-connected');
 });
 it('stops before database/object access when the private credential is unavailable and never prints inherited secrets',()=>{
  const env:NodeJS.ProcessEnv={NODE_ENV:'test',...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SystemRoot|WINDIR|TEMP|TMP)$/i.test(k))),EXTERNAL_STORAGE_AUTHORIZATION:'OWNER_PHASE2B0',DATABASE_URL:'intentionally-invalid-never-connected',UNRELATED_PRIVATE_TOKEN:'synthetic-do-not-print'};
  const r=spawnSync(process.execPath,['--import','tsx','scripts/external-storage-backup.ts'],{env,encoding:'utf8',shell:false,timeout:30000});
  expect(r.status).not.toBe(0);expect(r.stdout+r.stderr).toContain('BLOCKED_PRIVATE_STORAGE_READ_CREDENTIAL');expect(r.stdout+r.stderr).not.toContain('synthetic-do-not-print');expect(r.stdout+r.stderr).not.toContain('intentionally-invalid-never-connected');
 });
 it('refuses to start without the exact bounded authorization before interpreting credentials',()=>{
  const env:NodeJS.ProcessEnv={NODE_ENV:'test',...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SystemRoot|WINDIR|TEMP|TMP)$/i.test(k))),EXTERNAL_STORAGE_READ_TOKEN:'synthetic-do-not-print'};
  const r=spawnSync(process.execPath,['--import','tsx','scripts/external-storage-backup.ts'],{env,encoding:'utf8',shell:false,timeout:30000});
  expect(r.status).not.toBe(0);expect(r.stdout+r.stderr).toContain('BLOCKED_EXTERNAL_ARCHIVE_AUTHORIZATION');expect(r.stdout+r.stderr).not.toContain('synthetic-do-not-print');
 });
});
