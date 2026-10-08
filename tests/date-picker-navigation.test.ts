import {describe,it,expect,vi,beforeAll,afterAll} from "vitest";
import type {ReactElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
const state=vi.hoisted(()=>({cursor:0,view:"days",viewUpdate:undefined as unknown}));
vi.mock("react",async()=>({...await vi.importActual<typeof import("react")>("react"),
  useMemo:(factory:()=>unknown)=>factory(),useRef:()=>({current:null}),useEffect:()=>undefined,
  useState:(initial:unknown)=>{const index=state.cursor++;return [index===1?true:index===5?state.view:initial,(update:unknown)=>{if(index===5)state.viewUpdate=update;}];},
}));
let DatePicker:typeof import("@/components/date-picker").DatePicker;
beforeAll(async()=>{vi.resetModules();({DatePicker}=await import("@/components/date-picker"));});
afterAll(()=>{vi.doUnmock("react");vi.resetModules();});
function tree(locale:"en"|"fr"|"ar",view:string){state.cursor=0;state.view=view;state.viewUpdate=undefined;return DatePicker({name:"date",locale,defaultValue:"2026-10-07"});}
function elements(node:unknown):ReactElement<Record<string,unknown>>[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=="object"||!("props" in node))return [];const e=node as ReactElement<Record<string,unknown>>;return [e,...elements(e.props.children)];}
describe("date picker accessible navigation",()=>{
  it("returns from the year pane to days when the announced back control is activated",()=>{
    const button=elements(tree("en","years")).find(e=>e.type==="button"&&e.props["aria-label"]==="Back to days");expect(button).toBeDefined();(button!.props.onClick as ()=>void)();expect((state.viewUpdate as (view:string)=>string)("years")).toBe("days");
  });
  it.each([
    ["fr","Choisir le mois et l’année","Choisir le mois","Choisir l’année","Revenir aux jours"],
    ["ar","اختيار الشهر والسنة","اختيار الشهر","اختيار السنة","العودة إلى الأيام"],
  ] as const)("labels every date navigation pane in %s",(locale,monthYear,month,year,back)=>{
    const days=renderToStaticMarkup(tree(locale,"days"));const months=renderToStaticMarkup(tree(locale,"months"));const years=renderToStaticMarkup(tree(locale,"years"));
    expect(days).toContain(`aria-label="${monthYear}"`);expect(months).toContain(`aria-label="${month}"`);expect(months).toContain(`aria-label="${year}"`);expect(years).toContain(`aria-label="${year}"`);expect(years).toContain(`aria-label="${back}"`);
  });
});
