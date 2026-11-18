# Remuneração no Supabase

## Autoridade durante a transição

O programa de identidade da plataforma Lunna administra as contas Supabase, os perfis canônicos e o vínculo comprovado entre emissor/UID Firebase e UUID Supabase. Cada operação de remuneração tem um escopo cadastrado em `rota_earnings_private.scopes` e exige um vínculo ativo em `memberships`. Admin e sócio publicam regras. Admin, sócio e gestor operam pagamentos de acordo com a política de páginas vigente. O entregador acessa o extrato do próprio escopo.

O Firestore conserva a autoridade sobre rotas e entregas. A API de rotas por sessão Supabase usa o vínculo privado da plataforma para validar o titular, registrar os desfechos e gravar a prova da prestação. A interface operacional legada tem uma API separada que exige sua sessão Firebase vigente. Os endpoints de escrita de criação de rotas e de importação Lunna exigem `Authorization: Bearer <Firebase ID token>` do operador durante essa fase. A atribuição da gravação vem da sessão verificada. Consumidores externos desses endpoints devem ser homologados no corte. A tela de ganhos usa a sessão Supabase da própria origem. A virada do login de toda a PWA depende também da migração de uploads, presença, notificações, perfil, chamados, reedição e outras operações diretas ainda usadas na interface.

O PostgreSQL mantém a única razão financeira após o corte. A contribuição de uma rota depende da revisão e da regra da data de encerramento comprovada. O lançamento nasce **a conferir**, segue para aprovação e recebe baixa manual com referência. Um lançamento quitado permanece congelado e uma correção depende de procedimento compensatório aprovado.

## Componentes e configuração

As migrations são versionadas no repositório Luna. A sequência depende de `20261118132716_platform_directory.sql`. As quatro migrations foram aplicadas separadamente ao projeto compartilhado Sistema Lunna, ref `rjmrndqmzgcxpclnqvgv`. As versões abaixo são as que o Supabase registrou no histórico. A troca de nome dos arquivos preservou os bytes aplicados.

| Etapa | Versão registrada | SHA-256 do SQL |
|---|---|---|
| Esquema | `20261118194002` | `ab5485a3d6b68f2cf33d7e05163c0c4a4d95c9f620fbbab86612d329b43dc46a` |
| Acesso | `20261118194019` | `c9535996c89a7a4511d79c4ba26dc362224ac9ce4d08c2183a7f9bbdaa2120dd` |
| Emissão | `20261118194032` | `aa87fad043228fe311b233ac27caccd85a1e58071b256d8e204d993b4b9d58c1` |
| Comandos e extrato | `20261118194050` | `d06211704160986d5ed176e62f1bb121feda6d119e2eee7b75ead8c518c51612` |

O histórico do owner já incluía versões datadas no futuro e uma duplicata anterior de CRM. A ordem efetiva da nova cadeia segue a tabela acima. Preserve os arquivos e registros de outros módulos.

A configuração pública da interface usa `NEXT_PUBLIC_ROTA_EARNINGS_ENABLED`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. O runtime do Next.js usa `SUPABASE_EARNINGS_SECRET_KEY` e `ROTA_EARNINGS_SCOPE_ID`. O emissor usa um service account dedicado e token Google com audience igual a `ROTA_EARNINGS_EVENTS_URL`. Configure no receptor `ROTA_EARNINGS_SOURCE_PROJECT`, `ROTA_EARNINGS_BRIDGE_EMAIL` e `ROTA_EARNINGS_BRIDGE_SUBJECT`. A função Firebase requer o mesmo projeto e URL, `ROTA_EARNINGS_BRIDGE_ENABLED` e o watermark `ROTA_EARNINGS_CAPTURE_FROM`.

Na configuração inicial de um escopo, `capture_enabled`, `issue_enabled`, `commands_enabled` e `statement_enabled` estão desligados. A captura em sombra é uma fase independente. `issue_from` delimita a apuração autorizada após a virada.

O servidor confirma o evento ao emissor depois da persistência na inbox. As rotinas agendadas recuperam a outbox pendente e varrem as rotas e provas de origem. Uma falta de histórico detectada entra em revisão. Se houver falha persistente, acompanhe a idade da fila, eventos em revisão, conflito de conteúdo e tentativas no cursor Firestore. Antes de ligar a captura, confirme a conta Google configurada em `serviceAccount` nos três gatilhos. Execute `GET` no endpoint da ponte com o ID token desse runtime e confirme `ready: true` e o projeto esperado. O receptor valida assinatura, emissor, audience, subject e e-mail. A função `PUT` drena a fila com a mesma identidade. O utilitário de operação permite processar uma quantidade limitada com destino explícito.

```sh
node --experimental-strip-types scripts/reconcile-earnings-events.ts --target "$NEXT_PUBLIC_SUPABASE_URL" --limit 6
```

## Conferência e virada

1. Confirme que o diretório está carregado, os vínculos são demonstráveis e o usuário nativo tem o mesmo estado verificado e ativo da origem. Defina o escopo e seus membros pelo vínculo da plataforma.
2. Aprove o contrato de tarifa e a competência inicial. Rotas parciais na modalidade por distância, híbrido, trocas, retornos, reentregas e categoria desconhecida entram em revisão conforme a regra aplicável.
3. Instale as APIs operacionais e verifique início, confirmação, reedição, rastreamento e encerramento nas versões ativas da PWA. Coordene a regra Firestore que restringe a escrita direta pelo motorista. Registre a versão efetivamente entregue pelo service worker.
4. Capture a origem com watermark, habilite a inbox em sombra e compare os fatos apurados com a amostra autorizada. Nesta fase a emissão continua pausada.
5. Exporte pagamentos, regra ativa e rotas com leitura consistente, revisão de origem e arquivo privado. Audite o snapshot e confirme divergências de total, duplicatas, titularidade e pagamentos realizados por fora.

```sh
node --experimental-strip-types scripts/audit-driver-earnings.ts "$SNAPSHOT_PRIVADO"
node --experimental-strip-types scripts/migrate-driver-earnings.ts "$SNAPSHOT_PRIVADO"
```

Com o snapshot e o destino aprovados, `--apply --target <URL> --scope <UUID> --batch <UUID>` grava somente staging privado. Cada documento preserva o ID, revisão, original e situação. Um documento que mudou gera conflito para conferência. Com a identidade conferida, use `--promote` com os mesmos arquivo, destino, escopo e lote para atribuir os registros elegíveis enquanto o extrato e a emissão permanecem pausados. A promoção reconsulta o vínculo vigente por emissor e UID e deixa dados inconclusivos no staging. Compare contagem, centavos e estados por ID antes de habilitar `statement_enabled`. A existência de rota concluída sem lançamento não define um crédito.

6. Congele os escritores legados, inclusive clientes antigos e scripts administrativos. Confira `src/lib/payment-generator.ts`, `src/lib/payment-actions.ts`, `scripts/recalculate-all-payments.ts` e `scripts/add-route-created-at-to-payments.ts`. Drene e confira o último delta ao redor do corte.
7. Abra o financeiro e o extrato para o escopo aprovado e habilite os comandos e a emissão com a data registrada. Confira a regra vigente, o primeiro lançamento, a trilha da baixa, o extrato e os negativos de isolamento em sessões distintas.

## Pausa e reversão

Antes de haver lançamento novo, mantenha emissão e comandos pausados e preserve a inbox. A consulta legada autorizada pode servir para auditoria. Após emissão no Supabase, pause a emissão e os comandos, mantenha o último extrato confirmado e exporte o delta da razão antes de qualquer retorno de autoridade. As chaves idempotentes permitem retomar a leitura da fila. A remoção da ponte acompanha o corte operacional das rotas e a confirmação de paridade.

## Homologação

Use o Supabase local isolado com GoTrue, REST, Realtime e PostgreSQL reais. As suítes SQL no owner verificam permissões, constraints, ordem das revisões, ajuste, baixa e projeção. O alvo do emulador Firestore é `demo-rotaexata-driver` em `127.0.0.1:8181`.

O roteiro `scripts/homologate-earnings-local.ts` exige exatamente o gateway Supabase local em `127.0.0.1:61421`, o emulador Firestore e três contas sintéticas em arquivo privado. Ele valida a API de rotas com sessão Supabase, emissão, ajuste de estado e isolamento por REST/Realtime. A execução local da ponte chama o receptor validado de dados diretamente. A credencial e o gatilho do Cloud Functions são verificados na janela de homologação do ambiente de destino.

O ensaio em navegador cobre as telas de regras, pagamentos e ganhos conforme o relatório de homologação. O ensaio em dispositivo requer Android autorizado e exploração ARTEMIS antes da autoria de testes de aparelho.
