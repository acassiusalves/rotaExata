# Validação da geocodificação Luna → RotaExata — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endereço errado nunca chega ao motorista sem aviso, e as telas mostram o endereço como foi cadastrado — não o texto que o Google devolveu.

**Architecture:** Um módulo novo em `luna` (`address-resolver.ts`) concentra a única chamada ao Google Geocoding do sistema, confere a resposta contra a base dos Correios (ViaCEP) e devolve um veredito. `/api/geocode` passa a receber endereço estruturado e delegar para ele. `buildStop()` grava os campos do cadastro no ponto e propaga o veredito. O RotaExata só ganha os tipos novos e um aviso no popup — o resto das telas passa a mostrar o endereço certo sozinho.

**Tech Stack:** TypeScript, Next.js App Router, Vitest (já configurado em `luna/vitest.config.ts`), Firestore, Google Geocoding API, ViaCEP.

**Spec:** `docs/superpowers/specs/2026-08-05-validacao-geocodificacao-design.md`

## Global Constraints

- **Repositórios:** Tasks 1–5 são em `/Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao` (worktree do `luna`, branch `fix/validacao-geocodificacao`, criada a partir de `main`). Task 6 é em `/Users/acassiusalves/rotaExata-1/.claude/worktrees/github-alignment-check-dc1542` (branch `claude/github-alignment-check-dc1542`).
- **Ambiente:** os dois worktrees já estão prontos — branch criada, `node_modules` e `.env.local` no lugar. Baseline do `luna` verificado antes de começar: 47 arquivos, 682 testes, todos passando. Não criar branch nem rodar `npm install`.
- **Testes:** `npm test` (`vitest run`) na raiz do `luna`. Testes ficam em `src/lib/__tests__/`, seguindo o padrão do repositório. Nenhum teste pode tocar a rede — `fetch` sempre mockado com `vi.stubGlobal`.
- **Comentários e mensagens de commit em português.** Mensagens de erro voltadas ao operador também.
- **ViaCEP é estritamente opcional.** Indisponível, lento ou CEP desconhecido nunca marca um ponto nem derruba o envio.
- **Coordenadas do Google são mantidas mesmo quando o veredito é suspeito.** O aviso é consultivo, não bloqueia.
- Todo commit termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `luna/src/lib/address-resolver.ts` *(criar)* | Tipos, normalização, ViaCEP, chamada ao Google, regras de validação, orquestração. Única chamada ao Google no sistema. |
| `luna/src/lib/__tests__/address-resolver.test.ts` *(criar)* | Cobertura de `normalizeText`, `lookupCep`, `validate`, `resolveAddress`. |
| `luna/src/app/api/geocode/route.ts` *(modificar)* | Autenticação + delegação. Perde a lógica do Google. |
| `luna/src/lib/rota-exata-integration.ts` *(modificar)* | `buildStop` grava os campos novos; 4 call sites passam a usar o resolver; 126 linhas de código duplicado do Google saem. |
| `luna/src/lib/__tests__/rota-exata-buildstop.test.ts` *(criar)* | Formato do ponto gravado. |
| `rotaExata/src/lib/types.ts` *(modificar)* | `geocodedAddress` e `addressSeverity` no `PlaceValue`. |
| `rotaExata/src/components/maps/RouteMap.tsx` *(modificar)* | Aviso no popup quando o ponto está marcado. |

---

## Task 1: Módulo address-resolver — tipos, normalização e ViaCEP

**Files:**
- Create: `luna/src/lib/address-resolver.ts`
- Test: `luna/src/lib/__tests__/address-resolver.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `CadastroAddress`, `CepReference`, `GeocodeCandidate`, `Verdict`, `GeocodeReason`, `digitsOnly(v: string): string`, `normalizeText(s: string): string`, `lookupCep(cep: string): Promise<CepReference | null>`, `__clearCepCache(): void`.

- [ ] **Step 1: Conferir o ponto de partida**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && git branch --show-current && git status --short
```

Esperado: `fix/validacao-geocodificacao`, e nenhuma saída de `git status` além do symlink `node_modules` e do `.env.local` (ambos ignorados). A branch já existe — não criar.

- [ ] **Step 2: Escrever o teste que falha**

Criar `luna/src/lib/__tests__/address-resolver.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  digitsOnly,
  normalizeText,
  lookupCep,
  __clearCepCache,
} from '@/lib/address-resolver';

afterEach(() => {
  vi.unstubAllGlobals();
  __clearCepCache();
});

describe('digitsOnly', () => {
  it('remove máscara do CEP', () => {
    expect(digitsOnly('74684-688')).toBe('74684688');
  });

  it('devolve string vazia para entrada nula', () => {
    expect(digitsOnly(undefined as unknown as string)).toBe('');
  });
});

describe('normalizeText', () => {
  it('equipara a abreviação do Google ao nome dos Correios', () => {
    expect(normalizeText('St. Sul')).toBe(normalizeText('Setor Sul'));
  });

  it('equipara Residencial abreviado', () => {
    expect(normalizeText('Res. Alice Barbosa')).toBe(normalizeText('Residencial Alice Barbosa'));
  });

  it('ignora acentuação', () => {
    expect(normalizeText('Goiânia')).toBe(normalizeText('Goiania'));
  });

  it('não achata bairros diferentes', () => {
    expect(normalizeText('Setor Urias Magalhães'))
      .not.toBe(normalizeText('Residencial Elizene Santana'));
  });
});

describe('lookupCep', () => {
  const RESPOSTA_OK = {
    cep: '74684-688',
    logradouro: 'Rua ES14',
    bairro: 'Residencial Elizene Santana',
    localidade: 'Goiânia',
    uf: 'GO',
  };

  it('devolve a referência dos Correios', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => RESPOSTA_OK,
    }));

    await expect(lookupCep('74684-688')).resolves.toEqual({
      cep: '74684688',
      logradouro: 'Rua ES14',
      bairro: 'Residencial Elizene Santana',
      localidade: 'Goiânia',
      uf: 'GO',
    });
  });

  it('devolve null quando o ViaCEP responde erro (string "true")', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ erro: 'true' }),
    }));

    await expect(lookupCep('75250000')).resolves.toBeNull();
  });

  it('devolve null sem chamar a rede quando o CEP não tem 8 dígitos', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    await expect(lookupCep('7468')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('devolve null quando a rede falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    await expect(lookupCep('74684688')).resolves.toBeNull();
  });

  it('consulta o mesmo CEP uma única vez', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => RESPOSTA_OK });
    vi.stubGlobal('fetch', spy);

    await lookupCep('74684688');
    await lookupCep('74684-688');

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test -- src/lib/__tests__/address-resolver.test.ts
```

Esperado: FAIL — `Failed to resolve import "@/lib/address-resolver"`.

- [ ] **Step 4: Escrever o módulo**

Criar `luna/src/lib/address-resolver.ts`:

```ts
// src/lib/address-resolver.ts
//
// Resolve o endereço cadastrado de um cliente em coordenadas, conferindo a
// resposta do Google contra a base dos Correios (ViaCEP) antes de confiar nela.
//
// Este é o ÚNICO lugar do sistema que chama a Google Geocoding API.

// ============================================
// TIPOS
// ============================================

export type CadastroAddress = {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
};

/** Referência oficial dos Correios. `logradouro` e `bairro` vêm vazios em CEP único. */
export type CepReference = {
  cep: string; // 8 dígitos, sem máscara
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
};

export type GeocodeCandidate = {
  formattedAddress: string;
  placeId: string;
  lat: number;
  lng: number;
  partialMatch: boolean;
  types: string[];
  cep: string;
  bairro: string;
  cidade: string;
};

export type Verdict = {
  trusted: boolean;
  severity: 'grave' | 'conferir' | null;
  issues: string[];
};

export type GeocodeReason =
  | 'ok'
  | 'no_api_key'
  | 'zero_results'
  | 'over_quota'
  | 'denied'
  | 'invalid_request'
  | 'http_error'
  | 'network_error';

export const GEOCODE_REASON_MESSAGE: Record<GeocodeReason, string> = {
  ok: 'OK',
  no_api_key: 'API Key do Google Maps não configurada',
  zero_results: 'Endereço não encontrado pela API de geocoding',
  over_quota: 'Cota da API de geocoding excedida — tente novamente em alguns minutos',
  denied: 'Acesso à API de geocoding negado (verificar restrições da chave)',
  invalid_request: 'Endereço inválido para geocoding',
  http_error: 'Falha de comunicação com o serviço de geocoding',
  network_error: 'Falha de rede ao acessar o serviço de geocoding',
};

// ============================================
// NORMALIZAÇÃO
// ============================================

/**
 * Prefixos de tipo de logradouro e de bairro. O Google abrevia ("St. Sul",
 * "Res. Alice Barbosa") e os Correios escrevem por extenso ("Setor Sul").
 * Remover os dois lados evita divergência falsa.
 */
const PREFIXOS = /\b(setor|st|residencial|res|jardim|jd|parque|pq|vila|vl|conjunto|cj|loteamento|lot)\b/g;

export function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function normalizeText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(PREFIXOS, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// VIACEP
// ============================================

const VIACEP_TIMEOUT_MS = 4000;

/** Cache por CEP com escopo de processo. Uma instância serverless reaproveita. */
const cepCache = new Map<string, CepReference | null>();

/** Exposto só para os testes — zera o cache entre casos. */
export function __clearCepCache(): void {
  cepCache.clear();
}

/**
 * Busca a referência oficial do CEP. Nunca lança: qualquer falha vira `null`,
 * e `null` significa "sem gabarito", não "endereço inválido".
 */
export async function lookupCep(cep: string): Promise<CepReference | null> {
  const limpo = digitsOnly(cep);
  if (limpo.length !== 8) return null;
  if (cepCache.has(limpo)) return cepCache.get(limpo) ?? null;

  let referencia: CepReference | null = null;

  try {
    const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`, {
      signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
    });

    if (resp.ok) {
      const data = await resp.json();
      // CEP inexistente devolve { "erro": "true" } — string, não booleano.
      if (!data?.erro && data?.localidade) {
        referencia = {
          cep: digitsOnly(data.cep),
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          localidade: data.localidade || '',
          uf: data.uf || '',
        };
      }
    }
  } catch {
    referencia = null;
  }

  cepCache.set(limpo, referencia);
  return referencia;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test -- src/lib/__tests__/address-resolver.test.ts
```

Esperado: PASS, 10 testes.

- [ ] **Step 6: Commit**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao
git add src/lib/address-resolver.ts src/lib/__tests__/address-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(geocode): módulo address-resolver com consulta ao ViaCEP

Primeiro pedaço do resolver de endereços: tipos, normalização de texto
para comparar o que o Google abrevia com o que os Correios escrevem por
extenso, e a consulta ao ViaCEP.

O ViaCEP nunca lança e nunca bloqueia: falha de rede, timeout de 4s ou
CEP inexistente viram null, que significa "sem gabarito" — não
"endereço inválido".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Regras de validação

**Files:**
- Modify: `luna/src/lib/address-resolver.ts` (acrescentar ao final)
- Test: `luna/src/lib/__tests__/address-resolver.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `GeocodeCandidate`, `CepReference`, `Verdict`, `normalizeText`, `digitsOnly` da Task 1.
- Produces: `validate(candidate: GeocodeCandidate, ref: CepReference | null): Verdict`.

As fixtures abaixo são dados **reais**, capturados da produção durante a análise do P3460. Não substituir por valores inventados.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `luna/src/lib/__tests__/address-resolver.test.ts`:

```ts
import { validate } from '@/lib/address-resolver';
import type { GeocodeCandidate, CepReference } from '@/lib/address-resolver';

// --- Fixtures reais, capturadas da produção ---

/** P3460 — o caso âncora. Google casou "ES14" com "Espírito Santo". */
const P3460_GOOGLE: GeocodeCandidate = {
  formattedAddress:
    'R. Espírito Santo, 06 - Q.10 LT.11 - St. Urias Magalhães, Goiânia - GO, 74565-270, Brazil',
  placeId: 'ChIJI_-9D9fzXpMRcRs-jZwRpFE',
  lat: -16.6510533,
  lng: -49.2718514,
  partialMatch: true,
  types: ['establishment', 'point_of_interest'],
  cep: '74565-270',
  bairro: 'Setor Urias Magalhães',
  cidade: 'Goiânia',
};
const P3460_REF: CepReference = {
  cep: '74684688',
  logradouro: 'Rua ES14',
  bairro: 'Residencial Elizene Santana',
  localidade: 'Goiânia',
  uf: 'GO',
};

/** P3370 — entrega de Goiânia apontada para Catalão, 216 km. */
const P3370_GOOGLE: GeocodeCandidate = {
  formattedAddress: 'Praça Dom Emanuel - St. Central, Catalão - GO, 75701-030, Brazil',
  placeId: 'ChIJ-p3370-catalao',
  lat: -18.1712,
  lng: -47.9463,
  partialMatch: true,
  types: ['route'],
  cep: '75701-030',
  bairro: 'Setor Central',
  cidade: 'Catalão',
};
const P3370_REF: CepReference = {
  cep: '74030140',
  logradouro: 'Praça Dom Emanuel',
  bairro: 'Setor Central',
  localidade: 'Goiânia',
  uf: 'GO',
};

/** P3404 — perdeu o nível de rua; CEP único, ViaCEP devolve erro. */
const P3404_GOOGLE: GeocodeCandidate = {
  formattedAddress: 'Centro, Senador Canedo - State of Goiás, 75250-000, Brazil',
  placeId: 'ChIJ-p3404-centro',
  lat: -16.7052,
  lng: -49.0932,
  partialMatch: true,
  types: ['postal_code'],
  cep: '75250-000',
  bairro: '',
  cidade: 'Senador Canedo',
};

/** Caso bom: CEP diverge por numeração, mas rua e bairro conferem. Não pode marcar. */
const BOM_GOOGLE: GeocodeCandidate = {
  formattedAddress: 'R. 82, 455 - St. Sul, Goiânia - GO, 74015-095, Brazil',
  placeId: 'ChIJ-bom-rua82',
  lat: -16.6799,
  lng: -49.2643,
  partialMatch: false,
  types: ['street_address'],
  cep: '74015-095',
  bairro: 'Setor Sul',
  cidade: 'Goiânia',
};
const BOM_REF: CepReference = {
  cep: '74083010',
  logradouro: 'Rua 82',
  bairro: 'Setor Sul',
  localidade: 'Goiânia',
  uf: 'GO',
};

describe('validate', () => {
  it('marca o P3460 como grave por estabelecimento, região de CEP e bairro', () => {
    const v = validate(P3460_GOOGLE, P3460_REF);

    expect(v.trusted).toBe(false);
    expect(v.severity).toBe('grave');
    expect(v.issues).toHaveLength(3);
    expect(v.issues).toContain(
      'O Google devolveu um estabelecimento, não um endereço residencial'
    );
    expect(v.issues).toContain('O endereço encontrado fica em outra região de CEP');
    expect(v.issues).toContain('Bairro e CEP não conferem com o cadastro');
  });

  it('marca o P3370 por região de CEP e cidade diferentes', () => {
    const v = validate(P3370_GOOGLE, P3370_REF);

    expect(v.severity).toBe('grave');
    expect(v.issues).toContain('O endereço encontrado fica em outra região de CEP');
    expect(v.issues).toContain('O endereço encontrado fica em outra cidade');
    // Bairro é "Setor Central" dos dois lados — R5 não pode disparar.
    expect(v.issues).not.toContain('Bairro e CEP não conferem com o cadastro');
  });

  it('marca o P3404 por não chegar ao nível de rua, mesmo sem referência', () => {
    const v = validate(P3404_GOOGLE, null);

    expect(v.severity).toBe('grave');
    expect(v.issues).toEqual(['A geocodificação não chegou ao nível de rua']);
  });

  it('não marca quando só o CEP diverge, com rua e bairro conferindo', () => {
    const v = validate(BOM_GOOGLE, BOM_REF);

    expect(v.trusted).toBe(true);
    expect(v.severity).toBeNull();
    expect(v.issues).toEqual([]);
  });

  it('não marca estabelecimento casado com confiança total', () => {
    const v = validate(
      { ...BOM_GOOGLE, partialMatch: false, types: ['establishment', 'point_of_interest'] },
      BOM_REF
    );

    expect(v.trusted).toBe(true);
  });

  it('sem referência, só R1 e R2 podem disparar', () => {
    const v = validate(P3460_GOOGLE, null);

    expect(v.issues).toEqual([
      'O Google devolveu um estabelecimento, não um endereço residencial',
    ]);
  });

  it('não dispara R5 quando o ViaCEP não traz bairro (CEP único)', () => {
    const v = validate(
      { ...BOM_GOOGLE, cep: '74999-999', bairro: 'Qualquer Bairro' },
      { ...BOM_REF, bairro: '' }
    );

    expect(v.issues).not.toContain('Bairro e CEP não conferem com o cadastro');
  });

  it('classifica como conferir quando só R5 dispara', () => {
    const v = validate(
      { ...BOM_GOOGLE, cep: '74099-000', bairro: 'Setor Oeste' },
      BOM_REF
    );

    expect(v.trusted).toBe(false);
    expect(v.severity).toBe('conferir');
    expect(v.issues).toEqual(['Bairro e CEP não conferem com o cadastro']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test -- src/lib/__tests__/address-resolver.test.ts
```

Esperado: FAIL — `validate is not a function` (ou erro de import).

- [ ] **Step 3: Implementar `validate`**

Acrescentar ao final de `luna/src/lib/address-resolver.ts`:

```ts
// ============================================
// VALIDAÇÃO
// ============================================

/** Tipos do Google que indicam que o resultado chegou ao nível de rua. */
const TIPOS_COM_RUA = ['street_address', 'premise', 'subpremise', 'route'];

/**
 * Confere o candidato do Google contra a referência dos Correios.
 *
 * Função pura, sem I/O. Regras calibradas contra 200 pontos de produção:
 * capturam 14 de 14 casos críticos conhecidos, sinalizando 14,5% do total.
 *
 * "CEP divergente" puro foi descartado como regra — dispara em 19,5% e a maior
 * parte é numeração diferente da mesma rua, ruído que faria o operador ignorar
 * os avisos.
 */
export function validate(
  candidate: GeocodeCandidate,
  ref: CepReference | null
): Verdict {
  const graves: string[] = [];
  const conferir: string[] = [];

  const ehEstabelecimento =
    candidate.types.includes('establishment') ||
    candidate.types.includes('point_of_interest');
  const temNivelDeRua = candidate.types.some((t) => TIPOS_COM_RUA.includes(t));

  // R1 — o Google admitiu incerteza e devolveu um POI no lugar de um endereço.
  // Um POI SEM partial_match não dispara: normalmente é o cliente que cadastrou
  // um comércio de verdade como ponto de entrega.
  if (candidate.partialMatch && ehEstabelecimento) {
    graves.push('O Google devolveu um estabelecimento, não um endereço residencial');
  }

  // R2 — parou em bairro, CEP ou cidade. O motorista cairia num centroide.
  if (!temNivelDeRua && !ehEstabelecimento) {
    graves.push('A geocodificação não chegou ao nível de rua');
  }

  if (ref) {
    const cepRef = digitsOnly(ref.cep);
    const cepGoogle = digitsOnly(candidate.cep);
    const cepsComparaveis = cepRef.length === 8 && cepGoogle.length === 8;

    // R3 — os 3 primeiros dígitos separam regiões inteiras. 740 é Goiânia, 757 é Catalão.
    if (cepsComparaveis && cepRef.slice(0, 3) !== cepGoogle.slice(0, 3)) {
      graves.push('O endereço encontrado fica em outra região de CEP');
    }

    // R4 — cidade diferente.
    if (
      ref.localidade &&
      candidate.cidade &&
      normalizeText(ref.localidade) !== normalizeText(candidate.cidade)
    ) {
      graves.push('O endereço encontrado fica em outra cidade');
    }

    // R5 — dois sinais fracos juntos. Sozinhos, bairro ou CEP dão falso positivo
    // em vizinhança limítrofe na mesma via.
    const bairroDivergente =
      !!ref.bairro &&
      !!candidate.bairro &&
      normalizeText(ref.bairro) !== normalizeText(candidate.bairro);
    const cepDivergente =
      cepsComparaveis && cepRef.slice(0, 5) !== cepGoogle.slice(0, 5);

    if (bairroDivergente && cepDivergente) {
      conferir.push('Bairro e CEP não conferem com o cadastro');
    }
  }

  const issues = [...graves, ...conferir];

  return {
    trusted: issues.length === 0,
    severity: graves.length > 0 ? 'grave' : conferir.length > 0 ? 'conferir' : null,
    issues,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test -- src/lib/__tests__/address-resolver.test.ts
```

Esperado: PASS, 18 testes.

- [ ] **Step 5: Commit**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao
git add src/lib/address-resolver.ts src/lib/__tests__/address-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(geocode): regras de validação do resultado do Google

Cinco regras, calibradas contra 200 pontos de produção: capturam 14 de
14 casos críticos conhecidos sinalizando 14,5% do total.

As fixtures são dados reais. O P3460 é a âncora — o Google devolveu um
estabelecimento na Rua Espírito Santo para um cadastro na Rua ES14, e
marcou o próprio resultado como partial_match.

"CEP divergente" puro ficou de fora: dispara em 19,5% e quase tudo é
numeração da mesma rua. Ruído que faria o operador ignorar os avisos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Chamada ao Google e orquestração

**Files:**
- Modify: `luna/src/lib/address-resolver.ts` (acrescentar ao final)
- Test: `luna/src/lib/__tests__/address-resolver.test.ts` (acrescentar)

**Interfaces:**
- Consumes: tudo das Tasks 1 e 2.
- Produces: `buildQuery(a: CadastroAddress): string`, `resolveAddress(a: CadastroAddress, apiKey: string): Promise<{ place: GeocodeCandidate | null; verdict: Verdict; reason: GeocodeReason }>`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `luna/src/lib/__tests__/address-resolver.test.ts`:

```ts
import { buildQuery, resolveAddress } from '@/lib/address-resolver';

const CADASTRO_P3460 = {
  rua: 'Rua ES14',
  numero: '',
  bairro: 'Residencial Elizene Santana',
  cidade: 'Goiânia - GO',
  cep: '74684688',
};

/** Resposta real do Google para a query do P3460. */
const GOOGLE_P3460 = {
  status: 'OK',
  results: [
    {
      formatted_address:
        'R. Espírito Santo, 06 - Q.10 LT.11 - St. Urias Magalhães, Goiânia - GO, 74565-270, Brazil',
      place_id: 'ChIJI_-9D9fzXpMRcRs-jZwRpFE',
      partial_match: true,
      types: ['establishment', 'point_of_interest'],
      geometry: { location: { lat: -16.6510533, lng: -49.2718514 } },
      address_components: [
        { long_name: '74565-270', types: ['postal_code'] },
        { long_name: 'Setor Urias Magalhães', types: ['sublocality', 'political'] },
        { long_name: 'Goiânia', types: ['administrative_area_level_2', 'political'] },
      ],
    },
  ],
};

const VIACEP_P3460 = {
  cep: '74684-688',
  logradouro: 'Rua ES14',
  bairro: 'Residencial Elizene Santana',
  localidade: 'Goiânia',
  uf: 'GO',
};

/** Roteia o fetch mockado por host. */
function mockFetch(handlers: { viacep?: unknown; google?: unknown; googleFails?: boolean }) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('viacep')) {
      if (handlers.viacep === undefined) throw new Error('viacep fora do ar');
      return { ok: true, json: async () => handlers.viacep };
    }
    if (handlers.googleFails) throw new Error('google fora do ar');
    return { ok: true, status: 200, json: async () => handlers.google };
  });
}

describe('buildQuery', () => {
  it('monta no formato que o sistema já usava, omitindo campo vazio', () => {
    expect(buildQuery(CADASTRO_P3460)).toBe(
      'Rua ES14, Residencial Elizene Santana, Goiânia - GO, CEP 74684688, Brasil'
    );
  });

  it('inclui o número quando existe', () => {
    expect(buildQuery({ ...CADASTRO_P3460, numero: '455' })).toBe(
      'Rua ES14, 455, Residencial Elizene Santana, Goiânia - GO, CEP 74684688, Brasil'
    );
  });
});

describe('resolveAddress', () => {
  it('devolve o candidato e o veredito suspeito do P3460', async () => {
    vi.stubGlobal('fetch', mockFetch({ viacep: VIACEP_P3460, google: GOOGLE_P3460 }));

    const { place, verdict, reason } = await resolveAddress(CADASTRO_P3460, 'chave-teste');

    expect(reason).toBe('ok');
    expect(place?.placeId).toBe('ChIJI_-9D9fzXpMRcRs-jZwRpFE');
    expect(place?.lat).toBe(-16.6510533);
    expect(place?.cep).toBe('74565-270');
    expect(place?.bairro).toBe('Setor Urias Magalhães');
    expect(place?.cidade).toBe('Goiânia');
    expect(verdict.severity).toBe('grave');
  });

  it('mantém as coordenadas mesmo com veredito suspeito', async () => {
    vi.stubGlobal('fetch', mockFetch({ viacep: VIACEP_P3460, google: GOOGLE_P3460 }));

    const { place } = await resolveAddress(CADASTRO_P3460, 'chave-teste');

    expect(place?.lat).not.toBe(0);
    expect(place?.lng).not.toBe(0);
  });

  it('segue sem o ViaCEP quando ele está fora do ar', async () => {
    vi.stubGlobal('fetch', mockFetch({ google: GOOGLE_P3460 }));

    const { place, verdict } = await resolveAddress(CADASTRO_P3460, 'chave-teste');

    expect(place).not.toBeNull();
    // Sem gabarito, só R1 dispara.
    expect(verdict.issues).toEqual([
      'O Google devolveu um estabelecimento, não um endereço residencial',
    ]);
  });

  it('devolve place nulo e motivo quando o Google não acha nada', async () => {
    vi.stubGlobal('fetch', mockFetch({
      viacep: VIACEP_P3460,
      google: { status: 'ZERO_RESULTS', results: [] },
    }));

    const { place, verdict, reason } = await resolveAddress(CADASTRO_P3460, 'chave-teste');

    expect(place).toBeNull();
    expect(reason).toBe('zero_results');
    expect(verdict.trusted).toBe(false);
    expect(verdict.severity).toBe('grave');
    expect(verdict.issues).toEqual(['Endereço não encontrado pela API de geocoding']);
  });

  it('não chama o Google sem chave', async () => {
    const spy = mockFetch({ viacep: VIACEP_P3460, google: GOOGLE_P3460 });
    vi.stubGlobal('fetch', spy);

    const { place, reason } = await resolveAddress(CADASTRO_P3460, '');

    expect(place).toBeNull();
    expect(reason).toBe('no_api_key');
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('maps.googleapis.com'));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test -- src/lib/__tests__/address-resolver.test.ts
```

Esperado: FAIL — `buildQuery is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar ao final de `luna/src/lib/address-resolver.ts`:

```ts
// ============================================
// GOOGLE GEOCODING
// ============================================

const GEOCODE_MAX_ATTEMPTS = 3;
const GEOCODE_BACKOFF_BASE_MS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Monta a query no mesmo formato que o sistema já usava, para não mudar a taxa
 * de acerto do Google junto com a validação.
 */
export function buildQuery(a: CadastroAddress): string {
  const partes = [
    a.rua,
    a.numero,
    a.bairro,
    a.cidade,
    a.cep ? `CEP ${a.cep}` : '',
  ].filter(Boolean);
  return `${partes.join(', ')}, Brasil`;
}

/** Primeiro componente que casar, na ordem dos tipos pedidos. */
function extractComponent(components: any[], tipos: string[]): string {
  for (const tipo of tipos) {
    const achado = (components || []).find((c: any) => c?.types?.includes(tipo));
    if (achado) return achado.long_name || '';
  }
  return '';
}

async function geocode(
  query: string,
  apiKey: string
): Promise<{ candidate: GeocodeCandidate | null; reason: GeocodeReason }> {
  if (!apiKey) return { candidate: null, reason: 'no_api_key' };

  for (let tentativa = 1; tentativa <= GEOCODE_MAX_ATTEMPTS; tentativa++) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json` +
        `?address=${encodeURIComponent(query)}&region=BR&key=${apiKey}`;

      const resp = await fetch(url, { cache: 'no-store' });

      if (resp.status >= 500 && tentativa < GEOCODE_MAX_ATTEMPTS) {
        await sleep(GEOCODE_BACKOFF_BASE_MS * 2 ** (tentativa - 1));
        continue;
      }
      if (!resp.ok) return { candidate: null, reason: 'http_error' };

      const data = await resp.json();

      if (data.status === 'OK' && data.results?.[0]) {
        const r = data.results[0];
        const location = r.geometry?.location;
        if (!location) return { candidate: null, reason: 'zero_results' };

        const components = r.address_components || [];

        return {
          candidate: {
            formattedAddress: r.formatted_address || '',
            placeId: r.place_id || '',
            lat: location.lat,
            lng: location.lng,
            partialMatch: r.partial_match === true,
            types: r.types || [],
            cep: extractComponent(components, ['postal_code']),
            bairro: extractComponent(components, ['sublocality', 'neighborhood']),
            // administrative_area_level_2 carrega o município em Goiás;
            // locality às vezes traz o distrito.
            cidade: extractComponent(components, [
              'administrative_area_level_2',
              'locality',
            ]),
          },
          reason: 'ok',
        };
      }

      if (data.status === 'OVER_QUERY_LIMIT' && tentativa < GEOCODE_MAX_ATTEMPTS) {
        await sleep(GEOCODE_BACKOFF_BASE_MS * 2 ** (tentativa - 1));
        continue;
      }

      const mapa: Record<string, GeocodeReason> = {
        OVER_QUERY_LIMIT: 'over_quota',
        REQUEST_DENIED: 'denied',
        INVALID_REQUEST: 'invalid_request',
        ZERO_RESULTS: 'zero_results',
      };
      return { candidate: null, reason: mapa[data.status] || 'http_error' };
    } catch (error) {
      console.error(`[address-resolver] erro na tentativa ${tentativa}:`, error);
      if (tentativa < GEOCODE_MAX_ATTEMPTS) {
        await sleep(GEOCODE_BACKOFF_BASE_MS * 2 ** (tentativa - 1));
        continue;
      }
      return { candidate: null, reason: 'network_error' };
    }
  }

  return { candidate: null, reason: 'http_error' };
}

// ============================================
// ORQUESTRAÇÃO
// ============================================

/**
 * Resolve o endereço cadastrado. O ViaCEP roda em paralelo com o Google porque
 * a query não depende dele — ele serve de gabarito para conferir a resposta.
 */
export async function resolveAddress(
  cadastro: CadastroAddress,
  apiKey: string
): Promise<{
  place: GeocodeCandidate | null;
  verdict: Verdict;
  reason: GeocodeReason;
}> {
  const [ref, geo] = await Promise.all([
    lookupCep(cadastro.cep),
    geocode(buildQuery(cadastro), apiKey),
  ]);

  if (!geo.candidate) {
    return {
      place: null,
      verdict: {
        trusted: false,
        severity: 'grave',
        issues: [GEOCODE_REASON_MESSAGE[geo.reason]],
      },
      reason: geo.reason,
    };
  }

  return {
    place: geo.candidate,
    verdict: validate(geo.candidate, ref),
    reason: geo.reason,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test -- src/lib/__tests__/address-resolver.test.ts
```

Esperado: PASS, 25 testes.

- [ ] **Step 5: Commit**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao
git add src/lib/address-resolver.ts src/lib/__tests__/address-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(geocode): chamada ao Google e orquestração no resolver

Move a chamada ao Google para o resolver, com o retry exponencial que já
existia. O ViaCEP roda em paralelo — a query não depende dele, ele é só
o gabarito de conferência.

A query segue exatamente o formato antigo, de propósito: mudar a taxa de
acerto do Google junto com a validação atrapalharia medir o efeito de
cada coisa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: /api/geocode passa a receber endereço estruturado

**Files:**
- Modify: `luna/src/app/api/geocode/route.ts` (substituir o arquivo inteiro)

**Interfaces:**
- Consumes: `resolveAddress`, `CadastroAddress`, `GeocodeReason` da Task 3.
- Produces: `POST /api/geocode` com body `{ rua, numero, bairro, cidade, cep }` e resposta `{ place: GeocodeCandidate | null, verdict: Verdict, reason: GeocodeReason }`.

O contrato antigo (`{ address: string }`) **não** é mantido. O único caller é `rota-exata-integration.ts:612`, atualizado na Task 5.

- [ ] **Step 1: Reescrever a rota**

Substituir todo o conteúdo de `luna/src/app/api/geocode/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/api-auth-helper';
import { resolveAddress } from '@/lib/address-resolver';
import type { CadastroAddress, GeocodeReason } from '@/lib/address-resolver';

/**
 * POST /api/geocode
 * Body:     { rua, numero, bairro, cidade, cep }
 * Resposta: { place, verdict, reason }
 *
 * Mantém a chave do Google no servidor. Toda a lógica de resolução e validação
 * vive em `address-resolver`; aqui só ficam autenticação e transporte.
 *
 * Permissões: qualquer usuário autenticado (a chamada é cara mas não destrutiva).
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request, ['admin', 'gestor', 'socio', 'financeiro', 'user']);
  if (!auth.success) {
    return NextResponse.json(
      { place: null, verdict: { trusted: false, severity: 'grave', issues: [] }, reason: 'denied' },
      { status: auth.status || 401 }
    );
  }

  let cadastro: CadastroAddress;
  try {
    const body = await request.json();
    cadastro = {
      rua: String(body?.rua || '').trim(),
      numero: String(body?.numero || '').trim(),
      bairro: String(body?.bairro || '').trim(),
      cidade: String(body?.cidade || '').trim(),
      cep: String(body?.cep || '').trim(),
    };
  } catch {
    return NextResponse.json(
      {
        place: null,
        verdict: { trusted: false, severity: 'grave', issues: ['JSON inválido'] },
        reason: 'invalid_request' as GeocodeReason,
      },
      { status: 400 }
    );
  }

  // Sem rua e sem CEP não há o que geocodificar.
  if (!cadastro.rua && !cadastro.cep) {
    return NextResponse.json(
      {
        place: null,
        verdict: {
          trusted: false,
          severity: 'grave',
          issues: ['Cadastro sem rua e sem CEP'],
        },
        reason: 'invalid_request' as GeocodeReason,
      },
      { status: 400 }
    );
  }

  const apiKey =
    process.env.GMAPS_SERVER_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GMAPS_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    '';

  const resultado = await resolveAddress(cadastro, apiKey);
  return NextResponse.json(resultado, { status: 200 });
}
```

- [ ] **Step 2: Conferir que compila**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm run typecheck
```

Esperado: erros **apenas** em `src/lib/rota-exata-integration.ts` (o caller antigo, corrigido na Task 5). Se aparecer erro em qualquer outro arquivo, parar e investigar.

- [ ] **Step 3: Commit**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao
git add src/app/api/geocode/route.ts
git commit -m "$(cat <<'EOF'
refactor(geocode): /api/geocode recebe endereço estruturado

A rota passa a receber os campos do cadastro em vez de uma string pronta,
e delega resolução e validação para o address-resolver. Sobram só
autenticação e transporte.

O contrato antigo não foi mantido: o único caller é o
rota-exata-integration, atualizado na sequência.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: buildStop grava o cadastro e o veredito

**Files:**
- Modify: `luna/src/lib/rota-exata-integration.ts`
  - Tipo `PlaceValue`: linhas 135-167
  - `buildStop`: linhas 246-302
  - Call site 1 (`createRouteFromLunnaOrders`): linhas 386-424
  - Bloco de geocoding duplicado a remover: linhas 574-713
  - Call site 2 (`addOrdersToExistingService`): linhas 1080-1117
  - Call site 3 (`addOrdersToExistingRoute`): linhas 1302-1338
  - Call site 4 (`resendOrderToRoute`): linhas 1539-1560
- Test: `luna/src/lib/__tests__/rota-exata-buildstop.test.ts` *(criar)*

**Interfaces:**
- Consumes: `resolveAddress`, `GeocodeCandidate`, `Verdict`, `CadastroAddress`, `GEOCODE_REASON_MESSAGE`, `GeocodeReason`, `buildQuery` da Task 3; contrato de `/api/geocode` da Task 4.
- Produces: `buildStop(order, client, resolved: ResolvedAddress | null): PlaceValue` onde `ResolvedAddress = { place: GeocodeCandidate | null; verdict: Verdict }`; ponto com `address`/`geocodedAddress`/`rua`/`numero`/`bairro`/`cidade`/`cep`/`addressSeverity`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `luna/src/lib/__tests__/rota-exata-buildstop.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildStop } from '@/lib/rota-exata-integration';
import type { GeocodeCandidate, Verdict } from '@/lib/address-resolver';

const PEDIDO = {
  id: 'UFRV6iHJPrFqv9sLpm75',
  number: 'P3460',
  items: [{ code: 'SKU-1', description: 'Sandália', quantity: 1, subtotal: 99.9, tipo: 'Venda' }],
  billing: { finalValue: 99.9 },
  complement: { notes: 'A PARTIR DAS 17H' },
  shipping: { deliveryTimeStart: '17:00', deliveryTimeEnd: '19:00' },
};

const CLIENTE = {
  nome: 'Deusirene Alves',
  telefone: '62982108768',
  rua: 'Rua ES14',
  numero: '',
  bairro: 'Residencial Elizene Santana',
  cidade: 'Goiânia - GO',
  cep: '74684688',
  complemento: 'Quadra 18 Lote 22',
  codigo: '0110930',
};

const PLACE_ERRADO: GeocodeCandidate = {
  formattedAddress:
    'R. Espírito Santo, 06 - Q.10 LT.11 - St. Urias Magalhães, Goiânia - GO, 74565-270, Brazil',
  placeId: 'ChIJI_-9D9fzXpMRcRs-jZwRpFE',
  lat: -16.6510533,
  lng: -49.2718514,
  partialMatch: true,
  types: ['establishment', 'point_of_interest'],
  cep: '74565-270',
  bairro: 'Setor Urias Magalhães',
  cidade: 'Goiânia',
};

const VEREDITO_GRAVE: Verdict = {
  trusted: false,
  severity: 'grave',
  issues: ['O Google devolveu um estabelecimento, não um endereço residencial'],
};

const VEREDITO_OK: Verdict = { trusted: true, severity: null, issues: [] };

describe('buildStop', () => {
  it('grava os campos estruturados do cadastro', () => {
    const stop = buildStop(PEDIDO, CLIENTE, { place: PLACE_ERRADO, verdict: VEREDITO_OK });

    expect(stop.rua).toBe('Rua ES14');
    expect(stop.numero).toBe('');
    expect(stop.bairro).toBe('Residencial Elizene Santana');
    expect(stop.cidade).toBe('Goiânia - GO');
    expect(stop.cep).toBe('74684688');
    expect(stop.complemento).toBe('Quadra 18 Lote 22');
  });

  it('usa o endereço do cadastro em address e guarda o do Google à parte', () => {
    const stop = buildStop(PEDIDO, CLIENTE, { place: PLACE_ERRADO, verdict: VEREDITO_OK });

    expect(stop.address).toBe(
      'Rua ES14, Residencial Elizene Santana, Goiânia - GO, CEP 74684688'
    );
    expect(stop.geocodedAddress).toBe(PLACE_ERRADO.formattedAddress);
    expect(stop.addressString).toBe(stop.address);
  });

  it('mantém as coordenadas do Google quando o veredito é suspeito', () => {
    const stop = buildStop(PEDIDO, CLIENTE, { place: PLACE_ERRADO, verdict: VEREDITO_GRAVE });

    expect(stop.lat).toBe(-16.6510533);
    expect(stop.lng).toBe(-49.2718514);
    expect(stop.placeId).toBe('ChIJI_-9D9fzXpMRcRs-jZwRpFE');
  });

  it('propaga o veredito suspeito para as flags de validação', () => {
    const stop = buildStop(PEDIDO, CLIENTE, { place: PLACE_ERRADO, verdict: VEREDITO_GRAVE });

    expect(stop.hasValidationIssues).toBe(true);
    expect(stop.addressSeverity).toBe('grave');
    expect(stop.validationIssues).toEqual(VEREDITO_GRAVE.issues);
  });

  it('não marca nada quando o veredito é limpo', () => {
    const stop = buildStop(PEDIDO, CLIENTE, { place: PLACE_ERRADO, verdict: VEREDITO_OK });

    expect(stop.hasValidationIssues).toBeUndefined();
    expect(stop.addressSeverity).toBeUndefined();
  });

  it('zera coordenadas e marca quando não houve geocodificação', () => {
    const stop = buildStop(PEDIDO, CLIENTE, null);

    expect(stop.lat).toBe(0);
    expect(stop.lng).toBe(0);
    expect(stop.hasValidationIssues).toBe(true);
    expect(stop.addressSeverity).toBe('grave');
    expect(stop.address).toBe(
      'Rua ES14, Residencial Elizene Santana, Goiânia - GO, CEP 74684688'
    );
  });

  it('mantém o id estável para idempotência', () => {
    const a = buildStop(PEDIDO, CLIENTE, null);
    const b = buildStop(PEDIDO, CLIENTE, null);

    expect(a.id).toBe('lunna-UFRV6iHJPrFqv9sLpm75');
    expect(b.id).toBe(a.id);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test -- src/lib/__tests__/rota-exata-buildstop.test.ts
```

Esperado: FAIL — `buildStop` não é exportado.

- [ ] **Step 3: Remover o bloco de geocoding duplicado**

Em `luna/src/lib/rota-exata-integration.ts`, apagar da linha 574 (`// ============================================` que precede `// FUNÇÃO DE GEOCODING`) até a linha 713 (fim de `geocodeAddress`), inclusive. Saem: `type GeocodeReason`, `GEOCODE_MAX_ATTEMPTS`, `GEOCODE_BACKOFF_BASE_MS`, `sleep`, `geocodeAddressDetailed`, `GEOCODE_REASON_MESSAGE`, `geocodeAddress`.

No lugar, colocar:

```ts
// ============================================
// GEOCODING
// ============================================
//
// A resolução de endereços vive em `address-resolver` e roda no servidor,
// atrás de /api/geocode. Não existe mais chamada ao Google a partir do browser.

type ResolvedAddress = { place: GeocodeCandidate | null; verdict: Verdict };

/**
 * Resolve um endereço via /api/geocode. Sem fallback direto ao Google: se o
 * endpoint não responde, o ponto entra pelo caminho de falha, marcado.
 */
async function resolveViaApi(
  cadastro: CadastroAddress
): Promise<{ resolved: ResolvedAddress | null; reason: GeocodeReason }> {
  if (typeof window === 'undefined' || !auth.currentUser) {
    return { resolved: null, reason: 'denied' };
  }

  try {
    const token = await auth.currentUser.getIdToken();
    const resp = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cadastro),
    });

    if (!resp.ok) return { resolved: null, reason: 'http_error' };

    const data = await resp.json();
    if (!data?.place) {
      return { resolved: null, reason: (data?.reason as GeocodeReason) || 'zero_results' };
    }

    return {
      resolved: { place: data.place as GeocodeCandidate, verdict: data.verdict as Verdict },
      reason: 'ok',
    };
  } catch {
    return { resolved: null, reason: 'network_error' };
  }
}

/** Extrai do cliente os campos que o resolver consome. */
function toCadastro(client: LunnaClient): CadastroAddress {
  return {
    rua: client.rua || '',
    numero: client.numero || '',
    bairro: client.bairro || '',
    cidade: client.cidade || '',
    cep: client.cep || '',
  };
}
```

E acrescentar ao bloco de imports do topo do arquivo (depois do import de `historicoMovimentacoes.service`):

```ts
import { GEOCODE_REASON_MESSAGE, buildQuery } from '@/lib/address-resolver';
import type {
  CadastroAddress,
  GeocodeCandidate,
  GeocodeReason,
  Verdict,
} from '@/lib/address-resolver';
```

`buildQuery` entra como valor (não como tipo) porque o Step 7 usa ela para montar a chave do cache.

- [ ] **Step 4: Acrescentar os campos novos ao tipo `PlaceValue`**

Em `luna/src/lib/rota-exata-integration.ts`, dentro de `type PlaceValue` (linhas 135-167), logo depois de `validationIssues?: string[];`:

```ts
  /** Texto formatado devolvido pelo Google. Só para diagnóstico — não é o que a tela mostra. */
  geocodedAddress?: string;
  addressSeverity?: 'grave' | 'conferir';
  // Campos estruturados do cadastro, exibidos direto no InfoWindow do Rota Exata
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
```

- [ ] **Step 5: Reescrever `buildStop`**

Substituir `buildStop` (linhas 246-302) por:

```ts
export function buildStop(
  order: any,
  client: LunnaClient & { codigo?: string },
  resolved: ResolvedAddress | null
): PlaceValue {
  const addressParts = [
    client.rua, client.numero, client.bairro, client.cidade,
    client.cep ? `CEP ${client.cep}` : '',
  ].filter(Boolean);
  const addressString = addressParts.join(', ');

  const items = (order.items || []).map((item: any, idx: number) => ({
    id: `${order.number}-item-${idx}`,
    code: item.code || '',
    description: item.description || '',
    quantity: item.quantity || 0,
    subtotal: item.subtotal || 0,
    tipo: item.tipo || 'Venda',
  }));

  const hasVenda = items.some((i: any) => i.tipo === 'Venda');
  const hasTroca = items.some((i: any) => i.tipo === 'Troca');
  const operationType: 'venda' | 'troca' | 'misto' =
    (hasVenda && hasTroca) ? 'misto' : hasTroca ? 'troca' : 'venda';

  const place = resolved?.place ?? null;

  const baseStop: PlaceValue = {
    // ID estável (sem Date.now) para idempotência com arrayUnion
    id: `lunna-${order.id || order.number}`,
    // O que as telas mostram é o endereço como foi cadastrado, não o do Google.
    address: addressString,
    geocodedAddress: place?.formattedAddress || '',
    placeId: place?.placeId || '',
    lat: place?.lat || 0,
    lng: place?.lng || 0,
    customerName: client.nome || '',
    phone: client.telefone || '',
    notes: order.complement?.notes || '',
    orderNumber: order.number || '',
    complemento: client.complemento || '',
    addressString: addressString,
    // Campos estruturados: o InfoWindow do Rota Exata exibe estes por cima de `address`.
    rua: client.rua || '',
    numero: client.numero || '',
    bairro: client.bairro || '',
    cidade: client.cidade || '',
    cep: client.cep || '',
    deliveryStatus: 'pending',
    expectedValue: order.billing?.finalValue || 0,
    items,
    deliveredItemIds: items.map((i: any) => i.id),
    hasExchangeItems: hasTroca,
    operationType,
    lunnaClientCode: client.codigo || '',
    timeWindowStart: order.shipping?.deliveryTimeStart || '',
    timeWindowEnd: order.shipping?.deliveryTimeEnd || '',
    hasTimePreference: !!(order.shipping?.deliveryTimeStart && order.shipping?.deliveryTimeEnd),
  };

  if (!resolved) {
    baseStop.hasValidationIssues = true;
    baseStop.addressSeverity = 'grave';
    baseStop.validationIssues = [
      'Endereço não foi geocodificado. Necessário editar manualmente.',
    ];
  } else if (!resolved.verdict.trusted) {
    baseStop.hasValidationIssues = true;
    baseStop.addressSeverity = resolved.verdict.severity ?? 'conferir';
    baseStop.validationIssues = resolved.verdict.issues;
  }

  return baseStop;
}
```

- [ ] **Step 6: Rodar o teste de buildStop e confirmar que passa**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test -- src/lib/__tests__/rota-exata-buildstop.test.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 7: Atualizar os call sites 1, 2 e 3**

Os três blocos de geocodificação em lote (linhas ~386-424, ~1080-1117, ~1302-1338) seguem o mesmo formato. Em cada um, substituir o corpo do callback de `mapLimit` por:

```ts
    const stops: PlaceValue[] = await mapLimit(orders, GEOCODE_CONCURRENCY, async (order) => {
      const client = clientsMap.get(order.client?.id);
      if (!client) {
        return buildStop(
          order,
          { nome: '', telefone: '', rua: '', numero: '', bairro: '', cidade: '', cep: '' } as any,
          null
        );
      }

      const cadastro = toCadastro(client);
      const chaveCache = buildQuery(cadastro);

      let resolved: ResolvedAddress | null = null;
      let reason: GeocodeReason = 'zero_results';

      if (geocodeCache.has(chaveCache)) {
        resolved = geocodeCache.get(chaveCache) ?? null;
        if (resolved) reason = 'ok';
      } else {
        const r = await resolveViaApi(cadastro);
        resolved = r.resolved;
        reason = r.reason;
        geocodeCache.set(chaveCache, resolved);
      }

      if (!resolved) {
        failedGeocodings.push({
          orderNumber: order.number,
          reason: GEOCODE_REASON_MESSAGE[reason],
        });
      }

      return buildStop(order, client, resolved);
    });
```

Ajustes por call site:
- **Call site 1** (`createRouteFromLunnaOrders`, ~386): nome da variável é `stops`. Trocar a declaração do cache para `const geocodeCache = new Map<string, ResolvedAddress | null>();`. Remover a linha `const apiKey = googleMapsApiKey || process.env...` (linha 352) — não é mais usada.
- **Call site 2** (`addOrdersToExistingService`, ~1080): variável é `newStops`. Mesmo ajuste no tipo do cache. Remover o `apiKey` local se ficar sem uso.
- **Call site 3** (`addOrdersToExistingRoute`, ~1302): variável é `newStops`, e o retorno é envolvido em `sanitizeFirestoreData(...)`. Manter esse envelope: `return sanitizeFirestoreData(buildStop(order, client, resolved));` e, no ramo do cliente ausente, `return sanitizeFirestoreData(buildStop(order, ..., null));`. Mesmo ajuste no tipo do cache. O `client` aqui usa `|| normalizeClientForStop(null, order)` em vez do early-return — preservar esse comportamento.

- [ ] **Step 8: Atualizar o call site 4 (`resendOrderToRoute`)**

Substituir as linhas 1539-1560 por:

```ts
      const cadastro = toCadastro(cliente);
      const enderecoCadastro = [
        cliente.rua, cliente.numero, cliente.bairro, cliente.cidade,
        cliente.cep ? `CEP ${cliente.cep}` : '',
      ].filter(Boolean).join(', ');

      const { resolved, reason } = await resolveViaApi(cadastro);

      if (!resolved) {
        return {
          success: false,
          error: `Não foi possível resolver o endereço do cliente: ${GEOCODE_REASON_MESSAGE[reason]}`,
        };
      }

      const newStop: PlaceValue = {
        id: `lunna-${pedido.id}`,
        address: enderecoCadastro,
        geocodedAddress: resolved.place?.formattedAddress || '',
        placeId: resolved.place?.placeId || '',
        lat: resolved.place?.lat || 0,
        lng: resolved.place?.lng || 0,
        customerName: cliente.nome || '',
        phone: cliente.telefone || '',
        orderNumber: pedido.numero,
        addressString: enderecoCadastro,
        complemento: cliente.complemento || '',
        rua: cliente.rua || '',
        numero: cliente.numero || '',
        bairro: cliente.bairro || '',
        cidade: cliente.cidade || '',
        cep: cliente.cep || '',
        deliveryStatus: 'pending',
        hasValidationIssues: !resolved.verdict.trusted,
        ...(resolved.verdict.trusted
          ? {}
          : {
              addressSeverity: resolved.verdict.severity ?? 'conferir',
              validationIssues: resolved.verdict.issues,
            }),
      };
```

O parâmetro `apiKey` de `resendOrderToRoute` fica sem uso. Manter na assinatura (é chamado de fora com ele) e marcar com um comentário:

```ts
  apiKey?: string // mantido por compatibilidade — a chave agora vive só no servidor
```

- [ ] **Step 9: Conferir que tudo compila e que a suíte passa**

O repositório **já tem 165 erros de typecheck pré-existentes em 35 arquivos**, medidos em `main`
antes desta branch (lista em `.superpowers/sdd/typecheck-baseline-main.txt`). `npm run typecheck`
não passa limpo e nunca passou — não tente consertar isso.

Os três arquivos desta mudança estão **limpos no baseline**, então o critério é: zero erro neles.

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm run typecheck 2>&1 | grep -E "address-resolver|rota-exata-integration|api/geocode" ; echo "--- fim (vazio acima = OK) ---" ; npm test
```

Esperado: nenhuma linha entre o comando e o marcador `--- fim ---`; toda a suíte de testes PASS.

- [ ] **Step 9b: Conferir o contrato entre a rota e o caller — o compilador NÃO pega isso**

`rota-exata-integration.ts` fala com `/api/geocode` por `fetch`, que é sem tipo. Se o corpo enviado
não casar com o que a rota espera, **nada acusa em tempo de compilação** — quebra em produção, em
silêncio. Confira à mão que os dois lados combinam:

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao
echo "=== o que a rota LE do body ==="; grep -n "body?\." src/app/api/geocode/route.ts
echo "=== o que o caller ENVIA ==="; grep -n -B2 -A2 "body: JSON.stringify" src/lib/rota-exata-integration.ts
echo "=== o que a rota DEVOLVE ==="; grep -n "NextResponse.json" src/app/api/geocode/route.ts
echo "=== o que o caller LE da resposta ==="; grep -n "data?\.\|data\.place\|data\.verdict\|data\.reason" src/lib/rota-exata-integration.ts
```

Os nomes de campo precisam bater exatamente nos dois sentidos: o caller envia
`{rua, numero, bairro, cidade, cep}` e lê `{place, verdict, reason}`.

- [ ] **Step 10: Confirmar que não sobrou chamada ao Google fora do resolver**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && grep -rn "maps.googleapis.com/maps/api/geocode" src/lib/ src/app/api/
```

Esperado: uma única linha, em `src/lib/address-resolver.ts`.

- [ ] **Step 11: Commit**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao
git add src/lib/rota-exata-integration.ts src/lib/__tests__/rota-exata-buildstop.test.ts
git commit -m "$(cat <<'EOF'
fix(rota-exata): ponto guarda o endereço do cadastro, não o do Google

O campo address passa a levar o endereço como cadastrado; o texto do
Google vai para geocodedAddress, só para diagnóstico. Voltam também os
campos estruturados (rua, numero, bairro, cidade, cep) que pararam de ser
enviados em 04/02/2026, quando o Luna passou a gravar direto no
Firestore.

Isso conserta de uma vez as ~15 telas do Rota Exata que leem address —
incluindo a de rastreio que o cliente final enxerga.

Veredito suspeito marca o ponto mas mantém as coordenadas: a rota ainda
pode ser montada, e o aviso é consultivo.

Some o fallback que chamava o Google direto do browser. Sobra uma única
chamada à API no sistema inteiro, dentro do address-resolver.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: RotaExata — tipos e aviso no popup

**Files:**
- Modify: `rotaExata/src/lib/types.ts` (dentro de `PlaceValue`, que começa na linha 22)
- Modify: `rotaExata/src/components/maps/RouteMap.tsx` (função `createInfoWindowContent`, linhas 16-117)

**Interfaces:**
- Consumes: o formato de ponto produzido na Task 5 — `geocodedAddress`, `addressSeverity`, `hasValidationIssues`, `validationIssues`, `rua`, `numero`, `bairro`, `cidade`, `cep`.
- Produces: nada para tarefas seguintes.

`rua`, `numero`, `bairro`, `cidade`, `cep`, `hasValidationIssues` e `validationIssues` **já existem** em `PlaceValue` (linhas 45-53). Só faltam dois campos.

- [ ] **Step 1: Acrescentar os campos ao tipo**

Em `rotaExata/src/lib/types.ts`, logo depois de `hasValidationIssues?: boolean;` (linha 53):

```ts
  /** Texto formatado que o Google devolveu. Só para conferência — a tela mostra os campos do cadastro. */
  geocodedAddress?: string;
  addressSeverity?: 'grave' | 'conferir';
```

- [ ] **Step 2: Acrescentar o aviso no popup**

Em `rotaExata/src/components/maps/RouteMap.tsx`, dentro de `createInfoWindowContent`, logo depois da linha `const stopId = String(stop.id ?? stop.placeId ?? index);` (linha 25):

```ts
  // Aviso de endereço suspeito. O ponto entra na rota mesmo assim — o operador
  // decide se corrige pelo botão Editar.
  let addressWarning = '';
  if (stop.hasValidationIssues && stop.validationIssues?.length) {
    const grave = stop.addressSeverity !== 'conferir';
    const cor = grave ? '#9E3423' : '#A66B15';
    const fundo = grave ? '#FAEBE7' : '#FBF2E1';
    const titulo = grave ? 'Endereço provavelmente errado' : 'Endereço a conferir';

    const listaIssues = stop.validationIssues
      .map((i) => `<li style="margin: 0 0 2px 0;">${i}</li>`)
      .join('');

    const comparacao = stop.geocodedAddress
      ? `<p style="margin: 6px 0 0 0; font-size: 11px; color: #555;">
           O Google apontou para:<br><em>${stop.geocodedAddress}</em>
         </p>`
      : '';

    addressWarning = `
      <div style="background: ${fundo}; border-left: 3px solid ${cor}; padding: 8px 10px; margin-bottom: 12px; border-radius: 2px;">
        <strong style="color: ${cor}; font-size: 12px; display: block; margin-bottom: 4px;">⚠ ${titulo}</strong>
        <ul style="margin: 0; padding-left: 16px; font-size: 11.5px; color: #333;">${listaIssues}</ul>
        ${comparacao}
      </div>
    `;
  }
```

- [ ] **Step 3: Inserir o aviso no HTML**

Na string de retorno da mesma função, trocar a linha `${statusBadge}` (linha 42) por:

```
      ${statusBadge}
      ${addressWarning}
```

- [ ] **Step 4: Conferir que compila**

```bash
cd /Users/acassiusalves/rotaExata-1/.claude/worktrees/github-alignment-check-dc1542 && npm run typecheck 2>&1 | tail -20
```

Esperado: sem erros novos em `types.ts` nem em `RouteMap.tsx`. (Se o projeto já tiver erros pré-existentes em outros arquivos, comparar com `git stash && npm run typecheck` antes de concluir que a mudança quebrou algo.)

- [ ] **Step 5: Commit**

```bash
cd /Users/acassiusalves/rotaExata-1/.claude/worktrees/github-alignment-check-dc1542
git add src/lib/types.ts src/components/maps/RouteMap.tsx
git commit -m "$(cat <<'EOF'
feat(mapa): aviso de endereço suspeito no popup da parada

O popup já sabia exibir os campos estruturados do cadastro (rua, bairro,
CEP) — só faltava o Luna enviá-los. Com eles de volta, o endereço certo
aparece sozinho.

Falta o aviso: quando o ponto vem marcado, o popup mostra o motivo e o
endereço que o Google tinha apontado, lado a lado, para o operador
comparar antes de despachar. Duas severidades — grave e a conferir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificação final

- [ ] **Suíte completa do Luna**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && npm test && npm run typecheck
```

Esperado: tudo PASS, sem erro de tipo.

- [ ] **Uma única chamada ao Google**

```bash
cd /Users/acassiusalves/luna/.claude/worktrees/validacao-geocodificacao && grep -rn "maps/api/geocode/json" src/lib/ src/app/api/ | wc -l
```

Esperado: `1`.

- [ ] **Teste manual com o P3460**

No Luna, reenviar o pedido P3460 para um serviço de teste e conferir no Firestore que o ponto gravado tem:
- `address` = `Rua ES14, Residencial Elizene Santana, Goiânia - GO, CEP 74684688`
- `geocodedAddress` = o texto da Rua Espírito Santo
- `rua` = `Rua ES14`, `bairro` = `Residencial Elizene Santana`, `cep` = `74684688`
- `hasValidationIssues` = `true`, `addressSeverity` = `grave`
- `lat` / `lng` preenchidos, diferentes de zero

E no RotaExata, abrir a parada no mapa: deve mostrar Rua/Bairro/Cidade/CEP do cadastro, com o aviso vermelho em cima e o endereço do Google embaixo, para comparação.

---

## Fora deste plano

Registrado no spec, para uma rodada seguinte:

- Varredura e correção dos 3.455 pontos históricos. Os 14 críticos da amostra seguem gravados com coordenadas erradas.
- Remoção do endpoint órfão `rotaExata/src/app/api/import-lunna-orders/route.ts`, que tem a terceira cópia do geocoding e nenhum caller.
- Mesmo tratamento nas telas de criação de pedido do Luna (`pedidos/novo:1003`, `frente-caixa:1588`), que chamam o Google direto para autopreencher endereço a partir do CEP.
