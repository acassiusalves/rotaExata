# 📦 Guia de Integração Lunna → Rota Exata

## ✅ O que foi implementado

### 1. Backend (Rota Exata)
- ✅ Tipos TypeScript atualizados ([types.ts](src/lib/types.ts))
- ✅ API endpoint `/api/import-lunna-orders` criado
- ✅ Sistema de sincronização de status ([lunna-sync.ts](src/lib/lunna-sync.ts))
- ✅ Validação de permissões (admin, gestor, socio)
- ✅ Geocoding automático de endereços
- ✅ Geração de código LN-XXXX

### 2. Frontend (Rota Exata)
- ✅ Badge visual "Lunna" nas rotas importadas
- ✅ Badge aparece na lista de rotas ([routes/page.tsx](src/app/(admin)/routes/page.tsx))
- ✅ Badge aparece nos detalhes da rota ([route-details-dialog.tsx](src/components/routes/route-details-dialog.tsx))

### 3. Sincronização Automática
- ✅ Quando motorista marca entrega como **concluída** → atualiza `logisticsStatus = 'entregue'` no Lunna
- ✅ Quando motorista marca entrega como **falha** → atualiza `logisticsStatus = 'falha'` no Lunna
- ✅ Sincronização não bloqueia operação se falhar (resiliente)

---

## 🚀 Como Testar o Endpoint

### Pré-requisitos
1. Servidor Rota Exata rodando: `http://localhost:2000`
2. Firebase configurado
3. Pedidos e clientes existentes no banco

### Teste via Postman/Insomnia

**Endpoint:**
```
POST http://localhost:2000/api/import-lunna-orders
```

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "orderIds": [
    "ID_DO_PEDIDO_1",
    "ID_DO_PEDIDO_2",
    "ID_DO_PEDIDO_3"
  ],
  "userId": "ID_DO_USUARIO_ADMIN"
}
```

**Exemplo Real:**
```json
{
  "orderIds": [
    "ZsHvBOkMHBVWxcOiHhwk",
    "abc456def789",
    "xyz123uvw456"
  ],
  "userId": "seu-user-id-aqui"
}
```

### Respostas Esperadas

#### ✅ Sucesso (Status 200)
```json
{
  "success": true,
  "routeId": "abc123xyz",
  "routeCode": "LN-0001",
  "stats": {
    "total": 3,
    "success": 2,
    "withIssues": 1,
    "failedGeocodings": [
      {
        "orderNumber": "P0003",
        "reason": "Endereço não encontrado pela API de geocoding"
      }
    ]
  }
}
```

#### ❌ Erro - Pedidos não encontrados (Status 404)
```json
{
  "error": "Alguns pedidos não foram encontrados",
  "notFoundOrders": ["ID_INVALIDO_1", "ID_INVALIDO_2"]
}
```

#### ❌ Erro - Clientes não encontrados (Status 404)
```json
{
  "error": "Alguns clientes não foram encontrados na coleção \"clientes\"",
  "missingClients": [
    "Pedido P0001: Cliente João Silva (ID: cliente123) não encontrado"
  ]
}
```

#### ❌ Erro - Sem permissão (Status 403)
```json
{
  "error": "Usuário não tem permissão para importar pedidos"
}
```

#### ❌ Erro - Parâmetros inválidos (Status 400)
```json
{
  "error": "orderIds é obrigatório e deve ser um array não vazio"
}
```

---

## 🔄 Fluxo Completo

### 1. **No Lunna (você vai implementar)**
```typescript
// Exemplo de chamada no Lunna
const selectedOrders = ['pedido1', 'pedido2', 'pedido3'];
const currentUserId = auth.currentUser.uid;

const response = await fetch('http://localhost:2000/api/import-lunna-orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    orderIds: selectedOrders,
    userId: currentUserId,
  }),
});

const result = await response.json();

if (result.success) {
  console.log(`Rota ${result.routeCode} criada com sucesso!`);
  console.log(`ID da rota: ${result.routeId}`);
  console.log(`Estatísticas:`, result.stats);

  // Exibir mensagem para o usuário
  alert(`Rota ${result.routeCode} criada com ${result.stats.success} pedidos!`);
} else {
  console.error('Erro:', result.error);
  alert(`Erro: ${result.error}`);
}
```

### 2. **No Rota Exata (já implementado)**
- Rota aparece na lista com badge "Lunna"
- Usuário pode editar, otimizar, atribuir motorista
- Motorista completa entregas normalmente
- Status é sincronizado automaticamente com o Lunna

### 3. **Sincronização Automática**
Quando motorista marca entrega:
- ✅ **Completed** → `logisticsStatus = 'entregue'` no pedido
- ❌ **Failed** → `logisticsStatus = 'falha'` no pedido

---

## 📊 Campos Atualizados no Pedido (Lunna)

Após importação bem-sucedida, cada pedido na coleção `orders` será atualizado com:

```typescript
{
  logisticsStatus: 'em_rota',        // Status da logística
  rotaExataRouteId: 'abc123',        // ID da rota no Firestore
  rotaExataRouteCode: 'LN-0001',     // Código visual da rota
  updatedAt: Timestamp.now()         // Data de atualização
}
```

Quando entrega é concluída:
```typescript
{
  logisticsStatus: 'entregue',       // ou 'falha'
  updatedAt: Timestamp.now()
}
```

---

## 🧪 Checklist de Testes

### Teste 1: Importação Básica
- [ ] Selecionar 3 pedidos válidos no Lunna
- [ ] Enviar para o endpoint
- [ ] Verificar rota criada em `http://localhost:2000/routes`
- [ ] Confirmar badge "Lunna" aparece
- [ ] Verificar código LN-0001

### Teste 2: Geocoding
- [ ] Importar pedido com endereço válido
- [ ] Verificar que lat/lng foram preenchidos
- [ ] Importar pedido com endereço inválido
- [ ] Verificar que stop tem `hasValidationIssues: true`

### Teste 3: Permissões
- [ ] Tentar importar com usuário sem permissão → Deve falhar 403
- [ ] Tentar importar com admin → Deve funcionar
- [ ] Tentar importar com gestor → Deve funcionar

### Teste 4: Validações
- [ ] Enviar orderIds vazio → Erro 400
- [ ] Enviar ID de pedido inexistente → Erro 404
- [ ] Pedido com cliente inexistente → Erro 404

### Teste 5: Sincronização
- [ ] Criar rota importada do Lunna
- [ ] Atribuir motorista
- [ ] Motorista marca entrega como concluída
- [ ] Verificar `logisticsStatus = 'entregue'` no pedido Lunna
- [ ] Motorista marca entrega como falha
- [ ] Verificar `logisticsStatus = 'falha'` no pedido Lunna

---

## 🐛 Troubleshooting

### Erro: "Google Maps API key não configurada"
**Solução:** Verificar se `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` está no `.env`

### Erro: "Usuário não tem permissão"
**Solução:** Verificar role do usuário no Firestore (`users/{userId}/role`)

### Geocoding falhando
**Solução:** Endereços com problema são marcados com `hasValidationIssues: true` e podem ser editados manualmente no Rota Exata

### Sincronização não acontece
**Solução:** Verificar console do navegador (F12) → buscar por logs "🔄 Sincronizando status com Lunna"

---

## 📝 Próximos Passos (Para implementar no Lunna)

1. **Interface de Seleção**
   - [ ] Adicionar checkbox nos pedidos
   - [ ] Botão "Criar Rota no Rota Exata"
   - [ ] Filtrar apenas pedidos com `logisticsStatus = 'pendente'`

2. **Chamada da API**
   - [ ] Implementar função para chamar endpoint
   - [ ] Tratar respostas de sucesso/erro
   - [ ] Exibir feedback visual ao usuário

3. **Exibição de Resultados**
   - [ ] Mostrar código da rota criada (LN-XXXX)
   - [ ] Listar pedidos com geocoding com problemas
   - [ ] Link para abrir rota no Rota Exata

4. **Monitoramento**
   - [ ] Exibir status atualizado dos pedidos
   - [ ] Mostrar em qual rota o pedido está
   - [ ] Permitir visualizar progresso da rota

---

## 🎯 Exemplo de Interface no Lunna

```jsx
// Pseudo-código para o Lunna
function PedidosPage() {
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isCreatingRoute, setIsCreatingRoute] = useState(false);

  const handleCreateRoute = async () => {
    setIsCreatingRoute(true);

    try {
      const response = await fetch('http://localhost:2000/api/import-lunna-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: selectedOrders,
          userId: auth.currentUser.uid,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ Rota ${result.routeCode} criada com sucesso!`);

        if (result.stats.withIssues > 0) {
          alert(`⚠️ ${result.stats.withIssues} endereços precisam de revisão manual`);
        }
      } else {
        alert(`❌ Erro: ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Erro ao criar rota: ${error.message}`);
    } finally {
      setIsCreatingRoute(false);
    }
  };

  return (
    <div>
      {/* Lista de pedidos com checkboxes */}
      <Button
        onClick={handleCreateRoute}
        disabled={selectedOrders.length === 0 || isCreatingRoute}
      >
        {isCreatingRoute ? 'Criando...' : 'Criar Rota no Rota Exata'}
      </Button>
    </div>
  );
}
```

---

## 📞 Suporte

Se encontrar problemas:
1. Verificar logs do console (F12 no navegador)
2. Verificar logs do servidor Next.js
3. Conferir permissões do usuário no Firebase
4. Validar estrutura dos dados em `orders` e `clientes`

---

**Implementação concluída em:** 2025-01-11
**Status:** ✅ Pronto para testes
