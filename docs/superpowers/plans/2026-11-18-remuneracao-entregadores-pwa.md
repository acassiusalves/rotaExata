# Adendo de execução da PWA

Base Rota e42ea329. O financeiro, o staging e a cadeia SQL já homologados permanecem a referência.

1. Servir a PWA com a sessão canônica existente, inclusive MFA, e reutilizar a mesma sessão em Meus ganhos. O manifesto continua abrindo /my-routes. A fase operacional legada usa um caminho explícito enquanto o corte aguarda a troca da configuração.
2. Migrar as telas existentes para contratos HTTP tipados. Cobrir listagem e histórico, detalhes, confirmação e mídia, notificações, localização, presença, preferências, registro push e chamados. Usar escopo e vínculo do diretório, verificar titularidade na transação e manter os escritores administrativos atuais.
3. Compor as regras Firestore sobre a release ativa. Testar paridade de permissões dos consumidores compartilhados, build sem acesso remoto e jornada web autenticada com uma sessão. A habilitação das funções financeiras continua independente do login operacional.
4. Entregar diferença verificável, resultados e requisitos de configuração ao coordenador para publicar e testar com a configuração do destino. A validação Android depende de aparelho e exploração ARTEMIS.

## Segurança das contas

O painel operacional mantém a transição para `/driver/admin/accounts`. Os comandos de segurança usam a sessão Supabase do operador, com a mesma verificação de sessão, e-mail e MFA do financeiro. O servidor aplica a política de `/drivers` com os papéis admin, sócio e gestor como padrão e exige associação ao escopo. O motorista é identificado pelo vínculo da origem e pelo perfil do diretório.

Encerrar sessões, bloquear e exigir troca de senha revogam as sessões nativas. Reativar libera o acesso para autenticações novas. Cada comando compara a revisão do cadastro e usa um identificador de repetição, com auditoria transacional. Na troca própria, o servidor verifica a sessão, envia a senha ao Auth e remove a exigência em uma revisão correspondente somente quando o Auth confirma a alteração. Convite e exclusão legados ficam indisponíveis na interface para a coorte nativa.

## Corte do SDK Firebase

As Rules combinam a release compartilhada com as proteções da rota e o documento privado `rotaAuthTransition/driver`. Antes do corte, a ausência do documento ou o modo `firebase` mantém o SDK disponível. O modo `supabase` bloqueia o acesso Firebase dos motoristas com perfil `driver` e dos UIDs incluídos em `driverUids`. Os operadores continuam usando seus controles operacionais. Os IDs da coorte vêm do diretório reconciliado. Somente o Admin SDK altera esse documento. O release do cliente e a transição das Rules dependem da mesma janela de corte.

A PWA no Vercel usa o service worker versionado para navegação online quando o build não gera `sw.js`. As APIs privadas usam a rede. A versão de build e o upload excluem os artefatos locais de service worker. O Firebase Messaging continua como transporte temporário de notificações.
