# Relatório — Task 1: regra pura de reconciliação

## Implementação

- Adicionado `src/lib/route-stop-reconciliation.ts` com identidade estável via `getStopIdentityKey`, validação de identidade/ordem, detecção de conflito estrutural, rebase de plano sobre a versão atual preservando campos operacionais, atualização por identidade e limpeza de flags.
- Adicionado `scripts/verify-route-stop-reconciliation.ts` com a reprodução determinística da concorrência entre edição administrativa e execução de entregas.
- Atualizado `src/lib/route-change-tracker.ts` para detectar, agrupar e marcar mudanças por `stopKey`, mantendo `stopId` para compatibilidade.
- Atualizado `src/lib/types.ts` com `stopKey?: string` nas mudanças serializadas da notificação.

## Evidência TDD

1. RED por resolução: `npx tsx scripts/verify-route-stop-reconciliation.ts` falhou com `Cannot find module '../src/lib/route-stop-reconciliation'`.
2. RED comportamental após esqueleto mínimo de exports: o mesmo comando falhou em `rebasePlannedStops` com `Error: Not implemented`.
3. GREEN após a implementação: o mesmo comando terminou com código 0 e imprimiu `OK: reconciliação preserva execução e rejeita conflitos estruturais.`

## Testes e verificações

- `npx tsx scripts/verify-route-stop-reconciliation.ts`: PASS (código 0).
- `npx tsc --noEmit --project tsconfig.task1.json` (configuração temporária incluindo somente os arquivos da tarefa): PASS (código 0).
- `npm run typecheck`: FAIL (código 2) por erros globais preexistentes fora dos arquivos tocados, incluindo scripts de migração/reparo, páginas administrativas, componentes e módulos Firebase já documentados no plano. Nenhum erro foi reportado nos arquivos da Task 1.
- `git diff --check`: PASS (código 0).

## Self-review

- A sequência base/atual é validada por identidade estável e divergência estrutural lança `RouteStructureConflictError`.
- Campos operacionais são sempre tomados da versão atual; flags administrativos transitórias não são reaplicadas.
- Atualização e localização de parada não dependem de índice e parada ausente lança `RouteStopNotFoundError`.
- `stopId` existente permanece no formato compatível e `stopKey` é opcional.

## Preocupações

O typecheck global permanece vermelho por falhas anteriores e fora do escopo desta tarefa; o typecheck isolado dos arquivos alterados está verde. Não foram feitas refatorações nos fluxos de UI.

## Fix round 1

- Ajustada a preservação de `notes` para ocorrer somente quando o estado atual é terminal (`completed` ou `failed`). Estados não terminais, como `pending`, aceitam a nota planejada pelo administrador.
- Em `scripts/verify-route-stop-reconciliation.ts`, adicionada uma asserção que exige que a nota administrativa substitua a nota atual de uma parada `pending`.
- RED: `npx tsx scripts/verify-route-stop-reconciliation.ts` falhou com `actual: 'Nota atual'` e `expected: 'Nota administrativa'`.
- GREEN: o mesmo comando terminou com código 0 e imprimiu `OK: reconciliação preserva execução e rejeita conflitos estruturais.`
- Typecheck tocado: `npx tsc --noEmit --project tsconfig.task1.json` terminou com código 0 (configuração temporária somente com os arquivos da tarefa).
