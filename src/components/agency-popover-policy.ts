// Short grace period bridges the visual gap between trigger and floating panel.
export const POPOVER_EXIT_DELAY=180;
export function shouldSchedulePointerClose(pointerType:string,modality:"mouse"|"keyboard"|"touch",inside:boolean):boolean{
 return pointerType==="mouse"&&modality==="mouse"&&!inside;
}
