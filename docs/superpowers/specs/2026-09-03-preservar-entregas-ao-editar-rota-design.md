# Preservação do estado de entregas durante alterações de rota

## Contexto

O administrador pode abrir uma rota enquanto o motorista continua executando as entregas. Os dois clientes escrevem no mesmo documento `routes/{routeId}` e o estado operacional de cada entrega (`deliveryStatus`, `completedAt`, `payments`, fotos e dados de falha) fica embutido nos objetos do array `stops`.

Hoje, a tela administrativa mantém uma cópia local do array. Quando remove, exclui, reordena ou aplica edições, ela substitui `stops` por essa cópia. Se o motorista tiver finalizado uma parada depois que a tela administrativa foi carregada, a gravação administrativa remove os campos recém-gravados. O app do motorista escuta o documento em tempo real e passa a exibir a entrega como pendente novamente.

O fluxo inverso também é inseguro: a confirmação do motorista copia o array local, altera uma posição por índice e substitui o array inteiro. Uma remoção administrativa concorrente pode ser desfeita por essa gravação.

## Objetivo

Garantir que alterações estruturais da rota e atualizações operacionais do motorista possam ocorrer concorrentemente sem perda de dados, ressurreição de paradas removidas ou incremento duplicado do contador de entregas.

## Decisão de arquitetura

A correção usará transações do Firestore e identidade estável de parada. Antes de escrever, cada transação lerá a versão mais recente do documento e aplicará a intenção do usuário sobre essa versão.

As regras serão:

1. Alterações administrativas usam uma reconciliação de três versões: base exibida ao administrador, plano editado e versão atual do Firestore.
2. Se a estrutura atual do Firestore ainda for igual à base, o plano é reaplicado sobre os objetos atuais e preserva os campos operacionais mais recentes.
3. Se outra operação também tiver alterado a estrutura, a transação aborta com conflito e solicita recarga, sem escolher silenciosamente qual alteração vencerá.
4. Confirmações do motorista localizam a parada por identidade, nunca por índice.
5. Se a parada já tiver sido removida, a confirmação aborta e não a recria.
6. O contador `totalDeliveries` é incrementado na mesma transação da rota somente quando ocorre uma transição real de status não concluído para `completed`.
7. O reconhecimento de mudanças limpa os indicadores sobre a versão atual do array, também dentro de transação.

## Identidade de parada

A correção reutilizará `getStopIdentityKey` de `src/lib/route-stop-utils.ts`, com a precedência existente:

1. `orderNumber`
2. `pointCode`
3. `id`
4. `placeId`
5. coordenadas e endereço
6. endereço

Operações que não consigam calcular identidade estável devem falhar antes de escrever.

## Campos operacionais protegidos

Ao reaplicar um plano administrativo, os valores mais recentes destes campos pertencem ao fluxo operacional e não podem ser substituídos por uma cópia antiga:

- `deliveryStatus`
- `arrivedAt`
- `completedAt`
- `photoUrl`
- `signatureUrl`
- `failureReason`
- `wentToLocation`
- `attemptPhotoUrl`
- `payments`
- `deliveredItemIds`
- `reconciled`
- `reconciledAt`
- `reconciledBy`
- `reconciledMethod`
- `aiExtractedValue`
- `editedByDriver`
- `editedAt`

Quando a versão atual já possuir `deliveryStatus`, `notes` também será preservado, porque a confirmação de entrega usa esse campo para a observação do motorista. Em paradas ainda não executadas, o administrador continua podendo editar `notes`.

Os indicadores `wasModified`, `modifiedAt`, `modificationType` e `originalSequence` continuam pertencendo ao sistema de notificação de mudanças e são recalculados a partir da diferença efetivamente persistida.

## Componentes

### Reconciliação pura

Um novo módulo `src/lib/route-stop-reconciliation.ts` conterá funções puras para:

- validar e comparar a sequência de identidades;
- reaplicar um plano administrativo sobre a versão atual;
- atualizar uma parada atual por identidade;
- limpar indicadores de mudança;
- classificar a transição de uma confirmação como primeira conclusão ou edição.

Essas funções serão verificadas sem conexão com o Firebase por um script baseado em `node:assert/strict`.

### Gateway transacional

Um novo módulo `src/lib/firebase/route-stop-mutations.ts` será a única fronteira usada pelos fluxos ativos para substituir `routes.stops` em documentos já existentes.

Ele oferecerá três operações:

- `saveExistingRoutePlansAtomically`: persiste uma ou mais alterações administrativas, com todas as leituras antes das escritas;
- `confirmRouteStopAtomically`: aplica o resultado da entrega e o incremento idempotente do motorista;
- `acknowledgeRouteChangesAtomically`: confirma a notificação e limpa flags sobre os stops atuais.

As notificações push continuam sendo enviadas depois do commit. A falha de notificação não reverte uma alteração de rota já persistida.

### Telas administrativas

As duas páginas ativas serão migradas:

- `src/app/(admin)/routes/[routeId]/acompanhar/page.tsx`
- `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx`

Serão cobertos os caminhos de remover para não atribuídos, excluir permanentemente, salvar rota existente e aplicar edições pendentes. Transferências entre rotas existentes usarão uma única chamada transacional com os dois planos.

A página legada `src/app/(admin)/routes/organize/acompanhar/page.tsx` redireciona rotas existentes para as URLs ativas e não será ampliada nesta correção.

### Aplicativo do motorista

`src/app/(driver)/my-routes/[id]/page.tsx` passará a identificar a parada selecionada pelo próprio objeto/identidade. Uploads continuam ocorrendo antes da transação; a URL resultante entra no patch atômico. Se a parada desaparecer durante o upload, a tela informa o conflito e não altera a rota.

O log de atividade e a sincronização Luna continuam depois do commit e usam a parada retornada pela transação. Edições de uma entrega já finalizada podem gerar log/notificação de edição, mas não incrementam novamente `totalDeliveries`.

## Recuperação de dados

Depois da implantação, `scripts/update-driver-deliveries.ts` será tornado seguro para auditoria: simulação por padrão e escrita somente com `--apply`. Ele recalculará os contadores a partir do estado atual das rotas.

Pagamentos já apagados não serão reconstruídos por inferência. A recuperação desses valores exige backup, Point-in-Time Recovery do Firestore ou outra fonte que contenha o valor original.

## Tratamento de erros

- `RouteStructureConflictError`: a estrutura mudou desde que o administrador começou a editar. A interface mantém a operação sem sucesso, recarrega a rota e pede que o usuário repita a alteração.
- `RouteStopNotFoundError`: a parada desapareceu antes da confirmação do motorista. A interface fecha o diálogo, recarrega a rota e informa que a parada foi removida ou movida.
- Documento inexistente ou motorista divergente: a operação falha sem escrita.
- Falha de cálculo de rota: mantém-se o comportamento atual de salvar somente os stops quando a estrutura puder ser persistida com segurança; métricas antigas não são apresentadas como recalculadas.

## Critérios de aceite

1. Com administrador e motorista conectados simultaneamente, finalizar A e remover B mantém em A status, horário, pagamentos, fotos, itens entregues e observações.
2. O comportamento anterior funciona em rota avulsa e em rota de serviço Luna.
3. Reordenar ou aplicar edições pendentes preserva os campos operacionais pelo identificador da parada.
4. Confirmar uma parada removida concorrentemente falha sem recriá-la.
5. Editar ou reenviar uma entrega `completed` não incrementa `totalDeliveries` novamente.
6. Confirmar o recebimento de alterações não desfaz uma alteração administrativa mais recente.
7. A notificação de alteração usa a diferença entre a versão lida na transação e a versão efetivamente gravada.
8. O script de reparo não escreve sem `--apply`.

## Fora de escopo

- Migrar execuções de entrega para uma subcoleção separada.
- Reconstruir automaticamente pagamentos cujo valor original não esteja disponível.
- Refatorar integralmente as duas páginas administrativas extensas.
- Alterar regras do Firestore ou fazer mudança incompatível no formato das notificações push. Um `stopKey` opcional pode ser acrescentado para alinhar a detecção à identidade estável sem quebrar consumidores existentes.
