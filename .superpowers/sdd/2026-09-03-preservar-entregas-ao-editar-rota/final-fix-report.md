# Relatório da onda final de correções

Data: 2026-09-03
Base: `2b218555350b284b60a8859a6cc76010c561f8de`
Status: **DONE_WITH_CONCERNS** — os 14 achados foram corrigidos e os gates do escopo passam; o typecheck global continua com 88 diagnósticos preexistentes fora dos arquivos tocados e os testes externos proibidos não foram executados.

## Resultado executivo

- Os 4 Critical, 6 Important e 4 Minor estão fechados em código e cobertos por harness comportamental, verificação estrutural ou ambos.
- As substituições de `routes.stops` em documentos existentes continuam centralizadas no gateway transacional: a auditoria AST encontrou zero candidato de escrita direta nos três consumidores ativos.
- A página admin direta agora aplica rotas existentes, rotas novas e o vínculo do serviço em uma única transação; nenhuma alteração de state/baseline acontece antes do commit.
- Transferências deixaram de ser inferidas globalmente por identidade e agora exigem intenção explícita, validada e consumida uma única vez.
- O reparador usa lotes de no máximo 450 writes e valores absolutos; a simulação cria zero batches/commits.
- Não houve acesso a produção, Firebase, Storage ou Lunna, e `scripts/update-driver-deliveries.ts` não foi executado.

## Mapeamento dos achados

### Critical

1. **Edição que muda identidade perdia execução**
   - `PlannedRouteStop` recebeu `_originalStopKey` transitório. `rebasePlannedStops` localiza o snapshot latest por essa linhagem, valida a identidade final e remove o campo antes de devolver/persistir.
   - Os dois formulários admin só acrescentam linhagem em rota já persistida; rotas ainda locais não carregam o marcador para caminhos de criação direta.
   - Cobertura: todos os fallbacks de precedência (`orderNumber`, `pointCode`, `id`, `placeId`, coordenadas+endereço e endereço), colisão depois do rename, preservação de status/pagamento/foto/notas e ausência do marcador no resultado e no documento em memória.
   - Arquivos: `src/lib/route-stop-reconciliation.ts`, `src/lib/firebase/route-stop-mutations.ts`, as duas páginas admin e os dois harnesses.

2. **Remoção direta usava objeto local obsoleto**
   - Os dois handlers da página direta obtêm a parada exclusivamente de `result.removedStops`, usando a identidade original, antes de atualizar não alocados.
   - `findSingleStopByIdentity` falha fechado em identidade ausente, resultado ausente ou ambíguo; a mesma defesa foi aplicada à página Luna relacionada.
   - Cobertura: versão latest é selecionada; zero ou duas correspondências lançam `RouteStructureConflictError`; o harness do gateway confirma que `removedStops` contém execução latest.

3. **Mixed apply direto criava/vinculava antes de validar existentes**
   - IDs de novas rotas são pré-alocados com `doc(collection(...)).id`; existentes, novas e `serviceLink` entram em uma única chamada de `saveRoutePlanBatchAtomically`.
   - State, baselines e IDs locais são alterados somente depois do retorno confirmado.
   - Cobertura comportamental: movimento existente→nova preserva falha/foto latest; baseline concorrente deixa origem, nova rota e `services.routeIds` sem writes. Auditoria estrutural do handler confirma uma chamada ao batch e nenhum `addDoc`/`updateDoc`.

4. **Inferência `removedByIdentity` contaminava/clonava adições**
   - Removida a inferência global. `RoutePlanBatchInput.transferIntents` é extensão opcional e retrocompatível com `sourceRouteId`, `targetRouteId` e `stopKey`.
   - O gateway valida rotas distintas e presentes, exatamente uma remoção, exatamente uma adição, unicidade na origem/destino e consumo único por índice de destino.
   - Admin direta e Luna emitem intents nos movimentos imediatos e nos movimentos pendentes/mistos; `_movedFromRoute` preserva a origem inicial em movimentos encadeados.
   - Cobertura: adição independente de mesma chave não herda execução; one-to-many, intent duplicada, rota de origem/destino ausente e remoção/adição correspondente ausente falham sem writes; existente→existente e existente→nova preservam latest.

### Important

1. **Validação incompleta de identidades/IDs e dedupe silencioso**
   - `validateRoutePlanBatchInput` valida IDs não vazios/não duplicados, identidades computáveis/únicas nas bases, planos e novas rotas; o rebase valida o array latest.
   - `updateStopByIdentity` valida latest e o array resultante, cobrindo a confirmação do motorista.
   - `dedupeStops` foi removido dos arrays de persistência em edição, adição, drag, remoção, transferência, visualização pendente e mixed apply; colisão de destino agora aborta com mensagem, sem remover silenciosamente a origem.
   - Cobertura: IDs de rota vazios/duplicados, identidade planejada/nova ausente ou duplicada e latest do motorista ausente/duplicada.

2. **Semântica de `notes` terminal**
   - Para latest `completed`/`failed`, propriedade ausente apaga nota planejada obsoleta e `null` explícito permanece `null`; status não terminal continua aceitando edição administrativa.
   - Cobertura: ausência e `null` para ambos os status terminais, mais `pending` editável.

3. **Metadata/notificação separadas na página direta**
   - Despacho de draft envia status, motorista e `driverInfo` como `metadata` na mesma transação dos stops; reatribuição também inclui motorista/`driverInfo` no plano.
   - O resultado inclui `previousStatus?` e `previousDriverId?` para logs e expõe status/motorista efetivamente confirmados para a notificação pós-commit. Campos novos de saída são opcionais onde necessário para compatibilidade de tipo.
   - Metadata é sanitizada antes de calcular o resultado e antes da escrita; `driverId: undefined` agora preserva tanto o documento quanto o destinatário reportado.
   - Cobertura: metadata anterior/nova, resultado confirmado e documento persistido em memória.

4. **Batch ilimitado no reparador**
   - `commitDriverDeliveryUpdates` divide as diferenças em batches de até 450, grava `{ totalDeliveries: valorAbsoluto }` e não cria batch em dry-run.
   - Cobertura local sem credenciais: 0, 1, 450, 451 e 901 diferenças; dry-run com 501 diferenças e zero criação/commit.

5. **Rota direta vazia mantinha métricas antigas**
   - `resolveRoutePlanMetrics` retorna sempre polyline vazia, distância `0` e duração `0s` para plano vazio, mesmo se receber um cálculo obsoleto; ambas as páginas usam o helper no mixed apply.
   - Cobertura: vazio sem cálculo, vazio com cálculo stale e rota não vazia sem cálculo.

6. **`undefined` aceito no harness/rejeitado pelo SDK**
   - O adaptador em memória rejeita `undefined` recursivo. O gateway remove `undefined` recursivamente de stops, dados de rota e metadata, preservando `null` e objetos não planos (incluindo sentinelas/Timestamps).
   - Cobertura: harness rejeita documento inválido; `serviceCode`, `driverId`, campo aninhado e `notes` indefinidos são omitidos em rota existente/nova; `null` permanece; resultado e documento não divergem.

### Minor

1. **`wasPreviouslyFinalized` por truthiness**
   - A regra agora é estritamente `completed || failed`.
   - Cobertura: `arrived → completed` é primeira conclusão, incrementa uma vez e não recebe marca de edição de entrega finalizada.

2. **Acknowledgement não causal**
   - A UI ativa calcula um fingerprint determinístico de rota, motorista, mudanças e `createdAt`; a transação compara o fingerprint atual antes de qualquer write e lança `RouteNotificationConflictError` em mismatch.
   - O segundo argumento é opcional para preservar consumidores legados; a tela ativa sempre o envia.
   - Cobertura: token obsoleto faz somente duas leituras e zero writes; token exato reconhece; chamada legada continua funcional.

3. **Copy de conflito dizia “repita a remoção” fora desse contexto**
   - Update, apply e transferência da página direta receberam textos neutros/contextuais. O texto de remoção permaneceu apenas nos três handlers que realmente removem.
   - Auditoria textual confirmou ausência do padrão nos contextos de apply/reorder/transfer.

4. **Luna inflava `driversNotified` em falha**
   - `notifySavedRoutePlansAndCount` incrementa somente depois de `await notify` bem-sucedido, ignora não elegíveis e reporta falhas pelo callback sem inflar o toast.
   - Cobertura: uma notificação bem-sucedida, uma rejeitada e uma inelegível resultam em contagem `1` e erro associado somente à rejeitada.

## Evidência TDD — RED → GREEN

Todos os testes foram acrescentados antes da implementação correspondente. Os ciclos relevantes foram:

1. `npx tsx scripts/verify-route-stop-reconciliation.ts`
   - RED identidade: `orderNumber: status mais recente`; atual `pending`, esperado `completed`.
   - RED notas: `completed: ausência mais recente remove nota obsoleta`; a propriedade ainda existia.
   - RED seleção pós-commit: esperado `typeof findSingleStopByIdentity === 'function'`, atual `undefined`.
   - GREEN final: `OK: reconciliação preserva execução e rejeita conflitos estruturais.`

2. `npx tsx scripts/verify-route-stop-mutations.ts`
   - RED finalização: `arrived → completed` retornava `wasPreviouslyFinalized: true`, esperado `false`.
   - RED transferência: adição independente de mesma chave recebia `completed`, esperado `undefined`.
   - RED causalidade: `Missing expected rejection` para fingerprint obsoleto.
   - RED métricas/helper: `resolveRoutePlanMetrics`/`notifySavedRoutePlansAndCount` ainda eram `undefined` durante seus respectivos ciclos.
   - RED rota vazia stale: retornava `{ stale-polyline, 999, 999s }`, esperado `{ '', 0, '0s' }`.
   - RED sanitização: o harness passou a acusar `Firestore não aceita undefined em documento.serviceCode`; depois, `driverId: undefined` produzia resultado `undefined` enquanto o documento mantinha `driver-existing`.
   - GREEN final: `OK: gateway transacional preserva as garantias centrais.`

3. Mixed apply direto — auditoria da base `2b21855` antes da alteração:

   ```text
   BASE_HANDLE_APPLY_CALLS=addDoc,updateDoc,saveExistingRoutePlansAtomically
   exit 1
   ```

   GREEN atual nas duas páginas:

   ```text
   .../[routeId]/acompanhar/page.tsx: saveRoutePlanBatchAtomically
   .../service/[serviceId]/acompanhar/page.tsx: saveRoutePlanBatchAtomically
   exit 0
   ```

4. `npx tsx scripts/verify-driver-delivery-repair.ts`
   - RED válido: módulo puro `./driver-delivery-repair` inexistente (`MODULE_NOT_FOUND`). Um primeiro ensaio do verifier usou top-level await incompatível com a saída CJS e foi corrigido antes de ser aceito como RED de produto.
   - GREEN final: `OK: reparo divide lotes em até 450 writes e dry-run não cria commits.`

Ao ampliar os casos negativos de transferência, uma asserção inicialmente exigia zero leituras para um conflito que só pode ser provado após ler as rotas. A asserção foi corrigida para a regra real — zero writes — e o caso então passou sem mudança de produção.

## Gates finais

Executados novamente após os commits funcionais:

```text
npx tsx scripts/verify-route-stop-reconciliation.ts
exit 0 — OK: reconciliação preserva execução e rejeita conflitos estruturais.

npx tsx scripts/verify-route-stop-mutations.ts
exit 0 — OK: gateway transacional preserva as garantias centrais.

npx tsx scripts/verify-driver-delivery-repair.ts
exit 0 — OK: reparo divide lotes em até 450 writes e dry-run não cria commits.

npx eslint <10 arquivos tocados>
exit 0 — 0 erros; 6 warnings react-hooks/exhaustive-deps preexistentes
  admin direta: 3; admin serviço: 2; motorista: 1.

npm run typecheck
exit 1 — TOTAL_ERRORS=88; todos fora do escopo tocado.

filtro exato dos 10 arquivos TypeScript/TSX tocados
TOUCHED_FILE_ERRORS=0.

git diff --check / git diff --cached --check
exit 0 — sem saída.
```

Os 88 diagnósticos globais coincidem em quantidade com o baseline já registrado no relatório da Task 7. Eles permanecem em scripts/páginas/componentes fora deste diff; nenhum arquivo tocado aparece no filtro exato.

## Auditorias de identidade e writes

Auditoria AST read-only dos três consumidores:

```text
admin direta: direct_route_stops_write_candidates=0; gateway_calls=12
admin serviço: direct_route_stops_write_candidates=0; gateway_calls=12
motorista: direct_route_stops_write_candidates=0; gateway_calls=2
TOTAL_DIRECT_ROUTE_STOPS_WRITE_CANDIDATES=0
```

Auditoria negativa com `rg` para `removedByIdentity`, `plannedStops: dedupeStops`, `dedupeStops(removeStopWithSameIdentity`, alvo do motorista por índice e source de drag por índice: zero ocorrências (exit 1 esperado do `rg`).

Auditoria de linhagem: `_originalStopKey` aparece somente no tipo/regra de reconciliação, nos dois pontos de montagem do plano admin e nos testes. O harness confirma que não aparece nem no `SavedRoutePlan` nem no documento gravado em memória.

Revisão de callers:

- **Admin direta:** cleanup automático, edições/add/drag inline, despacho de draft, reatribuição, duas remoções para não alocados, exclusão, transferência imediata e mixed apply usam baseline + resultado confirmado. O mixed apply não contém `addDoc`/`updateDoc`; copies de conflito foram conferidas por contexto.
- **Admin Luna:** os 12 callers continuam compatíveis; identidade editada usa linhagem, movimentos imediatos/pendentes enviam intents, novas rotas usam o batch, remoções são fail-closed e o contador de notificações mede somente sucesso.
- **Motorista:** confirmação continua por objeto/identidade latest; acknowledgement envia fingerprint da notificação renderizada. A extensão do acknowledgement permanece opcional para compatibilidade.

## Commits e arquivos

- `1a767ed` — `fix: endurecer mutacoes atomicas de paradas`
  - `src/lib/route-stop-reconciliation.ts`
  - `src/lib/firebase/route-stop-mutations.ts`
  - `src/app/(admin)/routes/[routeId]/acompanhar/page.tsx`
  - `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx`
  - `src/app/(driver)/my-routes/[id]/page.tsx`
  - `scripts/verify-route-stop-reconciliation.ts`
  - `scripts/verify-route-stop-mutations.ts`
- `6ef8204` — `fix: limitar batches do reparo de entregas`
  - `scripts/driver-delivery-repair.ts`
  - `scripts/verify-driver-delivery-repair.ts`
  - `scripts/update-driver-deliveries.ts`
- O commit documental que contém este relatório é criado no fechamento da onda.

## Riscos, concerns e itens não concluídos

- **Nenhum dos 14 achados permanece aberto.** Não há item funcional conhecido incompleto dentro do escopo autorizado.
- O typecheck global do repositório permanece vermelho com 88 diagnósticos preexistentes; o filtro exato de todos os arquivos tocados está limpo.
- Permanecem seis warnings preexistentes de dependências de hooks. Eles não foram alterados porque exigiriam uma refatoração fora dos 14 achados.
- Não houve teste contra Firestore real/emulador, Storage, Lunna, notificações reais ou duas sessões concorrentes. Essa validação externa não foi feita porque o trabalho proibiu acesso externo; os cenários foram exercitados pelo adaptador transacional local e pelas auditorias.
- O migrador/reparador real não foi iniciado. Apenas `scripts/verify-driver-delivery-repair.ts`, puro e sem credenciais, foi executado.
