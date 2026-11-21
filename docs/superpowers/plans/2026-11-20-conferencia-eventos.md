# Conferencia de eventos de ganhos Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.
**Goal:** disponibilizar conferencia individual auditada com previa e emissao apenas pendente.
**Architecture:** BFF recalcula tarifa e confere Source; SQL serializa decisao contra worker e grava recibo imutavel, sem mudar prova original.
**Tech Stack:** Next.js, TypeScript, Zod, Firebase Admin, Supabase/PostgreSQL.
**Spec:** docs/superpowers/specs/2026-11-20-conferencia-eventos-design.md
## Global Constraints
Preservar Source/provas/374 historicos; nao criar pagamentos ou decisoes reais automaticamente. Reusar login/papeis/MFA, tarifa e writer existentes. Sem push para repositorio publico.
## Review Focus
- Previa e confirmacao com Source, ator, tarifa ou corpo diferentes devem falhar; distinguir E/W/F para nao bloquear atualizacoes operacionais legitimas.
- Retry autenticado apos ACK perdido devolve recibo mesmo com evento fora da fila.
- Corrida worker/revisao, legado e dois operadores nunca emitem dois lancamentos.
- Falta de confirmacao difere de resultado divergente; nao aceitar lacuna inventada.
- UF conflitante ou de destino diferente nao deve corrigir enquadramento silenciosamente.
## Task 1: contrato e persistencia financeira
Files: owner /Users/acassiusalves/.codex/worktrees/remuneracao-supabase-db/luna/supabase/migrations; testes SQL no mesmo owner; Rota src/lib/earnings/source-review-contract.ts, src/lib/server/earnings/source-reviews.ts, src/app/api/financeiro/revisoes/route.ts.
Consumes: motor normalizeRouteFacts/normalizeRule/calculateEarnings; authorize_actor, route_lock, sync_statement e SourceState.
Produces: GET lista/detalhe, POST previa, PATCH confirmar, recibo privado e earning pending.
- [ ] Criar teste RED para UF comprovada e atestacao das lacunas existentes; provar negativas do spec e privacidade do payload.
- [ ] Criar migration com Supabase CLI, implementar RPCs read/context/receipt/confirm usando contratos definidos no brief e authorizer atual.
- [ ] Implementar contrato e BFF incluindo digest de entradas/fatos/prova/ator/regra e lookup de replay antes de ler Source.
- [ ] Executar testes reais PostgreSQL descartavel de perfil/MFA/escopo, EXECUTE/RLS, CAS, mudanca de regra, dois operadores, worker e dedupe legado; regressao de emissao/extrato/comandos.
## Task 2: painel de conferencia
Files: src/components/earnings/source-review-panel.tsx, src/components/earnings/period-view.tsx, erros do earnings-shell/client se necessarios.
Consumes: contrato da Task 1.
Produces: lista/detalhe, formulario restrito com evidencias, previa e botao Gerar valor a conferir.
- [ ] Provar em teste o contrato da UI com os dois tipos, restricoes e erros de revisao obsoleta; explorar UI antes de escrever teste de dispositivo.
- [ ] Implementar componente com estado limpo ao trocar evento, detalhes e total antes da confirmacao; termos financeiros claros sem detalhes de infraestrutura.
- [ ] Rodar suite do app, typecheck comparativo e build exato do commit; entregar pacote para revisao independente com provas RED/GREEN.
## Task 3: publicacao e verificacao
- [ ] Revisar SQL/BFF/UI e corrigir achados C/I em lote focado.
- [ ] Conferir projeto rjmrndqmzgcxpclnqvgv, migration remota atual e hashes; aplicar somente migration nova autorizada, preservar SourceAuthority e configuracao global.
- [ ] Empacotar commit limpo privado; staging producao, checks candidatos, promover mesmo deployment e checks publicos.
- [ ] Validar lista/detalhe autenticados para os dois casos reais sem confirmar decisoes; conferir 374 historicos e nenhum ganho real novo.
