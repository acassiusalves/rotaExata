# Cadastro nativo de motoristas

## Fluxo

Em **Motoristas**, abra **Cadastrar e gerenciar contas**. A operação de cadastro exige a conta Lunna e aplica o mesmo papel, escopo, política de páginas e MFA da gestão de contas. Informe nome, e-mail e telefone com DDD. Compartilhe o link da página **Primeiro acesso**. O motorista solicita o e-mail no navegador em que abrirá o link e escolhe a própria senha. O cadastro público permanece desligado.

A API reserva o comando e um UUID canônico no Supabase e usa esse UUID para criar a conta Auth. Uma repetição verifica também o marcador administrativo. O sistema recusa um e-mail já cadastrado e deixa inscrições ambíguas pendentes. O PostgreSQL audita as transições. A projeção Firestore começa fora dos seletores de motorista. Depois da confirmação e da troca inicial de senha, o sistema conclui a etapa canônica e libera os controles de conta antes de publicar o motorista no despacho. Um primeiro acesso interrompido pode ser retomado na própria conta. Se a senha já foi gravada, a tela oferece **Concluir ativação**.

A troca inicial exige uma mudança em relação à credencial basal do GoTrue. A saga guarda apenas o digest privado durante a preparação. A verificação de e-mail, por si só, deixa a conta indisponível para operar.

## Autoridade operacional

Para motoristas novos, o UUID Supabase identifica a projeção `users/{UUID}` e `routes.driverId`. A sessão, o escopo e o perfil canônico continuam obrigatórios para operar, obter comprovantes, acessar o extrato e vincular notificações. O mapa de emissores legados continua sendo a única via para conciliar os 374 históricos. Os 15 motoristas migrados conservam seus identificadores de origem.

O despacho e a edição de telefone e veículo continuam na operação Firebase de staff. O bloqueio pelo painel canônico retira primeiro a disponibilidade de despacho na projeção e, depois, revoga a autorização e as sessões no Supabase. A reativação só reabre a projeção depois da confirmação do comando canônico. A revisão gravada e a última reativação auditada impedem que uma tentativa antiga sobrescreva um bloqueio mais recente. Depois de recarregar o painel, **Concluir bloqueio** ou **Restaurar despacho** retoma um comando interrompido. Alterações de senha ou sessão não reabrem o despacho por conta própria; alterações de conta feitas fora do painel exigem reconciliar a projeção. A PWA e o extrato usam a autorização canônica mesmo durante uma divergência. A criação em lote confirma rotas, pedidos e referências do serviço na mesma transação. Repetir o mesmo pedido recupera o recibo do primeiro commit.

## Homologação e publicação

Em ambiente isolado, o Chrome e o Mailpit confirmaram cadastro, e-mail com PKCE, recusa de ativação antes da escolha da senha e retomada após a gravação da senha. Uma atribuição por UUID passou pelas Rules do emulador. A rota foi iniciada, confirmada com comprovante privado e concluída. A revisão repetida deixou um lançamento de R$ 37,00 a conferir. A consulta direta mostrou uma linha para o titular e zero para outro motorista. O bloqueio recusou novo despacho, JWT antigo e a prova de push anterior. A reativação exigiu novo login.

A implantação usa a migração `20261119105738_rota_driver_provisioning.sql` do owner Luna, aplicada pelo provedor com SHA-256 `64cbde6540dc69e4aa24f64e5acfe9ee9ba9f8b5ef4cf452d23f53d6b6285db4`, a atualização da aplicação e o delta de Firestore Rules composto sobre a release ativa. Os endpoints Firebase que tratam a conta, a impersonação ou a atribuição também exigem publicação coordenada. A ponte mantém os formatos e a identidade de execução. O canário hospedado da API Admin conferiu o UUID e o marcador e foi removido. A jornada autenticada foi verificada em ambiente local. Entrega real de e-mail, Android e notificação FCM em aparelho ainda aguardam conferência.

## Publicação em 19/11/2026

O domínio [RotaExata](https://rota-exata.vercel.app) serve o deployment `dpl_J4QUKbDSbw9xiEMPmYTzW7EFiWh4`, com código `76963d71822f7b0c374b969e02dfc7d2c735dfd3` e build `76963d71822f-native-v2`. A candidata passou em 21 verificações antes da promoção; o mesmo deployment passou em 20 verificações públicas. O primeiro acesso e os POSTs de cadastro e ativação foram conferidos. A varredura de erros desse deployment não encontrou registros entre 11:00 e 11:07 UTC.

As dez definições SQL e seus grants corresponderam ao ambiente homologado; a tabela privada tem RLS e os RPCs públicos recusam execução por `anon` e `authenticated`. As oito Functions afetadas estão ativas em Node.js 22 e preservam suas contas de execução. As três Functions da ponte mantêm identidade, destino, habilitação e corte anteriores. A release Firestore `80b494e6-32f3-44f4-98f0-2241da75bfa3`, SHA-256 `a9ac1a66963f1af3221fa4269fe70d94c2207136f938cbcd4b679e8e3259f20b`, contém somente o delta revisado sobre a release anterior. O Storage permaneceu na release existente.

A leitura de 11:06 UTC confirmou 33 contas Auth, 30 perfis, 30 vínculos legados, zero novos cadastros operacionais e os 374 históricos privados. O cadastro público continua desligado, com confirmação de e-mail obrigatória. Ainda não há tarifa publicada, lançamento ou extrato em produção. A [conferência histórica](conferencia-legado-2026-11-19.md) foi concluída sem promover pagamentos. Os relatórios com identidades e provas foram entregues em arquivos privados. A jornada autenticada completa continua delimitada ao ensaio local descrito acima. O código foi implantado por artefatos privados; não houve publicação no repositório Git público.
