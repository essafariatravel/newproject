// Pure, bounded parser. Search words are data, never SQL identifiers.
export function normalizeNotificationSearch(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
export function parseNotificationSearch(value:string){
 let text=normalizeNotificationSearch(value.slice(0,160));
 const unread=/(^|\s)(non lues?|unread|غير مقروءة)(?=\s|$)/.test(text);
 const date=/(^|\s)(hier|yesterday|أمس)(?=\s|$)/.test(text)?"yesterday":/(^|\s)(aujourd’hui|aujourd'hui|today|اليوم)(?=\s|$)/.test(text)?"today":null;
 text=text.replace(/(^|\s)(non lues?|unread|غير مقروءة|hier|yesterday|أمس|aujourd’hui|aujourd'hui|today|اليوم)(?=\s|$)/g," ").trim();
 const aliases:Record<string,string[]>={"visa approuve":["APPLICATION_DECISION","APPLICATION_COMPLETED"],"visa approved":["APPLICATION_DECISION","APPLICATION_COMPLETED"],"document":["DOCUMENT_REQUESTED","DOCUMENT_REJECTED","DOCUMENT_ACCEPTED","DOCUMENT_REQUEST_FULFILLED","RESUBMISSION_REQUIRED"],"documents":["DOCUMENT_REQUESTED","DOCUMENT_REJECTED","DOCUMENT_ACCEPTED","DOCUMENT_REQUEST_FULFILLED","RESUBMISSION_REQUIRED"],"وثائق":["DOCUMENT_REQUESTED","DOCUMENT_REJECTED","DOCUMENT_ACCEPTED","DOCUMENT_REQUEST_FULFILLED"],"message":["MESSAGE_POSTED"],"رسالة":["MESSAGE_POSTED"],"recharge":["WALLET_TOPUP_DECIDED","WALLET_TOPUP_REQUESTED","TOPUP_REQUESTED"],"top-up":["WALLET_TOPUP_DECIDED","WALLET_TOPUP_REQUESTED","TOPUP_REQUESTED"],"شحن":["WALLET_TOPUP_DECIDED","WALLET_TOPUP_REQUESTED","TOPUP_REQUESTED"]};
 // Approval specifically requires the actual case status, not merely a decision event.
 const approved=/(^|\s)(visa approuve|visa approved|تأشيرة مقبولة)(?=\s|$)/.test(text);
 if(approved)text=text.replace(/(^|\s)(visa approuve|visa approved|تأشيرة مقبولة)(?=\s|$)/g," ").trim();
 const types:string[]=[];for(const [alias,values] of Object.entries(aliases)){if(text===alias||text.startsWith(alias+" ")||text.endsWith(" "+alias)){types.push(...values);text=text.split(" ").filter((_,index,all)=>!(alias===all[index])).join(" ").trim();}}
 const amount=text.replace(/\s/g,"");
 return {unread,date,approved,types:[...new Set(types)],amount:/^\d{4,12}$/.test(amount)?amount:null,terms:text.split(/\s+/).filter(Boolean).slice(0,6)};
}
export function escapeNotificationLike(value:string){return "%"+value.replace(/[\\%_]/g,"\\$&")+"%";}

const isoCodes="AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
let countryIndex:{code:string;names:string[]}[]|undefined;
export function notificationCountryCodes(term:string):string[]{
 if(term.length<3)return [];
 countryIndex??=isoCodes.map(code=>({code,names:["fr","en","ar"].map(locale=>{try{return normalizeNotificationSearch(new Intl.DisplayNames([locale],{type:"region"}).of(code)??"")}catch{return ""}})}));
 return countryIndex.filter(entry=>entry.names.some(name=>name===term||name.split(/[\s-]+/).includes(term))).map(entry=>entry.code);
}
