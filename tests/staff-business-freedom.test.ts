import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { suiteSetup } from './helpers/global-state';
import { userByEmail } from './helpers/fixtures';
import { createSession } from './helpers/authenticated-session';
import { request } from './helpers/request';
import { db } from '@/lib/db';
import { users, visaCategories, documentTypes, countries, auditLogs } from '@/db/schema';
import { createAccount, updateAccount, changeAccountPassword } from '@/lib/account-security';
import { issueAccessToken } from '@/lib/account-recovery';
import { getSessionUser } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { createVisaCategoryAction, updateVisaCategoryAction, createDocumentTypeAction, updateDocumentTypeAction, createCountryAction } from '@/app/actions/config';
import { listAuditLogs } from '@/lib/queries';
import { automaticDatabaseChangesForbidden } from '../scripts/lib/build-policy';
import { getSiteSettings } from '@/lib/settings';
import type { AuthUser } from '@/lib/types';

suiteSetup();
afterEach(()=>{request.cookie='';});
async function ownerSession(){const owner=await userByEmail('superadmin@test.example');request.cookie=(await createSession(owner.id)).token;return owner;}
async function save(action:(form:FormData)=>Promise<void>,fields:Record<string,string>){const form=new FormData();for(const [k,v]of Object.entries(fields))form.set(k,v);await expect(action(form)).rejects.toMatchObject({digest:expect.stringMatching(/NEXT_REDIRECT.*ok=/)});}

describe('Staff business text and immutable identities',()=>{
 it('accepts a business destination region while retaining ISO country identifiers',async()=>{
  await ownerSession();await save(createCountryAction,{name:'Synthetic destination',iso2:'XY',region:'Maghreb / sur mesure',sortOrder:'0'});
  expect((await db.select().from(countries).where(eq(countries.iso2,'XY')))[0]?.region).toBe('Maghreb / sur mesure');
 });
 it('makes a Staff identity administrative history searchable by its stable UUID',async()=>{
  const target=await userByEmail('accounting@test.example');await db.insert(auditLogs).values({action:'SYNTHETIC_STAFF_HISTORY',entity:'user',entityId:target.id});
  expect((await listAuditLogs({q:target.id,entity:'user'})).rows.some(row=>row.log.action==='SYNTHETIC_STAFF_HISTORY')).toBe(true);
 });
 it('never runs automatic database writes when building the Staff branch Preview',()=>{
  const previous=process.env.MFA_ENFORCEMENT_ENABLED;process.env.MFA_ENFORCEMENT_ENABLED='true';
  try{expect(automaticDatabaseChangesForbidden('codex/staff-administration-2026-11-01')).toBe(true);}finally{if(previous===undefined)delete process.env.MFA_ENFORCEMENT_ENABLED;else process.env.MFA_ENFORCEMENT_ENABLED=previous;}
 });
 it('preserves punctuation, accents, Arabic and case in a chosen category code',async()=>{
  await ownerSession();const code='Oman / express (été) — عُمان 2026';
  await save(createVisaCategoryAction,{name:'Voyage professionnel',code,sortOrder:'0',description:'Instructions '.repeat(1500)});
  expect((await db.select().from(visaCategories).where(eq(visaCategories.code,code)))[0]?.description).toHaveLength(19499);
 });
 it('edits a category business code without replacing its UUID',async()=>{
  await ownerSession();const [type]=await db.insert(visaCategories).values({name:'Synthetic rename',code:'SYNTHETIC_RENAME'}).returning();
  await save(updateVisaCategoryAction,{id:type!.id,name:'Synthetic renamed',code:'Client / libre 2026',sortOrder:'0'});
  expect((await db.select().from(visaCategories).where(eq(visaCategories.id,type!.id)))[0]?.code).toBe('Client / libre 2026');
 });
 it('preserves custom document names and lets staff edit their internal code',async()=>{
  await ownerSession();await save(createDocumentTypeAction,{name:'Justificatif / شهادة',code:'Doc client (FR / AR)',sortOrder:'0',agencyUploadable:'1'});
  const [type]=await db.select().from(documentTypes).where(eq(documentTypes.code,'Doc client (FR / AR)'));
  await save(updateDocumentTypeAction,{id:type!.id,name:'Nom choisi '.repeat(35),code:'Version libre / 2',description:'Texte '.repeat(2500),sortOrder:'2',agencyUploadable:'1'});
  const [after]=await db.select().from(documentTypes).where(eq(documentTypes.id,type!.id));expect(after?.code).toBe('Version libre / 2');expect(after?.name).toHaveLength(384);
 });
 it('rejects a case-folded category duplicate instead of creating another identifier',async()=>{
  await ownerSession();await save(createVisaCategoryAction,{name:'Unique',code:'Unique business code',sortOrder:'0'});
  const form=new FormData();form.set('name','Duplicate');form.set('code','UNIQUE BUSINESS CODE');
  await expect(createVisaCategoryAction(form)).rejects.toMatchObject({digest:expect.stringMatching(/error=/)});
  expect((await db.select().from(visaCategories)).filter(x=>x.code.toLowerCase()==='unique business code')).toHaveLength(1);
 });
 it('rejects control characters in an internal code',async()=>{
  await ownerSession();const form=new FormData();form.set('name','Unsafe');form.set('code','bad\u202Ecode');
  await expect(createVisaCategoryAction(form)).rejects.toMatchObject({digest:expect.stringMatching(/error=/)});
  expect((await db.select().from(visaCategories)).some(x=>x.code.includes('\u202E'))).toBe(false);
 });
 it('does not let a business document impersonate a reserved official decision kind',async()=>{
  await ownerSession();const form=new FormData();for(const[k,v]of Object.entries({name:'Synthetic reserved',code:'DECISION_FAKE_NEW',agencyUploadable:'1'}))form.set(k,v);
  await expect(createDocumentTypeAction(form)).rejects.toMatchObject({digest:expect.stringMatching(/error=/)});
  expect(await db.select().from(documentTypes).where(eq(documentTypes.code,'DECISION_FAKE_NEW'))).toHaveLength(0);
 });
});

describe('owner-controlled Staff access',()=>{
 it.each(['VISA_AGENT','ACCOUNTING'] as const)('does not let a delegated %s acquire ADMIN-only reconciliation powers',async(role)=>{
  const owner=await userByEmail('superadmin@test.example');
  const manager=await createAccount(owner,{name:'Role scoped manager',email:`role-manager-${role}@test.example`,role,agencyId:null,password:'a quiet violet river garden',staffPermissions:{catalogManage:false,staffManage:true}});
  await db.update(users).set({mustChangePassword:false}).where(eq(users.id,manager.id));
  const actor=await userByEmail(manager.email);
  await expect(createAccount(actor,{name:'Escalated identity',email:`escalated-${role}@test.example`,role:'ADMIN',agencyId:null,password:'a quiet violet river garden'})).rejects.toMatchObject({code:'FORBIDDEN'});
  const target=await createAccount(owner,{name:'Restricted ADMIN',email:`role-target-${role}@test.example`,role:'ADMIN',agencyId:null,password:'a quiet violet river garden',staffPermissions:{catalogManage:false,staffManage:false}});
  await expect(updateAccount(actor,target.id,{email:`takeover-${role}@test.example`})).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(issueAccessToken(actor,target.id)).rejects.toMatchObject({code:'FORBIDDEN'});
  const peer=await createAccount(actor,{name:'Allowed peer',email:`peer-${role}@test.example`,role,agencyId:null,password:'a quiet violet river garden'});
  await expect(updateAccount(actor,peer.id,{role:'ADMIN'})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('stores a chosen internal Staff username without making it a login identity',async()=>{
  const owner=await userByEmail('superadmin@test.example');
  const created=await createAccount(owner,{name:'Nadia synthetic',email:'nadia-business@test.example',username:'Nadia / Opérations 2026',role:'ADMIN',agencyId:null,password:'a quiet violet river garden'});
  expect(created.username).toBe('Nadia / Opérations 2026');
  expect((await db.select().from(users).where(eq(users.id,created.id)))[0]?.username).toBeNull();
  expect(Object.keys(await getSiteSettings()).some(key=>key.startsWith('internal.staff.'))).toBe(false);
 });
 it('blocks creation of another SUPER_ADMIN even by the owner',async()=>{
  await expect(createAccount(await userByEmail('superadmin@test.example'),{name:'Not another owner',email:'extra-owner@test.example',role:'SUPER_ADMIN',agencyId:null,password:'a quiet violet river garden'})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('honours explicit catalogue denial and independent Staff delegation',async()=>{
  const actor={...(await userByEmail('admin@test.example')),staffPermissions:{catalogManage:false,staffManage:true}} as AuthUser;
  expect(hasPermission(actor,'config.manage')).toBe(false);expect(hasPermission(actor,'users.manage')).toBe(true);expect(hasPermission(actor,'recovery.manage')).toBe(false);
 });
 it('persists permissions through the authenticated session and revokes them atomically on change',async()=>{
  const owner=await userByEmail('superadmin@test.example');
  const input={name:'Synthetic controlled staff',email:'controlled-staff@test.example',role:'ADMIN' as const,agencyId:null,password:'a quiet violet river garden',staffPermissions:{catalogManage:false,staffManage:true}};
  const created=await createAccount(owner,input);
  await db.update(users).set({mustChangePassword:false}).where(eq(users.id,created.id));request.cookie=(await createSession(created.id)).token;
  const actor=await getSessionUser();expect(actor).not.toBeNull();expect(hasPermission(actor!,'config.manage')).toBe(false);expect(hasPermission(actor!,'users.manage')).toBe(true);
  await updateAccount(owner,created.id,{staffPermissions:{catalogManage:true,staffManage:false}});
  expect(await getSessionUser()).toBeNull();
 });
 it('accepts a long passphrase without imposed letters/digits composition',async()=>{
  const actor=await userByEmail('accounting@test.example');
  await expect(changeAccountPassword(actor,'Test-Password-123','violet market river cedar garden')).resolves.toBe(1);
 });
 it('rejects common compromised passwords on account creation',async()=>{
  await expect(createAccount(await userByEmail('superadmin@test.example'),{name:'Weak synthetic',email:'weak-staff@test.example',role:'ADMIN',agencyId:null,password:'Password123456'})).rejects.toMatchObject({code:'VALIDATION'});
 });
 it('does not let delegated user management take over a more privileged Staff identity',async()=>{
  const owner=await userByEmail('superadmin@test.example');
  const manager=await createAccount(owner,{name:'Scoped manager',email:'scoped-manager@test.example',role:'ADMIN',agencyId:null,password:'a quiet violet river garden',staffPermissions:{catalogManage:false,staffManage:true}});
  const target=await createAccount(owner,{name:'Catalogue manager',email:'catalogue-manager@test.example',role:'ADMIN',agencyId:null,password:'a quiet violet river garden',staffPermissions:{catalogManage:true,staffManage:false}});
  await db.update(users).set({mustChangePassword:false}).where(eq(users.id,manager.id));
  await expect(updateAccount(await userByEmail(manager.email),target.id,{email:'takeover@test.example'})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('does not give newly created Staff more capabilities than the delegated creator',async()=>{
  const owner=await userByEmail('superadmin@test.example');
  const manager=await createAccount(owner,{name:'Limited creator',email:'limited-creator@test.example',role:'ADMIN',agencyId:null,password:'a quiet violet river garden',staffPermissions:{catalogManage:false,staffManage:true}});
  await db.update(users).set({mustChangePassword:false}).where(eq(users.id,manager.id));
  const created=await createAccount(await userByEmail(manager.email),{name:'Limited member',email:'limited-member@test.example',role:'ADMIN',agencyId:null,password:'a quiet violet river garden'});
  expect(created.staffPermissions).toEqual({catalogManage:false,staffManage:false});
 });
});
