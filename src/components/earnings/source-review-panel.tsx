'use client';

import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { displayCents,displayWorkedAt,earningsComponentLabel,periodQuery,type EarningsCursor } from '@/lib/driver-statement';
import {
  brazilianStates,sourceReviewFormInput,type SourceReviewDetail,type SourceReviewPreview,
  type SourceReviewPreviewInput,type SourceReviewResult,type SourceReviewRow,
} from '@/lib/earnings/source-review-contract';
import { earningsMessage,EarningsRequestError,useEarnings } from './earnings-shell';

const endpoint='/api/financeiro/revisoes';
const blockedLabels:Record<string,string>={
  technical_event:'Este evento é um registro técnico. A conferência de valor não está disponível.',
  unsupported_reason:'Este caso ainda não pode gerar um valor pela conferência.',
  paused:'A geração de valores está pausada.',
  unsupported_proof:'A prova disponível não permite confirmar os resultados desta rota.',
  unsupported_facts:'Os dados da rota ainda não permitem calcular o valor.',
  too_many_stops:'Esta rota tem mais de 30 paradas para conferir e precisa de análise em separado.',
  source_changed:'Os dados da rota mudaram. Atualize a lista de conferências.',
  source_missing:'Não foi possível localizar os dados e a prova desta rota.',
  revision_conflict:'Existem versões divergentes dos dados desta rota.',
  route_already_accounted:'Esta rota já tem um lançamento.',
  legacy_route_requires_review:'Esta rota está vinculada a um lançamento histórico.',
  outside_cutover:'A data da conclusão não permite gerar um valor neste fluxo.',
  driver_unmapped:'O vínculo do motorista ainda não foi confirmado.',
  no_rule_at_work_time:'Não havia uma tarifa aplicável na conclusão da rota.',
};
const reasonLabels:Record<string,string>={
  unmatched_zone:'Parada sem enquadramento na tarifa',
  source_unproven:'Confirmação do servidor ausente',
  source_deleted:'Exclusão registrada',
  source_history_gap:'Histórico da origem indisponível',
};
function reasonLabel(reason:string|null) {
  if (reason && /^unmatched_zone(,unmatched_zone)*$/.test(reason)) return reasonLabels.unmatched_zone;
  return (reason && reasonLabels[reason]) || 'Verificação da rota pendente';
}
function routeLabel(row:SourceReviewRow) {
  return row.eventType==='snapshot' ? row.routeReference : 'Registro técnico · '+row.routeReference;
}
function outcomeLabel(stop:SourceReviewDetail['stops'][number]) {
  if (stop.status==='completed') return 'Entrega registrada';
  return stop.visited===true ? 'Tentativa com visita' : 'Falha registrada';
}

type Draft = {input:SourceReviewPreviewInput;preview:SourceReviewPreview;requestId:string};

function ReviewForm({detail,onIssued,onReload}:{
  detail:SourceReviewDetail;onIssued:(result:SourceReviewResult)=>void;onReload:()=>void;
}) {
  const {request}=useEarnings();
  const [draft,setDraft]=useState<Draft|null>(null);
  const [preparedInput,setPreparedInput]=useState<SourceReviewPreviewInput|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [stale,setStale]=useState(false);
  const submitLock=useRef(false);

  function readError(failure:unknown) {
    setError(earningsMessage(failure));
    if (failure instanceof EarningsRequestError &&
        ['earnings_review_revision_conflict','earnings_review_request_conflict','earnings_review_not_found'].includes(failure.code)) {
      setDraft(null);
      setStale(true);
    }
  }

  async function preview(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    let input:SourceReviewPreviewInput;
    try {
      input=sourceReviewFormInput(detail,new FormData(event.currentTarget));
    } catch {
      setError('Preencha os dados e a referência de evidência de cada parada.');
      return;
    }
    submitLock.current=true;
    setError('');
    setBusy(true);
    try {
      const prepared=await request<SourceReviewPreview>(endpoint,{method:'POST',body:JSON.stringify(input)});
      setPreparedInput(input);
      setDraft({input,preview:prepared,requestId:crypto.randomUUID()});
    } catch (failure) {
      readError(failure);
    } finally {
      submitLock.current=false;
      setBusy(false);
    }
  }

  async function confirm() {
    if (submitLock.current || !draft) return;
    submitLock.current=true;
    setError('');
    setBusy(true);
    try {
      const result=await request<SourceReviewResult>(endpoint,{
        method:'PATCH',body:JSON.stringify({...draft.input,previewDigest:draft.preview.previewDigest,requestId:draft.requestId}),
      });
      onIssued(result);
    } catch (failure) {
      readError(failure);
    } finally {
      submitLock.current=false;
      setBusy(false);
    }
  }

  if (!detail.action) return <p className="rounded-md bg-muted p-3 text-sm">
    {blockedLabels[detail.blockedReason ?? ''] ?? 'Este caso precisa de uma verificação adicional.'}
  </p>;

  const title=detail.action==='complete_uf' ? 'Complementar UF' : 'Atestar resultados registrados';
  return <div className="space-y-3 border-t pt-3">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {stale ? <Button type="button" variant="outline" onClick={onReload}>Atualizar conferência</Button> :
      draft ? <section className="space-y-3">
        <h3 className="font-semibold">Prévia do valor a conferir</h3>
        {draft.preview.driverName && <p className="text-sm">Motorista {draft.preview.driverName}</p>}
        <ul className="divide-y text-sm">
          {draft.preview.items.map((item,index)=><li key={index} className="flex justify-between gap-3 py-2">
            <span>{earningsComponentLabel[item.component]}{item.stopNumber ? ' · Parada '+item.stopNumber : ''}</span>
            <span className="tabular-nums">{displayCents(item.cents)}</span>
          </li>)}
        </ul>
        <p className="text-base font-semibold tabular-nums">Total {displayCents(draft.preview.totalCents)}</p>
        <p className="text-sm text-muted-foreground">
          Tarifa versão {draft.preview.ruleVersion}. Após a confirmação, o valor fica em A conferir.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={()=>void confirm()}>{busy?'Registrando…':'Gerar valor a conferir'}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>Editar informações</Button>
        </div>
      </section> : <form className="space-y-4" onSubmit={preview}>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{detail.action==='complete_uf' ?
          'Informe a UF comprovada para cada parada e indique onde a evidência pode ser consultada.' :
          'Ateste os resultados já registrados e indique a evidência de cada parada. A decisão será registrada na conferência financeira.'}</p>
        {detail.stops.map((stop,index)=>{
          const previous=preparedInput?.decision.stops[index];
          return <fieldset key={stop.id} disabled={busy} className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Parada {stop.number}{stop.city ? ' · '+stop.city : ''}</legend>
            <p className="text-sm text-muted-foreground">
              {stop.reference && (stop.reference.kind==='order'?'Pedido ':'Ponto ')+stop.reference.code+' · '}
              {outcomeLabel(stop)}
            </p>
            {detail.action==='complete_uf' && <div className="space-y-1">
              <Label htmlFor={'review-uf-'+index}>UF comprovada</Label>
              <select id={'review-uf-'+index} name={'uf-'+index} required
                defaultValue={previous && 'uf' in previous ? previous.uf : ''}
                className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="">Selecione a UF</option>
                {brazilianStates.map(uf=><option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>}
            <div className="space-y-1">
              <Label htmlFor={'review-evidence-'+index}>Referência da evidência</Label>
              <Input id={'review-evidence-'+index} name={'evidence-'+index} defaultValue={previous?.evidence}
                required maxLength={300} autoComplete="off"/>
            </div>
            <div className="space-y-1">
              <Label htmlFor={'review-reason-'+index}>Justificativa</Label>
              <Textarea id={'review-reason-'+index} name={'reason-'+index} defaultValue={previous?.reason} required maxLength={600}/>
            </div>
          </fieldset>;
        })}
        <Button type="submit" disabled={busy}>{busy?'Calculando…':'Simular valor'}</Button>
      </form>}
  </div>;
}

function ReviewDetails({eventId,onIssued}:{eventId:string;onIssued:(result:SourceReviewResult)=>void}) {
  const {request}=useEarnings();
  const [detail,setDetail]=useState<SourceReviewDetail|null>(null);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  function refresh() { setDetail(null);setError('');setReload(value=>value+1); }
  useEffect(()=>{
    const controller=new AbortController();
    request<SourceReviewDetail>(endpoint+'?eventId='+encodeURIComponent(eventId),{signal:controller.signal}).then(result=>{
      if (!controller.signal.aborted) setDetail(result);
    }).catch(failure=>{
      if (!controller.signal.aborted) setError(earningsMessage(failure));
    });
    return ()=>controller.abort();
  },[eventId,request,reload]);
  if (error) return <div className="space-y-2"><p role="alert">{error}</p>
    <Button type="button" variant="outline" onClick={refresh}>Recarregar detalhes</Button></div>;
  if (!detail) return <p role="status" className="text-sm">Carregando conferência…</p>;
  return <div className="space-y-3">
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <div><dt className="text-muted-foreground">Rota</dt><dd>{routeLabel(detail)}</dd></div>
      <div><dt className="text-muted-foreground">Data</dt><dd>{displayWorkedAt(detail.workedAt ?? detail.sourceTime)}</dd></div>
      {detail.driverName && <div><dt className="text-muted-foreground">Motorista</dt><dd>{detail.driverName}</dd></div>}
      <div><dt className="text-muted-foreground">Motivo</dt><dd>{reasonLabel(detail.reason)}</dd></div>
    </dl>
    <ReviewForm key={reload} detail={detail} onIssued={onIssued} onReload={refresh}/>
  </div>;
}

type ReviewList = {rows:SourceReviewRow[];nextCursor:EarningsCursor|null};

export function SourceReviewPanel({month,onIssued}:{month:string;onIssued:()=>void}) {
  const {request}=useEarnings();
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<ReviewList|null>(null);
  const [cursor,setCursor]=useState<EarningsCursor|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    if (!open || !month) return;
    const controller=new AbortController();
    request<ReviewList>(endpoint+'?'+periodQuery(month,'',cursor),{signal:controller.signal}).then(result=>{
      if (!controller.signal.aborted) setRows(result);
    }).catch(failure=>{
      if (!controller.signal.aborted) setError(earningsMessage(failure));
    });
    return ()=>controller.abort();
  },[cursor,month,open,reload,request]);
  function page(next:EarningsCursor|null) { setCursor(next);setRows(null);setError('');setReload(value=>value+1); }
  function issued(result:SourceReviewResult) {
    setSelected(null);
    setNotice(displayCents(result.totalCents)+' registrado em A conferir.');
    page(null);
    onIssued();
  }
  return <section className="space-y-3 rounded-lg border p-4">
    <Button type="button" variant="outline" aria-expanded={open} aria-controls="route-source-review-list"
      onClick={()=>{setOpen(value=>!value);page(null);}}>
      {open?'Ocultar conferências de rotas':'Conferir rotas'}
    </Button>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {open && <div id="route-source-review-list" className="space-y-3">
      {error ? <div role="alert" className="space-y-2 text-sm"><p>{error}</p>
        <Button variant="outline" onClick={()=>page(cursor)}>Tentar novamente</Button></div> :
        !rows ? <p role="status" className="text-sm">Carregando rotas em conferência…</p> :
        !rows.rows.length ? <p className="text-sm text-muted-foreground">Nenhuma rota em conferência neste período.</p> :
        <ul className="divide-y text-sm">
          {rows.rows.map(row=><li className="flex flex-wrap items-center justify-between gap-2 py-2" key={row.eventId}>
            <div><p className="font-medium">{routeLabel(row)}{row.driverName ? ' · '+row.driverName : ''}</p>
              <p className="text-muted-foreground">{displayWorkedAt(row.workedAt ?? row.sourceTime)} · {reasonLabel(row.reason)}</p></div>
            <Button variant="outline" type="button" size="sm" onClick={()=>setSelected(row.eventId)}>Ver conferência</Button>
          </li>)}
        </ul>}
      <div className="flex flex-wrap gap-2">
        {cursor && <Button type="button" variant="outline" size="sm" onClick={()=>page(null)}>Primeira página</Button>}
        {rows?.nextCursor && <Button type="button" variant="outline" size="sm" onClick={()=>page(rows.nextCursor)}>Próxima página</Button>}
      </div>
    </div>}
    <Dialog open={selected!==null} onOpenChange={value=>{if (!value) setSelected(null);}}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Conferência da rota</DialogTitle>
          <DialogDescription>Verifique o motivo e os dados disponíveis para calcular o ganho.</DialogDescription>
        </DialogHeader>
        {selected && <ReviewDetails key={selected} eventId={selected} onIssued={issued}/>}
      </DialogContent>
    </Dialog>
  </section>;
}
