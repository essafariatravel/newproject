/** Exact checklist identity, or an unambiguous legacy type. */
export function resolveRequestItem(items:readonly {id:string;documentTypeId:string|null}[],request:{checklistItemId:string|null;documentTypeId:string}):string|undefined{
 if(request.checklistItemId)return items.find(item=>item.id===request.checklistItemId)?.id;
 const candidates=items.filter(item=>item.documentTypeId===request.documentTypeId);
 return candidates.length===1?candidates[0]?.id:undefined;
}
