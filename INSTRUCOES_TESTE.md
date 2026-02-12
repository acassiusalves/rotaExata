# 🧪 Instruções para Testar o Sistema de Activity Log

## ✅ Sistema rodando na porta 2000

O sistema Next.js está rodando em: **http://localhost:2000**

## 📝 Como testar se as atividades estão sendo registradas

### Passo 1: Abrir o DevTools do Navegador

1. Acesse http://localhost:2000
2. Pressione **F12** (ou clique com botão direito > Inspecionar)
3. Vá para a aba **Console**
4. Certifique-se de que está vendo todos os logs (não filtre nada)

### Passo 2: Executar uma ação que deveria gerar log

Escolha UMA das opções abaixo:

#### Opção A: Criar uma rota (mais simples)
1. Vá para http://localhost:2000/routes/organize
2. Crie uma nova rota ou reorganize pontos
3. Salve as alterações

#### Opção B: Despachar uma rota
1. Vá para http://localhost:2000/routes
2. Selecione uma rota
3. Atribua um motorista
4. Despache a rota

#### Opção C: Criar um serviço Lunna
1. Vá para a página de serviços Lunna
2. Importe um CSV ou crie um serviço
3. Organize as rotas

### Passo 3: Verificar o Console

**🟢 Se estiver funcionando**, você verá logs assim:

```
[ActivityLog] 📝 Tentando registrar: { eventType: 'route_created', action: '...', ... }
[ActivityLog] DB disponível: true
[ActivityLog] ✅ Atividade registrada com sucesso! ID: abc123xyz
```

**🔴 Se houver erro**, você verá algo como:

```
[ActivityLog] ❌ Erro ao registrar atividade: FirebaseError: ...
[ActivityLog] Error code: permission-denied
[ActivityLog] Error message: Missing or insufficient permissions
```

### Passo 4: Interpretar os resultados

#### ✅ Sucesso - Aparece "✅ Atividade registrada com sucesso!"

As atividades ESTÃO sendo gravadas! Agora:
1. Acesse http://localhost:2000/history/atividades
2. Verifique se as atividades aparecem na página
3. Se aparecerem: **problema resolvido!** ✨
4. Se NÃO aparecerem: o problema é na query/exibição da página

#### ❌ Erro de permissão - "permission-denied"

**Causa**: Usuário não está autenticado ou não tem permissão

**Solução**:
1. Faça login na aplicação
2. Certifique-se de estar usando um usuário com role "admin", "gestor" ou "manager"
3. Tente novamente

#### ❌ Erro "DB disponível: false"

**Causa**: Firebase client não está inicializado

**Solução**:
1. Verifique se o arquivo `.env.local` tem todas as variáveis do Firebase
2. Reinicie o servidor: `npm run dev`

#### ⚠️ Nenhum log aparece

**Causa**: A função de logging não está sendo chamada

**Possibilidades**:
1. A ação que você executou não deveria gerar log
2. O código que chama o logging não está sendo executado
3. Há um erro anterior que impede o código de chegar até o logging

**O que fazer**:
1. Tente outra ação (Opção A, B ou C acima)
2. Verifique se há erros no console ANTES de executar a ação
3. Olhe na aba **Network** do DevTools para ver se as APIs estão sendo chamadas

## 🔍 Verificação alternativa - Usando o script de teste

Se quiser verificar diretamente no Firestore:

```bash
node test-activity-log.js
```

Isso vai mostrar:
- Quantas atividades existem na coleção
- As últimas 10 atividades
- Estatísticas por tipo de evento

## 📊 Verificar a página de histórico

Depois de executar ações que geram logs, acesse:

**http://localhost:2000/history/atividades**

Se a página:
- ✅ **Carregar sem erros** e **mostrar atividades**: Tudo funcionando!
- ⚠️ **Carregar mas não mostrar atividades**: Problema na query ou filtros
- ❌ **Mostrar erro**: Verifique o console para ver qual erro

## 🆘 Checklist de troubleshooting

- [ ] O servidor está rodando? (`lsof -i :2000`)
- [ ] Você está autenticado na aplicação?
- [ ] O console do navegador está aberto?
- [ ] Você executou uma ação que deveria gerar log?
- [ ] Apareceram logs com prefixo `[ActivityLog]`?
- [ ] Se sim, qual foi a mensagem (sucesso ou erro)?
- [ ] Se erro, qual foi o código do erro?

## 📁 Arquivos relevantes

- [activity-log.ts](src/lib/firebase/activity-log.ts) - Funções de logging (com logs de debug)
- [firestore.rules](firestore.rules) - Regras de permissão
- [atividades/page.tsx](src/app/(admin)/history/atividades/page.tsx) - Página de histórico
- [create-routes/route.ts](src/app/api/services/[serviceId]/create-routes/route.ts) - API que registra logs

---

**Depois de testar, me informe o resultado para eu poder ajudar mais!** 🚀
