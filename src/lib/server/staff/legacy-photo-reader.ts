import { EarningsError } from '../earnings/transport.ts';

const maximumBytes=8*1024*1024;
const imageTypes=/^image\/(jpeg|png|webp)$/;

export async function readLegacyReportReceipt(source:string,bucket:string|undefined,fetchImage=fetch) {
  let url:URL;
  try {url=new URL(source);} catch {throw new EarningsError(422,'staff_report_photo_invalid');}
  const matchesFirebase=url.hostname==='firebasestorage.googleapis.com' && url.pathname.startsWith('/v0/b/'+bucket+'/o/');
  const matchesStorage=url.hostname==='storage.googleapis.com' && url.pathname.startsWith('/'+bucket+'/');
  if (!bucket || url.protocol!=='https:' || url.username || url.password || url.port || !(matchesFirebase || matchesStorage)) {
    throw new EarningsError(422,'staff_report_photo_invalid');
  }
  const response=await fetchImage(url,{redirect:'error',signal:AbortSignal.timeout(8000)});
  const mime=response.headers.get('content-type');
  const bytes=Number(response.headers.get('content-length'));
  const reader=response.body?.getReader();
  if (!response.ok || !mime || !imageTypes.test(mime) || !reader || bytes>maximumBytes) {
    void reader?.cancel();
    throw new EarningsError(422,'staff_report_photo_invalid');
  }
  const chunks:Uint8Array[]=[];
  let size=0;
  try {
    while (true) {
      const {value,done}=await reader.read();
      if (done) break;
      size+=value.byteLength;
      if (size>maximumBytes) {
        void reader.cancel();
        throw new EarningsError(422,'staff_report_photo_invalid');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return 'data:'+mime+';base64,'+Buffer.concat(chunks).toString('base64');
}
