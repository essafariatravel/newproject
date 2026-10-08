import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type {ReactElement} from "react";
const hooks=vi.hoisted(()=>({cursor:0,refCursor:0,values:[] as unknown[],refs:[] as {current:unknown}[],effects:[] as (()=>unknown)[]}));
vi.mock("react",async()=>({...await vi.importActual<typeof import("react")>("react"),
  useMemo:(factory:()=>unknown)=>factory(),useEffect:(effect:()=>unknown)=>hooks.effects.push(effect),
  useRef:(initial:unknown)=>{const i=hooks.refCursor++;return hooks.refs[i]??(hooks.refs[i]={current:initial});},
  useState:(initial:unknown)=>{const i=hooks.cursor++;if(!(i in hooks.values))hooks.values[i]=initial;return [hooks.values[i],(update:unknown)=>{hooks.values[i]=typeof update==="function"?update(hooks.values[i]):update;}];},
}));
let DatePicker:typeof import("@/components/date-picker").DatePicker;
beforeAll(async()=>{vi.resetModules();({DatePicker}=await import("@/components/date-picker"));});
afterAll(()=>{vi.doUnmock("react");vi.resetModules();vi.unstubAllGlobals();});
beforeEach(()=>{hooks.values=[];hooks.refs=[];vi.stubGlobal("document",{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
function elements(node:unknown):ReactElement<Record<string,unknown>>[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=="object"||!("props" in node))return [];const e=node as ReactElement<Record<string,unknown>>;return [e,...elements(e.props.children)];}
function render(date="2026-10-07",extra:Partial<import("@/components/date-picker").DatePickerProps>={}){hooks.cursor=0;hooks.refCursor=0;hooks.effects=[];const tree=DatePicker({name:"date",defaultValue:date,...extra});return elements(tree);}
function opened(date="2026-10-07",extra:Partial<import("@/components/date-picker").DatePickerProps>={}){render(date,extra);hooks.values[1]=true;return render(date,extra);}
function key(nodes:ReturnType<typeof render>,key:string){const grid=nodes.find(e=>e.props.role==="grid")!;(grid.props.onKeyDown as (e:unknown)=>void)({key,preventDefault:vi.fn(),stopPropagation:vi.fn()});}
describe("date picker keyboard and calendar semantics",()=>{
  it.each([["2026-01-31",28],["2024-01-31",29]] as const)("clamps %s when PageDown enters February",(date,day)=>{key(opened(date),"PageDown");expect(hooks.values.slice(2,5)).toEqual([Number(date.slice(0,4)),1,day]);});
  it("clamps month movement to the allowed boundary",()=>{key(opened("2026-01-31",{max:"2026-02-12"}),"PageDown");expect(hooks.values.slice(2,5)).toEqual([2026,1,12]);});
  it("keeps arrow navigation within date bounds",()=>{key(opened("2026-10-07",{min:"2026-10-07"}),"ArrowLeft");expect(hooks.values.slice(2,5)).toEqual([2026,9,7]);});
  it("reverses horizontal movement in Arabic",()=>{key(opened("2026-10-07",{locale:"ar"}),"ArrowRight");expect(hooks.values[4]).toBe(6);});
  it("moves across the year boundary without losing the day",()=>{key(opened("2026-12-31"),"PageDown");expect(hooks.values.slice(2,5)).toEqual([2027,0,31]);});
  it("clamps leap day when returning from year navigation",()=>{opened("2024-02-29");hooks.values[2]=2025;hooks.values[5]="years";const button=render("2024-02-29").find(e=>e.props["aria-label"]==="Back to days")!;(button.props.onClick as ()=>void)();expect(hooks.values.slice(2,6)).toEqual([2025,1,28,"days"]);});
  it("returns from an out-of-range year to a valid bounded day grid",()=>{opened("2026-10-31",{max:"2026-10-20"});hooks.values[2]=2028;hooks.values[5]="years";const button=render("2026-10-31",{max:"2026-10-20"}).find(e=>e.props["aria-label"]==="Back to days")!;(button.props.onClick as ()=>void)();expect(hooks.values.slice(2,6)).toEqual([2026,9,20,"days"]);});
  it.each([["Home",5],["End",11]] as const)("moves %s to the current Monday-based week edge",(name,day)=>{key(opened(),name);expect(hooks.values[4]).toBe(day);});
  it("moves browser focus to the new day after an arrow key",()=>{const nodes=opened();const focus=vi.fn();const querySelector=vi.fn(()=>({focus,dataset:{day:"8"}}));hooks.refs[1]!.current={querySelector};key(nodes,"ArrowRight");render();hooks.effects.forEach(effect=>effect());expect(querySelector).toHaveBeenCalledWith('[data-day="8"]:not(:disabled)');expect(focus).toHaveBeenCalledOnce();});
  it("returns focus to the trigger on Escape and selection",()=>{let nodes=opened();const focus=vi.fn();const trigger=nodes.find(e=>e.props["aria-haspopup"]==="dialog")!;(trigger.props.ref as {current:unknown}).current={focus};key(nodes,"Escape");expect(hooks.values[1]).toBe(false);expect(focus).toHaveBeenCalledOnce();nodes=opened();key(nodes,"Enter");expect(focus).toHaveBeenCalledTimes(2);expect(hooks.values[0]).toBe("2026-10-07");});
  it("renders seven cells per calendar week and full weekday names",()=>{const nodes=opened();const rows=nodes.filter(e=>e.props.role==="row");expect(rows.length).toBe(6);for(const row of rows.slice(1))expect(elements(row.props.children).filter(e=>e.props.role==="gridcell")).toHaveLength(7);expect(nodes.find(e=>e.props.role==="columnheader")?.props["aria-label"]).toBe("Monday");});
  it.each(["months","years"])("exposes %s as a named group of native buttons",(view)=>{opened();hooks.values[5]=view;const nodes=render();expect(nodes.some(e=>e.props.role==="group"&&e.props["aria-label"])).toBe(true);expect(nodes.some(e=>e.props.role==="grid")).toBe(false);});
});
