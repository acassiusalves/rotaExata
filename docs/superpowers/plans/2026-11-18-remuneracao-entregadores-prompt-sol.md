# Prompt para GPT Sol

Copiar para a sessão de implementação quando autorizada.

```text
Use GPT Sol e Superpowers executing-plans para implementar a remuneração do RotaExata diretamente no Supabase, conforme o plano de 18/11/2026. Requisito confirmado: ao concluir a rota elegível, o entregador vê no app um valor a conferir. Aprovação e registro de baixa são etapas financeiras posteriores.

Antes de editar leia, nesta ordem:
1. AGENTS.md da sessão e /Users/acassiusalves/.codex/RTK.md.
2. /Users/acassiusalves/rotaExata/docs/superpowers/specs/2026-11-18-remuneracao-entregadores-analise.md
3. /Users/acassiusalves/rotaExata/docs/superpowers/plans/2026-11-18-remuneracao-entregadores.md
4. /Users/acassiusalves/.codex/worktrees/130c/luna/docs/superpowers/specs/2026-11-18-lunna-supabase-platform-design.md

RotaExata: /Users/acassiusalves/rotaExata (físico /Volumes/SanDisk SSD/GitHub/rotaExata), remote https://github.com/acassiusalves/rotaExata.git. Checkout da análise main@0d633a6429f73d72c3abc74868c77c3672ef9d60, base publicada origin/main@a62579ac9eafd6ca7a9022388085cbc3999fafab. Atualize refs e crie worktree isolada a partir da base atual, sugestão codex/remuneracao-entregadores-supabase. Leve os três documentos locais para a worktree caso ainda não constem no Git.

Retome na etapa 1. O desenho da plataforma Luna apontava o projeto rjmrndqmzgcxpclnqvgv e a branch codex/supabase-platform-migration, verificada em 39f1dcd62950bf85d77fd7394b0561dbfc9b5f11 na worktree 130c. Verifique o estado aplicado, o proprietário das migrations compartilhadas e o diretório/identidades reais antes de vincular dados. Parta de platform_profiles, legacy_identities e platform_resolve_actor. Preserve a sessão Supabase da própria origem da PWA. Contas e contratos de login pertencem à plataforma. Desenvolva sobre instância local e emuladores; o cliente mantém Next/Vercel.

Implemente regras versionadas, cálculo de centavos, principal único por rota, itens, ajustes, auditoria, RLS e extrato Realtime no Supabase. Onde as entregas ainda estão no Firestore use adaptador transitório autenticado, inbox durável no Postgres, retries com a mesma chave, revisão e reconciliação. Faça a prévia e a emissão com o mesmo motor confiável. Aplique comandos financeiros em transação e valide a sessão, a permissão, o dono e a revisão. Corte com escritor único, reconciliação e reversão ensaiada. A retirada posterior da ponte depende da migração das rotas no programa da plataforma.

Preserve os 374 pagamentos históricos e seus IDs de origem. Os 93 sem UID, a versão 2 sem snapshot e as 536 rotas completed + 69 autoencerradas sem crédito precisam de conferência. Não atribua pelo nome/e-mail ou motorista atual nem gere retroativos automaticamente. Progrida nas tarefas independentes enquanto os responsáveis resolvem exceções tarifárias. Antes de escrever testes Android, explore a PWA no ARTEMIS conforme AGENTS.md.

Registre dados sintéticos, testes SQL/RLS, segurança por ator, recuperação de evento, totais e telas realmente homologadas. Confirme o alvo de todo comando CLI antes do uso. A passagem de homologação local para infraestrutura compartilhada, importação real, merge, deploy, corte de Auth/financeiro e ativação de crédito exige autorização específica. Apresente a prévia e a reconciliação antes dessas operações.
```
