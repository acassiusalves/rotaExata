# Ganhos do motorista na visualização de suporte

## Objetivo e decisão autorizada

O usuário autorizou restaurar a visualização de suporte em Motoristas, compatível com Supabase, e verificar os R$ 78 do Rafael. A implementação será uma consulta administrativa identificada, sem impersonação. A publicação e a verificação fazem parte da continuação autorizada.

## Comportamento

- Administrador com acesso atual a Motoristas e Pagamentos encontra “Ver ganhos (suporte)” no menu de cada motorista. Abrir um modal preserva a sessão e o shell administrativo.
- Cabeçalho “Visualização de suporte — <nome>”, indicação de somente leitura e acesso registrado. Exigir justificativa de 1 a 1000 caracteres. Mostrar competência, filtro de situação, paginação e atualização manual.
- Extrair uma apresentação compartilhada de totais, andamento, rotas, situações e componentes da tela atual do entregador. O app do entregador mantém sua autenticação, consulta própria, realtime e atualização periódica. Suporte não ganha ações financeiras nem de rota.
- Selecionar outro motorista, fechar, trocar competência/filtro ou perder autorização cancela a consulta e elimina dados antigos. Respostas atrasadas não podem exibir extrato de outro alvo/período.
- O servidor resolve o ID de origem da linha de Motoristas pelo vínculo canônico existente dentro do escopo/projeto autoritativo. Nunca resolver por nome/e-mail, aceitar actor/escopo do cliente, provisionar vínculo ou produzir token de motorista.
- Cada leitura bem-sucedida tem auditoria com administrador, sessão, alvo, competência e justificativa. Permissões permanecem admin-only, como a inspeção financeira existente; indisponibilidade de autoridade falha fechada.

## Contrato e limites

POST /api/financeiro/motoristas/extrato recebe sourceUid, month YYYY-MM, status opcional, par de cursores after/afterId, limit 1..100 e reason. Corpo estrito; resposta privada sem cache. Actor verificado no servidor, com permissões atuais drivers e financeiro e MFA financeiro existentes.

RPC aditiva de suporte recebe os parâmetros de actor internos, Source UID e período completo. Usa scopes.source_project e driver_for_source, autoriza antes de revelar o alvo e preserva o contrato da RPC rota_earnings_inspect_statement existente. Pode reutilizar sua autorização/auditoria e statement_period para a página solicitada. EXECUTE somente service_role, search_path fixo, sem novas permissões de tabela. Todas as páginas e filtros devem funcionar, não limitar silenciosamente aos primeiros 50 registros.

Não alterar Rules, Auth global, PWA, bridge, tarifas, lançamentos, aprovações ou pagamentos. Não reabrir Firebase SDK comercial nem login legado. Não contatar Rafael ou acessar sua credencial. A validação provará a visualização administrativa do mesmo extrato; não será apresentada como observação no aparelho ou na sessão pessoal do Rafael.

## Aceite

Testes significativos de mapeamento, autorização, auditoria, período/paginação e contrato HTTP; regressões existentes passando; TypeScript sem novos diagnósticos (baseline tem 70). Sem teste móvel escrito: não há dispositivo ARTEMIS disponível. Build imutável revisado, SQL aditiva aplicada uma vez, mesma candidata promovida. Em produção, Motoristas → Rafael → suporte mostra LNS-0424-B, R$ 78 A conferir, entregas R$ 70 + bônus Lunna R$ 8. Confirmar auditoria e ausência de alteração no lançamento.
