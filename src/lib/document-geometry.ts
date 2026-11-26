/** Local four-corner perspective geometry: TL, TR, BR, BL. */
export type Point={x:number;y:number};
export type Quad=readonly [Point,Point,Point,Point];
export const FULL_QUAD:Quad=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
export function validQuad(q:Quad):boolean{
 if(q.length!==4||q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))return false;
 const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
 return q.every((p,i)=>cross(p,q[(i+1)%4]!,q[(i+2)%4]!)>.002);
}
export function projectiveMap(q:Quad):(u:number,v:number)=>Point{
 if(!validQuad(q))throw Error("Invalid corners");
 const [a,b,c,d]=q;
 const dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x;
 const dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y;
 const det=dx1*dy2-dx2*dy1;
 if(Math.abs(det)<1e-9)throw Error("Degenerate corners");
 const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
 const A=b.x-a.x+g*b.x,B=d.x-a.x+h*d.x,D=b.y-a.y+g*b.y,E=d.y-a.y+h*d.y;
 return (u,v)=>{const z=g*u+h*v+1;if(z<=1e-9)throw Error("Invalid projection");return {x:(A*u+B*v+a.x)/z,y:(D*u+E*v+a.y)/z}};
}
export function rectifiedSize(q:Quad,width:number,height:number):{width:number;height:number}{
 if(!validQuad(q)||!Number.isFinite(width)||!Number.isFinite(height)||width<3||height<3)throw Error("Invalid dimensions");
 const dist=(a:Point,b:Point)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);
 const w=(dist(q[0],q[1])+dist(q[2],q[3]))/2,h=(dist(q[0],q[3])+dist(q[1],q[2]))/2,s=Math.min(1,2000/Math.max(w,h));
 return {width:Math.max(1,Math.round(w*s)),height:Math.max(1,Math.round(h*s))};
}
export function rectifyPixels(source:Uint8ClampedArray,sw:number,sh:number,q:Quad,w:number,h:number):Uint8ClampedArray{
 if(![sw,sh,w,h].every(n=>Number.isSafeInteger(n)&&n>0&&n<=2400)||source.length!==sw*sh*4||w*h>4000000)throw Error("Invalid image");
 const map=projectiveMap(q),out=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=map((x+.5)/w,(y+.5)/h);
  const sx=Math.max(0,Math.min(sw-1,p.x*sw-.5)),sy=Math.max(0,Math.min(sh-1,p.y*sh-.5));
  const ix=Math.floor(sx),iy=Math.floor(sy),jx=Math.min(ix+1,sw-1),jy=Math.min(iy+1,sh-1),fx=sx-ix,fy=sy-iy,dst=(y*w+x)*4;
  for(let k=0;k<4;k++)out[dst+k]=source[(iy*sw+ix)*4+k]!*(1-fx)*(1-fy)+source[(iy*sw+jx)*4+k]!*fx*(1-fy)+source[(jy*sw+ix)*4+k]!*(1-fx)*fy+source[(jy*sw+jx)*4+k]!*fx*fy;
 }
 return out;
}
