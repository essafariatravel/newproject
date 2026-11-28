/** Opt-in, server-only timings. Never log request data, IDs, URLs or exception text. */
type CoreOperation="agency.shell.read"|"agency.dashboard.read"|"agency.booking.read"|"agency.catalogue.requirements"|"agency.notifications.read";
export async function coreTimed<T>(operation:CoreOperation,run:()=>Promise<T>):Promise<T>{
 if(process.env.ESSAFARIA_CORE_TIMING!=="true")return run();
 const started=performance.now();let success=false;
 try{const result=await run();success=true;return result}
 // Opt-in server timing intentionally emits a structured, non-sensitive info event.
 // eslint-disable-next-line no-console
 finally{console.info(JSON.stringify({event:"essafaria.core.timing",operation,durationMs:Math.round(performance.now()-started),success}))}
}
