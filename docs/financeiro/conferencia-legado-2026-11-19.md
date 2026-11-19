# Conferência do legado em 19/11/2026

Os **374 pagamentos somam R$ 28.690,00**: 373 pendentes, com R$ 28.667,00, e um aprovado na origem, com R$ 23,00. A conferência preservou todos os originais e não promoveu, aprovou, pagou ou corrigiu registros.

## Integridade

O manifesto reproduzido pelo transformador do commit `2293e72f` corresponde ao lote privado, com fingerprint `713485d63ee58a3885cb35527c5d11f236f465afe6c82fe5e186f1635be215ff`. Os 374 IDs, revisões, estados, valores, motivos de revisão e hashes dos originais e candidatos conferem com o Supabase consultado às 10:06 UTC. Os oito digests de lote também conferem.

A leitura Firestore de 10:05 UTC encontrou os mesmos 374 documentos e revisões do snapshot de 18/11 às 18:30:13.973649 UTC, sem inclusão, alteração ou exclusão. Diferenças de serialização de timestamps foram comparadas em nanossegundos. O detalhamento privado contém uma linha por pagamento e as evidências usadas.

## Grupos exclusivos para decisão financeira

| Situação | Quantidade | Total registrado |
|---|---:|---:|
| Positivos com UID salvo, vínculo nativo ativo e componentes conciliados | 160 | R$ 10.732,00 |
| V2 positivos compatíveis com a base histórica de entregas e tentativas | 104 | R$ 10.398,00 |
| V2 zerados, todas as parcelas zeradas | 7 | R$ 0,00 |
| V2 zerados, parcelas residuais de R$ 28,00 no detalhamento | 3 | R$ 0,00 |
| Ajustes de parada pendentes, reconstituídos pelas notas | 6 | R$ 480,00 |
| Ajuste de parada aprovado na origem, sem marcador de pagamento | 1 | R$ 23,00 |
| Sem UID salvo; log de atribuição anterior à conclusão, sem troca | 55 | R$ 4.104,00 |
| Sem UID salvo; sequência histórica com troca de motorista | 1 | R$ 80,00 |
| Sem UID salvo; revisão da rota anterior à criação do pagamento | 14 | R$ 1.139,00 |
| Sem UID salvo; revisão posterior e titularidade inconclusiva | 23 | R$ 1.734,00 |
| **Total** | **374** | **R$ 28.690,00** |

Os 281 documentos com UID salvo têm vínculo exato de emissor e identificador legado, perfil driver ativo e associação ativa ao escopo. Nenhuma associação foi inferida por nome ou e-mail. Os outros 93 preservam a ausência de UID; as atribuições propostas são evidências derivadas, sem alteração do staging.

As 107 divergências V2 coincidem com a base de entregas e tentativas do script legado no commit `7d30c6aa`. Os metadados são compatíveis com esse código, mas não comprovam sua execução individual. As sete outras divergências recompõem o total a partir das notas de edição manual. Os 374 não têm snapshot individual da regra original.

## Limites e próximo passo

Os 160 positivos são candidatos à revisão financeira de eventual importação, por R$ 10.732,00. Os outros 214, com R$ 17.958,00, dependem das decisões discriminadas acima. Sete zerados também satisfazem os predicados técnicos por linha, sem constituir crédito positivo. Os totais conferidos descrevem registros históricos; não comprovam saldo em aberto ou liquidação.

Na leitura de fechamento havia zero promoções, zero regras nativas publicadas, zero lançamentos e zero extratos. A promoção exige uma janela com emissão e extrato desligados, autorização financeira e revalidação das identidades e da sobreposição por rota. A auditoria não realizou essa operação. As 536 rotas concluídas e 69 autoencerradas sem documento de pagamento são inventário separado e não compõem este total.

Os relatórios CSV e JSON com os 374 IDs e provas estão no diretório privado de execução, com pasta `0700` e arquivos `0600`; dados pessoais e originais não integram este repositório.
