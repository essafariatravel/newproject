export type ChangeKind="price"|"duration"|"requirements"|"published"|"details";
type Entry={id:string;programmeId:string;action:string;createdAt:Date;metadata:Record<string,unknown>|null};
export type CatalogueChange={id:string;programmeId:string;kind:ChangeKind;at:Date;before?:string;after?:string};
function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function money(value:unknown):string|null{const s=typeof value==="number"?String(value):typeof value==="string"?value:"";return /^\d{1,12}(?:\.\d{1,2})?$/.test(s)?Number(s).toFixed(2):null}
function duration(value:Record<string,unknown>):string|null{const a=value.processingMinDays,b=value.processingMaxDays;return typeof a==="number"&&typeof b==="number"&&Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>0&&b>=a?a+"–"+b:null}
export function projectCatalogueChanges(entries:readonly Entry[],visibleIds:ReadonlySet<string>,limit=30):CatalogueChange[]{
 const result:CatalogueChange[]=[],seen=new Set<string>();
 for(const row of [...entries].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()||b.id.localeCompare(a.id))){
  if(!visibleIds.has(row.programmeId))continue;
  const meta=object(row.metadata),old=object(meta.oldValues),next=object(meta.newValues);
  const add=(kind:ChangeKind,before?:string,after?:string)=>{
   // Keep only the latest change of each kind for a programme on each UTC day.
   const key=[row.programmeId,kind,row.createdAt.toISOString().slice(0,10)].join(":");
   if(seen.has(key)||result.length>=limit)return;seen.add(key);
   result.push({id:row.id+":"+kind,programmeId:row.programmeId,kind,at:row.createdAt,before,after});
  };
  if(row.action==="CONFIG_VISA_TYPE_TOGGLED"&&old.active===false&&next.active===true)add("published");
  else if(row.action==="CONFIG_VISA_TYPE_UPDATED"){
   // Never expose edits recorded while the programme was unpublished.
   if(old.active!==true)continue;
   const a=money(old.fee),b=money(next.fee);
   if(a!==null&&b!==null&&a!==b&&old.currency==="DZD"&&next.currency==="DZD")add("price",a,b);
   const x=duration(old),y=duration(next);
   if(x!==y&&(x!==null||y!==null))add("duration",x??undefined,y??undefined);
   const fields=["name","nameFr","nameAr","description","descriptionFr","descriptionAr","embassyApplicability"];
   if(fields.some(k=>Object.prototype.hasOwnProperty.call(next,k)&&(old[k]??null)!==(next[k]??null)))add("details");
  }else if(["CONFIG_REQUIREMENT_ADDED","CONFIG_REQUIREMENT_TOGGLED","CONFIG_REQUIREMENT_REMOVED"].includes(row.action)&&meta.programmeWasActive===true)add("requirements");
 }
 return result;
}
