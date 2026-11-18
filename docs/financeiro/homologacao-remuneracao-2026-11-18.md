# Homologação da remuneração em Supabase

## Resultado local em 18/11/2026

A jornada sintética usou Supabase Auth, PostgREST, Realtime e PostgreSQL 17 locais, com Firestore emulado. O motorista acessou a rota com a sessão Supabase, iniciou, confirmou uma entrega e encerrou. A API gravou a prova da prestação. A mesma revisão enviada duas vezes produziu um lançamento de **R$ 37,00 a conferir**. O operador aprovou e registrou a baixa. O titular viu os três estados e três eventos Realtime. A segunda conta tentou acessar a rota e recebeu 404. Ao consultar e assinar o lançamento de outra conta, recebeu zero linhas REST e zero eventos Realtime.

Na interface web local, o operador entrou pela conta Supabase, simulou R$ 38,00 com o exemplo de duas paradas e publicou a versão 1. Ao recarregar, a tela mostrou a versão vigente e os valores gravados. O extrato foi conferido no navegador em viewport móvel com duas contas sintéticas. O login de uma conta com TOTP exigiu o desafio antes do financeiro. O código inválido exibiu erro, o cancelamento encerrou a sessão e retirou o token do armazenamento, e o código válido liberou a consulta de regras.

As APIs operacionais de escrita foram ensaiadas com Firebase Auth e Firestore emulados. Chamadas anônimas e chamadas de motorista com um identificador de operador no corpo foram recusadas. A criação legítima atribuiu a autoria ao identificador do operador autenticado.

## Integridade do financeiro

- Duas publicações simultâneas com a mesma revisão esperada produziram uma versão e um conflito.
- Dois comandos concorrentes sobre um pagamento aprovado produziram um desfecho e um conflito. Quando uma exclusão da rota chegou primeiro, a baixa concorrente foi recusada e o valor aprovado permaneceu congelado em revisão.
- Ajustes de parada de R$ 5 para R$ 7, R$ 8 e R$ 8 registraram deltas de R$ 2 e R$ 1. O ajuste de total aparece no painel e no extrato com a diferença correspondente.
- A pausa da emissão preservou a inbox e o extrato confirmado. O recebimento continuou durável, e um trabalhador em andamento respeitou a pausa ao tentar concluir.
- A importação sintética gravou dois documentos no staging e confirmou o replay. A primeira promoção deixou ambos privados por falta de vínculo. Depois de inserir uma correspondência comprovada, promoveu uma linha e manteve a outra em revisão. A promoção ocorreu com a visibilidade desligada.

## Snapshot histórico

O dry-run do snapshot de origem de 18/11/2026 às 18:30:13.973649 UTC somou 374 documentos e **R$ 28.690,00 nos registros**. São 373 pendentes e um aprovado. Há 93 sem UID histórico, 114 casos cuja composição requer conferência e dez valores zerados na versão 2. O inventário encontrou 536 rotas concluídas e 69 autoencerradas sem documento. Essas rotas continuam sem lançamento. A regra legada ativa estava na versão 3.

## Verificações e limites

Foram executados 80 testes da aplicação, 19 das Cloud Functions, 14 das Firestore Rules e cinco suítes SQL. A aplicação compilou no modo Vercel com variáveis sintéticas. O typecheck global retornou 84 diagnósticos que já existiam na base. O ensaio SQL usou a estrutura Auth efetiva do GoTrue, o contrato mínimo do vínculo CRM e a migration do diretório de plataforma. O histórico completo do owner tem uma versão CRM duplicada e exige tratamento em sua frente.

A autoria em Cloud Functions com a conta Google dedicada exige verificação no ambiente de destino antes da captura. A interface web em viewport móvel e o ensaio da API operacional são evidências locais. O corte de Auth da PWA inteira exige validar uploads, presença, notificações, perfil, chamados e a jornada operacional com uma única sessão canônica. O ensaio físico depende de aparelho Android autorizado.
