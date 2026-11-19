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

## Staging no projeto compartilhado

As quatro migrations constam no histórico do projeto Sistema Lunna. O escopo `e82fdc1f-e12a-42ea-9429-82a1bfec172e` recebeu 374 documentos privados em oito lotes, com ID de execução `62f1a57c-f8d7-4a5e-9040-6d779b7c99d4`. A conciliação comparou ID, revisão, fingerprint, original e candidato em todos os documentos e encontrou zero divergências. A repetição reconheceu 374 documentos e criou zero. A leitura da origem após o staging, às 19:44:27 UTC, encontrou zero inclusões, alterações ou remoções.

Os registros preservados somam R$ 28.667,00 pendentes e R$ 23,00 aprovados. Todos os 374 carregam a lacuna do snapshot original da regra. O valor financeiro ainda exige conferência. O manifesto tem fingerprint `713485d63ee58a3885cb35527c5d11f236f465afe6c82fe5e186f1635be215ff`.

O escopo tem zero membros, zero lançamentos, zero linhas de extrato e zero eventos de origem. Captura, emissão, comandos e visibilidade permanecem desligados. O diretório canônico verificado nesse ponto tinha zero perfis e zero vínculos. A promoção depende da prova de quem prestou o serviço e da reconciliação dos valores em revisão.

## Verificações e limites

Foram executados 80 testes da aplicação, 19 das Cloud Functions, 14 das Firestore Rules e cinco suítes SQL. A aplicação compilou no modo Vercel com variáveis sintéticas. O typecheck global retornou 84 diagnósticos que já existiam na base. O ensaio SQL usou a estrutura Auth efetiva do GoTrue, o contrato mínimo do vínculo CRM e a migration do diretório de plataforma. O histórico completo do owner tem uma versão CRM duplicada e exige tratamento em sua frente.

A autoria em Cloud Functions com a conta Google dedicada exige verificação no ambiente de destino antes da captura. A interface web em viewport móvel e o ensaio da API operacional são evidências locais. O corte de Auth da PWA inteira exige validar uploads, presença, notificações, perfil, chamados e a jornada operacional com uma única sessão canônica. O ensaio físico depende de aparelho Android autorizado.

## Fechamento da revisão e da interface

Uma revisão final com GPT Astra identificou onze pontos críticos ou importantes. O GPT Sol corrigiu a autorização dos escritores de rotas, a separação entre staging e promoção, a integridade do manifesto, a distância não calculada, a data do encerramento administrativo, a retenção do pagamento após divergência da fonte, a referência e a apuração no extrato, o MFA, o ajuste global, a precisão dos recibos e o preflight OIDC. As regressões passaram após a correção. A identidade Google efetiva ainda depende do ensaio publicado.

O navegador local confirmou a rota sintética `FILA-LOCAL` como **Em apuração** para o titular. A segunda conta recebeu um extrato vazio, sem essa rota. O cancelamento do MFA foi conferido após a resposta 204 de logout: token removido e recarregamento na tela de entrada. Os ensaios foram feitos no Chrome com viewport móvel e contas sintéticas.

Dois achados menores foram adiados: a atualização automática volta à primeira página da paginação; o contador no singular ainda usa o plural de “lançamentos”.

O verificador de segurança do Supabase confirmou as doze tabelas privadas com RLS e sem acesso direto. Seus avisos informativos de RLS sem política são intencionais: o acesso ocorre pelas RPCs de servidor. As quatorze RPCs públicas do módulo negam EXECUTE a anon e authenticated e fixam search_path. O alerta de proteção contra senhas vazadas já existia antes desta migração e pertence à configuração geral de Auth. [Referência dos avisos](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

A entrega está preservada nas branches locais `codex/remuneracao-entregadores-supabase` (RotaExata) e `codex/remuneracao-entregadores-supabase-db` (Luna). O código da aplicação e os gatilhos não foram publicados; o banco compartilhado recebeu somente as quatro migrations e o staging privado descritos neste relatório. A conclusão integral da etapa 8 aguarda os critérios de corte registrados no runbook.

## PWA com sessão nativa

No Chrome em viewport móvel, um motorista sintético entrou por `/login`, voltou à rota original, iniciou, registrou a entrega com um comprovante do Storage emulado, reeditou a observação e concluiu. A rota apareceu no histórico. A mesma conclusão gravada pelo navegador gerou prova de servidor e um envelope processado pelo inbox do Supabase local. A repetição foi identificada como duplicata. Pelo menu da PWA, o motorista abriu Meus ganhos e voltou às rotas com **uma única autenticação de senha**. O lançamento apareceu a conferir com **R$ 37,00**. O passo de ponte usou a emissão local com a revisão da rota desse ensaio.

O painel de contas usou a sessão Supabase do operador. O JWT antigo recebeu 401 imediatamente após revogação. O motorista bloqueado teve o acesso operacional recusado, inclusive depois de entrar de novo, e a reativação restaurou o acesso. Uma senha rejeitada pelo Auth preservou a exigência de troca. A troca bem-sucedida removeu a exigência e permitiu o novo login. O ensaio de recuperação PKCE e o reenvio de confirmação foram verificados no Mailpit sintético. O teste passou pelo túnel local da VM e preservou o callback emitido pelo GoTrue. A senha sintética foi restaurada e a conta de teste de confirmação removida.

O Firebase Messaging permanece como transporte. Entrega de push em aparelho, regras do Storage ativo, release do PWA, onboarding real, captura Eventarc e ponte OIDC de produção requerem evidência no destino. A homologação web usou os emuladores e não validou instalação Android.


O corte do Storage foi composto sobre uma cópia da release ativa. No emulador, tokens Firebase de dois motoristas sintéticos perderam leitura e escrita no caminho de comprovantes. O operador autenticado manteve acesso válido. O emulador recusou acesso anônimo, MIME incompatível e arquivo no limite de 5 MiB. O acesso administrativo de servidor funcionou e o rollback restaurou o acesso da coorte.
