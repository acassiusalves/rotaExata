'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PreviewStop = {
  id: string; outcome: 'completed' | 'visited' | 'missed' | 'open';
  city: string; state: string; lat: string; lng: string; category: string; lunna: '' | 'yes' | 'no';
};
export type RoutePreviewDraft = {
  workTime: string; distance: string; originLat: string; originLng: string; stops: PreviewStop[];
};
function localDateTime(date: Date) {
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function stop(id: string, patch: Partial<PreviewStop> = {}): PreviewStop {
  return { id,outcome:'completed',city:'',state:'',lat:'',lng:'',category:'',lunna:'',...patch };
}

export function initialRoutePreview(): RoutePreviewDraft {
  return { workTime:'',distance:'',originLat:'',originLng:'',stops:[] };
}
export function exampleRoutePreview(): RoutePreviewDraft {
  return {
    workTime:localDateTime(new Date('2026-11-18T14:00:00.000Z')),
    distance:'12500',originLat:'-16.68',originLng:'-49.25',
    stops:[
      stop('exemplo-1',{ city:'Goiânia',state:'GO',lat:'-16.67',lng:'-49.24',lunna:'no' }),
      stop('exemplo-2',{ outcome:'visited',city:'Goiânia',state:'GO',lat:'-16.69',lng:'-49.27',lunna:'no' }),
    ],
  };
}
function numberInput(value: string) {
  if (!value.trim()) return undefined;
  const result = Number(value.trim().replace(',','.'));
  return Number.isFinite(result) ? result : null;
}
export function routePreviewFacts(draft: RoutePreviewDraft) {
  if (!draft.workTime || !Number.isFinite(Date.parse(draft.workTime)) || !draft.stops.length) {
    throw new Error('Informe o horário do encerramento e adicione pelo menos uma parada.');
  }
  return {
    workedAt:new Date(draft.workTime).toISOString(),
    distanceMeters:numberInput(draft.distance),
    origin: draft.originLat || draft.originLng ? { lat:numberInput(draft.originLat),lng:numberInput(draft.originLng) } : null,
    stops:draft.stops.map(place => ({
      id:place.id, status:place.outcome === 'visited' || place.outcome === 'missed' ? 'failed' : place.outcome,
      visited:place.outcome === 'visited' ? true : place.outcome === 'missed' ? false : null,
      city:place.city || null,state:place.state || null,lat:numberInput(place.lat),lng:numberInput(place.lng),
      category:place.category || null,lunna:place.lunna ? place.lunna === 'yes' : null,
    })),
  };
}

function Field({ id,label,value,onChange,type='text',decimal=false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; type?: string; decimal?: boolean;
}) {
  return <div className="space-y-1"><Label htmlFor={id}>{label}</Label>
    <Input id={id} type={type} inputMode={decimal ? 'decimal' : undefined} value={value} onChange={event => onChange(event.target.value)} /></div>;
}

export function RoutePreviewFields({ value,mode,onChange }: {
  value: RoutePreviewDraft; mode: 'zone' | 'distance'; onChange: (draft: RoutePreviewDraft) => void;
}) {
  function update(patch: Partial<RoutePreviewDraft>) { onChange({...value,...patch}); }
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id="preview-work" label="Data e hora do encerramento" type="datetime-local" value={value.workTime} onChange={workTime => update({workTime})} />
      <Field id="preview-distance" label="Distância planejada (m)" decimal value={value.distance} onChange={distance => update({distance})} />
    </div>
    {mode === 'zone' && <div className="grid gap-3 sm:grid-cols-2">
      <Field id="preview-origin-lat" label="Latitude da saída" decimal value={value.originLat} onChange={originLat => update({originLat})} />
      <Field id="preview-origin-lng" label="Longitude da saída" decimal value={value.originLng} onChange={originLng => update({originLng})} />
    </div>}
    {value.stops.map((place,index) => {
      const prefix='preview-stop-'+index;
      function edit(patch: Partial<PreviewStop>) { update({stops:value.stops.map(stop => stop.id===place.id ? {...stop,...patch} : stop)}); }
      return <fieldset className="space-y-3 rounded-md border p-3" key={place.id}>
        <legend className="px-1 text-sm font-medium">Parada {index+1}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor={prefix+'-outcome'}>Desfecho</Label>
            <select id={prefix+'-outcome'} className="block h-10 w-full rounded-md border bg-background px-2 text-sm" value={place.outcome}
              onChange={event => edit({outcome:event.target.value as PreviewStop['outcome']})}>
              <option value="completed">Entrega concluída</option><option value="visited">Falha com visita</option>
              <option value="missed">Falha sem visita</option><option value="open">Em aberto</option>
            </select>
          </div>
          <div className="space-y-1"><Label htmlFor={prefix+'-lunna'}>Pedido Lunna</Label>
            <select id={prefix+'-lunna'} className="block h-10 w-full rounded-md border bg-background px-2 text-sm" value={place.lunna}
              onChange={event => edit({lunna:event.target.value as PreviewStop['lunna']})}>
              <option value="">Não identificado</option><option value="yes">Sim</option><option value="no">Não</option>
            </select>
          </div>
          {mode==='zone' && <>
            <Field id={prefix+'-city'} label="Cidade" value={place.city} onChange={city => edit({city})} />
            <Field id={prefix+'-state'} label="UF" value={place.state} onChange={state => edit({state})} />
            <Field id={prefix+'-lat'} label="Latitude" decimal value={place.lat} onChange={lat => edit({lat})} />
            <Field id={prefix+'-lng'} label="Longitude" decimal value={place.lng} onChange={lng => edit({lng})} />
          </>}
          <Field id={prefix+'-category'} label="Categoria (opcional)" value={place.category} onChange={category => edit({category})} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => update({stops:value.stops.filter(stop => stop.id!==place.id)})}>Remover parada</Button>
      </fieldset>;
    })}
    <Button variant="outline" size="sm" onClick={() => update({stops:[...value.stops,stop(crypto.randomUUID())]})}>Adicionar parada</Button>
  </div>;
}
