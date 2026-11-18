'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RoutePreviewFields, exampleRoutePreview, initialRoutePreview, routePreviewFacts } from '@/components/earnings/route-preview-fields';
import { EarningsRequestError, earningsMessage, useEarnings } from '@/components/earnings/earnings-shell';
import { displayCents, earningsComponentLabel } from '@/lib/driver-statement';
import type { EarningsIssue, EarningsQuote, EarningsRule } from '@/lib/earnings/domain';
import { defaultBrlInput, parseBrlInput } from '@/lib/earnings/currency-input';

type Zone = { label: string; cities: string; price: string; radius: string };
type Rate = 'baseCents' | 'kilometerCents' | 'deliveryCents' | 'attemptCents';
type Period = 'morning' | 'night' | 'weekend';
type Multiplier = { period: Period; start: string; end: string; percent: string };
type Draft = {
  mode: 'zone' | 'distance';
  zones: Zone[];
  rates: Record<Rate,string>;
  attemptPercent: string;
  partial: boolean;
  exclusions: string;
  lunna: string;
  volume: { minimum: string; price: string }[];
  multipliers: Multiplier[];
};
type RuleRecord = { id: string; version: number; effective_at: string; definition: EarningsRule };
type State = { latestVersion: number; rule: RuleRecord | null; legacyRule?: { version?: number; pricingMode?: string; pricingZones?: unknown[]; notes?: string } | null };
const endpoint = '/api/financeiro/regras';
const rateLabels: Record<Rate,string> = {
  baseCents:'Valor base por rota', kilometerCents:'Valor por km planejado', deliveryCents:'Valor por entrega', attemptCents:'Valor por tentativa com visita',
};
const issuesLabels: Record<string,string> = {
  unsupported_hybrid: 'A modalidade híbrida requer definição da franquia antes de publicar.',
  missing_zones: 'Adicione pelo menos uma zona.',
  missing_distance_rates: 'Informe os quatro valores da modalidade por distância.',
  missing_attempt_policy: 'Informe o percentual para tentativa com visita.',
  missing_origin: 'Informe as coordenadas de saída da rota.',
  unmatched_zone: 'A parada está fora das zonas cadastradas.',
  missing_stop_coordinates: 'Informe as coordenadas da parada.',
  missing_planned_distance: 'Informe a distância planejada.',
  exclusion_review: 'Trate a categoria da parada em conferência.',
  unknown_lunna_classification: 'Identifique se as entregas pertencem à Lunna.',
  partial_work: 'Há paradas abertas para conferir.',
  conflicting_brackets: 'Confira as faixas e horários. Cada condição deve ter uma única configuração.',
};
const periodNames = { morning:'Manhã', night:'Noite', weekend:'Fim de semana' };
const specialOrder: Rate[] = ['baseCents','kilometerCents','deliveryCents','attemptCents'];
function loadDraft(rule?: EarningsRule): Draft {
  return {
    mode: rule?.mode === 'zone' ? 'zone' : 'distance',
    zones: rule?.zones.map(zone => ({ label:zone.label ?? '',cities:zone.cities.map(city => city.name+(city.uf ? '/'+city.uf.toUpperCase() : '')).join(', '),price:defaultBrlInput(zone.priceCents),radius:zone.radiusMeters?.toString() ?? '' })) ?? [],
    rates: {
      baseCents: defaultBrlInput(rule?.baseCents), kilometerCents: defaultBrlInput(rule?.kilometerCents),
      deliveryCents: defaultBrlInput(rule?.deliveryCents), attemptCents: defaultBrlInput(rule?.attemptCents),
    },
    attemptPercent: rule?.attemptBasisPoints === undefined ? '' : String(rule.attemptBasisPoints/100),
    partial: rule?.partial === 'settle_confirmed',
    exclusions: rule?.excludedCategories.join(', ') ?? '',
    lunna: defaultBrlInput(rule?.lunnaCents),
    volume: rule?.volume.map(tier => ({ minimum:String(tier.minimum),price:defaultBrlInput(tier.cents) })) ?? [],
    multipliers: rule?.multipliers.map(multiplier => ({
      period: multiplier.period, start: multiplier.period === 'weekend' ? '' : String(multiplier.startHour),
      end: multiplier.period === 'weekend' ? '' : String(multiplier.endHour),percent: String(multiplier.basisPoints/100),
    })) ?? [],
  };
}
function parseValue(value: string) { return parseBrlInput(value) ?? (value.trim() ? null : undefined); }
function ruleInput(draft: Draft) {
  return {
    mode:draft.mode,
    ...(draft.mode === 'distance'
      ? Object.fromEntries(specialOrder.map(rate => [rate,parseValue(draft.rates[rate])]))
      : { zones:draft.zones.map(zone => ({ cities:zone.cities,priceCents:parseValue(zone.price),label:zone.label,
          radiusMeters:zone.radius.trim() ? Number(zone.radius) : undefined })),attemptBasisPoints:parseValue(draft.attemptPercent) }),
    partial:draft.partial ? 'settle_confirmed' : 'review', excludedCategories:draft.exclusions.split(',').map(item => item.trim()).filter(Boolean),
    lunnaCents:parseValue(draft.lunna) ?? (draft.lunna.trim() ? null : 0),
    volume:draft.volume.map(tier => ({ minimum:Number(tier.minimum),cents:parseValue(tier.price) })),
    multipliers:draft.multipliers.map(item => ({ period:item.period,basisPoints:parseValue(item.percent),
      ...(item.period === 'weekend' ? {} : { startHour:Number(item.start),endHour:Number(item.end) }) })),
  };
}

function RateField({ id,label,value,onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><Input id={id} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} /></div>;
}

export default function RulesPage() {
  const { request } = useEarnings();
  const [state,setState] = useState<State | null>(null);
  const [draft,setDraft] = useState<Draft | null>(null);
  const [effectiveAt,setEffectiveAt] = useState('');
  const [preview,setPreview] = useState(initialRoutePreview);
  const [quote,setQuote] = useState<EarningsQuote | null>(null);
  const [issues,setIssues] = useState<EarningsIssue[]>([]);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState('');
  const [reload,setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setError('');
    request<State>(endpoint,{ signal:abort.signal }).then(saved => {
      if (abort.signal.aborted) return;
      setState(saved); setDraft(saved.rule ? loadDraft(saved.rule.definition) : null);
    }).catch(failure => {
      if (!abort.signal.aborted) { setState(null); setDraft(null); setError(earningsMessage(failure)); }
    });
    return () => abort.abort();
  },[request,reload]);

  function update(patch: Partial<Draft>) {
    setDraft(previous => previous ? {...previous,...patch} : previous); setQuote(null); setIssues([]); setNotice('');
  }
  async function run(kind: 'preview' | 'publish') {
    if (!draft || !state) return;
    setBusy(kind); setError(''); setNotice(''); setIssues([]); setQuote(null);
    try {
      const rule = ruleInput(draft);
      if (kind === 'preview') {
        let input;
        try { input = routePreviewFacts(preview); }
        catch (failure) {
          setError(failure instanceof Error ? failure.message : 'Confira os dados da simulação.');
          return;
        }
        const response = await request<{ quote: EarningsQuote }>(endpoint + '/preview',{ method:'POST',body:JSON.stringify({ rule,facts:input }) });
        setQuote(response.quote);
      } else {
        const expectedVersion = state.latestVersion;
        const result = await request<State>(endpoint,{ method:'PATCH',body:JSON.stringify({
          rule,expectedVersion,effectiveAt:effectiveAt ? new Date(effectiveAt).toISOString() : null,
        }) });
        setNotice('Versão ' + result.latestVersion + ' publicada.');
        setReload(value => value+1);
      }
    } catch(failure) {
      if (failure instanceof EarningsRequestError && failure.issues.length) setIssues(failure.issues);
      else setError(earningsMessage(failure));
    } finally { setBusy(''); }
  }
  const due = new Intl.DateTimeFormat('pt-BR',{ timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short' });
  const panel = 'space-y-4 rounded-lg border bg-card p-4';

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">Regras de ganhos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Simule e publique a tabela usada para calcular novas rotas.</p></div>
      <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setReload(value => value+1)}>Recarregar regra</Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border bg-muted p-3 text-sm">{notice}</p>}
    {!state && !error && <p role="status" className="text-sm text-muted-foreground">Carregando regra…</p>}
    {state && <div className={panel}>
      <h2 className="font-semibold">{state.rule ? 'Versão vigente ' + state.rule.version : 'Nenhuma regra vigente'}</h2>
      {state.rule && <p className="text-sm text-muted-foreground">Em vigor desde {due.format(new Date(state.rule.effective_at))}, horário de Brasília.</p>}
      {state.latestVersion > (state.rule?.version ?? 0) && <p className="text-sm">Versão {state.latestVersion} agendada para uma vigência futura.</p>}
      {!draft && <Button onClick={() => setDraft(loadDraft())}>{state.latestVersion ? 'Preparar nova versão' : 'Criar primeira versão'}</Button>}
      {state.legacyRule && <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Configuração histórica</summary>
        <p className="mt-2">Versão {state.legacyRule.version} · {state.legacyRule.pricingMode === 'hybrid' ? 'Híbrida' : state.legacyRule.pricingMode === 'zone' ? 'Por zona' : 'Por distância'}</p>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(state.legacyRule,null,2)}</pre>
      </details>}
    </div>}
    {draft && <>
      <div className={panel}>
        <div className="space-y-1"><Label htmlFor="rule-mode">Modalidade</Label>
          <select id="rule-mode" className="block h-10 rounded-md border bg-background px-3 text-sm" value={draft.mode} onChange={event => update({mode:event.target.value as Draft['mode']})}>
            <option value="distance">Por distância</option><option value="zone">Por zona</option>
          </select>
        </div>
        {draft.mode === 'distance' ? <div className="grid gap-3 sm:grid-cols-2">
          {specialOrder.map(rate => <RateField key={rate} id={rate} label={rateLabels[rate]+' (R$)'} value={draft.rates[rate]} onChange={value => update({rates:{...draft.rates,[rate]:value}})} />)}
        </div> : <>
          <RateField id="attempt-percent" label="Percentual para tentativa com visita" value={draft.attemptPercent} onChange={value => update({attemptPercent:value})} />
          <p className="text-sm text-muted-foreground">A primeira zona compatível define o valor. Cadastre as zonas na ordem de prioridade.</p>
          <div className="space-y-3">{draft.zones.map((zone,index) => {
            function edit(patch: Partial<Zone>) { update({zones:draft!.zones.map((value,key) => key===index ? {...value,...patch} : value)}); }
            return <fieldset key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">Zona {index+1}</legend>
              <RateField id={'zone-label-'+index} label="Nome" value={zone.label} onChange={value => edit({label:value})} />
              <RateField id={'zone-cities-'+index} label="Cidades separadas por vírgula, com UF opcional" value={zone.cities} onChange={value => edit({cities:value})} />
              <RateField id={'zone-price-'+index} label="Valor por entrega (R$)" value={zone.price} onChange={value => edit({price:value})} />
              <RateField id={'zone-radius-'+index} label="Raio máximo em metros (opcional)" value={zone.radius} onChange={value => edit({radius:value})} />
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => update({zones:draft.zones.filter((_,key) => key !== index)})}><Trash2 aria-hidden="true" className="mr-1 size-4" />Remover zona</Button>
            </fieldset>;
          })}</div>
          <Button variant="outline" size="sm" onClick={() => update({zones:[...draft.zones,{label:'',cities:'',price:'',radius:''}]})}><Plus aria-hidden="true" className="mr-1 size-4" />Adicionar zona</Button>
        </>}
        <div className="space-y-1"><Label htmlFor="rule-exclusions">Categorias em conferência</Label>
          <Input id="rule-exclusions" value={draft.exclusions} onChange={event => update({exclusions:event.target.value})} placeholder="Ex.: hospital, clínica" /></div>
        {draft.mode === 'zone' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.partial} onChange={event => update({partial:event.target.checked})} />
          Apurar o trecho confirmado em rotas com paradas abertas</label>}
      </div>
      <div className={panel}>
        <h2 className="font-semibold">Bônus</h2>
        <RateField id="rule-lunna" label="Por pedido Lunna entregue (R$)" value={draft.lunna} onChange={value => update({lunna:value})} />
        <div className="space-y-3">
          <p className="text-sm font-medium">Volume de entregas concluídas</p>
          {draft.volume.map((tier,index) => <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]" key={index}>
            <RateField id={'tier-min-'+index} label="Quantidade mínima" value={tier.minimum} onChange={value => update({volume:draft.volume.map((item,key) => key===index ? {...item,minimum:value} : item)})} />
            <RateField id={'tier-rate-'+index} label="Bônus da faixa (R$)" value={tier.price} onChange={value => update({volume:draft.volume.map((item,key) => key===index ? {...item,price:value} : item)})} />
            <Button variant="outline" size="sm" onClick={() => update({volume:draft.volume.filter((_,key) => key!==index)})}>Remover faixa</Button>
          </div>)}
          <Button variant="outline" size="sm" onClick={() => update({volume:[...draft.volume,{minimum:'',price:''}]})}>Adicionar faixa</Button>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Multiplicador de horário</p>
          <p className="text-sm text-muted-foreground">Aplica o maior percentual compatível. Bônus Lunna e de volume são somados depois.</p>
          {(Object.keys(periodNames) as Period[]).map(period => {
            const item=draft.multipliers.find(entry => entry.period===period);
            function edit(patch: Partial<Multiplier>) { update({multipliers:draft!.multipliers.map(entry => entry.period===period ? {...entry,...patch} : entry)}); }
            return <fieldset key={period} className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!item} onChange={event => update({
                multipliers:event.target.checked ? [...draft.multipliers,{ period,start:period==='night'?'20':'6',end:period==='night'?'23':'8',percent:'100' }]
                  : draft.multipliers.filter(entry => entry.period!==period),
              })} />{periodNames[period]}</label>
              {item && <div className="grid gap-2 sm:grid-cols-3">
                {period!=='weekend' && <><RateField id={period+'-start'} label="Hora inicial" value={item.start} onChange={value => edit({start:value})} />
                  <RateField id={period+'-end'} label="Hora final" value={item.end} onChange={value => edit({end:value})} /></>}
                <RateField id={period+'-percent'} label="Percentual total" value={item.percent} onChange={value => edit({percent:value})} />
              </div>}
            </fieldset>;
          })}
        </div>
      </div>
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Simulação</h2>
          <Button variant="outline" size="sm" onClick={() => {setPreview(exampleRoutePreview());setQuote(null);setIssues([]);}}>Carregar exemplo</Button></div>
        <RoutePreviewFields value={preview} mode={draft.mode} onChange={value => {setPreview(value);setQuote(null);setIssues([]);}} />
        <Button variant="outline" disabled={!!busy} onClick={() => void run('preview')}>{busy==='preview'?'Calculando…':'Simular cálculo'}</Button>
        {quote && <dl className="space-y-2 rounded-md bg-muted p-3 text-sm">
          {quote.items.map(item => <div key={item.key} className="flex justify-between gap-2"><dt>{earningsComponentLabel[item.component]}</dt><dd>{displayCents(item.cents)}</dd></div>)}
          <div className="flex justify-between gap-2 border-t pt-2 font-semibold"><dt>Total simulado</dt><dd>{displayCents(quote.totalCents)}</dd></div>
        </dl>}
      </div>
      {issues.length>0 && <ul role="alert" className="space-y-1 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{issues.map((issue,index) =>
        <li key={issue.code+index}>{issuesLabels[issue.code] ?? 'Confira os dados da regra ou da rota.'}{issue.stopId ? ' Parada ' + issue.stopId + '.' : ''}</li>)}</ul>}
      <div className={panel}>
        <div className="space-y-1">
          <Label htmlFor="rule-effective-at">Início da vigência (opcional)</Label>
          <Input type="datetime-local" id="rule-effective-at" className="max-w-64" value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} />
          <p className="text-sm text-muted-foreground">Horário deste dispositivo. Deixe em branco para publicar com vigência imediata.</p>
        </div>
        <Button disabled={!!busy} onClick={() => void run('publish')}>{busy==='publish'?'Publicando…':'Publicar versão'}</Button>
      </div>
    </>}
  </section>;
}
