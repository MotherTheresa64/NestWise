export type Connection = 'ready' | 'connecting' | 'waking' | 'offline' | 'unreachable';
/** Wake with safe GETs before sending a write. Never retry an arbitrary POST after an uncertain response. */
export function createTransport(base:string,onStatus:(status:Connection)=>void,send:typeof fetch=fetch,isOffline=()=>typeof navigator!=='undefined' && navigator.onLine===false) {
  let contactedAt=0;let waking:Promise<void> | undefined;
  async function ready() {
    if(isOffline()){onStatus('offline');throw new Error('This device is offline. Saved care stays on this device.');}
    if(contactedAt && Date.now()-contactedAt<60000)return;
    if(waking)return waking;
    waking=(async()=>{
      onStatus('connecting');const notice=setTimeout(()=>onStatus('waking'),4000);const deadline=Date.now()+75000;
      try {
        while(Date.now()<deadline){
          if(isOffline())throw new Error('offline');
          try {const response=await send(`${base}/ready`,{signal:AbortSignal.timeout(Math.max(1,Math.min(12000,deadline-Date.now())))});if(response.ok){contactedAt=Date.now();onStatus('ready');return;}}catch{ /* Only the safe readiness GET is retried. */ }
          if(Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1000));
        }
        throw new Error('unreachable');
      } catch {onStatus(isOffline()?'offline':'unreachable');throw new Error(isOffline()?'This device is offline. Saved logs remain here.':'NestWise is taking longer to respond. Please try again; saved logs remain on this device.');}
      finally{clearTimeout(notice);}
    })();
    try{await waking;}finally{waking=undefined;}
  }
  return async(path:string,init:RequestInit):Promise<Response>=>{
    await ready();
    try{const response=await send(`${base}${path}`,{...init,signal:AbortSignal.timeout(12000)});contactedAt=Date.now();onStatus('ready');return response;}
    catch{contactedAt=0;onStatus(isOffline()?'offline':'unreachable');throw new Error('The response could not be confirmed. Your queued care remains saved. Check before repeating other account actions.');}
  };
}
