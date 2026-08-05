# Validação da geocodificação na integração Luna → RotaExata

**Data:** 2026-08-05
**Status:** aprovado, aguardando plano de implementação
**Repositórios afetados:** `luna` (maior parte), `rotaExata` (UI)

---

## Problema

O pedido P3460 chegou ao RotaExata com o endereço de outra pessoa, em outro bairro, a 7,9 km do
destino real. O cadastro no Luna estava correto — conferido contra a base dos Correios via ViaCEP.

O que aconteceu: o Google Geocoding não encontrou "Rua ES14" e devolveu, com `status: OK`, dois
resultados marcados por ele mesmo como `partial_match: true`. O primeiro nem era um endereço — era um
`establishment` na Rua Espírito Santo (o Google casou `ES14` com *Espírito Santo*). O código pegou
`results[0]` sem conferir nada e gravou endereço e coordenadas errados, sem levantar nenhuma flag.

Não é caso isolado. Numa amostra de 200 pontos dos 30 serviços mais recentes:

- 36 (18%) tinham `partial_match: true`
- 39 (19,5%) voltaram com CEP diferente do cadastro
- 14 (7%) estavam criticamente errados — incluindo o P3370, que apontou uma entrega de Goiânia
  para Catalão, 216 km de distância
- 0 pontos, em 3.455 no histórico inteiro, têm `hasValidationIssues` marcado

### Causa raiz

Duas falhas independentes que se somam:

1. **Nenhuma validação do resultado do Google.** Não existe checagem de `partial_match` em nenhum dos
   dois repositórios — confirmado por busca no código e no histórico do git. O tipo do resultado
   também é ignorado, então um `point_of_interest` é aceito como endereço residencial.
   `hasValidationIssues` só é marcado quando a geocodificação retorna **nulo**; um resultado errado
   com aparência de sucesso passa como acerto.

2. **A tela mostra o texto do Google, não o do cadastro.** O popup do mapa foi feito para exibir
   campos separados (Rua, Número, Bairro, Cidade, CEP) vindos direto do cadastro
   (`RouteMap.tsx:56-84`), mas o Luna parou de enviá-los em 04/02/2026, quando passou a gravar direto
   no Firestore via `buildStop()`. Desde então o popup cai no fallback `stop.address`, que guarda o
   texto do Google. Medição mês a mês no histórico: 4% dos pontos têm o campo `rua` em fev/2026, 0%
   de março em diante.

---

## Objetivo

Que um endereço errado nunca chegue ao motorista sem aviso, e que as telas mostrem o endereço como
foi cadastrado.

### Não-objetivos

- Não corrigir cadastros errados automaticamente. O ViaCEP entra como **gabarito de conferência**,
  não como fonte que reescreve o endereço do cliente.
- Não bloquear o envio de pedidos. Ponto suspeito entra na rota, marcado.
- Não fazer varredura/backfill dos 3.455 pontos históricos. Fica para uma rodada seguinte.
- Não mexer nas telas de criação de pedido do Luna (`pedidos/novo`, `frente-caixa`), que chamam o
  Google direto para autopreencher endereço a partir do CEP. Problema parecido, feature diferente.

---

## Decisões tomadas

| Decisão | Escolha | Porquê |
|---|---|---|
| Ponto suspeito | Entra na rota, marcado, **mantendo as coordenadas do Google** | Não trava a operação; a rota já pode ser montada e otimizada. O aviso é consultivo. |
| Papel do ViaCEP | Gabarito de conferência | Para o P3460 o ViaCEP devolve exatamente o que já está no cadastro — montar a query com ele não teria mudado nada. O ganho está em ter uma referência oficial para comparar com o que o Google respondeu. |
| Campo `address` | Passa a guardar o endereço do cadastro | Conserta ~15 telas de uma vez, incluindo o rastreio do cliente final (`track/[id]/page.tsx:239`) e a lista do motorista. |

---

## Arquitetura

Hoje existem três implementações copiadas da chamada ao Google:

| Local | Situação |
|---|---|
| `luna/src/app/api/geocode/route.ts:89` | ativa, server-side |
| `luna/src/lib/rota-exata-integration.ts:636-693` | fallback no browser, para quando o endpoint acima dá 404 |
| `rotaExata/src/app/api/import-lunna-orders/route.ts:40` | **órfã** — sem nenhum caller em `luna`, `luna-whatsapp-service` ou no próprio `rotaExata` |

A proposta consolida em uma só:

```
buildStop()                POST /api/geocode              address-resolver.ts
(endereço estruturado) ──▶ (valida auth, delega)  ──────▶ ├─ lookupCep()    ViaCEP
                                                          ├─ geocode()      Google (única no sistema)
                                                          └─ validate()     função pura
                                                                    │
                        { place, verdict } ◀────────────────────────┘
```

**O fallback direto ao Google em `rota-exata-integration.ts` é removido.** Se `/api/geocode` não
responder, o resolver retorna falha e o ponto entra pelo caminho de erro que já existe. Some uma cópia
do código e um dos caminhos que expõem a chave do Google ao browser — não todos: as telas de criação
de pedido (`pedidos/novo`, `frente-caixa`, fora de escopo — ver Não-objetivos acima) continuam chamando
o Google direto do browser com `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

`/api/geocode` tem exatamente um caller (`rota-exata-integration.ts:612`), então o contrato pode mudar
sem quebrar nada.

---

## Componentes

### `luna/src/lib/address-resolver.ts` (novo, server-only)

Três responsabilidades, testáveis em separado.

```ts
export type CadastroAddress = {
  rua: string; numero: string; bairro: string; cidade: string; cep: string;
};

export type CepReference = {
  cep: string;         // 8 dígitos, sem máscara
  logradouro: string;  // pode vir vazio em CEP único
  bairro: string;      // pode vir vazio em CEP único
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
  cep: string;         // extraído de address_components
  bairro: string;
  cidade: string;
};

export type Verdict = {
  trusted: boolean;
  severity: 'grave' | 'conferir' | null;
  issues: string[];    // mensagens em português, prontas para a UI
};

export async function lookupCep(cep: string): Promise<CepReference | null>;
export function validate(c: GeocodeCandidate, ref: CepReference | null): Verdict;  // pura
export async function resolveAddress(a: CadastroAddress): Promise<{
  place: GeocodeCandidate | null;
  verdict: Verdict;
}>;
```

**`lookupCep`** — `GET https://viacep.com.br/ws/{cep}/json/`, timeout de 4s via `AbortSignal.timeout`.
Retorna `null` se o CEP não tiver 8 dígitos, se o ViaCEP responder `{ "erro": true }`, ou em qualquer
falha de rede. Cache em `Map` por CEP, com escopo de processo.

**`validate`** — função pura, sem I/O. Regras abaixo.

**`resolveAddress`** — orquestra: monta a query, dispara `lookupCep` e o geocode em paralelo
(`Promise.all`), aplica `validate`. A query enviada ao Google continua sendo montada a partir do
cadastro, no formato atual: `rua, numero, bairro, cidade, CEP xxxxxxxx, Brasil`.

### Regras de validação

Extração dos campos do `address_components` da resposta do Google — o primeiro componente que casar,
na ordem listada; string vazia se nenhum casar:

| Campo do candidato | Tipos procurados, em ordem |
|---|---|
| `cep` | `postal_code` |
| `bairro` | `sublocality`, `neighborhood` |
| `cidade` | `administrative_area_level_2`, `locality` |

`administrative_area_level_2` vem antes de `locality` porque em Goiás é ele que carrega o município;
`locality` às vezes traz o distrito.

Normalização usada nas comparações de texto: minúsculas, remoção de acentos (NFD), remoção dos
prefixos de logradouro e de tipo de bairro (`setor`/`st`, `residencial`/`res`, `jardim`/`jd`,
`parque`/`pq`, `vila`/`vl`, `conjunto`/`cj`, `loteamento`/`lot`), tudo que não for alfanumérico vira
espaço, espaços colapsados.

| | Condição | Severidade | Mensagem |
|---|---|---|---|
| R1 | `partialMatch` **e** `types` contém `establishment` ou `point_of_interest` | grave | "O Google devolveu um estabelecimento, não um endereço residencial" |
| R2 | `types` não contém nenhum de `street_address`, `premise`, `subpremise`, `route` — e também não é POI | grave | "A geocodificação não chegou ao nível de rua" |
| R3 | CEP do Google e CEP de referência têm 8 dígitos e diferem nos **3 primeiros** | grave | "O endereço encontrado fica em outra região de CEP" |
| R4 | Cidade do Google difere da `localidade` do ViaCEP | grave | "O endereço encontrado fica em outra cidade" |
| R5 | Bairro **e** CEP (5 primeiros dígitos) divergem do ViaCEP | conferir | "Bairro e CEP não conferem com o cadastro" |

`trusted = issues.length === 0`. `severity` é `grave` se qualquer regra grave disparou, senão
`conferir` se R5 disparou, senão `null`.

R1 e R2 não dependem do ViaCEP. R3, R4 e R5 são puladas quando `ref` é `null`, e a ausência de
referência **não** marca o ponto.

Um POI **sem** `partial_match` não dispara R1 nem R2 — é decisão consciente, não esquecimento. Quando
o Google casa um estabelecimento com confiança total, normalmente é porque o cliente cadastrou um
comércio de verdade como ponto de entrega. Esse caso continua sujeito a R3, R4 e R5.

**Descartada:** "CEP divergente" puro como regra. Dispara em 19,5% da amostra e a maior parte é
numeração diferente da mesma rua — ruído que faria o operador ignorar os avisos.

### Calibração

Regras rodadas contra 200 pontos reais dos 30 serviços mais recentes:

| Métrica | Resultado |
|---|---|
| Sinalizados | 29 (14,5%) |
| Casos críticos conhecidos capturados | 14 de 14 |
| Sem referência do ViaCEP | 9 |
| Disparos por regra | R3: 15 · R5: 10 · R1: 5 · R2: 5 · R4: 3 |

Dos 15 sinalizados fora da lista dos 14 críticos, a inspeção manual indica que a maioria também é erro
real — P3434 aponta "Rua 609, Setor São José, Goiânia" para o CEP 75712-460 (região de Catalão);
P3319 joga "Rua 8, Setor Oeste" para 75392-731 (Trindade). Os limítrofes são os de bairro adjacente
na mesma via, que caem em `conferir`, não em `grave`.

### `luna/src/app/api/geocode/route.ts` (contrato novo)

```
POST /api/geocode
Body:     { rua, numero, bairro, cidade, cep }
Resposta: { place: GeocodeCandidate | null, verdict: Verdict, reason: GeocodeReason }
```

Mantém a autenticação atual (`verifyAuth` com os mesmos papéis) e o retry com backoff já existente
para erros transitórios do Google. Passa a delegar toda a lógica para `address-resolver`.

O formato antigo (`{ address: string }`) **não** precisa ser mantido: o único caller vai ser
atualizado na mesma mudança.

### `luna/src/lib/rota-exata-integration.ts`

- Remover `geocodeAddressDetailed` (linhas 603-693) e o wrapper `geocodeAddress` (710-713).
- Substituir por uma chamada fina a `/api/geocode` enviando o endereço estruturado.
- `buildStop()` passa a receber o `verdict` e a gravar os campos novos.
- Os três pontos que geocodificam em lote (`createRouteFromLunnaOrders`,
  `addOrdersToExistingService`, `addOrdersToExistingRoute`) continuam com `mapLimit` e cache por
  endereço; só muda a chave do cache, que passa a ser o endereço estruturado serializado.

### Formato do stop

| Campo | Antes | Depois |
|---|---|---|
| `address` | texto formatado do Google | **endereço como cadastrado** |
| `geocodedAddress` | — | texto formatado do Google (novo, para diagnóstico) |
| `addressString` | endereço do cadastro | inalterado |
| `rua`, `numero`, `bairro`, `cidade`, `cep` | ausentes | do cadastro (novos) |
| `lat`, `lng` | do Google | inalterado — **mantidos mesmo quando suspeito** |
| `hasValidationIssues` | só quando o geocode retorna nulo | também quando `verdict.trusted === false` |
| `validationIssues` | idem | recebe `verdict.issues` |
| `addressSeverity` | — | `'grave' \| 'conferir'` quando marcado (novo) |

O formato dos campos estruturados já tem precedente no repositório: é exatamente o que a rota órfã
`import-lunna-orders/route.ts:318-324` gravava, com o comentário *"campos estruturados para exibição
no InfoWindow"*.

### `rotaExata` — UI

- `src/components/maps/RouteMap.tsx` — o popup já prioriza os campos estruturados sozinho
  (linhas 56-84) e volta a mostrar o cadastro assim que o Luna os enviar. Acrescentar um aviso quando
  `hasValidationIssues`, listando `validationIssues` e exibindo `geocodedAddress` ao lado, para o
  operador comparar. O botão "Editar" já existe e é o caminho de correção.
- `src/lib/types.ts` — declarar os campos novos em `PlaceValue`.
- Nenhuma outra tela precisa mudar: as ~15 que leem `stop.address` passam a mostrar o endereço certo
  automaticamente.

---

## Tratamento de erro e degradação

| Situação | Comportamento |
|---|---|
| ViaCEP fora do ar, lento ou CEP desconhecido | R1 e R2 continuam valendo; R3/R4/R5 puladas. O ponto **não** é marcado por isso. Sem retry — 4s de timeout e segue. |
| Google indisponível / cota estourada | Caminho de falha que já existe: ponto com `lat/lng` zerados e `hasValidationIssues`. Retry com backoff, mantido. |
| `/api/geocode` fora do ar | Mesmo caminho de falha acima. O fallback direto ao Google não existe mais. |
| Cadastro sem CEP | Query montada sem CEP; R3/R4/R5 puladas. |

Nenhuma dessas situações derruba o envio do lote.

---

## Testes

`validate()` é pura, então o grosso da cobertura não toca a rede.

- **Fixtures reais cobrindo cada regra** — pares (candidato do Google, referência do ViaCEP)
  capturados da produção, um por regra, cada um com o veredito esperado:
  - P3460 (âncora) — dispara R1, R3 e R5 ao mesmo tempo
  - P3370 — dispara R3 e R4, e **não** pode disparar R5 (bairro "Setor Central" nos dois lados)
  - P3404 — dispara R2, sem referência do ViaCEP

  Um caso por regra, e não os 14 críticos: as outras 11 ocorrências repetem as mesmas combinações e
  exigiriam capturar 11 respostas do ViaCEP só para duplicar cobertura. O corpus completo de 200
  pontos como fixture de regressão fica registrado em "fora de escopo".
- **Fixture de falso positivo** — amostra de pontos bons (rua e bairro conferindo, CEP diferente por
  numeração) que devem passar como `trusted`. Trava a regra descartada de "CEP divergente puro".
- **Sem referência** — os 9 casos sem ViaCEP: só R1 e R2 podem disparar.
- **CEP único** — ViaCEP com `logradouro` e `bairro` vazios não pode disparar R5.
- **`lookupCep`** — testes com `fetch` mockado: resposta boa, `{ erro: true }`, timeout, JSON inválido.
- **`buildStop`** — verifica que os campos estruturados são gravados, que `address` recebe o cadastro
  e `geocodedAddress` o texto do Google, e que `lat/lng` sobrevivem a um veredito suspeito.

O Luna já tem Vitest configurado (`vitest.config.ts`, `vitest.setup.ts`).

---

## Riscos

| Risco | Mitigação |
|---|---|
| 14,5% dos pontos sinalizados vira ruído e o operador passa a ignorar | Duas severidades: `grave` (erro quase certo, 4 regras) e `conferir` (limítrofe, 1 regra). A UI diferencia. Reavaliar o corte depois de uma semana de uso real. |
| Mudar a semântica de `address` quebra algum consumidor | Levantei os ~15 usos: todos exibem ou usam como fallback de navegação quando falta `lat/lng`. Nenhum faz parsing. No fallback, buscar o texto do cadastro é melhor que o do Google. |
| Dependência de um serviço externo gratuito sem SLA | ViaCEP é estritamente opcional: some das regras quando indisponível, sem marcar ponto e sem travar envio. |
| Remover o fallback ao Google deixa o envio refém de `/api/geocode` | Mesmo processo Next.js, mesma origem — se ele está fora, o app está fora. Hoje o fallback só existia para ambiente legado sem a rota. |

---

## Fora de escopo (candidatos a rodada seguinte)

- Varredura e correção dos 3.455 pontos históricos; os 14 críticos da amostra seguem gravados com
  coordenadas erradas.
- Commitar o corpus de 200 pontos (candidato do Google + referência do ViaCEP) como fixture de
  regressão, para recalibrar as regras sem depender de rede.
- Remoção do endpoint órfão `rotaExata/src/app/api/import-lunna-orders/route.ts`.
- Aplicar o mesmo tratamento às telas de criação de pedido do Luna (`pedidos/novo:1003`,
  `frente-caixa:1588`), que chamam o Google direto para autopreencher endereço a partir do CEP.
