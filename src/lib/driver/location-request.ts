export function locationRequestDelivery(read:()=>Promise<string|null>,deliver:(revision:string)=>Promise<boolean>,active=()=>true) {
  let inFlight=false;
  let acknowledged:string|null=null;
  return async()=>{
    if (inFlight || !active()) return;
    inFlight=true;
    try {
      const revision=await read();
      if (active() && revision && revision!==acknowledged && await deliver(revision)) acknowledged=revision;
    } catch {
      // Only a successful storage ACK advances the observed revision.
    } finally {inFlight=false;}
  };
}
