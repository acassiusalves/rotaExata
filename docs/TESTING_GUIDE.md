# Guia de Teste - Sistema de Notificação de Alterações de Rota

## ✅ Pré-requisitos

1. Cloud Function `notifyRouteChanges` deployada ✅
2. Servidor Next.js rodando em `http://localhost:9002`
3. Dois navegadores ou abas anônimas (uma para admin, outra para motorista)

## 🧪 Cenário de Teste 1: Alteração de Sequência

### Passo 1: Preparar o Ambiente

**Aba 1 - Admin:**
1. Acesse `http://localhost:9002/login`
2. Faça login como administrador
3. Vá para `/routes`

**Aba 2 - Motorista:**
1. Acesse `http://localhost:9002/login` (modo anônimo ou outro navegador)
2. Faça login como motorista
3. Vá para `/my-routes`

### Passo 2: Criar e Iniciar uma Rota

**Na aba do Admin:**
1. Crie uma nova rota com pelo menos 3 paradas
2. Atribua a rota ao motorista que está logado na outra aba
3. Despache a rota

**Na aba do Motorista:**
1. A rota deve aparecer na lista
2. Clique na rota para visualizar detalhes
3. Clique em "Iniciar Rota" no topo
4. Status muda para "Em Progresso"
5. **MANTENHA ESTA ABA ABERTA**

### Passo 3: Fazer Alterações

**Na aba do Admin:**
1. Em `/routes`, encontre a rota que acabou de despachar
2. Clique em "Acompanhar Rota"
3. Você será levado para `/routes/organize`
4. **Reordene as paradas** (arraste e solte)
   - Por exemplo: mova a parada 1 para posição 3
5. Clique em "Atualizar Rota Existente" (botão da rota A ou B)
6. Aguarde a mensagem de sucesso

**Resultado esperado:**
```
✅ Rota Atualizada!
O motorista será notificado das X alterações.
```

### Passo 4: Verificar Notificação

**Na aba do Motorista:**
1. Um **dialog modal** deve aparecer AUTOMATICAMENTE
2. O dialog mostra:
   - Título: "Alterações na Rota"
   - Lista de mudanças com badges coloridos
   - Exemplo: "🔵 Sequência Alterada - Parada #1 → #3"
3. Nas paradas da lista, você verá **badges azuis pulsantes**:
   - "SEQUÊNCIA ALTERADA"

**Na aba do Admin:**
1. Volte para `/routes`
2. A rota deve mostrar um **badge laranja pulsante**:
   - "🔔 Aguardando confirmação"

### Passo 5: Confirmar Recebimento

**Na aba do Motorista:**
1. No dialog, clique em **"Confirmar Recebimento"**
2. Dialog fecha automaticamente
3. Os **badges azuis nas paradas desaparecem**

**Na aba do Admin:**
1. O **badge laranja desaparece** automaticamente

## ✅ Sucesso!
Se tudo funcionou conforme descrito, o sistema está operacional!

---

## 🧪 Cenário de Teste 2: Alteração de Endereço

### Preparação
Siga os Passos 1 e 2 do Cenário 1

### Fazer Alteração

**Na aba do Admin:**
1. Em `/routes/organize`, clique no ícone de lápis em uma parada
2. Edite o campo de endereço ou mova o pin no mapa
3. Clique em "Salvar"
4. Clique em "Atualizar Rota Existente"

**Na aba do Motorista:**
1. Dialog aparece mostrando:
   - "🟠 Endereço Modificado"
   - Endereço antigo (tachado)
   - Endereço novo (em verde)
2. Badge laranja "ENDEREÇO MODIFICADO" aparece na parada

---

## 🧪 Cenário de Teste 3: Adicionar Nova Parada

### Fazer Alteração

**Na aba do Admin:**
1. Em `/routes/organize`, adicione uma nova parada
2. Clique em "Atualizar Rota Existente"

**Na aba do Motorista:**
1. Dialog aparece mostrando:
   - "🟢 Nova Parada - Parada adicionada à rota"
2. Badge verde "NOVA PARADA" aparece na nova parada

---

## 🧪 Cenário de Teste 4: Remover Parada

### Fazer Alteração

**Na aba do Admin:**
1. Em `/routes/organize`, clique no X para remover uma parada
2. Clique em "Atualizar Rota Existente"

**Na aba do Motorista:**
1. Dialog aparece mostrando:
   - "🔴 Parada Removida"
2. A parada desaparece da lista

---

## 🐛 Troubleshooting

### Dialog não aparece para o motorista

**Verificações:**
1. Abra o DevTools (F12) → Console
2. Procure por erros em vermelho
3. Verifique se há:
   ```
   Error fetching notification: ...
   ```

**Soluções:**
- Verifique se a rota está com `status: 'in_progress'`
- Confirme no Firestore que existe documento em:
  ```
  routeChangeNotifications/{routeId}
  ```
- Verifique que `acknowledged: false`

### Badge não desaparece

**Verificações:**
1. Abra Firestore Console
2. Navegue até `routeChangeNotifications/{routeId}`
3. Verifique se `acknowledged: true`

**Soluções:**
- Limpe cache do navegador (Ctrl+Shift+R)
- Verifique console do navegador por erros
- Confirme que o listener está ativo

### Alterações não são detectadas

**Verificações:**
1. Console do navegador (aba Admin)
2. Procure por mensagens de erro ao clicar "Atualizar Rota Existente"

**Soluções:**
- Verifique que `routeData.isExistingRoute === true`
- Confirme que `routeData.currentRouteId` está definido
- Veja logs no terminal do servidor Next.js

### Cloud Function não é chamada

**Verificações:**
1. Firebase Console → Functions → Logs
2. Procure por invocações de `notifyRouteChanges`

**Soluções:**
- Verifique se a function foi deployada:
  ```bash
  firebase functions:list
  ```
- Redeploy se necessário:
  ```bash
  firebase deploy --only functions:notifyRouteChanges
  ```

---

## 📊 Checklist de Validação

- [ ] Dialog aparece automaticamente para o motorista
- [ ] Dialog mostra lista de alterações com cores corretas
- [ ] Badges aparecem nas paradas modificadas
- [ ] Badge laranja aparece no admin (aguardando confirmação)
- [ ] Ao confirmar, dialog fecha
- [ ] Badges nas paradas desaparecem
- [ ] Badge laranja no admin desaparece
- [ ] Sistema detecta: sequência, endereço, dados, adição, remoção
- [ ] Funciona apenas para rotas `in_progress`
- [ ] Não notifica se rota não está em andamento

---

## 🎯 Casos de Uso Avançados

### Múltiplas Alterações Simultâneas
1. Mude sequência de 2 paradas
2. Edite endereço de 1 parada
3. Adicione 1 nova parada
4. **Resultado:** Dialog mostra todas as 4 alterações

### Alterações em Rota Não Iniciada
1. Crie rota mas NÃO inicie (status: 'dispatched')
2. Faça alterações no admin
3. **Resultado:** Alterações são salvas mas motorista NÃO é notificado

### Confirmação Após Logout
1. Motorista recebe notificação
2. Motorista faz logout sem confirmar
3. Motorista faz login novamente
4. **Resultado:** Dialog aparece novamente (notificação persiste)

---

## 📝 Dados de Teste Recomendados

### Usuário Admin
```
Email: admin@rotaexata.com (ou o email que você configurou)
Senha: (sua senha de admin)
```

### Usuário Motorista
```
Email: motorista@rotaexata.com (ou crie um novo)
Senha: (senha configurada)
```

### Endereços de Teste
```
1. Rua Augusta, 1000 - São Paulo, SP
2. Av. Paulista, 1578 - São Paulo, SP
3. Rua Oscar Freire, 379 - São Paulo, SP
4. Av. Brigadeiro Faria Lima, 2232 - São Paulo, SP
```

---

## 🚀 Próximos Testes

Após validar o fluxo básico:
1. Teste com múltiplos motoristas simultâneos
2. Teste conexão intermitente (offline/online)
3. Teste performance com muitas paradas (50+)
4. Teste em dispositivos móveis reais

---

## 📞 Suporte

Se encontrar problemas não documentados aqui:
1. Verifique logs do Firebase Functions
2. Verifique logs do console do navegador
3. Verifique dados no Firestore Console
4. Consulte [ROUTE_CHANGE_NOTIFICATION_SYSTEM.md](./ROUTE_CHANGE_NOTIFICATION_SYSTEM.md)
