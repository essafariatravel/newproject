import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {expect,it} from 'vitest';
import {exportEncryptedObjects,restoreEncryptedObjects} from '../scripts/lib/dr-export';
import {AppError} from '@/lib/types';

it('encrypts HTTP object bytes, verifies all records before restore, resumes failures and preserves conflicts',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'dr-objects-local-')),artifact=path.join(dir,'objects.enc'),key=randomBytes(32);
 const source=new Map([['visa-documents/synthetic/one',{data:Buffer.from('%PDF-1.7 fictional one'),mimeType:'application/pdf'}],['visa-documents/synthetic/two',{data:Buffer.from('%PDF-1.7 fictional two'),mimeType:'application/pdf'}]]),target=new Map<string,{data:Buffer;mimeType:string}>();
 let failSecond=false,writes=0;
 const serverFor=(objects:typeof target)=>createServer(async(req,res)=>{
  const name=decodeURIComponent((req.url??'').slice(1));
  if(req.method==='PUT'){
   if(objects===source){res.writeHead(405);return res.end();}
   writes++;if(failSecond&&name.endsWith('/two')){res.writeHead(503);return res.end();}if(objects.has(name)){res.writeHead(409);return res.end();}
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));objects.set(name,{data:Buffer.concat(chunks),mimeType:String(req.headers['content-type'])});res.writeHead(201);return res.end();
  }
  const object=objects.get(name);if(!object){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':object.mimeType});res.end(object.data);
 });
 const server=serverFor(source),targetServer=serverFor(target);server.listen(0,'127.0.0.1');targetServer.listen(0,'127.0.0.1');await Promise.all([once(server,'listening'),once(targetServer,'listening')]);const address=server.address(),targetAddress=targetServer.address();if(!address||typeof address==='string'||!targetAddress||typeof targetAddress==='string')throw Error('LOCAL_BIND_REQUIRED');
 const origin=`http://127.0.0.1:${address.port}`;
 const targetOrigin=`http://127.0.0.1:${targetAddress.port}`;
 const provider=(side:string)=>({async get(name:string){const response=await fetch((side==='source'?origin:targetOrigin)+'/'+encodeURIComponent(name),{redirect:'error',signal:AbortSignal.timeout(1000)});if(response.status===404)throw new AppError('NOT_FOUND','Absent');if(!response.ok)throw Error('HTTP_GET_FAILED');return{data:Buffer.from(await response.arrayBuffer()),mimeType:response.headers.get('content-type')!};},async put(name:string,data:Buffer,mime:string){const response=await fetch((side==='source'?origin:targetOrigin)+'/'+encodeURIComponent(name),{method:'PUT',headers:{'content-type':mime},body:new Uint8Array(data),redirect:'error',signal:AbortSignal.timeout(1000)});if(!response.ok)throw Error('HTTP_PUT_FAILED');}});
 const inventory=[...source].map(([name,object])=>({key:name,sizeBytes:object.data.length,mimeType:object.mimeType,sha256:createHash('sha256').update(object.data).digest('hex')}));
 try{
  await expect(exportEncryptedObjects({sourceOrigin:'https://cloud.invalid',source:provider('source'),inventory,output:artifact,key})).rejects.toThrow('HOSTED_PERF_DISABLED');
  expect((await exportEncryptedObjects({sourceOrigin:origin,source:provider('source'),inventory,output:artifact,key})).objectCount).toBe(2);expect(await readdir(dir)).toEqual(['objects.enc']);
  const corrupted=path.join(dir,'corrupt.enc'),bytes=await readFile(artifact);bytes[bytes.length-1]!^=1;await writeFile(corrupted,bytes);
  await expect(restoreEncryptedObjects({targetOrigin,target:provider('target'),inventory,artifact:corrupted,key})).rejects.toThrow();expect(writes).toBe(0);
  await expect(restoreEncryptedObjects({targetOrigin:origin,target:provider('target'),inventory,artifact,key})).rejects.toThrow('TARGET_OR_INVENTORY');expect(writes).toBe(0);
  failSecond=true;await expect(restoreEncryptedObjects({targetOrigin,target:provider('target'),inventory,artifact,key})).rejects.toThrow('HTTP_PUT');expect(target.size).toBe(1);
  failSecond=false;expect(await restoreEncryptedObjects({targetOrigin,target:provider('target'),inventory,artifact,key})).toMatchObject({verified:2,restored:1,reused:1});
  expect(source.size).toBe(2);for(const [name,object]of source)expect(target.get(name)).toEqual(object);
  target.set(inventory[0]!.key,{data:Buffer.from('conflicting pre-existing data'),mimeType:'application/pdf'});
  await expect(restoreEncryptedObjects({targetOrigin,target:provider('target'),inventory,artifact,key})).rejects.toThrow('PREEXISTING_TARGET');expect(target.get(inventory[0]!.key)!.data.toString()).toBe('conflicting pre-existing data');
  const changed=path.join(dir,'changed.enc');source.get(inventory[0]!.key)!.data=Buffer.from('changed source');await expect(exportEncryptedObjects({sourceOrigin:origin,source:provider('source'),inventory,output:changed,key})).rejects.toThrow('SOURCE_OBJECT');await expect(readFile(changed)).rejects.toThrow();
 }finally{key.fill(0);server.closeAllConnections();targetServer.closeAllConnections();await Promise.all([new Promise<void>(resolve=>server.close(()=>resolve())),new Promise<void>(resolve=>targetServer.close(()=>resolve()))]);if(path.dirname(dir)!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('dr-objects-local-'))throw Error('LOCAL_RETIREMENT_UNSAFE');await rm(dir,{recursive:true,force:true});}
});
