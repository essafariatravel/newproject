import {describe,it,expect} from "vitest";
import {physicalBackupObservation} from "../scripts/managed-backup-evidence";
describe("official read-only physical backup observation",()=>{
 const observed="2026-10-20T12:00:00Z";
 it("selects a concrete completed physical backup, dropping unrelated response metadata",()=>{
  expect(physicalBackupObservation({backups:[{id:1,is_physical_backup:true,status:"FAILED",inserted_at:"2026-10-20T11:00:00Z"},{id:2,is_physical_backup:true,status:"COMPLETED",inserted_at:"2026-10-20T08:00:00Z",unneeded:"not copied"},{id:3,is_physical_backup:false,status:"COMPLETED",inserted_at:"2026-10-20T10:00:00Z"}]},observed)).toEqual({id:2,is_physical_backup:true,status:"COMPLETED",inserted_at:"2026-10-20T08:00:00Z"});
 });
 it("does not invent a status or reference from an owner-reported timestamp or PITR range",()=>{
  for(const payload of [{backups:[]},{physical_backup_data:{latest_physical_backup_date_unix:1792483200}},{backups:[{is_physical_backup:true,inserted_at:"2026-10-20T08:00:00Z"}]},{backups:[{id:2,is_physical_backup:true,status:"COMPLETED",inserted_at:"2026-10-21T08:00:00Z"}]}])expect(()=>physicalBackupObservation(payload,observed)).toThrow();
 });
});
