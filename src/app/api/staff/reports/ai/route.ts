import { analyzePaymentReceipt } from '@/ai/flows/analyze-payment-receipt';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { readDeliveryPhoto } from '@/lib/server/driver/media';
import { reconcileStaffReportWithAi } from '@/lib/server/staff/reports-ai';
import { reportAiSchema, type ReportAiResult } from '@/lib/staff/reports-contract';
import { EarningsError, earningsErrorResponse, readJsonBody } from '@/lib/server/earnings/transport';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';
import { privateJson } from '@/lib/server/earnings/store';

export const maxDuration=60;

export async function POST(request:Request) {
  try {
    const actor=await requireStaffActor(request,'reports:reconcile');
    const payload=reportAiSchema.safeParse(await readJsonBody(request,12_000));
    if (!payload.success) throw new EarningsError(422,'staff_invalid_command');
    if (!rateLimit('staff-report-ai:'+actor.scopeId+':'+actor.userId,rateLimitConfigs.write).success) {
      throw new EarningsError(429,'staff_report_ai_rate_limited');
    }
    const db=staffSourceDb(actor);
    const results:ReportAiResult[]=[];
    for (const route of payload.data.routes) {
      try {
        results.push(...await reconcileStaffReportWithAi(db,actor,route,{
          verifyAuthority:async()=>{await requireStaffActor(request,'reports:reconcile');},
          readPrivatePhoto:(id,routeId)=>readDeliveryPhoto(id,{routeId}),
          analyze:imageUrl=>analyzePaymentReceipt({imageUrl}),
          bucket:process.env.FIREBASE_STORAGE_BUCKET,
        }));
      } catch(error) {
        if (!(error instanceof EarningsError) || ![404,409].includes(error.status)) throw error;
        results.push(...route.stops.map(stop=>({routeId:route.routeId,stopIndex:stop.index,expectedValue:0,
          extractedValue:0,success:false,reconciled:false,difference:0,error:'A rota mudou. Atualize o relatório e selecione novamente.'})));
      }
    }
    return privateJson({results,summary:{
      total:results.length,
      reconciled:results.filter(row=>row.reconciled).length,
      failed:results.filter(row=>!row.reconciled).length,
      aiErrors:results.filter(row=>!row.success).length,
      valueMismatch:results.filter(row=>row.success&&!row.reconciled).length,
    }});
  } catch(error) {
    return earningsErrorResponse(error);
  }
}
