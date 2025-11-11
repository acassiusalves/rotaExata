# 📋 PROMPT PARA O CLAUDE DO SISTEMA LUNNA

```
Preciso implementar integração com o sistema Rota Exata para criar rotas de entrega a partir de pedidos selecionados.

## CONTEXTO

Temos dois sistemas que compartilham o mesmo banco de dados Firebase:
1. **Sistema Lunna** - Gerencia vendas, estoque, financeiro (onde estou agora)
2. **Sistema Rota Exata** - Gerencia logística e entregas

Vou criar rotas **salvando diretamente na coleção `routes`** do Firebase compartilhado.

---

## ARQUIVO PRONTO PARA COPIAR

O desenvolvedor do Rota Exata preparou um arquivo completo com toda a lógica necessária.

**Primeiro, crie este arquivo no Lunna:**

Caminho: `src/lib/rota-exata-integration.ts`

```typescript
// src/lib/rota-exata-integration.ts

import { db } from '@/lib/firebase/config'; // Ajuste o caminho conforme meu projeto
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

// ============================================
// TIPOS
// ============================================

type PlaceValue = {
  id: string;
  address: string;
  placeId: string;
  lat: number;
  lng: number;
  customerName?: string;
  phone?: string;
  notes?: string;
  orderNumber?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  addressString?: string;
  complemento?: string;
  deliveryStatus?: 'pending' | 'en_route' | 'arrived' | 'completed' | 'failed';
  hasValidationIssues?: boolean;
  validationIssues?: string[];
};

type RouteInfo = {
  code?: string;
  stops: PlaceValue[];
  encodedPolyline: string;
  distanceMeters: number;
  duration: string;
  visible?: boolean;
  status?: 'dispatched' | 'in_progress' | 'completed' | 'completed_auto';
  source?: 'rota-exata' | 'lunna';
  lunnaOrderIds?: string[];
  plannedDate?: any;
  createdBy?: string;
  createdAt?: any;
};

type LunnaClient = {
  nome: string;
  telefone: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  complemento?: string;
};

// ============================================
// FUNÇÃO DE GEOCODING
// ============================================

async function geocodeAddress(address: string, apiKey: string): Promise<PlaceValue | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&region=BR&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results[0]) {
      const result = data.results[0];
      const location = result.geometry?.location;

      if (!location) {
        console.warn(`Geocoding result for "${address}" missing geometry`);
        return null;
      }

      return {
        id: `geocoded-${result.place_id}-${Date.now()}`,
        address: result.formatted_address,
        placeId: result.place_id,
        lat: location.lat,
        lng: location.lng,
      };
    } else {
      console.warn(`Geocoding failed for "${address}": ${data.status}`);
      return null;
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

// ============================================
// FUNÇÃO PARA GERAR CÓDIGO LN-XXXX
// ============================================

async function generateLunnaRouteCode(): Promise<string> {
  const counterRef = doc(db, 'counters', 'routeCode');

  const newCode = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let currentValue = 0;
    if (counterDoc.exists()) {
      currentValue = counterDoc.data().value || 0;
    }

    const nextValue = currentValue + 1;
    transaction.set(counterRef, { value: nextValue }, { merge: true });

    return `LN-${String(nextValue).padStart(4, '0')}`;
  });

  return newCode;
}

// ============================================
// FUNÇÃO PRINCIPAL: CRIAR ROTA DO LUNNA
// ============================================

export type CreateRouteResult = {
  success: boolean;
  routeId?: string;
  routeCode?: string;
  stats?: {
    total: number;
    success: number;
    withIssues: number;
    failedGeocodings: Array<{ orderNumber: string; reason: string }>;
  };
  error?: string;
  notFoundOrders?: string[];
  missingClients?: string[];
};

export async function createRouteFromLunnaOrders(
  orderIds: string[],
  userId: string,
  googleMapsApiKey: string
): Promise<CreateRouteResult> {
  try {
    console.log('🚀 Iniciando criação de rota do Lunna...');

    // 1. Validar entrada
    if (!orderIds || orderIds.length === 0) {
      return {
        success: false,
        error: 'orderIds é obrigatório e deve ser um array não vazio',
      };
    }

    if (!userId) {
      return {
        success: false,
        error: 'userId é obrigatório',
      };
    }

    // 2. Validar permissões do usuário
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return {
        success: false,
        error: 'Usuário não encontrado',
      };
    }

    const userData = userDoc.data();
    const allowedRoles = ['admin', 'gestor', 'socio'];
    if (!allowedRoles.includes(userData.role)) {
      return {
        success: false,
        error: 'Usuário não tem permissão para criar rotas',
      };
    }

    // 3. Buscar pedidos
    console.log('📦 Buscando pedidos...');
    const orders: any[] = [];
    const notFoundOrders: string[] = [];

    for (const orderId of orderIds) {
      const orderDoc = await getDoc(doc(db, 'orders', orderId));
      if (!orderDoc.exists()) {
        notFoundOrders.push(orderId);
      } else {
        orders.push({ id: orderDoc.id, ...orderDoc.data() });
      }
    }

    if (notFoundOrders.length > 0) {
      return {
        success: false,
        error: 'Alguns pedidos não foram encontrados',
        notFoundOrders,
      };
    }

    // 4. Buscar clientes
    console.log('👥 Buscando clientes...');
    const clientsMap = new Map<string, LunnaClient>();
    const missingClients: string[] = [];

    for (const order of orders) {
      if (!clientsMap.has(order.client.id)) {
        const clientDoc = await getDoc(doc(db, 'clientes', order.client.id));
        if (clientDoc.exists()) {
          clientsMap.set(order.client.id, clientDoc.data() as LunnaClient);
        } else {
          missingClients.push(
            `Pedido ${order.number}: Cliente ${order.client.name} (ID: ${order.client.id}) não encontrado`
          );
        }
      }
    }

    if (missingClients.length > 0) {
      return {
        success: false,
        error: 'Alguns clientes não foram encontrados na coleção "clientes"',
        missingClients,
      };
    }

    // 5. Criar stops e geocodificar
    console.log('🗺️ Geocodificando endereços...');
    const successfulStops: PlaceValue[] = [];
    const failedGeocodings: Array<{ orderNumber: string; reason: string }> = [];

    for (const order of orders) {
      const client = clientsMap.get(order.client.id);
      if (!client) continue;

      // Montar endereço completo
      const addressParts = [
        client.rua,
        client.numero,
        client.bairro,
        client.cidade,
        `CEP ${client.cep}`,
      ].filter(Boolean);

      const addressString = `${addressParts.join(', ')}, Brasil`;

      // Geocodificar
      const geocoded = await geocodeAddress(addressString, googleMapsApiKey);

      if (geocoded) {
        // Sucesso
        const stop: PlaceValue = {
          ...geocoded,
          id: `lunna-${order.id}-${Date.now()}`,
          customerName: client.nome,
          phone: client.telefone,
          notes: order.complement?.notes || `Pedido Lunna: ${order.number}`,
          orderNumber: order.number,
          complemento: client.complemento,
          addressString: addressString.replace(', Brasil', ''),
          deliveryStatus: 'pending',
        };
        successfulStops.push(stop);
      } else {
        // Falha - cria stop com problemas
        const stopWithIssue: PlaceValue = {
          id: `lunna-${order.id}-${Date.now()}`,
          address: addressString.replace(', Brasil', ''),
          placeId: '',
          lat: 0,
          lng: 0,
          customerName: client.nome,
          phone: client.telefone,
          notes: order.complement?.notes || `Pedido Lunna: ${order.number}`,
          orderNumber: order.number,
          complemento: client.complemento,
          addressString: addressString.replace(', Brasil', ''),
          deliveryStatus: 'pending',
          hasValidationIssues: true,
          validationIssues: ['Endereço não foi geocodificado. Necessário editar manualmente.'],
        };
        successfulStops.push(stopWithIssue);
        failedGeocodings.push({
          orderNumber: order.number,
          reason: 'Endereço não encontrado pela API de geocoding',
        });
      }
    }

    // 6. Gerar código da rota
    console.log('🔢 Gerando código da rota...');
    const routeCode = await generateLunnaRouteCode();

    // 7. Criar rota no Firestore
    console.log('💾 Salvando rota no Firestore...');
    const routeData: RouteInfo & { plannedDate: any; createdBy: string; createdAt: any } = {
      code: routeCode,
      stops: successfulStops,
      encodedPolyline: '',
      distanceMeters: 0,
      duration: '0s',
      status: 'dispatched',
      source: 'lunna',
      lunnaOrderIds: orders.map((o) => o.number),
      visible: true,
      plannedDate: serverTimestamp(),
      createdBy: userId,
      createdAt: serverTimestamp(),
    };

    const routeRef = await addDoc(collection(db, 'routes'), routeData);

    // 8. Atualizar pedidos
    console.log('✏️ Atualizando status dos pedidos...');
    for (const order of orders) {
      await updateDoc(doc(db, 'orders', order.id), {
        logisticsStatus: 'em_rota',
        rotaExataRouteId: routeRef.id,
        rotaExataRouteCode: routeCode,
        updatedAt: serverTimestamp(),
      });
    }

    console.log('✅ Rota criada com sucesso!');

    return {
      success: true,
      routeId: routeRef.id,
      routeCode: routeCode,
      stats: {
        total: orders.length,
        success: successfulStops.filter((s) => !s.hasValidationIssues).length,
        withIssues: failedGeocodings.length,
        failedGeocodings: failedGeocodings,
      },
    };
  } catch (error) {
    console.error('❌ Erro ao criar rota:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}
```

---

## O QUE PRECISO FAZER

Agora que tenho o arquivo `rota-exata-integration.ts` criado, preciso:

### 1. Configurar variável de ambiente

Adicionar no `.env.local`:
```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=minha-api-key-aqui
```

### 2. Criar interface na página de pedidos

Na minha página de listagem de pedidos, adicionar:

- [ ] Checkbox em cada pedido para seleção
- [ ] Mostrar apenas pedidos com `logisticsStatus === 'pendente'` ou sem esse campo
- [ ] Botão "Criar Rota no Rota Exata"
- [ ] Modal de confirmação antes de criar

### 3. Chamar a função

```typescript
import { createRouteFromLunnaOrders } from '@/lib/rota-exata-integration';

const handleCreateRoute = async () => {
  const result = await createRouteFromLunnaOrders(
    selectedOrderIds,        // IDs dos documentos selecionados
    currentUser.uid,         // ID do usuário logado
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
  );

  if (result.success) {
    toast.success(`Rota ${result.routeCode} criada!`);
    // Recarregar lista de pedidos
  } else {
    toast.error(result.error);
  }
};
```

### 4. Exibir status nos pedidos

Adicionar badge visual mostrando:
- Status logístico do pedido
- Código da rota (se já estiver em uma rota)
- Link para ver rota no Rota Exata

---

## ESTRUTURA DOS DADOS

### Coleção `orders` (já existe):
```typescript
{
  id: string,              // ID do documento
  number: string,          // Ex: "P0001"
  client: {
    id: string,
    name: string
  },
  complement?: {
    notes?: string
  }
}
```

### Campos que serão ADICIONADOS automaticamente:
```typescript
{
  logisticsStatus: 'em_rota',
  rotaExataRouteId: 'abc123',
  rotaExataRouteCode: 'LN-0001',
  updatedAt: Timestamp
}
```

### Coleção `clientes` (já existe):
```typescript
{
  nome: string,
  telefone: string,
  rua: string,
  numero: string,
  bairro: string,
  cidade: string,
  cep: string,
  complemento?: string
}
```

---

## EXEMPLO DE COMPONENTE

```typescript
'use client';

import { useState } from 'react';
import { createRouteFromLunnaOrders } from '@/lib/rota-exata-integration';

export default function PedidosPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const handleSelectOrder = (orderId: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, orderId]);
    } else {
      setSelectedIds(selectedIds.filter(id => id !== orderId));
    }
  };

  const handleCreateRoute = async () => {
    if (selectedIds.length === 0) return;

    setIsCreating(true);
    try {
      const result = await createRouteFromLunnaOrders(
        selectedIds,
        currentUser.uid, // Ajuste conforme seu sistema de auth
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
      );

      if (result.success) {
        alert(`✅ Rota ${result.routeCode} criada com sucesso!`);

        if (result.stats && result.stats.withIssues > 0) {
          alert(`⚠️ ${result.stats.withIssues} endereços precisam de revisão no Rota Exata`);
        }

        setSelectedIds([]);
        // Recarregar pedidos
      } else {
        alert(`❌ ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Erro: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      {/* Lista de pedidos com checkboxes */}

      <button
        onClick={handleCreateRoute}
        disabled={selectedIds.length === 0 || isCreating}
      >
        {isCreating ? 'Criando...' : `Criar Rota (${selectedIds.length})`}
      </button>
    </div>
  );
}
```

---

## O QUE ACONTECE AUTOMATICAMENTE

Quando chamo `createRouteFromLunnaOrders()`:

1. ✅ Valida permissões (admin, gestor, socio)
2. ✅ Busca pedidos da coleção `orders`
3. ✅ Busca clientes da coleção `clientes`
4. ✅ Geocodifica todos os endereços
5. ✅ Gera código LN-0001, LN-0002, etc.
6. ✅ Salva rota na coleção `routes`
7. ✅ Atualiza pedidos com status e código da rota
8. ✅ Rota aparece automaticamente no Rota Exata

---

## CHECKLIST

- [ ] Criar arquivo `src/lib/rota-exata-integration.ts`
- [ ] Adicionar variável de ambiente `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- [ ] Adicionar checkboxes nos pedidos
- [ ] Adicionar botão "Criar Rota"
- [ ] Adicionar modal de confirmação
- [ ] Chamar `createRouteFromLunnaOrders()`
- [ ] Tratar sucesso/erro
- [ ] Exibir status nos pedidos
- [ ] Testar com 1 pedido
- [ ] Testar com múltiplos pedidos

---

## NOTAS IMPORTANTES

⚠️ **IDs dos pedidos:** Use os IDs dos documentos do Firestore (não o campo `number`)
⚠️ **API Key:** Use a mesma do Rota Exata para manter consistência
⚠️ **Permissões:** Apenas admin, gestor e socio podem criar rotas
⚠️ **Sincronização:** Quando motorista completa entregas no Rota Exata, os pedidos são atualizados automaticamente

---

Implemente essa funcionalidade seguindo as especificações acima. O arquivo de integração está completo e pronto para uso.
```

---

**Copie este prompt completo para o Claude do Lunna!** 🚀
