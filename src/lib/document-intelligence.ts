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

export type GuardKind="photo"|"passport"|"bank"|"other";
export type GuardIssue="invalidFile"|"unreadable"|"limited"|"landscape"|"photoShape"|"photoTooSmall"|"lowResolution"|"blur"|"exposure"|"contrast"|"noFace"|"multipleFaces"|"faceSize"|"facePosition"|"background"|"faceUnavailable"|"portraitInDocument"|"documentInPhoto"|"typeUncertain"|"pdfProtected"|"pdfBlank"|"pdfRepeated"|"pdfPartial"|"duplicate"|"similar";
export type FaceBox={x:number;y:number;width:number;height:number};
export type GuardImage={signals:ImageSignals;fingerprint:string;edgeVariation:number;faces:FaceBox[]|null;layout?:DocumentLayout;faceSharpness?:number;isPdfPage?:boolean};
export function documentKind(code:string,name:string):GuardKind{
 const s=(code+" "+name).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 if(/passport|passeport|جواز/.test(s))return "passport";
 if(/photo|portrait|picture|صورة/.test(s))return "photo";
 if(/bank|bancaire|بنكي|بنك/.test(s))return "bank";
 return "other";
}

export type DocumentLayout={textRows:number;outsideTextRows:number;edgeDensity:number};
export type VisualType="portrait"|"document"|"uncertain";
/** Counts repeated horizontal high-frequency bands, without reading characters.
 * Face boxes are only geometric regions; no identity matching or recognition. */
export function documentLayout(pixels:Uint8ClampedArray,w:number,h:number,faces:FaceBox[]|null):DocumentLayout{
 if(w<3||h<3||pixels.length!==w*h*4)throw Error("Invalid layout sample");
 const g=new Float32Array(w*h);for(let i=0;i<g.length;i++){const p=i*4;g[i]=.299*pixels[p]!+.587*pixels[p+1]!+.114*pixels[p+2]!}
 let edges=0,n=0,rows=0,outsideRows=0,prior=false,priorOutside=false;
 for(let y=2;y<h-2;y++){
  let transitions=0,outside=0,available=0,previous=false,previousOut=false;
  for(let x=2;x<w-2;x++){
   const i=y*w+x,d=Math.abs(g[i+1]!-g[i-1]!)>26;
   const inside=(faces??[]).some(f=>x/w>=f.x-.06&&x/w<=f.x+f.width+.06&&y/h>=f.y-.08&&y/h<=f.y+f.height+.08);
   n++;if(d)edges++;
   if(d&&!previous)transitions++;previous=d;
   if(!inside){available++;if(d&&!previousOut)outside++;previousOut=d}else previousOut=false;
  }
  const band=transitions>=Math.max(7,w*.038),outBand=available>w*.32&&outside>=Math.max(6,w*.032);
  if(band&&!prior)rows++;if(outBand&&!priorOutside)outsideRows++;
  prior=band;priorOutside=outBand;
 }
 return {textRows:rows,outsideTextRows:outsideRows,edgeDensity:n?edges/n:0};
}
export function classifyVisual(image:GuardImage):VisualType{
 const s=image.signals,faces=image.faces,layout=image.layout;
 const largest=faces?.slice().sort((a,b)=>b.width*b.height-a.width*a.height)[0];
 const centered=largest&&Math.abs(largest.x+largest.width/2-.5)<=.23;
 const substantial=largest&&largest.width>=.20&&largest.height>=.25&&largest.width*largest.height>=.065;
 // A prominent centered face overrides aspect ratio; small embedded faces do not.
 if(faces?.length===1&&centered&&substantial&&!(layout&&layout.outsideTextRows>=11))return "portrait";
 if(layout&&(layout.outsideTextRows>=11||(!largest&&layout.textRows>=12)))return "document";
 if(s.ratio>1.08&&layout&&layout.textRows>=6&&(!largest||!substantial||!centered))return "document";
 if(largest&&(!substantial||!centered)&&layout&&layout.outsideTextRows>=6)return "document";
 return "uncertain";
}

export function visualIssues(kind:GuardKind,image:GuardImage):GuardIssue[]{
 const s=image.signals,issues:GuardIssue[]=[],type=classifyVisual(image);
 if(!image.isPdfPage&&Math.min(s.width,s.height)<300)issues.push(kind==="photo"?"photoTooSmall":"lowResolution");
 if((kind==="photo"?image.faceSharpness??s.sharpness:s.sharpness)<(kind==="photo"?22:35))issues.push("blur");
 if(s.mean<45||s.mean>240)issues.push("exposure");
 if(s.contrast<18)issues.push("contrast");
 if(kind==="photo"){
  if(type==="document"&&s.ratio<=1.08)issues.push("documentInPhoto");
  if(s.ratio>1.08)issues.push("landscape");
  else if(s.ratio<.55)issues.push("photoShape");
  if(image.edgeVariation>36)issues.push("background");
  if(image.faces===null){if(type!=="document"&&s.ratio<=1.08)issues.push("faceUnavailable");}
  else if(image.faces.length===0)issues.push("noFace");
  else if(image.faces.length>1)issues.push("multipleFaces");
  else {const f=image.faces[0]!;if(f.height<.28||f.height>.88||f.width<.2||f.width>.88)issues.push("faceSize");if(Math.abs(f.x+f.width/2-.5)>.18||f.y+f.height/2<.22||f.y+f.height/2>.75)issues.push("facePosition")}
 }else if(type==="portrait")issues.push("portraitInDocument");
 else if(type==="uncertain")issues.push("typeUncertain");
 if(kind==="photo"&&type==="uncertain"&&s.ratio<=1.08&&!issues.includes("typeUncertain"))issues.push("typeUncertain");
 return issues;
}
export function signatureKind(bytes:Uint8Array):"pdf"|"jpeg"|"png"|"webp"|"doc"|"zip"|"unknown"{
 const at=(offset:number,expected:number[])=>expected.every((v,i)=>bytes[offset+i]===v);
 if(at(0,[37,80,68,70,45]))return "pdf";
 if(at(0,[255,216,255]))return "jpeg";
 if(at(0,[137,80,78,71,13,10,26,10]))return "png";
 if(at(0,[82,73,70,70])&&at(8,[87,69,66,80]))return "webp";
 if(at(0,[208,207,17,224,161,177,26,225]))return "doc";
 if(at(0,[80,75,3,4]))return "zip";
 return "unknown";
}
export function expectedSignature(name:string):ReturnType<typeof signatureKind>{
 const ext=name.toLowerCase().split(".").pop();
 return ext==="jpg"||ext==="jpeg"?"jpeg":ext==="docx"?"zip":ext==="pdf"||ext==="png"||ext==="webp"||ext==="doc"?ext:"unknown";
}
export function differenceHash(gray:readonly number[]):string{
 if(gray.length!==72)throw Error("Invalid fingerprint sample");
 let bits="";for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits+=gray[y*9+x]!>gray[y*9+x+1]!?"1":"0";return bits;
}
export function probablySimilar(a:GuardImage,b:GuardImage):boolean{
 if(a.fingerprint.length!==64||b.fingerprint.length!==64||a.signals.contrast<18||b.signals.contrast<18)return false;
 if(Math.abs(a.signals.ratio/b.signals.ratio-1)>.035||Math.abs(a.signals.mean-b.signals.mean)>20||Math.abs(a.signals.contrast-b.signals.contrast)>22)return false;
 let d=0;for(let i=0;i<64;i++)if(a.fingerprint[i]!==b.fingerprint[i])d++;
 return d<=4;
}
export function guardTechnical(issue:GuardIssue):boolean{return issue==="invalidFile"||issue==="unreadable"}
/** ESSAFARIA internal rule: seven calendar months, clamped at month end. */
export function minimumPassportExpiry(reference:string):string|null{
 if(passportValidity(reference,reference)!==0)return null;
 const [y,m,d]=reference.split("-").map(Number);
 const first=new Date(Date.UTC(y!,m!-1+7,1));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 first.setUTCDate(Math.min(d!,last));
 return first.toISOString().slice(0,10);
}
export function expiryAssessment(expiry:string,today:string,_departure:string){
 const reference=today;
 const minimum=minimumPassportExpiry(reference),days=passportValidity(expiry,reference);
 const state=!expiry?"missing":days===null||!minimum?"invalid":days<=0?"expired":expiry<minimum?"insufficient":"valid";
 return {reference,days,minimum,state} as const;
}
export function passportMeetsPolicy(expiry:string,today:string,departure:string):boolean{
 return expiryAssessment(expiry,today,departure).state==="valid";
}

export function guardStatus(issues:readonly GuardIssue[],checking=false,attached=true):"missing"|"checking"|"invalid"|"warning"|"limited"|"clear"{
 if(!attached)return "missing";
 if(checking)return "checking";
 if(issues.some(guardTechnical))return "invalid";
 if(issues.some(k=>!["limited","faceUnavailable","typeUncertain","pdfPartial"].includes(k)))return "warning";
 return issues.length?"limited":"clear";
}
export function blankPdfPage(s:ImageSignals):boolean{return s.contrast<3&&s.mean>247}
export function pdfPagePlan(total:number,limit=4):number[]{
 if(!Number.isSafeInteger(total)||total<1||!Number.isSafeInteger(limit)||limit<1)return [];
 const count=Math.min(total,limit);
 if(count===1)return [1];
 return Array.from({length:count},(_,i)=>1+Math.round(i*(total-1)/(count-1)));
}
export function pdfPageIssues(pages:readonly GuardImage[],total:number):GuardIssue[]{
 const issues:GuardIssue[]=[];
 if(pages.length<total)issues.push("pdfPartial");
 if(pages.some(p=>blankPdfPage(p.signals)))issues.push("pdfBlank");
 if(pages.some((p,i)=>!blankPdfPage(p.signals)&&pages.slice(0,i).some(q=>probablySimilar(p,q))))issues.push("pdfRepeated");
 return issues;
}
