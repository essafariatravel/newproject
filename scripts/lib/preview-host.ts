/** Deployment URL recorded independently after authenticated Vercel project inspection. */
export function trustedPreviewOrigin(requested:string|undefined, recorded:string|undefined):string {
  if(!requested||!recorded)throw new Error("Independently recorded Preview deployment URL is missing.");
  const target=new URL(requested),trusted=new URL(recorded);
  for(const value of [target,trusted])if(value.protocol!=="https:"||!value.hostname.endsWith(".vercel.app")||value.username||value.password||value.port||value.pathname!=="/"||value.search||value.hash)throw new Error("Invalid isolated Preview origin.");
  if(target.origin!==trusted.origin)throw new Error("Preview target does not match the independently recorded deployment.");
  return trusted.origin;
}
