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

A implantação usa a migração `20261119100951_rota_driver_provisioning.sql` do owner Luna, a atualização da aplicação e o delta de Firestore Rules composto sobre a release ativa. Os endpoints Firebase que tratam a conta, a impersonação ou a atribuição também exigem publicação coordenada. A ponte mantém os formatos e a identidade de execução. O canário hospedado da API Admin conferiu o UUID e o marcador e foi removido. A jornada autenticada foi verificada em ambiente local. Entrega real de e-mail, Android e notificação FCM em aparelho ainda aguardam conferência.
