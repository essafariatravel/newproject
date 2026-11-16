import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {downloadExternalObjects,type ExternalObject} from '../scripts/lib/external-storage-recovery';

const objects:ExternalObject[]=[
 {id:'11111111-1111-4111-8111-111111111111',bucket:'documents',name:'synthetic/a.pdf',version:'v1',updatedAt:'2026-10-20T12:00:00.000Z',declaredBytes:3},
 {id:'22222222-2222-4222-8222-222222222222',bucket:'documents',name:'synthetic/é b.pdf',version:'v1',updatedAt:'2026-10-20T12:00:00.000Z',declaredBytes:3},
];
function signed(object:ExternalObject,claims:Record<string,unknown>={}){
 const now=Math.floor(Date.now()/1000);
 // Deliberately unsigned fixture assembled only in memory, never a real access token.
 const jwt=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({url:'documents/'+object.name,iat:now-5,exp:now+600,...claims})).toString('base64url'),Buffer.from('invalid-fixture-signature').toString('base64url')].join('.');
 return 'https://xgetzgixalrsmuvfthpf.supabase.co/storage/v1/object/sign/documents/'+object.name.split('/').map(encodeURIComponent).join('/')+'?token='+jwt;
}
describe('bounded owner-authorized signed object links',()=>{
 it('downloads in source order over real serial loopback HTTP without any server key or authorization header',async()=>{
  let calls=0;const server=createServer((req,res)=>{
   calls++;if(req.method!=='GET'||req.headers.authorization||req.headers.apikey){res.writeHead(403);res.end();return;}
   const name=decodeURIComponent(new URL(req.url!,'http://localhost').pathname).split('/documents/')[1];
   res.writeHead(200,{'content-length':'3'});res.end(name===objects[0]!.name?'aaa':'bbb');
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try{
   const address=server.address();if(!address||typeof address==='string')throw Error('LOOPBACK_FIXTURE_REQUIRED');
   const fetcher:typeof fetch=(input,init)=>{expect(init?.redirect).toBe('error');expect(init?.headers).toEqual({});const u=new URL(String(input));return fetch(`http://127.0.0.1:${address.port}${u.pathname}${u.search}`,init);};
   const result=await downloadExternalObjects(objects,{signedUrls:[signed(objects[1]!),signed(objects[0]!)]},fetcher);
   expect(result).toEqual([Buffer.from('aaa'),Buffer.from('bbb')]);expect(calls).toBe(2);
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 });
 it('validates the entire set before any request and rejects wrong scope, duplicates, expired or excessively broad capabilities',async()=>{
  const good=signed(objects[0]!),other=signed(objects[1]!);let requests=0;
  const fetcher:typeof fetch=async()=>{requests++;return new Response('aaa');};
  const now=Math.floor(Date.now()/1000);
  const bad=[
   [good], [good,good], [good,other,other],
   [good,other.replace('xgetzgixalrsmuvfthpf','nqudhszgodmzckautrby')],
   [good,other.replace('https:','http:')],
   [good,other.replace('https://','https://someone@')],
   [good,other+'&download=private'], [good,other+'&token=extra'], [good,other+'#fragment'],
   [good,other.replace('/object/sign/','/object/upload/sign/')],
   [good,signed(objects[1]!,{url:'documents/different.pdf'})],
   [good,signed(objects[1]!,{exp:now-1})],
   [good,signed(objects[1]!,{iat:now,exp:now+901})],
   [good,signed(objects[1]!,{iat:now+90,exp:now+300})],
  ];
  for(const signedUrls of bad){await expect(downloadExternalObjects(objects,{signedUrls},fetcher)).rejects.toThrow('SIGNED_OBJECT_LINKS_SCOPE_OR_EXPIRY_INVALID');}
  expect(requests).toBe(0);
 });
 it('does not report provider details or a capability when a bounded signed GET fails',async()=>{
  const signedUrls=objects.map(o=>signed(o));
  await expect(downloadExternalObjects(objects,{signedUrls},async()=>new Response('sensitive provider detail',{status:403}))).rejects.toThrow('EXTERNAL_OBJECT_READ_FAILED');
 });
});
