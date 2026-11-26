/** Pure local document analysis. No network, logging, persistence or authority decision. */
export function mrzCheckDigit(value:string):number{
 return [...value].reduce((sum,c,i)=>sum+(c==="<"?0:c>="0"&&c<="9"?Number(c):c.charCodeAt(0)-55)*[7,3,1][i%3]!,0)%10;
}
function mrzDate(value:string):boolean{
 if(!/^\d{6}$/.test(value))return false;
 const y=2000+Number(value.slice(0,2)),m=Number(value.slice(2,4)),d=Number(value.slice(4,6));
 const date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
export type PassportRead={name:string;nationality:string;expiryRaw:string;checksPassed:boolean};
export function readTd3(input:string):PassportRead|null{
 const lines=input.toUpperCase().split(/\r?\n/).map(s=>s.replace(/\s/g,"")).filter(Boolean);
 let a="",b="";
 for(let i=0;i<lines.length-1;i++){if(/^P[A-Z<][A-Z<]{3}[A-Z<]{39}$/.test(lines[i]!)&&/^[A-Z0-9<]{44}$/.test(lines[i+1]!)){a=lines[i]!;b=lines[i+1]!;break}}
 if(!a||!b)return null;
 const name=a.slice(5).replace(/<+/g," ").trim();
 if(!name||!b.slice(0,9).replace(/</g,"")||!mrzDate(b.slice(13,19))||!mrzDate(b.slice(21,27))||!(/^[A-Z]{1,3}<{0,2}$/.test(b.slice(10,13))))return null;
 const check=(v:string,c:string)=>/^\d$/.test(c)&&mrzCheckDigit(v)===Number(c);
 const optional=b.slice(28,42);
 const checksPassed=check(b.slice(0,9),b[9]!)&&check(b.slice(13,19),b[19]!)&&check(b.slice(21,27),b[27]!)&&(check(optional,b[42]!)||(/^<+$/.test(optional)&&b[42]==="<"))&&check(b.slice(0,10)+b.slice(13,20)+b.slice(21,43),b[43]!);
 return {name,nationality:b.slice(10,13).replace(/<+$/,""),expiryRaw:b.slice(21,27),checksPassed};
}
export function expiryCandidates(raw:string,today:string):string[]{
 if(!mrzDate(raw)||!/^\d{4}-\d{2}-\d{2}$/.test(today))return [];
 const century=Math.floor(Number(today.slice(0,4))/100)*100;
 return [century-100,century,century+100].map(c=>String(c+Number(raw.slice(0,2)))+"-"+raw.slice(2,4)+"-"+raw.slice(4,6)).filter(s=>Number.isFinite(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s);
}
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
