# Conferencia individual de eventos de ganhos
## Intencao e autorizacao
O usuario autorizou implementar a conferencia das duas rotas bloqueadas no painel, seguindo o relatorio de auditoria desta conversa. O encaminhamento aprovado e registrar decisao financeira individual auditada, mantendo fatos e provas originais. As escolhas tecnicas abaixo sao do implementador.
## Abordagem
Usar uma decisao financeira separada no Supabase para calcular e emitir somente pending. Reabrir rotas ou modificar provas antigas nao preserva a auditoria; emitir por simples replay nao supre as lacunas. Nenhuma decisao sobre as rotas reais sera executada pela implementacao.
## Escopo e arquitetura
- Em Financeiro/Pagamentos listar eventos correntes em revisao com codigo da rota, motorista, data, motivo e paradas pertinentes. Listar exclusao de rascunho como caso tecnico sem emissao.
- Detalhe com duas acoes: completar somente UF ausente de parada com municipio conhecido, ou atestar explicitamente resultados JA registrados quando faltam confirmacoes de servidor.
- Previa recalculada pelo motor atual e tarifa vigente na conclusao. Mostrar itens, total, evidencias exigidas e a diferenciacao entre atestacao financeira e prova de entrega.
- Confirmacao explicita com justificativa e referencias de evidencias. Gerar somente um lancamento pending/A conferir; aprovar e pagar continuam separados.
- Nao expor nomes de clientes, telefones, enderecos completos ou URLs de midia na API financeira.
## Invariantes
1. Nao alterar fatos do evento, resultado na Source, prova de inicio/conclusao, data de trabalho, motorista, regra ou taxas. Nao alterar os 374 historicos.
2. UF: apenas falta original e somente paradas bloqueadas por enquadramento. Exigir UF brasileira compativel com municipio/qualificador e tarifa; referencia e justificativa por complemento. Nao assumir GO por origem, raio ou cidade sem evidencia.
3. Atestacao: fechamento ordinario completed, nao forcado, inicio existente com motorista e fingerprint do plano iguais, snapshot atual identico ao evento; todas as paradas processadas e so lacunas de confirmacao AUSENTE, nunca confirmacao divergente. Exigir referencia por cada lacuna. Nao alterar status, visita ou horario de parada. Nao converter evidence:null em driver-server-v1.
4. APIs autenticam por requireStaffEarningsActor. Leitura payment:read; previa e confirmar payment:write. Revalidar no SQL sessao ativa, perfil, escopo, politica e MFA existentes. Nao ampliar papeis.
5. BFF resolve Source somente pelo projeto do escopo autorizado. Ler revisao/fatos/prova em previa e confirmacao, vinculando digest a ator, evento, revisao/hash, regra, entradas permitidas e prova.
6. Confirmacao recebe requestId idempotente e previewDigest. Depois de autenticar, recuperar primeiro recibo do MESMO ator e corpo; ACK perdido nao exige evento continuar na fila. Corpo diferente no mesmo requestId deve falhar.
7. SQL usa a mesma trava de rota do worker, verifica SourceState corrente, ausencia de conflito, regra/data/corte, flags capture/issue/commands/statement, motorista mapeado ativo, ausencia de lancamento e sobreposicao de legado. Corrida/revisao obsoleta falha sem emitir.
8. Recibo privado imutavel com autor, sessao, motivo, referencias, acao, deltas permitidos, hash original, regra, calculo e earningId. Evento original conserva motivo; consultas descontam decisoes aplicadas da fila financeira.
9. Nao existe transacao distribuida: se Source mudar depois da ultima leitura, a captura futura aplica a trava existente de revisao do lancamento. Declarar esse limite; nao prometer atomicidade entre Firebase e Postgres.
## Superficie
API nova /api/financeiro/revisoes GET lista/detalhe, POST previa, PATCH confirmar. Servico dedicado em src/lib/server/earnings e contrato compartilhado em src/lib/earnings. Componente de revisao integrado ao period-view financeiro. Uma migration aditiva no owner SQL e testes de banco descartavel.
## Validacao e entrega
Testes de motor/contratos/BFF, PostgreSQL real descartavel (autorizacao, MFA, RLS/EXECUTE, CAS, concorrencia, replay e worker), build exato e revisao independente. Validar UI autenticada em leitura dos dois casos reais. Nao confirmar a UF nem atestar resultado real em nome do operador. Nenhum pagamento ou aprovacao automaticos.
