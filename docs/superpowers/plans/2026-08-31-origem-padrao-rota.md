# Origem padrão das rotas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A origem das rotas passa a ser o endereço real da loja, definido em um único lugar, e o operador consegue trocá-la colando o link que o app do Google Maps gera.

**Architecture:** Um módulo `src/lib/default-origin.ts` vira a única definição da origem de fallback e do predicado de validação, eliminando as 12 cópias espalhadas. Um hook `use-default-origin` faz as telas de cliente lerem `settings/defaultOrigin` — que os fluxos de servidor já leem e as telas ignoravam. Um par `src/lib/maps-link.ts` (extração pura de coordenadas) + `/api/resolve-maps-link` (expansão do link curto, que exige servidor porque `maps.app.goo.gl` não manda CORS) alimenta um campo de link novo em Settings. Por fim, um script corrige o documento do Firestore e faz backfill apenas de serviços e rotas não concluídos.

**Tech Stack:** TypeScript, Next.js App Router, Firestore (SDK client e admin), Google Geocoding/Places API, `tsx` para scripts.

## Global Constraints

- **Worktree:** `/Users/acassiusalves/rotaExata-1/.claude/worktrees/github-alignment-check-dc1542`, branch `fix/origem-geocodificacao`, criada a partir de `origin/main` (`cdedbc0`). Não criar branch nem rodar `npm install` — `node_modules` e `.env.local` já estão no lugar.
- **Sem framework de teste.** O repositório não tem vitest/jest e não vamos introduzir um nesta tarefa. Cada Task verifica com um script executável em `scripts/`, seguindo o padrão que já existe lá (`npx tsx scripts/<nome>.ts`).
- **Critério de typecheck:** `npm run typecheck` **não passa limpo neste repositório e nunca passou** — 89 erros em `main`. O critério de aceite é **zero erro nos arquivos que a mudança toca**, filtrando a saída por esses caminhos. Dê timeout folgado (`tsc` leva minutos) e confira o exit code; contar linhas de um output vazio devolve 0 e parece sucesso falso.
- **Comentários, mensagens de erro e mensagens de commit em português.**
- **Todo commit termina com** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Backfill só toca documentos não concluídos.** Serviços com `status === 'completed'` e rotas com `status === 'completed'` ou `'completed_auto'` ficam intactos — o histórico registra a rota como ela foi de fato executada, e relatórios e pagamentos passados foram calculados em cima dela.
- **Nenhuma escrita em produção sem `--dry-run` antes.** Todo script de dados roda em modo simulação por padrão e só grava com `--apply` explícito.

## Valor correto da origem (verificado)

Conferido contra a API do Google em 31/08/2026, e contra o link da própria loja (`https://maps.app.goo.gl/GJJVfxQyjJYt3jk47`):

```ts
{
  id: 'default-origin-sol-de-maria',
  customerName: 'Sol de Maria',
  address: 'Av. Circular, 1028 - Qd.50 - Lt.08 - St. Pedro Ludovico, Goiânia - GO, 74823-020',
  placeId: 'ChIJ1V3toTXyXpMR-1qQO17BY8c',
  lat: -16.7123299,
  lng: -49.2511399,
  phone: '',
}
```

O valor antigo (`placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po'`, `lat: -16.6786`, `lng: -49.2552`) tem place ID que o Google rejeita como inválido e coordenadas 3,78 km ao norte do endereço que o acompanha.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/default-origin.ts` *(novo)* | Constante `FALLBACK_ORIGIN` e predicado `isValidOrigin`. Única definição no repositório. |
| `src/lib/maps-link.ts` *(novo)* | Função pura `extractCoordsFromMapsUrl` e `isShortMapsLink`. Sem I/O, para poder ser verificada isoladamente. |
| `src/app/api/resolve-maps-link/route.ts` *(novo)* | Expande link curto seguindo o redirect e devolve coordenadas. Server-side por causa de CORS. |
| `src/hooks/use-default-origin.ts` *(novo)* | Lê `settings/defaultOrigin` no cliente, com `FALLBACK_ORIGIN` como último recurso. |
| `src/app/(admin)/settings/page.tsx` | Ganha campo de link do Maps ao lado do autocomplete. |
| `src/app/api/import-lunna-orders/route.ts:561` | Passa a importar `FALLBACK_ORIGIN`. |
| `src/app/(admin)/routes/new/page.tsx:73` | Idem, e `handleOriginLinkChange` passa a usar o parser compartilhado. |
| `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx:1227,1368` | Idem (duas cópias no mesmo arquivo). |
| `src/app/(admin)/routes/[routeId]/acompanhar/page.tsx:1420` | Idem. |
| `src/app/(admin)/routes/organize/acompanhar/page.tsx:1146` | Idem. |
| `scripts/verify-default-origin.ts` *(novo)* | Verificação: confere a constante contra a API do Google. |
| `scripts/verify-maps-link.ts` *(novo)* | Verificação: casos do parser de link. |
| `scripts/fix-origin-coordinates.ts` *(novo)* | Corrige `settings/defaultOrigin` e faz backfill dos não concluídos. |
| `scripts/{setup-default-origin,check-route-origins,fix-service-origin,fix-lunna-service-origins,fix-lunna-route-origins}.ts` | Passam a importar a constante em vez de redeclará-la. |
| `LUNA_INTEGRATION_GUIDE.md:12` | Documentação com a coordenada errada, corrigida. |

---

### Task 1: Fonte única da origem padrão

**Files:**
- Create: `src/lib/default-origin.ts`
- Create: `scripts/verify-default-origin.ts`
- Modify: `src/app/api/import-lunna-orders/route.ts:561-566`
- Modify: `src/app/(admin)/routes/new/page.tsx:66-75`
- Modify: `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx:1227-1233` e `:1368-1374`
- Modify: `src/app/(admin)/routes/[routeId]/acompanhar/page.tsx:1420-1426`
- Modify: `src/app/(admin)/routes/organize/acompanhar/page.tsx:1146-1152`

**Interfaces:**
- Produces: `FALLBACK_ORIGIN: PlaceValue`, `isValidOrigin(o: PlaceValue | undefined | null): boolean` — consumidos pelas Tasks 2, 5 e 6.

- [ ] **Step 1: Escrever a verificação que falha**

Create `scripts/verify-default-origin.ts`:

```ts
/**
 * Verificação da origem padrão do sistema.
 *
 * Confere que FALLBACK_ORIGIN é internamente consistente: o endereço textual,
 * quando geocodificado pelo Google, cai no mesmo lugar que as coordenadas
 * declaradas ao lado dele. Foi exatamente essa consistência que faltou no valor
 * antigo — endereço certo, coordenadas 3,78 km fora.
 *
 * Uso: npx tsx scripts/verify-default-origin.ts
 */
import * as dotenv from 'dotenv';
import { FALLBACK_ORIGIN, isValidOrigin } from '../src/lib/default-origin';

dotenv.config({ path: '.env.local' });

const KEY = process.env.GMAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GMAPS_KEY;
const TOLERANCIA_METROS = 100;

function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function main() {
  let falhas = 0;
  const falhar = (msg: string) => { console.error(`FALHA: ${msg}`); falhas++; };

  if (!isValidOrigin(FALLBACK_ORIGIN)) falhar('FALLBACK_ORIGIN não passa em isValidOrigin');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${FALLBACK_ORIGIN.placeId}&language=pt-BR&key=${KEY}`;
  const res = await fetch(url).then((r) => r.json());

  if (res.status !== 'OK') {
    falhar(`place ID recusado pelo Google: ${res.status} ${res.error_message ?? ''}`);
  } else {
    const loc = res.results[0].geometry.location;
    const d = distanciaMetros(FALLBACK_ORIGIN, loc);
    console.log(`place ID resolve para ${loc.lat}, ${loc.lng} — ${d.toFixed(0)} m da constante`);
    if (d > TOLERANCIA_METROS) falhar(`place ID está a ${d.toFixed(0)} m das coordenadas declaradas`);
  }

  const geo = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(FALLBACK_ORIGIN.address)}&region=br&language=pt-BR&key=${KEY}`,
  ).then((r) => r.json());

  if (geo.status !== 'OK') {
    falhar(`endereço textual não geocodifica: ${geo.status}`);
  } else {
    const loc = geo.results[0].geometry.location;
    const d = distanciaMetros(FALLBACK_ORIGIN, loc);
    console.log(`endereço textual resolve para ${loc.lat}, ${loc.lng} — ${d.toFixed(0)} m da constante`);
    if (d > TOLERANCIA_METROS) falhar(`endereço textual está a ${d.toFixed(0)} m das coordenadas declaradas`);
  }

  if (falhas > 0) { console.error(`\n${falhas} falha(s).`); process.exit(1); }
  console.log('\nOrigem padrão consistente.');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx tsx scripts/verify-default-origin.ts
```

Esperado: falha com `Cannot find module '../src/lib/default-origin'` — o módulo ainda não existe.

- [ ] **Step 3: Criar o módulo**

Create `src/lib/default-origin.ts`:

```ts
import type { PlaceValue } from '@/lib/types';

/**
 * Origem de último recurso, usada só quando não há nada em settings/defaultOrigin.
 *
 * Verificada contra a API do Google em 31/08/2026: o place ID resolve e o endereço
 * textual geocodifica para estas mesmas coordenadas (precisão ROOFTOP).
 *
 * NÃO duplique este literal. Antes desta constante existir havia 12 cópias dele no
 * repositório, com coordenadas que não correspondiam ao próprio endereço ao lado,
 * e quatro scripts chamados fix-*origins* que "corrigiram" os dados para o valor errado.
 * Para trocar a loja, edite settings/defaultOrigin pela tela de Configurações.
 */
export const FALLBACK_ORIGIN: PlaceValue = {
  id: 'default-origin-sol-de-maria',
  customerName: 'Sol de Maria',
  address: 'Av. Circular, 1028 - Qd.50 - Lt.08 - St. Pedro Ludovico, Goiânia - GO, 74823-020',
  placeId: 'ChIJ1V3toTXyXpMR-1qQO17BY8c',
  lat: -16.7123299,
  lng: -49.2511399,
  phone: '',
};

/** Uma origem só serve se tiver coordenadas numéricas e diferentes de zero (0,0 é o Atlântico). */
export function isValidOrigin(o: PlaceValue | undefined | null): boolean {
  return !!(
    o &&
    typeof o.lat === 'number' &&
    typeof o.lng === 'number' &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng) &&
    o.lat !== 0 &&
    o.lng !== 0
  );
}
```

- [ ] **Step 4: Rodar a verificação até passar**

```bash
npx tsx scripts/verify-default-origin.ts
```

Esperado: `Origem padrão consistente.` e exit 0, com as duas distâncias abaixo de 100 m.

- [ ] **Step 5: Substituir as 6 cópias no `src/`**

Em cada um dos arquivos abaixo, apagar o literal `defaultOrigin` inline e passar a usar a constante importada. Adicionar no topo do arquivo:

```ts
import { FALLBACK_ORIGIN, isValidOrigin } from '@/lib/default-origin';
```

- `src/app/api/import-lunna-orders/route.ts:561` — trocar `let defaultOrigin: PlaceValue = { ... }` por `let defaultOrigin: PlaceValue = FALLBACK_ORIGIN;`
- `src/app/(admin)/routes/new/page.tsx:66-75` — o item `'origin-1'` de `initialSavedOrigins` passa a ser `{ id: 'origin-1', name: 'Sol de Maria', value: FALLBACK_ORIGIN }`
- `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx:1227` e `:1368` — trocar os dois `const defaultOrigin: PlaceValue = { ... }` por `const defaultOrigin = FALLBACK_ORIGIN;`
- `src/app/(admin)/routes/[routeId]/acompanhar/page.tsx:1420` — idem
- `src/app/(admin)/routes/organize/acompanhar/page.tsx:1146` — idem

Nos três arquivos que declaram um `isValidOrigin` local — `service/[serviceId]/acompanhar/page.tsx:1384`, `[routeId]/acompanhar/page.tsx:1436` e `organize/acompanhar/page.tsx:1162` — apagar a declaração local e usar a importada. Onde a validação está inline como `serviceData.origin && typeof ... .lat === 'number' && ... !== 0` (ex.: `service/[serviceId]/acompanhar/page.tsx:1236-1241`), substituir por `isValidOrigin(serviceData.origin)`.

- [ ] **Step 6: Confirmar que não sobrou nenhuma cópia no `src/`**

```bash
grep -rn -- "-16\.6786\|ChIJFT_4_9XFUpQRy_14vCVa2po" src/
```

Esperado: nenhuma saída.

- [ ] **Step 7: Typecheck dos arquivos tocados**

```bash
npm run typecheck 2>&1 | grep -E "default-origin|import-lunna-orders|routes/new|acompanhar"
```

Esperado: nenhuma saída. (O comando inteiro continua reportando os ~89 erros pré-existentes em outros arquivos — isso é o baseline, não regressão.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/default-origin.ts scripts/verify-default-origin.ts src/app
git commit -m "$(cat <<'EOF'
fix(origem): fonte unica para a origem padrao, com coordenadas corretas

O literal da origem estava duplicado em 6 lugares do src/ com coordenadas
que nao correspondiam ao proprio endereco ao lado — 3,78 km ao norte da loja —
e um place ID que o Google rejeita como invalido.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Telas de cliente passam a ler `settings/defaultOrigin`

Hoje só os fluxos de servidor leem o documento do Firestore. As cinco telas de cliente caem direto no literal, então corrigir a origem em Configurações não tem efeito nelas.

**Files:**
- Create: `src/hooks/use-default-origin.ts`
- Modify: `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx`
- Modify: `src/app/(admin)/routes/[routeId]/acompanhar/page.tsx`
- Modify: `src/app/(admin)/routes/organize/acompanhar/page.tsx`
- Modify: `src/app/(admin)/routes/new/page.tsx`

**Interfaces:**
- Consumes: `FALLBACK_ORIGIN`, `isValidOrigin` da Task 1.
- Produces: `useDefaultOrigin(): { origin: PlaceValue; loading: boolean }` — sempre devolve uma origem utilizável.

- [ ] **Step 1: Criar o hook**

Create `src/hooks/use-default-origin.ts`:

```ts
'use client';

import * as React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { FALLBACK_ORIGIN, isValidOrigin } from '@/lib/default-origin';
import type { PlaceValue } from '@/lib/types';

/**
 * Origem padrão do sistema, lida de settings/defaultOrigin.
 *
 * Cai em FALLBACK_ORIGIN quando o documento não existe, está sem coordenadas
 * válidas, ou a leitura falha. Nunca devolve null — quem chama sempre tem uma
 * origem utilizável e não precisa repetir o fallback.
 */
export function useDefaultOrigin(): { origin: PlaceValue; loading: boolean } {
  const [origin, setOrigin] = React.useState<PlaceValue>(FALLBACK_ORIGIN);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'defaultOrigin'));
        const salva = snap.exists() ? (snap.data()?.origin as PlaceValue | undefined) : undefined;
        if (ativo && isValidOrigin(salva)) setOrigin(salva!);
      } catch (erro) {
        console.warn('[useDefaultOrigin] falha ao ler settings/defaultOrigin, usando fallback:', erro);
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, []);

  return { origin, loading };
}
```

- [ ] **Step 2: Ligar o hook nas quatro telas**

Em cada arquivo, dentro do componente, adicionar:

```ts
const { origin: origemPadrao } = useDefaultOrigin();
```

e trocar cada uso de `defaultOrigin` / `FALLBACK_ORIGIN` por `origemPadrao`. Nos efeitos que dependem dele, incluir `origemPadrao` no array de dependências para que a origem correta reaplique quando a leitura do Firestore terminar.

- [ ] **Step 3: Verificar manualmente com o servidor de dev**

```bash
npm run dev
```

Abrir `http://localhost:2000/settings`, conferir que as coordenadas exibidas são `-16.712330, -49.251140`. Abrir uma rota em `/routes/organize` e conferir no console do navegador que o log `🏢 [loadServiceData] Origem selecionada` mostra `lat: -16.7123299`.

- [ ] **Step 4: Typecheck dos arquivos tocados**

```bash
npm run typecheck 2>&1 | grep -E "use-default-origin|acompanhar|routes/new"
```

Esperado: nenhuma saída.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-default-origin.ts src/app
git commit -m "$(cat <<'EOF'
fix(origem): telas de cliente leem settings/defaultOrigin

As cinco telas caiam direto no literal e ignoravam o documento do Firestore,
entao corrigir a origem em Configuracoes nao tinha efeito nelas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Parser de link do Google Maps

**Files:**
- Create: `src/lib/maps-link.ts`
- Create: `scripts/verify-maps-link.ts`

**Interfaces:**
- Produces: `extractCoordsFromMapsUrl(url: string): { lat: number; lng: number } | null`, `isShortMapsLink(url: string): boolean` — consumidos pelas Tasks 4 e 5.

- [ ] **Step 1: Escrever a verificação que falha**

Create `scripts/verify-maps-link.ts`:

```ts
/**
 * Verificação do parser de links do Google Maps.
 * Uso: npx tsx scripts/verify-maps-link.ts
 */
import { extractCoordsFromMapsUrl, isShortMapsLink } from '../src/lib/maps-link';

const ALVO = { lat: -16.7123299, lng: -49.2511399 };

const casos: Array<{ nome: string; url: string; esperado: { lat: number; lng: number } | null }> = [
  {
    nome: 'link longo de place — prioriza !3d/!4d (coordenada do local) sobre @ (centro do mapa)',
    url: 'https://www.google.com/maps/place/Sol+de+Maria+Brasil/@-16.6,-49.1,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-16.7123299!4d-49.2511399!16s%2Fg%2F11f272jyj8',
    esperado: ALVO,
  },
  {
    nome: 'link longo só com @lat,lng',
    url: 'https://www.google.com/maps/@-16.7123299,-49.2511399,17z',
    esperado: ALVO,
  },
  {
    nome: 'formato ?q=lat,lng',
    url: 'https://www.google.com/maps?q=-16.7123299,-49.2511399',
    esperado: ALVO,
  },
  {
    nome: 'formato ?ll=lat,lng',
    url: 'https://maps.google.com/?ll=-16.7123299,-49.2511399&z=17',
    esperado: ALVO,
  },
  { nome: 'link curto não tem coordenada', url: 'https://maps.app.goo.gl/GJJVfxQyjJYt3jk47', esperado: null },
  { nome: 'texto que não é URL', url: 'Avenida Circular, 1028', esperado: null },
  { nome: 'string vazia', url: '', esperado: null },
  {
    nome: 'coordenada fora de faixa é rejeitada',
    url: 'https://www.google.com/maps/@-916.7,-49.25,17z',
    esperado: null,
  },
];

let falhas = 0;
for (const c of casos) {
  const obtido = extractCoordsFromMapsUrl(c.url);
  const ok =
    c.esperado === null
      ? obtido === null
      : obtido !== null &&
        Math.abs(obtido.lat - c.esperado.lat) < 1e-6 &&
        Math.abs(obtido.lng - c.esperado.lng) < 1e-6;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${c.nome} -> ${JSON.stringify(obtido)}`);
  if (!ok) falhas++;
}

const curtos = [
  { url: 'https://maps.app.goo.gl/GJJVfxQyjJYt3jk47', esperado: true },
  { url: 'https://goo.gl/maps/abc123', esperado: true },
  { url: 'https://www.google.com/maps/place/x/@-16.7,-49.2,17z', esperado: false },
];
for (const c of curtos) {
  const obtido = isShortMapsLink(c.url);
  const ok = obtido === c.esperado;
  console.log(`${ok ? 'ok  ' : 'FALHA'} isShortMapsLink(${c.url}) -> ${obtido}`);
  if (!ok) falhas++;
}

if (falhas > 0) { console.error(`\n${falhas} falha(s).`); process.exit(1); }
console.log('\nParser de link ok.');
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx tsx scripts/verify-maps-link.ts
```

Esperado: falha com `Cannot find module '../src/lib/maps-link'`.

- [ ] **Step 3: Implementar o parser**

Create `src/lib/maps-link.ts`:

```ts
/**
 * Extração de coordenadas de URLs do Google Maps.
 *
 * Ordem de preferência importa: `!3d<lat>!4d<lng>` é a coordenada do local em si,
 * enquanto `@<lat>,<lng>` é apenas o centro da câmera do mapa. Nos links de place
 * elas costumam coincidir, mas quando divergem a do local é a correta.
 *
 * Links curtos (maps.app.goo.gl) não carregam coordenada nenhuma — precisam ser
 * expandidos antes, o que exige servidor. Use isShortMapsLink para detectá-los.
 */

const PADROES: RegExp[] = [
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,        // coordenada do local
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,             // centro do mapa
  /[?&](?:q|ll|center|daddr)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, // parâmetros de query
];

export function extractCoordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  if (!url || typeof url !== 'string') return null;

  for (const padrao of PADROES) {
    const m = url.match(padrao);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lat === 0 && lng === 0) continue;
    return { lat, lng };
  }
  return null;
}

/** Links encurtados do Maps não contêm coordenadas — só o destino do redirect tem. */
export function isShortMapsLink(url: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(url.trim());
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npx tsx scripts/verify-maps-link.ts
```

Esperado: todos os casos `ok`, `Parser de link ok.`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/maps-link.ts scripts/verify-maps-link.ts
git commit -m "$(cat <<'EOF'
feat(origem): parser de coordenadas de link do Google Maps

Prioriza !3d/!4d (coordenada do local) sobre @lat,lng (centro do mapa),
e reconhece link curto para que a camada de cima saiba que precisa expandir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: API de expansão de link curto

`maps.app.goo.gl` não devolve cabeçalho CORS, então o navegador não consegue seguir o redirect. Precisa de servidor.

**Files:**
- Create: `src/app/api/resolve-maps-link/route.ts`

**Interfaces:**
- Consumes: `extractCoordsFromMapsUrl`, `isShortMapsLink` da Task 3.
- Produces: `POST /api/resolve-maps-link` com corpo `{ url: string }` → `200 { lat, lng, expandedUrl }` ou `400 { error: string }`.

- [ ] **Step 1: Implementar a rota**

Create `src/app/api/resolve-maps-link/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { extractCoordsFromMapsUrl, isShortMapsLink } from '@/lib/maps-link';

/** Só seguimos redirect para domínios do próprio Google — evita usar a rota como proxy aberto. */
const DOMINIOS_PERMITIDOS = /^https?:\/\/([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl)\//i;

export async function POST(req: NextRequest) {
  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Informe o link do Google Maps.' }, { status: 400 });
  }
  if (!DOMINIOS_PERMITIDOS.test(url.trim())) {
    return NextResponse.json(
      { error: 'Só aceitamos links do Google Maps (google.com/maps ou maps.app.goo.gl).' },
      { status: 400 },
    );
  }

  // Link longo já traz a coordenada: nem precisa de rede.
  const direto = extractCoordsFromMapsUrl(url);
  if (direto) return NextResponse.json({ ...direto, expandedUrl: url });

  if (!isShortMapsLink(url)) {
    return NextResponse.json(
      { error: 'Não encontrei coordenadas neste link. Abra o local no Google Maps e copie o link novamente.' },
      { status: 400 },
    );
  }

  try {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 8000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controle.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RotaExata/1.0)' },
    });
    clearTimeout(limite);

    const expandida = res.url;
    const coords = extractCoordsFromMapsUrl(expandida);
    if (!coords) {
      return NextResponse.json(
        { error: 'O link abriu, mas não encontrei coordenadas nele. Copie o link direto do local no Google Maps.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ...coords, expandedUrl: expandida });
  } catch (erro) {
    const abortado = erro instanceof Error && erro.name === 'AbortError';
    console.error('[resolve-maps-link] falha ao expandir:', erro);
    return NextResponse.json(
      { error: abortado ? 'O Google demorou demais para responder. Tente de novo.' : 'Não consegui abrir o link.' },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 2: Verificar contra o link real**

Com `npm run dev` rodando:

```bash
curl -s -X POST http://localhost:2000/api/resolve-maps-link -H 'Content-Type: application/json' -d '{"url":"https://maps.app.goo.gl/GJJVfxQyjJYt3jk47"}'
```

Esperado: `{"lat":-16.7123299,"lng":-49.2511399,"expandedUrl":"https://www.google.com/maps/place/Sol+de+Maria+Brasil/..."}`

E que um domínio de fora seja recusado:

```bash
curl -s -X POST http://localhost:2000/api/resolve-maps-link -H 'Content-Type: application/json' -d '{"url":"https://exemplo.com/x"}'
```

Esperado: `{"error":"Só aceitamos links do Google Maps (google.com/maps ou maps.app.goo.gl)."}`

- [ ] **Step 3: Typecheck do arquivo tocado**

```bash
npm run typecheck 2>&1 | grep resolve-maps-link
```

Esperado: nenhuma saída.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/resolve-maps-link
git commit -m "$(cat <<'EOF'
feat(origem): rota que expande link curto do Google Maps

maps.app.goo.gl nao manda CORS, entao o redirect precisa ser seguido no servidor.
Restrito a dominios do Google para nao virar proxy aberto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Campo de link na tela de Configurações

**Files:**
- Modify: `src/app/(admin)/settings/page.tsx:140-165`
- Modify: `src/app/(admin)/routes/new/page.tsx:403-426` (`handleOriginLinkChange` passa a usar a rota nova)

**Interfaces:**
- Consumes: `POST /api/resolve-maps-link` da Task 4, `isValidOrigin` da Task 1.

- [ ] **Step 1: Adicionar estado e handler em `settings/page.tsx`**

Dentro do componente, junto dos outros `useState`:

```ts
const [originLink, setOriginLink] = React.useState('');
const [isResolvingLink, setIsResolvingLink] = React.useState(false);

/**
 * Resolve um link do Google Maps para uma origem completa.
 * Falha sempre com mensagem — o comportamento antigo abortava em silêncio
 * quando o link não batia com o regex, e o usuário não fazia ideia do porquê.
 */
const handleResolveOriginLink = async () => {
  if (!originLink.trim()) return;
  setIsResolvingLink(true);
  try {
    const res = await fetch('/api/resolve-maps-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: originLink.trim() }),
    });
    const dados = await res.json();
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Link não reconhecido', description: dados.error });
      return;
    }

    // O SDK do Maps é carregado pelo AutocompleteInput desta mesma tela. Se o
    // usuário colar o link antes de o loader terminar, window.google ainda não existe.
    if (typeof window === 'undefined' || !window.google?.maps) {
      toast({ variant: 'destructive', title: 'Mapa ainda carregando', description: 'Aguarde um instante e clique de novo.' });
      return;
    }

    const geocoder = new google.maps.Geocoder();
    const { results } = await geocoder.geocode({ location: { lat: dados.lat, lng: dados.lng } });
    const encontrado = results?.[0];
    if (!encontrado) {
      toast({ variant: 'destructive', title: 'Endereço não encontrado', description: 'O link tem coordenadas, mas não consegui achar o endereço delas.' });
      return;
    }

    setDefaultOrigin({
      id: encontrado.place_id,
      placeId: encontrado.place_id,
      address: encontrado.formatted_address,
      lat: dados.lat,
      lng: dados.lng,
      customerName: defaultOrigin?.customerName ?? '',
      phone: defaultOrigin?.phone ?? '',
    });
    toast({ title: 'Origem preenchida pelo link', description: `${encontrado.formatted_address}. Confira e clique em Salvar.` });
  } catch (erro) {
    console.error('[settings] falha ao resolver link:', erro);
    toast({ variant: 'destructive', title: 'Falha ao ler o link', description: 'Tente novamente em instantes.' });
  } finally {
    setIsResolvingLink(false);
  }
};
```

- [ ] **Step 2: Adicionar o campo no JSX**

Logo abaixo do bloco do `AutocompleteInput` (após a linha 147), antes do preview de coordenadas:

```tsx
<div className="space-y-2">
  <Label htmlFor="origin-link">Ou cole o link do Google Maps</Label>
  <div className="flex gap-2">
    <Input
      id="origin-link"
      value={originLink}
      onChange={(e) => setOriginLink(e.target.value)}
      placeholder="https://maps.app.goo.gl/..."
    />
    <Button
      type="button"
      variant="secondary"
      onClick={handleResolveOriginLink}
      disabled={isResolvingLink || !originLink.trim()}
    >
      {isResolvingLink ? 'Lendo...' : 'Usar link'}
    </Button>
  </div>
  <p className="text-xs text-muted-foreground">
    Aceita o link curto que o app do Google Maps gera ao compartilhar.
  </p>
</div>
```

- [ ] **Step 3: Fazer `routes/new` usar a mesma rota**

Em `src/app/(admin)/routes/new/page.tsx`, substituir o corpo de `handleOriginLinkChange` (linhas 403-426). Trocar o regex local por uma chamada à rota, mantendo a mesma assinatura e o mesmo `setTempOrigin`:

```ts
const handleOriginLinkChange = async (url: string) => {
  setNewOriginLink(url);
  if (!url.trim()) return;

  const res = await fetch('/api/resolve-maps-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  });
  const dados = await res.json();
  if (!res.ok) {
    toast({ variant: 'destructive', title: 'Link não reconhecido', description: dados.error });
    return;
  }

  toast({ title: 'Analisando link...', description: 'Buscando endereço a partir das coordenadas.' });
  const place = await reverseGeocode(dados.lat, dados.lng);
  if (!place) {
    toast({ variant: 'destructive', title: 'Falha na busca', description: 'Não foi possível encontrar o endereço para este link.' });
    return;
  }
  setTempOrigin({
    id: `geocoded-${place.place_id}-${Date.now()}`,
    address: place.formatted_address,
    placeId: place.place_id,
    lat: dados.lat,
    lng: dados.lng,
  });
  toast({ title: 'Endereço preenchido!', description: 'O campo de endereço foi preenchido automaticamente.' });
};
```

- [ ] **Step 4: Verificar na interface**

Com `npm run dev`, abrir `http://localhost:2000/settings`, colar `https://maps.app.goo.gl/GJJVfxQyjJYt3jk47` no campo novo e clicar em "Usar link". Esperado: toast de sucesso e o preview mostrando `Coordenadas: -16.712330, -49.251140`. Colar um texto qualquer e conferir que aparece toast de erro — não silêncio.

- [ ] **Step 5: Typecheck e commit**

```bash
npm run typecheck 2>&1 | grep -E "settings/page|routes/new"
git add src/app
git commit -m "$(cat <<'EOF'
feat(origem): aceitar link do Google Maps no cadastro da origem

Settings ganha campo de link, e routes/new passa a expandir link curto em vez
de abortar em silencio quando o regex nao batia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Corrigir os dados em produção

**Files:**
- Create: `scripts/fix-origin-coordinates.ts`

**Interfaces:**
- Consumes: `FALLBACK_ORIGIN` da Task 1.

- [ ] **Step 1: Escrever o script**

Create `scripts/fix-origin-coordinates.ts`:

```ts
/**
 * Corrige a origem errada gravada em produção.
 *
 * 1. Reescreve settings/defaultOrigin com a origem verificada.
 * 2. Faz backfill de serviços e rotas AINDA NÃO CONCLUÍDOS.
 *
 * Documentos concluídos ficam intactos de propósito: o histórico registra a rota
 * como ela foi de fato executada, e relatórios e pagamentos passados foram
 * calculados em cima daquela origem.
 *
 * Uso:
 *   npx tsx scripts/fix-origin-coordinates.ts            # simulação (padrão)
 *   npx tsx scripts/fix-origin-coordinates.ts --apply    # grava
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { FALLBACK_ORIGIN } from '../src/lib/default-origin';

dotenv.config({ path: '.env.local' });

const APLICAR = process.argv.includes('--apply');
const COORD_ERRADA = { lat: -16.6786, lng: -49.2552 };
const STATUS_CONCLUIDO_SERVICO = ['completed'];
const STATUS_CONCLUIDO_ROTA = ['completed', 'completed_auto'];

if (getApps().length === 0) {
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: privateKey } = process.env;
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Credenciais do Firebase não encontradas no .env.local');
    process.exit(1);
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }), projectId });
}
const db = getFirestore();

const temCoordErrada = (o: any) =>
  o && Math.abs(o.lat - COORD_ERRADA.lat) < 1e-4 && Math.abs(o.lng - COORD_ERRADA.lng) < 1e-4;

async function main() {
  console.log(APLICAR ? 'MODO GRAVAÇÃO\n' : 'MODO SIMULAÇÃO — nada será gravado. Use --apply para valer.\n');

  const settingsRef = db.collection('settings').doc('defaultOrigin');
  const atual = (await settingsRef.get()).data()?.origin;
  console.log(`settings/defaultOrigin: lat=${atual?.lat} lng=${atual?.lng}`);
  if (APLICAR) {
    await settingsRef.set({ origin: FALLBACK_ORIGIN, updatedAt: new Date() });
    console.log(`  -> reescrito para lat=${FALLBACK_ORIGIN.lat} lng=${FALLBACK_ORIGIN.lng}\n`);
  } else {
    console.log(`  -> seria reescrito para lat=${FALLBACK_ORIGIN.lat} lng=${FALLBACK_ORIGIN.lng}\n`);
  }

  for (const [colecao, statusConcluido] of [
    ['services', STATUS_CONCLUIDO_SERVICO],
    ['routes', STATUS_CONCLUIDO_ROTA],
  ] as const) {
    const snap = await db.collection(colecao).get();
    let alvos = 0, preservados = 0, jaOk = 0;
    let lote = db.batch(); let noLote = 0;

    for (const docu of snap.docs) {
      const dados = docu.data();
      if (!temCoordErrada(dados.origin)) { jaOk++; continue; }
      if (statusConcluido.includes(dados.status)) { preservados++; continue; }
      alvos++;
      if (APLICAR) {
        lote.update(docu.ref, { origin: { ...dados.origin, ...FALLBACK_ORIGIN }, originFixedAt: new Date() });
        if (++noLote >= 400) { await lote.commit(); lote = db.batch(); noLote = 0; }
      }
    }
    if (APLICAR && noLote > 0) await lote.commit();

    console.log(`${colecao}: ${snap.size} no total`);
    console.log(`  ${APLICAR ? 'corrigidos' : 'a corrigir'}: ${alvos}`);
    console.log(`  preservados por já estarem concluídos: ${preservados}`);
    console.log(`  já com origem correta: ${jaOk}\n`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar em simulação e conferir os números**

```bash
npx tsx scripts/fix-origin-coordinates.ts
```

Esperado: relatório mostrando quantos serviços e rotas seriam corrigidos e quantos seriam preservados por já estarem concluídos. Nenhuma escrita. **Conferir os números com o usuário antes do passo seguinte.**

- [ ] **Step 3: Aplicar**

```bash
npx tsx scripts/fix-origin-coordinates.ts --apply
```

- [ ] **Step 4: Verificar o resultado**

```bash
npx tsx scripts/fix-origin-coordinates.ts
```

Esperado: `a corrigir: 0` nas duas coleções — só sobram os preservados por conclusão.

- [ ] **Step 5: Commit**

```bash
git add scripts/fix-origin-coordinates.ts
git commit -m "$(cat <<'EOF'
fix(origem): script que corrige a origem gravada em producao

Reescreve settings/defaultOrigin e faz backfill de servicos e rotas nao
concluidos. Documentos concluidos ficam intactos para nao reescrever historico.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Limpar as cópias restantes em `scripts/` e na documentação

Sobram 5 scripts e um guia com o literal errado. Quatro desses scripts se chamam `fix-*origins*` e foram tentativas anteriores de corrigir este mesmo bug usando a constante errada — deixá-los como estão é deixar armadilhas carregadas.

**Files:**
- Modify: `scripts/setup-default-origin.ts:44-52`
- Modify: `scripts/check-route-origins.ts:34-42`
- Modify: `scripts/fix-service-origin.ts:42-50`
- Modify: `scripts/fix-lunna-service-origins.ts:44-52`
- Modify: `scripts/fix-lunna-route-origins.ts:44-52`
- Modify: `LUNA_INTEGRATION_GUIDE.md:8-16`

- [ ] **Step 1: Trocar os literais pelo import**

Em cada um dos cinco scripts, apagar o bloco `const DEFAULT_ORIGIN = { ... }` e no lugar colocar:

```ts
import { FALLBACK_ORIGIN } from '../src/lib/default-origin';

const DEFAULT_ORIGIN = FALLBACK_ORIGIN;
```

- [ ] **Step 2: Corrigir o guia de integração**

Em `LUNA_INTEGRATION_GUIDE.md`, atualizar o bloco de exemplo da origem para as coordenadas corretas (`lat: -16.7123299`, `lng: -49.2511399`, `placeId: 'ChIJ1V3toTXyXpMR-1qQO17BY8c'`) e acrescentar abaixo dele:

```markdown
> A origem real do sistema vive em `settings/defaultOrigin` no Firestore e é
> definida pela tela de Configurações. O bloco acima é só ilustrativo — não copie
> estes valores para código.
```

- [ ] **Step 3: Confirmar que não sobrou nenhuma cópia no repositório**

```bash
grep -rn -- "-16\.6786\|ChIJFT_4_9XFUpQRy_14vCVa2po" . --include='*.ts' --include='*.tsx' --include='*.md' | grep -v node_modules
```

Esperado: nenhuma saída. (A única menção tolerada é dentro de `scripts/fix-origin-coordinates.ts`, na constante `COORD_ERRADA`, que precisa do valor antigo para localizar os documentos — se ela aparecer, está certo.)

- [ ] **Step 4: Commit**

```bash
git add scripts LUNA_INTEGRATION_GUIDE.md
git commit -m "$(cat <<'EOF'
chore(origem): scripts e guia passam a usar a constante compartilhada

Quatro desses scripts eram tentativas anteriores de corrigir a origem usando
a mesma constante errada, e por isso gravavam o valor errado nos dados.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificação final

- [ ] `npx tsx scripts/verify-default-origin.ts` passa
- [ ] `npx tsx scripts/verify-maps-link.ts` passa
- [ ] `grep -rn -- "-16\.6786" src/ scripts/ --include='*.ts' --include='*.tsx'` só encontra `COORD_ERRADA` em `fix-origin-coordinates.ts`
- [ ] `npm run typecheck` não reporta erro em nenhum arquivo tocado (o baseline de ~89 erros em outros arquivos permanece)
- [ ] `npm run build` conclui
- [ ] Com `npm run dev`: Settings mostra `-16.712330, -49.251140`; colar o link curto preenche a origem; um serviço novo do Luna nasce com a origem correta
