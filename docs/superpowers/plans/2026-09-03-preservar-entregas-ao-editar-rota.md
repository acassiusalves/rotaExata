# Preservar entregas ao editar rota — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alterações administrativas em rotas deixam de apagar entregas já finalizadas, e confirmações concorrentes deixam de recriar paradas removidas ou duplicar o contador do motorista.

**Architecture:** Toda substituição de `routes.stops` em rotas existentes passa por um gateway com transações do Firestore. Funções puras reconciliam base, plano administrativo e documento atual por identidade estável, preservando o estado operacional do motorista e abortando quando há conflito estrutural real.

**Tech Stack:** TypeScript 5, Next.js 15 App Router, React 18, Firebase/Firestore Web SDK 11, `node:assert/strict` e `npx tsx` para verificações isoladas.

**Spec:** `docs/superpowers/specs/2026-09-03-preservar-entregas-ao-editar-rota-design.md`

## Global Constraints

- **Começar em branch:** o worktree atual está em detached HEAD. Antes da Task 1, usar o controle **Create branch** do Codex com o nome `codex/fix-preserve-delivery-state`; não criar outro worktree.
- **TDD obrigatório:** cada mudança de regra começa por uma verificação que falha, depois recebe a implementação mínima e volta a passar.
- **Sem framework novo de teste:** seguir o padrão existente de scripts TypeScript e executar com `npx tsx scripts/<arquivo>.ts`.
- **Sem migração de schema nesta correção:** o estado operacional continua dentro de `routes.stops`; separar entregas em subcoleção fica fora do escopo.
- **Sem mudança de permissões:** as regras atuais já permitem transações dos administradores e do motorista dono da rota.
- **Identidade, não índice:** nenhuma escrita concorrente pode localizar uma parada somente por posição no array.
- **Campos operacionais protegidos:** preservar `deliveryStatus`, `arrivedAt`, `completedAt`, `photoUrl`, `signatureUrl`, `failureReason`, `wentToLocation`, `attemptPhotoUrl`, `payments`, `deliveredItemIds`, `reconciled`, `reconciledAt`, `reconciledBy`, `reconciledMethod`, `aiExtractedValue`, `editedByDriver` e `editedAt`; preservar `notes` quando a versão atual já estiver finalizada.
- **Conflito estrutural é erro:** se a sequência de identidades no Firestore divergir da base administrativa, abortar e pedir recarga; nunca escolher silenciosamente uma versão.
- **Produção protegida:** verificações manuais usam emulador ou uma rota descartável de homologação. O script de contadores simula por padrão e só escreve com `--apply`.
- **Typecheck:** o repositório possui erros globais preexistentes documentados em `docs/superpowers/plans/2026-08-31-origem-padrao-rota.md`; o gate desta correção é zero erro nos arquivos tocados, além do registro do resultado global.
- **Commits focados:** cada commit contém apenas a tarefa correspondente, sem refatorações paralelas.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/route-stop-reconciliation.ts` *(novo)* | Regras puras de rebase, identidade, limpeza de flags e atualização por identidade. |
| `scripts/verify-route-stop-reconciliation.ts` *(novo)* | Reproduções determinísticas do bug e dos conflitos sem Firebase. |
| `src/lib/route-change-tracker.ts` | Detecta mudanças usando a mesma identidade estável da persistência. |
| `src/lib/firebase/route-stop-mutations.ts` *(novo)* | Executa as transações administrativas, confirmação do motorista e reconhecimento. |
| `src/app/(admin)/routes/[routeId]/acompanhar/page.tsx` | Usa o gateway em rotas avulsas/abertas diretamente pela URL. |
| `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx` | Usa o gateway em rotas de serviço Luna. |
| `src/app/(driver)/my-routes/[id]/page.tsx` | Confirma e reconhece alterações por identidade e de forma idempotente. |
| `scripts/update-driver-deliveries.ts` | Audita por padrão e repara contadores somente com `--apply`. |

---

### Task 1: Codificar a regra pura de reconciliação

**Files:**
- Create: `src/lib/route-stop-reconciliation.ts`
- Create: `scripts/verify-route-stop-reconciliation.ts`
- Modify: `src/lib/route-change-tracker.ts:1-149`
- Modify: `src/lib/types.ts:113-124`

**Interfaces:**
- Consumes: `getStopIdentityKey(stop)` de `src/lib/route-stop-utils.ts`.
- Produces: `RouteStructureConflictError`, `RouteStopNotFoundError`, `rebasePlannedStops(input)`, `updateStopByIdentity(stops, target, patch)` e `clearRouteChangeFlags(stops)`.

- [ ] **Step 1: Escrever a reprodução que falha**

Criar `scripts/verify-route-stop-reconciliation.ts`:

```ts
import assert from 'node:assert/strict';
import type { PlaceValue } from '../src/lib/types';
import {
  RouteStopNotFoundError,
  RouteStructureConflictError,
  clearRouteChangeFlags,
  rebasePlannedStops,
  updateStopByIdentity,
} from '../src/lib/route-stop-reconciliation';

const stop = (id: string, extra: Partial<PlaceValue> = {}): PlaceValue => ({
  id,
  placeId: `place-${id}`,
  address: `Rua ${id}, 10`,
  lat: -16.7,
  lng: -49.2,
  customerName: `Cliente ${id}`,
  ...extra,
});

const base = [stop('A'), stop('B'), stop('C')];
const latest = [
  stop('A', {
    deliveryStatus: 'completed',
    completedAt: new Date('2026-09-03T10:00:00Z'),
    payments: [{ id: 'pix-1', method: 'pix', value: 120 }],
    photoUrl: 'https://example.test/a.jpg',
    notes: 'Recebido por Maria',
  }),
  stop('B'),
  stop('C', {
    deliveryStatus: 'failed',
    failureReason: 'Cliente ausente',
    wentToLocation: true,
    attemptPhotoUrl: 'https://example.test/c.jpg',
  }),
];

const removeB = rebasePlannedStops({
  baseStops: base,
  plannedStops: [base[0], base[2]],
  latestStops: latest,
});

assert.deepEqual(removeB.map((item) => item.id), ['A', 'C']);
assert.equal(removeB[0].deliveryStatus, 'completed');
assert.deepEqual(removeB[0].payments, [{ id: 'pix-1', method: 'pix', value: 120 }]);
assert.equal(removeB[0].photoUrl, 'https://example.test/a.jpg');
assert.equal(removeB[0].notes, 'Recebido por Maria');
assert.equal(removeB[1].deliveryStatus, 'failed');
assert.equal(removeB[1].failureReason, 'Cliente ausente');

const reordered = rebasePlannedStops({
  baseStops: base,
  plannedStops: [base[2], base[0], base[1]],
  latestStops: latest,
});
assert.deepEqual(reordered.map((item) => item.id), ['C', 'A', 'B']);
assert.equal(reordered[0].attemptPhotoUrl, 'https://example.test/c.jpg');
assert.equal(reordered[1].deliveryStatus, 'completed');

assert.throws(
  () => rebasePlannedStops({
    baseStops: base,
    plannedStops: [base[0], base[2]],
    latestStops: [...latest, stop('D')],
  }),
  RouteStructureConflictError,
);

const byOrder = updateStopByIdentity(
  [stop('legacy-id', { orderNumber: 'P-100' })],
  { orderNumber: 'p-100' },
  { deliveryStatus: 'completed' },
);
assert.equal(byOrder.updatedStop.deliveryStatus, 'completed');
assert.equal(byOrder.index, 0);

assert.throws(
  () => updateStopByIdentity(latest, stop('removida'), { deliveryStatus: 'completed' }),
  RouteStopNotFoundError,
);

const clean = clearRouteChangeFlags([
  stop('A', {
    wasModified: true,
    modifiedAt: new Date('2026-09-03T10:10:00Z'),
    modificationType: 'sequence',
    originalSequence: 2,
    deliveryStatus: 'completed',
  }),
]);
assert.equal(clean[0].wasModified, false);
assert.equal(clean[0].modifiedAt, undefined);
assert.equal(clean[0].modificationType, undefined);
assert.equal(clean[0].originalSequence, undefined);
assert.equal(clean[0].deliveryStatus, 'completed');

console.log('OK: reconciliação preserva execução e rejeita conflitos estruturais.');
```

- [ ] **Step 2: Executar e confirmar a falha inicial**

Run:

```bash
npx tsx scripts/verify-route-stop-reconciliation.ts
```

Expected: FAIL com `Cannot find module '../src/lib/route-stop-reconciliation'`.

- [ ] **Step 3: Implementar o módulo puro**

Criar `src/lib/route-stop-reconciliation.ts`:

```ts
import type { PlaceValue } from '@/lib/types';
import { getStopIdentityKey } from '@/lib/route-stop-utils';

const EXECUTION_FIELDS = [
  'deliveryStatus',
  'arrivedAt',
  'completedAt',
  'photoUrl',
  'signatureUrl',
  'failureReason',
  'wentToLocation',
  'attemptPhotoUrl',
  'payments',
  'deliveredItemIds',
  'reconciled',
  'reconciledAt',
  'reconciledBy',
  'reconciledMethod',
  'aiExtractedValue',
  'editedByDriver',
  'editedAt',
] as const;

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

export class RouteStructureConflictError extends Error {
  readonly code = 'route-structure-conflict';

  constructor(message = 'A estrutura da rota mudou durante a edição.') {
    super(message);
    this.name = 'RouteStructureConflictError';
  }
}

export class RouteStopNotFoundError extends Error {
  readonly code = 'route-stop-not-found';

  constructor(message = 'A parada não existe mais nesta rota.') {
    super(message);
    this.name = 'RouteStopNotFoundError';
  }
}

function keysOf(stops: PlaceValue[], label: string): string[] {
  const keys = stops.map((item) => getStopIdentityKey(item));
  if (keys.some((key) => !key)) {
    throw new RouteStructureConflictError(`${label} contém parada sem identidade estável.`);
  }
  const normalized = keys as string[];
  if (new Set(normalized).size !== normalized.length) {
    throw new RouteStructureConflictError(`${label} contém identidades duplicadas.`);
  }
  return normalized;
}

function stripTransientFields(stop: PlaceValue): PlaceValue {
  const {
    _originalIndex,
    _wasMoved,
    _movedFromRoute,
    _originalRouteColor,
    wasModified,
    modifiedAt,
    modificationType,
    originalSequence,
    ...clean
  } = stop as PlaceValue & Record<string, unknown>;
  return clean as PlaceValue;
}

function mergeWithLatestExecution(latest: PlaceValue, planned: PlaceValue): PlaceValue {
  const merged = {
    ...latest,
    ...stripTransientFields(planned),
  } as PlaceValue & Record<string, unknown>;

  for (const field of EXECUTION_FIELDS) {
    if (hasOwn(latest, field)) merged[field] = (latest as Record<string, unknown>)[field];
    else delete merged[field];
  }

  if (latest.deliveryStatus && hasOwn(latest, 'notes')) {
    merged.notes = latest.notes;
  }

  return merged as PlaceValue;
}

export function rebasePlannedStops(input: {
  baseStops: PlaceValue[];
  plannedStops: PlaceValue[];
  latestStops: PlaceValue[];
}): PlaceValue[] {
  const baseKeys = keysOf(input.baseStops, 'A base');
  const latestKeys = keysOf(input.latestStops, 'A versão atual');
  if (JSON.stringify(baseKeys) !== JSON.stringify(latestKeys)) {
    throw new RouteStructureConflictError();
  }

  const baseKeySet = new Set(baseKeys);
  const latestByKey = new Map(
    input.latestStops.map((item) => [getStopIdentityKey(item) as string, item]),
  );

  return input.plannedStops.map((planned) => {
    const key = getStopIdentityKey(planned);
    if (!key) throw new RouteStructureConflictError('O plano contém parada sem identidade estável.');
    const latest = latestByKey.get(key);
    if (latest) return mergeWithLatestExecution(latest, planned);
    if (baseKeySet.has(key)) throw new RouteStructureConflictError();
    return stripTransientFields(planned);
  });
}

export function updateStopByIdentity(
  stops: PlaceValue[],
  target: Partial<PlaceValue>,
  patch: Partial<PlaceValue>,
): { stops: PlaceValue[]; previousStop: PlaceValue; updatedStop: PlaceValue; index: number } {
  const targetKey = getStopIdentityKey(target);
  if (!targetKey) throw new RouteStopNotFoundError('Não foi possível identificar a parada.');
  const index = stops.findIndex((item) => getStopIdentityKey(item) === targetKey);
  if (index < 0) throw new RouteStopNotFoundError();
  const previousStop = stops[index];
  const updatedStop = { ...previousStop, ...patch };
  const next = [...stops];
  next[index] = updatedStop;
  return { stops: next, previousStop, updatedStop, index };
}

export function clearRouteChangeFlags(stops: PlaceValue[]): PlaceValue[] {
  return stops.map((stop) => {
    const {
      modifiedAt,
      modificationType,
      originalSequence,
      ...clean
    } = stop;
    return { ...clean, wasModified: false };
  });
}
```

- [ ] **Step 4: Alinhar a detecção de mudanças à identidade estável**

Em `src/lib/route-change-tracker.ts`, acrescentar `stopKey?: string` à interface `RouteChange`, importar `getStopIdentityKey` e substituir os mapas baseados apenas em `stop.id`:

```ts
import { getStopIdentityKey } from './route-stop-utils';

const oldStopsMap = new Map(
  oldStops.map((stop, index) => [getStopIdentityKey(stop), { stop, index }]),
);
const newStopsMap = new Map(
  newStops.map((stop, index) => [getStopIdentityKey(stop), { stop, index }]),
);
```

Nos objetos de mudança, manter `stopId` no formato atual para compatibilidade e acrescentar a identidade normalizada:

```ts
const stopKey = getStopIdentityKey(oldStop);
if (!newStopsMap.has(stopKey)) {
  changes.push({
    stopId: oldStop.id || oldStop.pointCode || oldStop.orderNumber || oldStop.placeId,
    stopKey: stopKey || undefined,
    stopIndex: oldIndex,
    changeType: 'removed',
    oldValue: oldStop.address,
  });
}

const newStopKey = getStopIdentityKey(newStop);
const oldStopData = oldStopsMap.get(newStopKey);
```

Repetir `stopKey: newStopKey || undefined` nas mudanças `added`, `sequence`, `address` e `data`. Em `markModifiedStops`, agrupar e consultar desta forma:

```ts
changes.forEach((change) => {
  const changeKey = change.stopKey || change.stopId;
  const existing = changesMap.get(changeKey) || [];
  existing.push(change);
  changesMap.set(changeKey, existing);
});

const normalizedKey = getStopIdentityKey(stop);
const stopChanges =
  (normalizedKey ? changesMap.get(normalizedKey) : undefined) ||
  changesMap.get(stop.id);
```

Em `src/lib/types.ts`, acrescentar o campo opcional à forma serializada da notificação:

```ts
stopKey?: string;
```

- [ ] **Step 5: Executar a verificação pura**

Run:

```bash
npx tsx scripts/verify-route-stop-reconciliation.ts
```

Expected: PASS e saída `OK: reconciliação preserva execução e rejeita conflitos estruturais.`

- [ ] **Step 6: Commit da regra pura**

```bash
git add src/lib/route-stop-reconciliation.ts src/lib/route-change-tracker.ts src/lib/types.ts scripts/verify-route-stop-reconciliation.ts
git commit -m "test: cobrir concorrência entre rota e entrega"
```

---

### Task 2: Criar o gateway de transações do Firestore

**Files:**
- Create: `src/lib/firebase/route-stop-mutations.ts`
- Modify: `scripts/verify-route-stop-reconciliation.ts`

**Interfaces:**
- Consumes: funções da Task 1 e `db` de `src/lib/firebase/client.ts`.
- Produces: `saveExistingRoutePlansAtomically(plans)`, `confirmRouteStopAtomically(input)` e `acknowledgeRouteChangesAtomically(routeId)`.

- [ ] **Step 1: Acrescentar ao script o contrato de primeira conclusão**

Adicionar antes do `console.log` final de `scripts/verify-route-stop-reconciliation.ts`:

```ts
const firstCompletion = updateStopByIdentity(
  [stop('A')],
  stop('A'),
  { deliveryStatus: 'completed' },
);
assert.equal(firstCompletion.previousStop.deliveryStatus, undefined);
assert.equal(firstCompletion.updatedStop.deliveryStatus, 'completed');

const completedEdit = updateStopByIdentity(
  [stop('A', { deliveryStatus: 'completed' })],
  stop('A'),
  { deliveryStatus: 'completed', notes: 'Corrigida' },
);
assert.equal(completedEdit.previousStop.deliveryStatus, 'completed');
assert.equal(completedEdit.updatedStop.deliveryStatus, 'completed');
```

- [ ] **Step 2: Criar o gateway transacional**

Criar `src/lib/firebase/route-stop-mutations.ts` com estas assinaturas e fluxo:

```ts
import {
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { PlaceValue } from '@/lib/types';
import { detectRouteChanges, markModifiedStops, type RouteChange } from '@/lib/route-change-tracker';
import {
  clearRouteChangeFlags,
  rebasePlannedStops,
  RouteStopNotFoundError,
  updateStopByIdentity,
} from '@/lib/route-stop-reconciliation';

export type RouteMetrics = {
  encodedPolyline: string;
  distanceMeters: number;
  duration: string;
};

export type ExistingRoutePlan = {
  routeId: string;
  baseStops: PlaceValue[];
  plannedStops: PlaceValue[];
  metrics?: RouteMetrics;
};

export type SavedRoutePlan = {
  routeId: string;
  stops: PlaceValue[];
  changes: RouteChange[];
  status: string;
  driverId?: string;
};

export async function saveExistingRoutePlansAtomically(
  plans: ExistingRoutePlan[],
): Promise<SavedRoutePlan[]> {
  return runTransaction(db, async (transaction) => {
    const refs = plans.map((plan) => doc(db, 'routes', plan.routeId));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));

    const results = plans.map((plan, index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists()) throw new Error(`Rota ${plan.routeId} não encontrada.`);
      const data = snapshot.data();
      const latestStops = (data.stops || []) as PlaceValue[];
      const rebased = rebasePlannedStops({
        baseStops: plan.baseStops,
        plannedStops: plan.plannedStops,
        latestStops,
      });
      const changes = detectRouteChanges(latestStops, rebased);
      const stops = markModifiedStops(rebased, changes);
      return {
        routeId: plan.routeId,
        stops,
        changes,
        status: data.status || '',
        driverId: data.driverId as string | undefined,
      };
    });

    results.forEach((result, index) => {
      const metrics = plans[index].metrics;
      transaction.update(refs[index], {
        stops: result.stops,
        ...(metrics || {}),
        updatedAt: serverTimestamp(),
      });
    });

    return results;
  });
}

export async function confirmRouteStopAtomically(input: {
  routeId: string;
  driverId: string;
  targetStop: Partial<PlaceValue>;
  patch: Partial<PlaceValue>;
}): Promise<{
  stops: PlaceValue[];
  previousStop: PlaceValue;
  updatedStop: PlaceValue;
  wasPreviouslyFinalized: boolean;
  transitionedToCompleted: boolean;
}> {
  return runTransaction(db, async (transaction) => {
    const routeRef = doc(db, 'routes', input.routeId);
    const routeSnapshot = await transaction.get(routeRef);
    if (!routeSnapshot.exists()) throw new Error('Rota não encontrada.');
    const routeData = routeSnapshot.data();
    if (routeData.driverId !== input.driverId) {
      throw new Error('Esta rota não pertence mais ao motorista atual.');
    }

    const mutation = updateStopByIdentity(
      (routeData.stops || []) as PlaceValue[],
      input.targetStop,
      input.patch,
    );
    const wasPreviouslyFinalized = Boolean(mutation.previousStop.deliveryStatus);
    const transitionedToCompleted =
      mutation.previousStop.deliveryStatus !== 'completed' &&
      mutation.updatedStop.deliveryStatus === 'completed';
    const updatedStop = wasPreviouslyFinalized
      ? { ...mutation.updatedStop, editedByDriver: true, editedAt: Timestamp.now() }
      : mutation.updatedStop;
    const stops = [...mutation.stops];
    stops[mutation.index] = updatedStop;

    transaction.update(routeRef, {
      stops,
      currentStopIndex: mutation.index + 1,
      updatedAt: serverTimestamp(),
    });

    if (transitionedToCompleted) {
      transaction.update(doc(db, 'users', input.driverId), {
        totalDeliveries: increment(1),
      });
    }

    return {
      stops,
      previousStop: mutation.previousStop,
      updatedStop,
      wasPreviouslyFinalized,
      transitionedToCompleted,
    };
  });
}

export async function acknowledgeRouteChangesAtomically(routeId: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const routeRef = doc(db, 'routes', routeId);
    const notificationRef = doc(db, 'routeChangeNotifications', routeId);
    const routeSnapshot = await transaction.get(routeRef);
    const notificationSnapshot = await transaction.get(notificationRef);
    if (!routeSnapshot.exists()) throw new Error('Rota não encontrada.');
    if (!notificationSnapshot.exists()) throw new Error('Notificação não encontrada.');

    transaction.update(routeRef, {
      stops: clearRouteChangeFlags((routeSnapshot.data().stops || []) as PlaceValue[]),
      pendingChanges: false,
      updatedAt: serverTimestamp(),
    });
    transaction.update(notificationRef, {
      acknowledged: true,
      acknowledgedAt: serverTimestamp(),
    });
  });
}

export { RouteStopNotFoundError };
```

- [ ] **Step 3: Rodar a verificação pura após a criação do gateway**

Run:

```bash
npx tsx scripts/verify-route-stop-reconciliation.ts
```

Expected: PASS. O script não importa Firebase nem acessa rede.

- [ ] **Step 4: Rodar typecheck focado no gateway**

Run:

```bash
npx tsc --noEmit --pretty false > /tmp/rota-exata-typecheck-task2.log 2>&1
rg "route-stop-(mutations|reconciliation)|route-change-tracker" /tmp/rota-exata-typecheck-task2.log
```

Expected: o primeiro comando pode herdar o exit code global diferente de zero; o `rg` não deve encontrar erro nos três arquivos da tarefa.

- [ ] **Step 5: Commit do gateway**

```bash
git add src/lib/firebase/route-stop-mutations.ts scripts/verify-route-stop-reconciliation.ts
git commit -m "feat: adicionar mutações atômicas de paradas"
```

---

### Task 3: Migrar a página administrativa de rota direta

**Files:**
- Modify: `src/app/(admin)/routes/[routeId]/acompanhar/page.tsx:1216-1264,3756-3845,3868-4410,4620-4990`

**Interfaces:**
- Consumes: `saveExistingRoutePlansAtomically` e `SavedRoutePlan` da Task 2.
- Produces: todos os caminhos que alteram uma rota existente usam o documento atual da transação e atualizam o estado local com o resultado persistido.

- [ ] **Step 1: Registrar a falha de concorrência antes da migração**

No cenário manual de homologação, abrir a mesma rota em duas sessões, finalizar a parada A como motorista e, sem recarregar o administrador, remover B. Registrar no console do Firestore que A perde `deliveryStatus` com o código atual. Não usar dados reais de pagamento.

Expected: reprodução do relato antes da alteração; se o ambiente de homologação não estiver disponível, a reprodução determinística da Task 1 é a evidência obrigatória e este passo fica registrado como não executado por falta de ambiente, sem escrita em produção.

- [ ] **Step 2: Importar o gateway e criar a memória de baseline**

Adicionar aos imports:

```ts
import {
  saveExistingRoutePlansAtomically,
  type RouteMetrics,
  type SavedRoutePlan,
} from '@/lib/firebase/route-stop-mutations';
import { RouteStructureConflictError } from '@/lib/route-stop-reconciliation';
```

Ao lado dos estados de rota, adicionar:

```ts
const persistedStopsRef = React.useRef<Record<string, PlaceValue[]>>({});
const rememberPersistedStops = React.useCallback((id: string, stops: PlaceValue[]) => {
  persistedStopsRef.current[id] = stops;
}, []);
const getPersistedStops = React.useCallback((id: string, fallback: PlaceValue[]) => (
  persistedStopsRef.current[id] || fallback
), []);
```

Nos carregamentos de `routeId`, `additionalRoutes` e rotas do serviço, chamar `rememberPersistedStops(documentId, routeDoc.stops || [])` no mesmo bloco que monta o estado visual. Depois de cada transação bem-sucedida, substituir a baseline pelos `result.stops` retornados.

- [ ] **Step 3: Extrair a aplicação do resultado persistido**

Adicionar dentro do componente:

```ts
const applySavedRouteResult = (routeKey: string, result: SavedRoutePlan, metrics?: RouteMetrics) => {
  rememberPersistedStops(result.routeId, result.stops);
  setRoute(routeKey, (previous) => previous ? {
    ...previous,
    stops: result.stops,
    ...(metrics || {}),
  } : null);
};

const notifySavedRouteChanges = async (result: SavedRoutePlan) => {
  if (
    result.changes.length === 0 ||
    !result.driverId ||
    !['dispatched', 'in_progress'].includes(result.status)
  ) return;
  const notifyFn = httpsCallable(functions, 'notifyRouteChanges');
  await notifyFn({
    routeId: result.routeId,
    driverId: result.driverId,
    changes: result.changes,
  });
};
```

- [ ] **Step 4: Migrar remover e excluir da timeline**

Em `handleRemoveFromRouteTimeline` e `handleDeleteStopFromTimeline`, remover o par `getDoc` + `updateDoc({ stops: ... })`. Antes de alterar o state local, calcular o plano por identidade e persistir assim:

```ts
const draftStops = pendingEdits[routeKey] ?? targetRoute.stops;
const plannedStops = dedupeStops(removeStopWithSameIdentity(draftStops, stop));
const routeInfo = plannedStops.length > 0
  ? await computeRoute(routeData.origin, plannedStops)
  : null;
const metrics: RouteMetrics | undefined = routeInfo ? {
  encodedPolyline: routeInfo.encodedPolyline,
  distanceMeters: routeInfo.distanceMeters,
  duration: routeInfo.duration,
} : plannedStops.length === 0 ? {
  encodedPolyline: '',
  distanceMeters: 0,
  duration: '0s',
} : undefined;

const [result] = await saveExistingRoutePlansAtomically([{
  routeId: firestoreRouteId,
  baseStops: getPersistedStops(firestoreRouteId, targetRoute.stops),
  plannedStops,
  ...(metrics ? { metrics } : {}),
}]);
applySavedRouteResult(routeKey, result, metrics);
await notifySavedRouteChanges(result);
```

Somente depois do sucesso atualizar `unassignedStops`, limpar `pendingEdits` e, no caso da exclusão, desvincular `orders`/`services`. No `catch`, tratar conflito sem limpar a edição:

```ts
if (error instanceof RouteStructureConflictError) {
  toast({
    variant: 'destructive',
    title: 'A rota mudou durante a edição',
    description: 'Recarregue a rota e repita a remoção para preservar as alterações mais recentes.',
  });
  return;
}
throw error;
```

- [ ] **Step 5: Migrar salvar rota e aplicar edições pendentes**

Em `handleUpdateExistingRoute`, substituir `getDoc`, `markModifiedStops` e `updateDoc` por uma chamada com `baseStops: getPersistedStops(currentRouteId, routeToUpdate.stops)` e `plannedStops: routeToUpdate.stops`.

Em `handleApplyPendingEdits`, manter a criação de rotas novas como está. Para `routeUpdates`, substituir o `writeBatch` por uma chamada única:

```ts
const existingPlans = routeUpdates.map((update) => ({
  routeId: update.routeId,
  baseStops: getPersistedStops(update.routeId, getRoute(update.routeKey)?.stops || []),
  plannedStops: update.cleanedStops,
  metrics: update.routeInfo ? {
    encodedPolyline: update.routeInfo.encodedPolyline,
    distanceMeters: update.routeInfo.distanceMeters,
    duration: update.routeInfo.duration,
  } : undefined,
}));
const savedResults = await saveExistingRoutePlansAtomically(existingPlans);
savedResults.forEach((result, index) => {
  const update = routeUpdates[index];
  const metrics = existingPlans[index].metrics;
  applySavedRouteResult(update.routeKey, result, metrics);
});
for (const result of savedResults) await notifySavedRouteChanges(result);
```

Limpar `pendingEdits` somente depois da transação bem-sucedida.

- [ ] **Step 6: Migrar transferências entre rotas existentes**

Em `executeTransferStop`, montar os planos de origem e destino e enviá-los juntos para `saveExistingRoutePlansAtomically`. Usar `removeStopWithSameIdentity` na origem e `upsertStopInCollection` no destino. A transação deve abortar os dois lados se qualquer baseline estiver desatualizada.

- [ ] **Step 7: Auditar gravações restantes da página**

Run:

```bash
rg -n "(updateDoc|batch\.update).*|stops:" 'src/app/(admin)/routes/[routeId]/acompanhar/page.tsx'
```

Expected: criação de rotas novas e limpezas de dados ainda podem escrever `stops`; remover, excluir, transferir, salvar rota existente e aplicar pendências devem apontar para `saveExistingRoutePlansAtomically`, sem `updateDoc(routeRef, { stops:` nesses fluxos.

- [ ] **Step 8: Rodar verificações da página**

```bash
npx tsx scripts/verify-route-stop-reconciliation.ts
npx tsc --noEmit --pretty false > /tmp/rota-exata-typecheck-task3.log 2>&1
rg "routes/\[routeId\]/acompanhar|route-stop-(mutations|reconciliation)" /tmp/rota-exata-typecheck-task3.log
```

Expected: script PASS e nenhum erro filtrado nos arquivos tocados.

- [ ] **Step 9: Commit da rota direta**

```bash
git add 'src/app/(admin)/routes/[routeId]/acompanhar/page.tsx'
git commit -m "fix: preservar entregas ao alterar rota"
```

---

### Task 4: Migrar a página administrativa de serviço Luna

**Files:**
- Modify: `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx:2171-2250,4010-4165,4508-4775,4800-5350`

**Interfaces:**
- Consumes: o mesmo gateway, baseline e helpers da Task 3.
- Produces: remoção, exclusão, transferência e edições em rotas A/B/dinâmicas do serviço preservam a execução mais recente.

- [ ] **Step 1: Importar o gateway e manter baseline por ID do documento**

Adicionar:

```ts
import {
  saveExistingRoutePlansAtomically,
  type RouteMetrics,
  type SavedRoutePlan,
} from '@/lib/firebase/route-stop-mutations';
import { RouteStructureConflictError, rebasePlannedStops } from '@/lib/route-stop-reconciliation';
import { getStopIdentityKey } from '@/lib/route-stop-utils';
```

Ao lado dos estados de rota, adicionar:

```ts
const persistedStopsRef = React.useRef<Record<string, PlaceValue[]>>({});
const rememberPersistedStops = React.useCallback((id: string, stops: PlaceValue[]) => {
  persistedStopsRef.current[id] = stops;
}, []);
const getPersistedStops = React.useCallback((id: string, fallback: PlaceValue[]) => (
  persistedStopsRef.current[id] || fallback
), []);
```

Ao carregar `serviceRouteIds.A`, `serviceRouteIds.B`, rotas dinâmicas e adicionais, executar `rememberPersistedStops(routeDoc.id, routeDoc.data().stops || [])` usando o Firestore ID real, não as chaves visuais A/B/C.

- [ ] **Step 2: Atualizar o listener do serviço sem tratar execução como estrutura**

No listener iniciado em torno da linha 2171, quando a sequência de identidades recebida for igual à baseline, atualizar `rememberPersistedStops(routeDoc.id, firestoreStops)` e mesclar os campos operacionais no state visual. Quando a sequência for diferente e não houver `pendingEdits` para a rota, substituir state e baseline pelo Firestore. Quando houver edição pendente, manter o plano e deixar a transação detectar o conflito.

Usar esta comparação e atualização:

```ts
const sameIdentitySequence = (left: PlaceValue[], right: PlaceValue[]) => (
  left.length === right.length && left.every((item, index) => (
    getStopIdentityKey(item) === getStopIdentityKey(right[index])
  ))
);

const baseline = getPersistedStops(routeDoc.id, currentRoute?.stops || []);
if (sameIdentitySequence(baseline, firestoreStops)) {
  const refreshedStops = rebasePlannedStops({
    baseStops: baseline,
    plannedStops: currentRoute?.stops || firestoreStops,
    latestStops: firestoreStops,
  });
  rememberPersistedStops(routeDoc.id, firestoreStops);
  setRoute(routeKey, (previous) => previous ? { ...previous, stops: refreshedStops } : null);
} else if (!pendingEdits[routeKey]) {
  rememberPersistedStops(routeDoc.id, firestoreStops);
  setRoute(routeKey, (previous) => previous ? { ...previous, stops: firestoreStops } : null);
}
```

- [ ] **Step 3: Migrar remoção e exclusão**

Em `handleRemoveFromRouteTimeline` e `handleDeleteStopFromTimeline`, calcular `plannedStops` com `removeStopWithSameIdentity`, chamar `saveExistingRoutePlansAtomically` com a baseline do Firestore ID e atualizar state/unassigned somente depois do commit. Tratar o conflito com o bloco completo:

```ts
if (error instanceof RouteStructureConflictError) {
  toast({
    variant: 'destructive',
    title: 'A rota mudou durante a edição',
    description: 'Recarregue a rota e repita a alteração para preservar os dados mais recentes.',
  });
  return;
}
throw error;
```

- [ ] **Step 4: Migrar salvar e aplicar pendências**

Em `handleUpdateExistingRoute`, usar um plano transacional único. Em `handleApplyPendingEdits`, manter a criação de documentos novos e enviar todas as rotas existentes em uma chamada `saveExistingRoutePlansAtomically(existingPlans)`. Atualizar cada `routeKey` pelo índice correspondente do resultado e notificar somente com `result.changes`.

- [ ] **Step 5: Migrar transferência entre rotas existentes**

Em `executeTransferStop`, enviar origem e destino na mesma transação. O plano da origem usa `removeStopWithSameIdentity`; o plano do destino usa `upsertStopInCollection`. Não disparar notificação nem alterar state antes de os dois documentos serem confirmados.

- [ ] **Step 6: Auditar gravações restantes da página de serviço**

Run:

```bash
rg -n "(updateDoc|batch\.update).*|stops:" 'src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx'
```

Expected: fluxos de documentos novos e sincronização do serviço continuam visíveis; nenhuma edição de `stops` de rota existente nos handlers cobertos permanece fora do gateway.

- [ ] **Step 7: Rodar verificações da página de serviço**

```bash
npx tsx scripts/verify-route-stop-reconciliation.ts
npx tsc --noEmit --pretty false > /tmp/rota-exata-typecheck-task4.log 2>&1
rg "routes/service/\[serviceId\]/acompanhar|route-stop-(mutations|reconciliation)" /tmp/rota-exata-typecheck-task4.log
```

Expected: script PASS e nenhum erro filtrado nos arquivos tocados.

- [ ] **Step 8: Commit da rota de serviço**

```bash
git add 'src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx'
git commit -m "fix: preservar entregas nas rotas de servico"
```

---

### Task 5: Tornar confirmação e reconhecimento do motorista atômicos

**Files:**
- Modify: `src/app/(driver)/my-routes/[id]/page.tsx:185-222,382-585`
- Modify: `scripts/verify-route-stop-reconciliation.ts`

**Interfaces:**
- Consumes: `confirmRouteStopAtomically`, `acknowledgeRouteChangesAtomically`, `RouteStopNotFoundError`.
- Produces: confirmação por identidade, contador idempotente e reconhecimento que não substitui estado recente.

- [ ] **Step 1: Acrescentar a regressão de índice instável**

Adicionar ao script de verificação:

```ts
const reorderedBeforeConfirmation = [stop('B'), stop('A')];
const confirmation = updateStopByIdentity(
  reorderedBeforeConfirmation,
  stop('A'),
  { deliveryStatus: 'completed', payments: [{ id: 'cash-1', method: 'dinheiro', value: 50 }] },
);
assert.equal(confirmation.index, 1);
assert.equal(confirmation.stops[0].id, 'B');
assert.equal(confirmation.stops[0].deliveryStatus, undefined);
assert.equal(confirmation.stops[1].id, 'A');
assert.equal(confirmation.stops[1].deliveryStatus, 'completed');
```

Run:

```bash
npx tsx scripts/verify-route-stop-reconciliation.ts
```

Expected: PASS; a função da Task 1 já atende o novo caso e comprova que a página pode abandonar o índice local.

- [ ] **Step 2: Substituir o reconhecimento por transação**

Adicionar aos imports da página:

```ts
import {
  acknowledgeRouteChangesAtomically,
  confirmRouteStopAtomically,
  RouteStopNotFoundError,
} from '@/lib/firebase/route-stop-mutations';
```

Em `handleAcknowledgeChanges`, remover os dois `updateDoc` e o `route.stops.map`. Usar:

```ts
await acknowledgeRouteChangesAtomically(routeId);
```

Manter o toast e o tratamento de loading existentes.

- [ ] **Step 3: Montar um patch de entrega sem copiar o array**

Em `handleConfirmDelivery`, incluir `!user` na guarda inicial, capturar a identidade antes dos uploads e manter as URLs atuais como fallback caso um upload falhe:

```ts
if (!route || selectedStopIndex === null || !user) {
  console.error('Confirmação falhou: rota, parada ou motorista ausente.');
  return;
}

const selectedStop = route.stops[selectedStopIndex];
let resolvedPhotoUrl: string | null = selectedStop.photoUrl || null;
let resolvedAttemptPhotoUrl: string | null = selectedStop.attemptPhotoUrl || null;

if (data.photo?.startsWith('data:')) {
  const photoRef = ref(
    storage,
    `delivery-photos/${routeId}/${selectedStop.id || selectedStop.placeId}-${Date.now()}.jpg`,
  );
  await uploadString(photoRef, data.photo, 'data_url');
  resolvedPhotoUrl = await getDownloadURL(photoRef);
} else if (data.photo?.startsWith('http')) {
  resolvedPhotoUrl = data.photo;
} else if (!data.photo) {
  resolvedPhotoUrl = null;
}

if (data.attemptPhoto?.startsWith('data:')) {
  const attemptPhotoRef = ref(
    storage,
    `delivery-attempt-photos/${routeId}/${selectedStop.id || selectedStop.placeId}-${Date.now()}.jpg`,
  );
  await uploadString(attemptPhotoRef, data.attemptPhoto, 'data_url');
  resolvedAttemptPhotoUrl = await getDownloadURL(attemptPhotoRef);
} else if (data.attemptPhoto?.startsWith('http')) {
  resolvedAttemptPhotoUrl = data.attemptPhoto;
} else if (!data.attemptPhoto) {
  resolvedAttemptPhotoUrl = null;
}
```

Manter os `try/catch` individuais e os toasts atuais em volta de cada upload; o código acima define apenas a forma final dos valores. Depois, montar somente os campos alterados:

```ts
const deliveryPatch: Partial<PlaceValue> = {
  deliveryStatus: data.status,
  completedAt: Timestamp.now(),
  notes: data.notes || null,
  failureReason: data.status === 'failed' ? data.failureReason || null : null,
  wentToLocation: data.status === 'failed' ? Boolean(data.wentToLocation) : null,
  payments: data.status === 'completed' ? data.payments || [] : null,
  deliveredItemIds: data.status === 'completed' ? data.deliveredItemIds || [] : null,
  photoUrl: resolvedPhotoUrl,
  attemptPhotoUrl: resolvedAttemptPhotoUrl,
};
```

Como `PlaceValue` ainda tipa alguns campos sem `null`, montar o objeto como `Record<string, unknown>` e convertê-lo para `Partial<PlaceValue>` somente na chamada, preservando o comportamento existente de limpeza no Firestore.

- [ ] **Step 4: Confirmar usando o objeto selecionado como identidade**

Capturar `const selectedStop = route.stops[selectedStopIndex]` antes dos uploads e substituir `updateDoc(routeRef, { stops: updatedStops })` e o `increment(1)` separado por:

```ts
const result = await confirmRouteStopAtomically({
  routeId,
  driverId: user.uid,
  targetStop: selectedStop,
  patch: deliveryPatch,
});
```

Usar `result.updatedStop` para `logPointCompleted`, `logPointFailed`, sincronização Luna e notificação de edição. Usar `result.wasPreviouslyFinalized` no lugar do `isEdit` calculado antes da transação. Remover o bloco separado que executa `totalDeliveries: increment(1)`.

- [ ] **Step 5: Tratar parada removida durante a confirmação**

No `catch` de `handleConfirmDelivery`, antes do erro genérico:

```ts
if (error instanceof RouteStopNotFoundError) {
  setIsConfirmDialogOpen(false);
  setSelectedStopIndex(null);
  toast({
    variant: 'destructive',
    title: 'Esta parada mudou',
    description: 'A parada foi removida ou movida enquanto você confirmava. A rota foi atualizada sem recriá-la.',
  });
  return;
}
```

O listener já recarrega o documento da rota e mostrará a versão persistida.

- [ ] **Step 6: Verificar imports e ausência de gravação integral**

Run:

```bash
rg -n "stops: updatedStops|totalDeliveries: increment\(1\)|selectedStopIndex \+ 1" 'src/app/(driver)/my-routes/[id]/page.tsx'
```

Expected: nenhuma ocorrência. Remover imports `increment` e referências que ficaram sem uso.

- [ ] **Step 7: Rodar verificações do motorista**

```bash
npx tsx scripts/verify-route-stop-reconciliation.ts
npx tsc --noEmit --pretty false > /tmp/rota-exata-typecheck-task5.log 2>&1
rg "driver\)/my-routes/\[id\]|route-stop-(mutations|reconciliation)" /tmp/rota-exata-typecheck-task5.log
```

Expected: script PASS e nenhum erro filtrado nos arquivos tocados.

- [ ] **Step 8: Commit do fluxo do motorista**

```bash
git add 'src/app/(driver)/my-routes/[id]/page.tsx' scripts/verify-route-stop-reconciliation.ts
git commit -m "fix: confirmar entrega de forma atomica"
```

---

### Task 6: Tornar o reparo de contadores seguro

**Files:**
- Modify: `scripts/update-driver-deliveries.ts:1-128`
- Modify: `ATUALIZAR_ENTREGAS.md`

**Interfaces:**
- Consumes: documentos atuais de `routes` e `users` via Firebase Admin.
- Produces: simulação padrão e modo explícito `--apply` para corrigir `users.totalDeliveries`.

- [ ] **Step 1: Fazer o script anunciar o modo antes de preparar escritas**

Adicionar no início:

```ts
const shouldApply = process.argv.includes('--apply');
const modeLabel = shouldApply ? 'APLICAÇÃO' : 'SIMULAÇÃO';
```

No começo de `updateDriverDeliveries`, imprimir `Modo: ${modeLabel}`.

- [ ] **Step 2: Separar diferenças de valores já corretos**

Ao iterar motoristas, ler `currentTotal = driverDoc.data()?.totalDeliveries || 0`. Só incluir no batch quando `currentTotal !== totalDeliveries`, registrando:

```ts
console.log(`  ${driverName}: ${currentTotal} -> ${totalDeliveries}`);
```

No modo simulação, não chamar `batch.update` nem `batch.commit`.

- [ ] **Step 3: Exigir `--apply` para escrever**

Substituir o commit final por:

```ts
if (!shouldApply) {
  console.log(`\nSIMULAÇÃO: ${updateCount} motorista(s) precisariam de ajuste.`);
  console.log('Execute novamente com --apply somente após revisar os valores.');
  return;
}

if (updateCount > 0) {
  await batch.commit();
  console.log(`\n${updateCount} motorista(s) atualizado(s).`);
}
```

- [ ] **Step 4: Atualizar a documentação operacional**

Em `ATUALIZAR_ENTREGAS.md`, definir os comandos:

```bash
npx tsx scripts/update-driver-deliveries.ts
npx tsx scripts/update-driver-deliveries.ts --apply
```

Explicar que o primeiro apenas lista diferenças e que o segundo deve ser executado depois da implantação da correção e da conferência da simulação.

- [ ] **Step 5: Validar sintaxe sem acessar produção**

Run:

```bash
npx tsc --noEmit --pretty false > /tmp/rota-exata-typecheck-task6.log 2>&1
rg "scripts/update-driver-deliveries" /tmp/rota-exata-typecheck-task6.log
```

Expected: nenhum erro filtrado no script.

- [ ] **Step 6: Commit do reparo seguro**

```bash
git add scripts/update-driver-deliveries.ts ATUALIZAR_ENTREGAS.md
git commit -m "chore: proteger recalculo de entregas com dry run"
```

---

### Task 7: Verificação final ponta a ponta

**Files:**
- Verify: todos os arquivos anteriores

**Interfaces:**
- Consumes: implementação completa das Tasks 1–6.
- Produces: evidência de regressão, compilação focada e aceite manual nas duas variantes de rota.

- [ ] **Step 1: Rodar a suíte de regressão isolada**

```bash
npx tsx scripts/verify-route-stop-reconciliation.ts
```

Expected: PASS com a mensagem final `OK: reconciliação preserva execução e rejeita conflitos estruturais.`

- [ ] **Step 2: Rodar o typecheck completo e filtrar o escopo**

```bash
npm run typecheck > /tmp/rota-exata-typecheck-final.log 2>&1
rg "route-stop-(reconciliation|mutations)|route-change-tracker|routes/\[routeId\]/acompanhar|routes/service/\[serviceId\]/acompanhar|driver\)/my-routes/\[id\]|update-driver-deliveries" /tmp/rota-exata-typecheck-final.log
```

Expected: registrar o exit code global; o filtro não pode retornar erros dos arquivos tocados.

- [ ] **Step 3: Verificar integridade do diff**

```bash
git diff --check
git status --short
```

Expected: `git diff --check` com exit 0; o status contém somente mudanças esperadas, caso ainda não tenham sido commitadas.

- [ ] **Step 4: Testar rota avulsa em duas sessões**

1. Criar rota descartável com paradas A, B e C e atribuir a um motorista de homologação.
2. Abrir a rota na tela administrativa e mantê-la aberta.
3. No app do motorista, finalizar A com pagamento PIX e foto.
4. Sem recarregar o administrador, mover B para não atribuídos.
5. Conferir no Firestore e no app que A mantém `deliveryStatus`, `completedAt`, `payments` e `photoUrl`; B não está mais em `stops`.
6. Reconhecer a notificação no app e conferir que A continua finalizada.

- [ ] **Step 5: Testar rota de serviço Luna em duas sessões**

Repetir o cenário da Step 4 pela URL `/routes/service/{serviceId}/acompanhar`, incluindo uma reordenação de C antes de aplicar as edições. Conferir que a ordem muda, A mantém o estado operacional e a notificação descreve remoção/reordenação.

- [ ] **Step 6: Testar conflito motorista versus remoção**

1. Abrir o diálogo de confirmação de C no app.
2. Remover C pela tela administrativa.
3. Concluir o diálogo do motorista.
4. Confirmar que aparece `Esta parada mudou`, C não reaparece no Firestore e `totalDeliveries` não aumenta.

- [ ] **Step 7: Testar idempotência do contador**

1. Anotar `users/{driverId}.totalDeliveries`.
2. Finalizar uma parada pendente e confirmar incremento de exatamente 1.
3. Editar a mesma entrega sem trocar seu status `completed`.
4. Confirmar que o contador permanece inalterado na edição.

- [ ] **Step 8: Simular o reparo de contadores**

Em ambiente com credencial de homologação:

```bash
npx tsx scripts/update-driver-deliveries.ts
```

Expected: lista diferenças e termina sem escrever. Somente depois de revisar o resultado, executar `--apply` no ambiente autorizado.

- [ ] **Step 9: Revisar o histórico e preparar integração**

```bash
git log --oneline -6
git status --short
```

Expected: commits focados das Tasks 1–6 e worktree limpo. Usar `superpowers:requesting-code-review` antes de integrar e `superpowers:finishing-a-development-branch` depois que a revisão passar.
