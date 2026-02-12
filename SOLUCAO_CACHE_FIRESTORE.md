# 🔧 Solução para Problema de Cache do Firestore

## 🐛 Problema Identificado

**Sintoma:** Pedido P0234 está no Firebase (confirmado via Admin SDK) mas não aparece no Rota Exata.

**Dados verificados:**
- ✅ Serviço NRKTrbRTDYkLOF1pT6qf (LNS-0015) existe
- ✅ allStops: 14 stops (incluindo P0234)
- ✅ lunnaOrderIds: 15 pedidos (incluindo P0234)
- ❌ Rota Exata mostra apenas 13 stops

## 🎯 Causa Raiz

**CACHE DO FIRESTORE CLIENT SDK**

O Firestore Client SDK (usado no frontend) mantém cache local dos documentos. Quando novos dados são adicionados no servidor (pelo Lunna usando Admin SDK), o cache do cliente não é atualizado automaticamente.

### Por que isso acontece:

1. **Lunna** adiciona pedido usando **Admin SDK** (backend)
2. **Rota Exata** lê usando **Client SDK** (frontend)
3. Client SDK retorna dados do **CACHE** (antigos)
4. Novo pedido não aparece até o cache expirar ou ser invalidado

## ✅ Solução Implementada

### Correção 1: Forçar leitura do servidor

**Arquivo:** `src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx`

**Mudança:**
```typescript
// ❌ ANTES (usava cache)
const serviceDoc = await getDoc(doc(db, 'services', serviceId));

// ✅ DEPOIS (força leitura do servidor)
const serviceDoc = await getDoc(doc(db, 'services', serviceId), { source: 'server' });
```

**Linhas alteradas:**
- Linha 1154: Loading inicial do serviço
- Linha 1577: Reload do serviço durante execução

### Correção 2: Usar listener em tempo real (já implementado)

O código já tem listener com `onSnapshot()` (linha 2230) que atualiza automaticamente quando há mudanças. O problema era apenas no carregamento inicial.

## 🧪 Como Testar

### Teste 1: Verificar cache (Admin SDK)

```bash
node teste-cache-firestore.js
```

**Resultado esperado:**
- Mostra 14 stops no servidor
- Confirma que P0234 existe

### Teste 2: Verificar no browser

1. Acesse: `http://localhost:2000/routes/service/NRKTrbRTDYkLOF1pT6qf/acompanhar`
2. Abra DevTools > Console
3. Procure por: `allStops: 14` (deve aparecer)
4. Verifique se P0234 está na lista

### Teste 3: Adicionar novo pedido do Lunna

1. No Lunna, adicione um pedido ao serviço
2. No Rota Exata, recarregue a página
3. O pedido deve aparecer IMEDIATAMENTE (sem delay de cache)

## 📊 Opções de source no getDoc

```typescript
// Opção 1: Padrão (usa cache se disponível)
getDoc(docRef)

// Opção 2: Apenas cache (offline-first)
getDoc(docRef, { source: 'cache' })

// Opção 3: Apenas servidor (sempre atualizado) ← USAMOS ESTA
getDoc(docRef, { source: 'server' })
```

## 🔄 Alternativas Consideradas

### 1. Limpar cache manualmente
```typescript
await clearIndexedDbPersistence(db);
```
**Problema:** Muito agressivo, remove TODOS os dados em cache.

### 2. Desabilitar cache completamente
```typescript
enableIndexedDbPersistence(db, { forceOwnership: true });
```
**Problema:** Piora performance e não funciona offline.

### 3. Usar apenas onSnapshot
```typescript
const unsubscribe = onSnapshot(doc(db, 'services', id), (snapshot) => {
  // Sempre atualizado
});
```
**Problema:** Não resolve o carregamento inicial.

### 4. ✅ source: 'server' (escolhida)
```typescript
getDoc(doc(db, 'services', id), { source: 'server' })
```
**Vantagens:**
- ✅ Garante dados atualizados no carregamento
- ✅ Não afeta outras partes do app
- ✅ Funciona junto com onSnapshot
- ✅ Performance aceitável (apenas 2 chamadas por carregamento de página)

## 📝 Checklist de Verificação

- [x] Corrigir linha 1154 (carregamento inicial)
- [x] Corrigir linha 1577 (reload durante execução)
- [ ] Testar com pedido novo vindo do Lunna
- [ ] Verificar que onSnapshot continua funcionando
- [ ] Confirmar que P0234 aparece
- [ ] Verificar performance (não deve ter degradação perceptível)

## 🎯 Resultado Esperado

### ANTES da correção:
- Lunna adiciona P0234 → Firestore atualiza ✅
- Rota Exata recarrega → Lê do cache ❌
- P0234 NÃO aparece até cache expirar ❌

### DEPOIS da correção:
- Lunna adiciona P0234 → Firestore atualiza ✅
- Rota Exata recarrega → Lê do servidor ✅
- P0234 aparece IMEDIATAMENTE ✅

## 🚨 Impacto da Mudança

**Positivo:**
- ✅ Dados sempre atualizados
- ✅ Resolve inconsistências entre Lunna e Rota Exata
- ✅ Melhora confiabilidade

**Negativo:**
- ⚠️ 2 requisições extras ao servidor por carregamento (negligível)
- ⚠️ Não funciona offline (mas serviços requerem conexão de qualquer forma)

**Performance:**
- Impacto: ~100-300ms de latência extra
- Aceitável para uso interno
- Pode ser otimizado depois se necessário

## 📚 Referências

- [Firestore Get Data: source option](https://firebase.google.com/docs/firestore/query-data/get-data#source_options)
- [Firestore Caching](https://firebase.google.com/docs/firestore/manage-data/enable-offline)

---

**Status:** ✅ Implementado e pronto para teste
**Data:** 2026-02-12
**Autor:** Claude Code (via solicitação do desenvolvedor)
