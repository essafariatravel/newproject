/** Pure local document analysis. No network, logging, persistence or authority decision. */
export function passportValidity(expiry:string,reference:string):number|null{
 const parse=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return NaN;const d=Date.parse(s+"T00:00:00Z");return Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===s?d:NaN};
 const days=(parse(expiry)-parse(reference))/86400000;
 return Number.isFinite(days)?days:null;
}
export type ImageSignals={width:number;height:number;mean:number;contrast:number;sharpness:number;ratio:number};
export function imageSignals(pixels:Uint8ClampedArray,w:number,h:number,originalWidth=w,originalHeight=h):ImageSignals{
 if(w<3||h<3||pixels.length!==w*h*4)throw Error("Invalid image sample");
 const gray=new Float32Array(w*h);let sum=0,sq=0;
 for(let i=0;i<gray.length;i++){const p=i*4,a=pixels[p+3]!/255;const v=(.299*pixels[p]!+.587*pixels[p+1]!+.114*pixels[p+2]!)*a+255*(1-a);gray[i]=v;sum+=v;sq+=v*v}
 let lap=0,lapSq=0,n=0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,v=4*gray[i]!-gray[i-1]!-gray[i+1]!-gray[i-w]!-gray[i+w]!;lap+=v;lapSq+=v*v;n++}
 const mean=sum/gray.length;
 return {width:originalWidth,height:originalHeight,mean,contrast:Math.sqrt(Math.max(0,sq/gray.length-mean*mean)),sharpness:Math.max(0,lapSq/n-(lap/n)**2),ratio:originalWidth/originalHeight};
}
export function duplicateGroups<T>(rows:readonly {item:T;hash:string}[]):T[][]{
 const groups=new Map<string,T[]>();
 for(const {item,hash} of rows){const list=groups.get(hash)??[];list.push(item);groups.set(hash,list)}
 return [...groups.values()].filter(group=>group.length>1);
}

/** Technical framing comparison against a user-selected reference, never consular validation. */
export function photoRatioDifference(width:number,height:number,targetWidth:number,targetHeight:number):number|null{
 if(![width,height,targetWidth,targetHeight].every(n=>Number.isFinite(n)&&n>0))return null;
 return Math.abs((width/height)/(targetWidth/targetHeight)-1)*100;
}
