import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { factsHash } from '../../../../functions/src/earnings-source-adapter.ts';
import type { PlaceValue } from '../../types';
import { getStopIdentityKey } from '../../route-stop-utils.ts';
import { isProtectedPhoto, protectedPhotoPrefix } from '../../driver/photo-policy.ts';
import { reportEvidenceInput, type ReportAiResult, type ReportAiRoute } from '../../staff/reports-contract.ts';
import { readLegacyReportReceipt } from './legacy-photo-reader.ts';
export { readLegacyReportReceipt } from './legacy-photo-reader.ts';
import { EarningsError } from '../earnings/transport.ts';
import { reportTarget, verifyReportRoute, writeReportAudit } from './reports.ts';

type Actor = Parameters<typeof writeReportAudit>[2];
type Analysis = {success:boolean;extractedValue:number;error?:string};
type Services = {
  verifyAuthority:()=>Promise<void>;
  readPrivatePhoto:(id:string,routeId:string)=>Promise<string>;
  analyze:(photo:string)=>Promise<Analysis>;
  bucket?:string;
  fetchImage?:typeof fetch;
};
const maximumBytes=8*1024*1024;
const imageTypes=/^image\/(jpeg|png|webp)$/;

async function readReportReceipt(db:Firestore,routeId:string,stop:DocumentData,source:string,services:Services) {
  if (!isProtectedPhoto(source)) return readLegacyReportReceipt(source,services.bucket,services.fetchImage);
  const id=source.slice(protectedPhotoPrefix.length);
  const receipt=await db.collection('driverDeliveryMedia').doc(id).get();
  const stopKey=getStopIdentityKey(stop as PlaceValue);
  if (!stopKey || receipt.get('routeId')!==routeId || receipt.get('kind')!=='delivery' ||
      receipt.get('stopKey')!==stopKey || receipt.get('url')!==source || !imageTypes.test(receipt.get('contentType'))) {
    throw new EarningsError(422,'staff_report_photo_invalid');
  }
  const data=await services.readPrivatePhoto(id,routeId);
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(data) || data.length>Math.ceil(maximumBytes/3)*4+30) {
    throw new EarningsError(422,'staff_report_photo_invalid');
  }
  return data;
}

function previousResults(receipt:DocumentData|undefined,fingerprint:string) {
  if (!receipt) return null;
  if (receipt.fingerprint!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
  return receipt.results as ReportAiResult[];
}

export async function reconcileStaffReportWithAi(db:Firestore,actor:Actor,input:ReportAiRoute,services:Services) {
  const routeRef=db.collection('routes').doc(input.routeId);
  const receiptRef=db.collection('rotaStaffReportAiCommands').doc(input.commandId);
  const fingerprint=factsHash({actorId:actor.userId,input});
  const [receipt,current]=await db.getAll(receiptRef,routeRef);
  const existing=previousResults(receipt.data(),fingerprint);
  if (existing) return existing;
  const route=verifyReportRoute(current,input.revision);
  const stops:Array<DocumentData>=Array.isArray(route.stops) ? route.stops:[];
  const results:ReportAiResult[]=[];
  for (const target of input.stops) {
    const stop=reportTarget(stops,target);
    const evidence=reportEvidenceInput(stop);
    const base:ReportAiResult={routeId:input.routeId,stopIndex:target.index,
      ...(typeof stop.customerName==='string'?{customerName:stop.customerName}:{}),
      expectedValue:evidence?.expectedValue ?? 0,extractedValue:0,success:false,reconciled:false,difference:0};
    if (!evidence) {
      results.push({...base,error:'A entrega não está disponível para conciliação com IA.'});
      continue;
    }
    try {
      const image=await readReportReceipt(db,input.routeId,stop,evidence.photoUrl,services);
      const analysis=await services.analyze(image);
      if (!analysis.success || !Number.isFinite(analysis.extractedValue) || analysis.extractedValue<=0) {
        results.push({...base,error:'A IA não conseguiu identificar um valor válido no comprovante.'});
        continue;
      }
      const difference=Math.abs(Math.round(analysis.extractedValue*100)-Math.round(base.expectedValue*100))/100;
      const reconciled=difference<=0.5;
      results.push({...base,extractedValue:analysis.extractedValue,success:true,reconciled,difference,
        ...(!reconciled ? {error:'O valor do comprovante excedeu a tolerância de R$ 0,50.'}:{})});
    } catch {
      results.push({...base,error:'Não foi possível analisar o comprovante vinculado à parada.'});
    }
  }
  await services.verifyAuthority();
  return db.runTransaction(async tx=>{
    const [prior,snapshot]=await tx.getAll(receiptRef,routeRef);
    const replay=previousResults(prior.data(),fingerprint);
    if (replay) return replay;
    const currentRoute=verifyReportRoute(snapshot,input.revision);
    const currentStops=[...currentRoute.stops as DocumentData[]];
    const now=Timestamp.now();
    const who=actor.sourceUid ?? actor.userId;
    for (const result of results.filter(row=>row.reconciled)) {
      const stop=currentStops[result.stopIndex];
      const next={...stop,reconciled:true,reconciledAt:now,reconciledBy:who,reconciledMethod:'ai',aiExtractedValue:result.extractedValue};
      currentStops[result.stopIndex]=next;
      writeReportAudit(db,tx,actor,input.routeId,currentRoute,next,input.commandId,result.stopIndex,'ai',[
        {field:'reconciled',oldValue:false,newValue:true,fieldLabel:'Conciliação'},
        {field:'aiExtractedValue',oldValue:null,newValue:result.extractedValue,fieldLabel:'Valor extraído do comprovante'},
      ]);
    }
    if (results.some(result=>result.reconciled)) tx.update(routeRef,{stops:currentStops,lastModifiedAt:now,lastModifiedBy:who});
    tx.create(receiptRef,{fingerprint,results,actorId:actor.userId,createdAt:now});
    return results;
  });
}
