/** React close events from nested dialogs can propagate through the component tree. */
export function ownsClosedDialog(target:unknown,currentTarget:{open:boolean}):boolean {
 return target===currentTarget&&!currentTarget.open;
}
export function isDialogBackdrop(target:unknown,currentTarget:{getBoundingClientRect():{left:number;right:number;top:number;bottom:number}},x:number,y:number):boolean{
 if(target!==currentTarget)return false;
 const r=currentTarget.getBoundingClientRect();
 return x<r.left||x>=r.right||y<r.top||y>=r.bottom;
}
