import {describe,it,expect} from "vitest";
import {FULL_QUAD,validQuad,projectiveMap,rectifiedSize,rectifyPixels,type Quad} from "@/lib/document-geometry";
describe("local perspective geometry",()=>{
 it("preserves identity and dimensions",()=>{const map=projectiveMap(FULL_QUAD);expect(map(.3,.7)).toEqual({x:.3,y:.7});expect(rectifiedSize(FULL_QUAD,4000,2000)).toEqual({width:2000,height:1000})});
 it("maps all four perspective corners",()=>{const q:Quad=[{x:.1,y:.2},{x:.9,y:.1},{x:.8,y:.9},{x:.2,y:.8}];const map=projectiveMap(q);for(const [i,uv] of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]] as const){const p=map(uv[0],uv[1]);expect(p.x).toBeCloseTo(q[i].x);expect(p.y).toBeCloseTo(q[i].y)}});
 it("rejects crossed, collapsed and outside corners",()=>{expect(validQuad([FULL_QUAD[0],FULL_QUAD[2],FULL_QUAD[1],FULL_QUAD[3]])).toBe(false);expect(validQuad([FULL_QUAD[0],FULL_QUAD[0],FULL_QUAD[2],FULL_QUAD[3]])).toBe(false);expect(validQuad([{x:-.1,y:0},FULL_QUAD[1],FULL_QUAD[2],FULL_QUAD[3]])).toBe(false)});
 it("preserves synthetic pixels under identity",()=>{const a=new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);expect(rectifyPixels(a,2,2,FULL_QUAD,2,2)).toEqual(a)});
 it("rejects oversized outputs",()=>expect(()=>rectifyPixels(new Uint8ClampedArray(16),2,2,FULL_QUAD,2001,2001)).toThrow());
});
