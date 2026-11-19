import {FieldPath,FieldValue,type DocumentData,type DocumentSnapshot,type Firestore} from 'firebase-admin/firestore';
import {z} from 'zod';
import {
  isReportStatus,normalizeReport,readSubmission,selectReportPage,serializeReportDate,validReportId,
} from '../../reporting/report-contract';
import {createReport,ReportRequestError} from '../../reporting/report-server';
import {sanitizeForFirestore,sanitizeText} from '../../reporting/sanitize';
import {
  staffFeedbackId,type StaffFeedbackCommand,type StaffFeedbackDetail,type StaffFeedbackList,type StaffFeedbackSubmission,type StaffFeedbackSummary,
} from '../../staff/feedback-contract';
import {EarningsError} from '../earnings/transport';
import type {StaffActor} from './actor';
import {cursorFor,cursorTimestamp,readSupportCursor,revisionOf,supportCursor,supportHash} from './support-revision';

type Actor=Pick<StaffActor,'userId'|'scopeId'|'sourceUid'|'name'|'role'>;
const listCursor=z.object({filter:z.string(),after:supportCursor}).strict();
const pageSize=20;
const scanSize=240;
function feedbackMissing():never {throw new EarningsError(404,'staff_feedback_not_found');}
const text=(value:unknown,max:number)=>typeof value==='string' ? sanitizeText(value,max):undefined;
const statuses={pending:0,in_progress:0,resolved:0};

function projectSummary(id:string,data:DocumentData,actor:Actor):StaffFeedbackSummary|null {
  const summary=normalizeReport(id,data);
  const scope=data.staffAuthorScopeId;
  if (summary.trustedOrigin!=='rota_exata' || scope!==undefined && scope!==actor.scopeId) return null;
  const uid=validReportId(summary.user.uid) ? summary.user.uid:undefined;
  const reopen=!!uid && (scope===undefined ? uid===actor.sourceUid:uid===actor.userId);
  return {...summary,description:sanitizeText(summary.description,5000),
    user:{uid,name:text(summary.user.name,200),email:text(summary.user.email,254)},capabilities:{view:true,manage:true,reopen}};
}

function projectDetail(row:DocumentSnapshot,actor:Actor):StaffFeedbackDetail {
  const data=row.data();
  const summary=data ? projectSummary(row.id,data,actor):null;
  if (!data || !summary) feedbackMissing();
  const statusHistory=Array.isArray(data.statusHistory) ? data.statusHistory.slice(-100):[];
  const reopenHistory=Array.isArray(data.reopenHistory) ? data.reopenHistory.slice(-100):[];
  return {
    ...summary,revision:revisionOf(row),
    statusHistory:statusHistory.flatMap(entry=>isReportStatus(entry?.next) ? [{
      next:entry.next,at:serializeReportDate(entry.at),actor:{name:text(entry.actor?.name,200) ?? 'Equipe Rota'},
    }]:[]),
    reopenHistory:reopenHistory.flatMap(entry=>typeof entry?.details==='string' ? [{
      details:sanitizeText(entry.details,5000),reopenedAt:serializeReportDate(entry.reopenedAt),
    }]:[]),
    context:data.context && {url:text(data.context.url,2000),resolution:text(data.context.resolution,80),userAgent:text(data.context.userAgent,1000)},
    logs:Array.isArray(data.logs) ? sanitizeForFirestore(data.logs.slice(-10),{
      maxDepth:4,maxArrayLength:20,maxStringLength:4000,
    }) as unknown[]:undefined,
  };
}

export async function readStaffFeedback(db:Firestore,actor:Actor,id:string) {
  if (!staffFeedbackId.safeParse(id).success) feedbackMissing();
  return projectDetail(await db.collection('error_reports').doc(id).get(),actor);
}

export async function listStaffFeedback(db:Firestore,actor:Actor,query:StaffFeedbackList) {
  const {cursor,...filters}=query;
  const filter=supportHash([actor.scopeId,actor.userId,filters]);
  const after=readSupportCursor(cursor,listCursor);
  if (after && after.filter!==filter) throw new EarningsError(422,'staff_invalid_cursor');
  if (filters.origin && filters.origin!=='rota_exata') return {reports:[],counts:{total:0,...statuses},nextCursor:null};
  const source=db.collection('error_reports').orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc')
    .select('originSystem','schemaVersion','context.url','createdAt','description','category','improvement','user.uid','user.name','user.email','status','staffAuthorScopeId')
    .limit(scanSize+1);
  const rows=await (after ? source.startAfter(cursorTimestamp(after.after),after.after.id):source).get();
  const docs=rows.docs.slice(0,scanSize);
  const reports=docs.flatMap(doc=>{
    const report=projectSummary(doc.id,doc.data(),actor);
    return report ? [report]:[];
  });
  // Existing filter and author-search semantics apply to each window. Preserve the
  // Firestore ordering for pagination, including a sub-millisecond timestamp tie.
  const params=new URLSearchParams(Object.entries(filters));
  params.set('limit','50');
  const eligibleIds=new Set<string>();
  let windowCursor:string|null=null;
  do {
    if (windowCursor) params.set('cursor',windowCursor);
    const page=selectReportPage(reports,{uid:actor.userId,role:'admin',active:true},params);
    for (const report of page.reports) eligibleIds.add(report.id);
    windowCursor=page.nextCursor;
  } while (windowCursor);
  const visible=reports.filter(report=>eligibleIds.has(report.id)).slice(0,pageSize);
  const consumed=eligibleIds.size>pageSize ? docs.find(doc=>doc.id===visible.at(-1)?.id):docs.at(-1);
  const nextCursor=consumed && (rows.size>scanSize || eligibleIds.size>pageSize)
    ? JSON.stringify({filter,after:cursorFor(consumed,'createdAt')}):null;
  const counts={total:visible.length,...statuses};
  for (const report of visible) counts[report.status]++;
  return {reports:visible,counts,nextCursor};
}

export async function submitStaffFeedback(db:Firestore,actor:Actor,body:StaffFeedbackSubmission) {
  const submission=readSubmission(body);
  if (!submission) throw new EarningsError(422,'staff_feedback_invalid_submission');
  const url=sanitizeText(body.url ?? '',2000);
  let pathname='';
  try {pathname=new URL(url).pathname;} catch { /* The report can lack browser context. */ }
  const logs=sanitizeForFirestore(body.logs ?? [],{maxDepth:4,maxArrayLength:20,maxStringLength:4000});
  const fingerprint=supportHash(['rota_exata',submission.category,pathname,Array.isArray(logs) ? logs[0] ?? null:null]).slice(0,20);
  const digest=supportHash(submission);
  try {
    const key=supportHash([actor.scopeId,body.submissionId]);
    const saved=await createReport(db,actor.userId,'rota_exata',key,{
      category:submission.category,description:sanitizeText(submission.description,5000),
      improvement:submission.improvement ? sanitizeForFirestore(submission.improvement,{maxStringLength:2000}):null,
      user:{uid:actor.userId,name:actor.name,role:actor.role},
      context:{url,pathname,userAgent:sanitizeText(body.userAgent ?? '',1000),resolution:sanitizeText(body.resolution ?? '',80)},
      logs,fingerprint,source:'floating_feedback_button',staffAuthorScopeId:actor.scopeId,staffSubmissionDigest:digest,
    });
    const row=await db.collection('error_reports').doc(saved.id).get();
    if (row.get('staffSubmissionDigest')!==digest) throw new EarningsError(409,'staff_feedback_command_conflict');
    return {success:true,id:saved.id,fingerprint:saved.fingerprint};
  } catch (error) {
    if (error instanceof ReportRequestError) throw new EarningsError(error.status,'staff_feedback_rate_limited');
    throw error;
  }
}

export async function changeStaffFeedback(db:Firestore,actor:Actor,command:StaffFeedbackCommand) {
  const ref=db.collection('error_reports').doc(command.reportId);
  const receipt=ref.collection('staffOperations').doc(supportHash([actor.scopeId,actor.userId,command.requestId]));
  const digest=supportHash(command);
  await db.runTransaction(async tx=>{
    const current=await tx.get(ref);
    const report=projectDetail(current,actor);
    const previous=await tx.get(receipt);
    const reopen='action' in command;
    if (reopen && !report.capabilities.reopen) throw new EarningsError(403,'staff_access_denied');
    if (previous.exists) {
      if (previous.get('digest')!==digest) throw new EarningsError(409,'staff_feedback_command_conflict');
      return;
    }
    if (report.revision!==command.revision) throw new EarningsError(409,'staff_feedback_revision_conflict');
    if (reopen && report.status!=='resolved') throw new EarningsError(409,'staff_feedback_invalid_transition');
    const next=reopen ? 'pending':command.status;
    if (next===report.status) {
      tx.create(receipt,{digest,createdAt:FieldValue.serverTimestamp()});
      return;
    }

    const data=current.data()!;
    let recipient:{uid?:string;staff:boolean}|undefined;
    if (reopen) recipient={staff:true};
    else if (next==='resolved' && report.user.uid) {
      if (data.staffAuthorScopeId===actor.scopeId) recipient={uid:report.user.uid,staff:true};
      else {
        const profile=(await tx.get(db.collection('users').doc(report.user.uid))).data();
        if (profile && profile.active!==false && profile.disabled!==true && !profile.deletedAt &&
            (!profile.nativeDriverProvisioningId || profile.nativeDriverReady===true && profile.nativeDriverDispatchEnabled===true)) {
          recipient={uid:report.user.uid,staff:['admin','socio','gestor','partner','manager'].includes(profile.role)};
        }
      }
    }
    const now=new Date().toISOString();
    const author={uid:actor.userId,name:actor.name};
    tx.update(ref,{
      status:next,updatedAt:FieldValue.serverTimestamp(),
      statusHistory:FieldValue.arrayUnion({previous:report.status,next,at:now,actor:author,notificationPending:false}),
      ...(reopen ? {reopenHistory:FieldValue.arrayUnion({details:command.details,reopenedAt:now,reopenedBy:author}),
        reopenCount:FieldValue.increment(1)}:{}),
    });
    tx.create(receipt,{digest,createdAt:FieldValue.serverTimestamp()});
    if (recipient) {
      const key=supportHash([ref.id,actor.scopeId,actor.userId,command.requestId]);
      tx.create(db.collection('notifications').doc(key),{
        type:'system',priority:'medium',read:false,opened:false,timestamp:FieldValue.serverTimestamp(),reportId:ref.id,
        title:reopen ? 'Chamado reaberto':'Chamado resolvido',
        message:reopen ? 'O autor reabriu um chamado. Abra o chamado para ver o complemento.':'Seu chamado foi marcado como resolvido.',
        ...(recipient.uid ? {driverId:recipient.uid}:{}),
        ...(recipient.staff ? {forAdmin:true}:{}),
        staffScopeId:actor.scopeId,staffAuthorId:actor.userId,staffAuthorName:actor.name,
        link:(recipient.staff ? '/admin/erros':'/driver/chamados')+'?report='+encodeURIComponent(ref.id),
      });
    }
  });
  return {success:true,report:await readStaffFeedback(db,actor,command.reportId)};
}
