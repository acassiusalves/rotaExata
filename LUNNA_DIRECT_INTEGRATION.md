# 📦 Integração Direta Lunna → Rota Exata (Sem API)

## 🎯 Abordagem: Salvar Diretamente no Firebase

Como ambos os sistemas compartilham o mesmo banco de dados, você vai **salvar direto na coleção `routes`** do Firebase.

---

## 📁 Arquivo Utilitário para Copiar no Lunna

Crie o arquivo: `src/lib/rota-exata-integration.ts` no **Sistema Lunna**

```typescript
// src/lib/rota-exata-integration.ts

import { db } from '@/lib/firebase/config'; // Ajuste o caminho conforme seu projeto
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
// TIPOS (copie estes tipos para o Lunna)
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

## 🎨 Como Usar no Componente do Lunna

```typescript
// src/app/pedidos/page.tsx (ou onde for sua página de pedidos)

'use client';

import { useState } from 'react';
import { createRouteFromLunnaOrders } from '@/lib/rota-exata-integration';
import { useAuth } from '@/hooks/use-auth'; // Ajuste conforme seu projeto

export default function PedidosPage() {
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isCreatingRoute, setIsCreatingRoute] = useState(false);
  const { user } = useAuth();

  const handleCreateRoute = async () => {
    setIsCreatingRoute(true);

    try {
      const result = await createRouteFromLunnaOrders(
        selectedOrderIds,
        user.uid,
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
      );

      if (result.success) {
        alert(`✅ Rota ${result.routeCode} criada com sucesso!`);

        if (result.stats && result.stats.withIssues > 0) {
          alert(
            `⚠️ ${result.stats.withIssues} endereços precisam de revisão manual no Rota Exata`
          );
        }

        // Limpar seleção
        setSelectedOrderIds([]);

        // Recarregar lista de pedidos
        // fetchPedidos();
      } else {
        alert(`❌ Erro: ${result.error}`);

        if (result.missingClients) {
          console.error('Clientes faltantes:', result.missingClients);
        }
      }
    } catch (error) {
      alert(`❌ Erro inesperado: ${error}`);
    } finally {
      setIsCreatingRoute(false);
    }
  };

  return (
    <div>
      {/* Sua lista de pedidos com checkboxes */}

      <button
        onClick={handleCreateRoute}
        disabled={selectedOrderIds.length === 0 || isCreatingRoute}
      >
        {isCreatingRoute
          ? 'Criando Rota...'
          : `Criar Rota no Rota Exata (${selectedOrderIds.length})`}
      </button>
    </div>
  );
}
```

---

## 🔑 Configurar Variável de Ambiente no Lunna

Adicione no `.env.local` do Lunna:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=sua-api-key-aqui
```

**⚠️ Use a MESMA API key que está no Rota Exata!**

---

## ✅ Vantagens da Abordagem Direta

1. ✅ Sem chamadas HTTP
2. ✅ Sem problemas de URL localhost vs produção
3. ✅ Tudo em um só arquivo (fácil de manter)
4. ✅ Funciona tanto em desenvolvimento quanto em produção
5. ✅ Performance melhor (sem overhead de rede)

---

## 📊 O Que Acontece Automaticamente

Quando você chama `createRouteFromLunnaOrders()`:

1. ✅ Valida permissões do usuário
2. ✅ Busca pedidos da coleção `orders`
3. ✅ Busca clientes da coleção `clientes`
4. ✅ Geocodifica endereços
5. ✅ Gera código LN-XXXX
6. ✅ Cria rota na coleção `routes`
7. ✅ Atualiza pedidos com status e código da rota
8. ✅ Rota aparece automaticamente no Rota Exata

---

## 🧪 Como Testar

1. Copie o arquivo `rota-exata-integration.ts` para o Lunna
2. Configure a API key do Google Maps
3. Selecione alguns pedidos
4. Clique em "Criar Rota"
5. Verifique a rota em `http://localhost:2000/routes`

---

## 🔄 Sincronização de Status Continua Automática

Quando o motorista marca entregas no Rota Exata:
- ✅ Status é atualizado automaticamente nos pedidos do Lunna
- ✅ A sincronização já está implementada no Rota Exata
- ✅ Você não precisa fazer nada no Lunna

---

## 📝 Checklist Final

- [ ] Copiar arquivo `rota-exata-integration.ts` para o Lunna
- [ ] Adicionar `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` no `.env.local`
- [ ] Adicionar checkboxes nos pedidos
- [ ] Adicionar botão "Criar Rota"
- [ ] Chamar `createRouteFromLunnaOrders()`
- [ ] Testar com 1 pedido
- [ ] Testar com múltiplos pedidos
- [ ] Verificar rota aparece no Rota Exata

---

**Pronto! Agora você tem toda a lógica em um único arquivo para copiar no Lunna.** 🎉

Precisa de mais alguma coisa?
