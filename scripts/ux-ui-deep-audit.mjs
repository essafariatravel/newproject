#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src/app", "src/components"];
const EXTS = new Set([".tsx", ".ts", ".jsx", ".js", ".css", ".scss"]);
const APPROVED_SPACING = new Set([0, 4, 8, 16, 24, 32]);
const APPROVED_FONT_PX = new Set([12, 16, 18, 24, 32]);
const ALLOWED_TW_SPACING = new Set(["0", "1", "2", "4", "6", "8"]);
const BLOCK = [];
const REVIEW = [];

function walk(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

function add(list,file,line,rule,value,note="") {
  list.push({file,line,rule,value,note});
}

function lineNo(src, index) {
  return src.slice(0,index).split("\n").length;
}

function stripVariants(token) {
  const parts = token.split(":");
  return parts[parts.length-1];
}

function auditTailwind(file, src) {
  const tokenMatches = src.match(/[A-Za-z0-9_:[\]./%-]+/g) ?? [];
  const spacingRe = /^(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-(.+)$/;
  const seen = new Set();
  for (const raw of tokenMatches) {
    const token = stripVariants(raw);
    const m = token.match(spacingRe);
    if (!m) continue;
    const val = m[2];
    if (/^\[/.test(val)) {
      const px = val.match(/^\[(\d+(?:\.\d+)?)px\]$/);
      if (px && !APPROVED_SPACING.has(Number(px[1]))) {
        const key=file+"|spacing|"+raw;
        if(!seen.has(key)){seen.add(key);add(BLOCK,file,0,"layout-spacing",raw,"arbitrary layout spacing outside 0/4/8/16/24/32px");}
      }
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(val) && !ALLOWED_TW_SPACING.has(val)) {
      const key=file+"|spacing|"+raw;
      if(!seen.has(key)){seen.add(key);add(BLOCK,file,0,"layout-spacing",raw,"Tailwind layout spacing outside approved scale");}
    }
  }

  const forbiddenType = [
    ["text-sm","14px"],["text-xl","20px"],["text-3xl","30px"],["text-4xl","36px"],
    ["text-5xl","48px"],["text-6xl","60px"],["text-7xl","72px"],["text-8xl","96px"],["text-9xl","128px"]
  ];
  for (const [klass,size] of forbiddenType) {
    const re=new RegExp("\\b"+klass+"\\b","g"); let m;
    while((m=re.exec(src))) add(BLOCK,file,lineNo(src,m.index),"font-size",klass,size+" is outside 12/16/18/24/32px");
  }

  const arb=/\btext-\[(\d+(?:\.\d+)?)px\]/g; let tm;
  while((tm=arb.exec(src))) {
    const px=Number(tm[1]);
    if(!APPROVED_FONT_PX.has(px)) add(BLOCK,file,lineNo(src,tm.index),"font-size",tm[0],"outside approved five-size system");
  }

  for (const klass of ["font-medium","font-bold","font-extrabold","font-black","font-light","font-thin"]) {
    const re=new RegExp("\\b"+klass+"\\b","g"); let m;
    while((m=re.exec(src))) add(BLOCK,file,lineNo(src,m.index),"font-weight",klass,"only 400/600 are approved");
  }

  // Candidate controls below 44px. Review only because icon can sit inside a larger target.
  const lines=src.split(/\r?\n/);
  lines.forEach((line,i)=>{
    if (/(<button\b|<a\b|<Link\b|Button\b|IconButton\b)/.test(line) &&
        /\b(?:h|w)-(?:6|7|8|9|10)\b/.test(line)) {
      add(REVIEW,file,i+1,"target-size",line.trim(),"verify effective target is >=44x44");
    }
    if (/\b(?:ml|mr|pl|pr|left|right)-/.test(line)) {
      add(REVIEW,file,i+1,"rtl-physical-direction",line.trim(),"use logical start/end unless intrinsically LTR");
    }
    if (/\b(?:bg-gradient|backdrop-blur|animate-bounce)\b/.test(line) || /spring|elastic|parallax/i.test(line)) {
      add(REVIEW,file,i+1,"decorative-effect",line.trim(),"verify effect is operationally justified");
    }
    if ((/text-\[#?C99A32\]/i.test(line) || /color\s*:\s*#C99A32/i.test(line)) && /bg-white|ivory|#fff|#ffffff/i.test(line)) {
      add(REVIEW,file,i+1,"gold-contrast",line.trim(),"gold small text on white/ivory is not approved");
    }
  });
}

function toPx(raw) {
  const m=raw.match(/^(-?\d+(?:\.\d+)?)(px|rem)$/);
  if(!m) return null;
  return m[2]==="px" ? Number(m[1]) : Number(m[1])*16;
}

function auditCssSpacing(file, src) {
  const propRe=/\b(padding(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|margin(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap)\s*:\s*([^;}{]+)/g;
  let m;
  while((m=propRe.exec(src))) {
    const vals=m[2].trim().split(/\s+/).filter(v=>!v.startsWith("calc(")&&v!=="auto"&&v!=="normal");
    for(const v of vals){
      const px=toPx(v);
      if(px!==null && !APPROVED_SPACING.has(px)) add(BLOCK,file,lineNo(src,m.index),"css-layout-spacing",`${m[1]}: ${v}`,`${px}px outside approved scale`);
    }
  }
}

const files=ROOTS.flatMap(r=>walk(r));
for(const file of files){
  const src=fs.readFileSync(file,"utf8");
  auditTailwind(file,src);
  if(/\.s?css$/.test(file)) auditCssSpacing(file,src);
}

function printSection(title,items){
  console.log("\n## "+title+" ("+items.length+")");
  for(const f of items.slice(0,400)) {
    console.log(`- ${f.file}${f.line?":"+f.line:""} [${f.rule}] ${f.value}${f.note?" — "+f.note:""}`);
  }
  if(items.length>400) console.log(`... ${items.length-400} more`);
}

console.log(`ESSAFARIA deep UI audit scanned ${files.length} files.`);
printSection("Blocking candidates",BLOCK);
printSection("Manual-review candidates",REVIEW);

fs.writeFileSync("ux-ui-deep-audit.json",JSON.stringify({filesScanned:files.length,blocking:BLOCK,review:REVIEW},null,2));

if(BLOCK.length){
  console.error(`\nFAIL: ${BLOCK.length} blocking UX/UI token violations remain.`);
  process.exit(1);
}
console.log("\nPASS: no blocking token violations remain.");
