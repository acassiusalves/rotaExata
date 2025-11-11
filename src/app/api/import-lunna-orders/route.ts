import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type { LunnaOrder, LunnaClient, PlaceValue, RouteInfo } from '@/lib/types';

// Função para geocodificar um endereço usando Google Maps API
async function geocodeAddress(address: string): Promise<PlaceValue | null> {
  try {
    // Usando a API do Google Maps Geocoding via servidor
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('Google Maps API key não configurada');
      return null;
    }

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

// Função para gerar código LN-XXXX usando o contador existente
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

// Validar permissões do usuário
async function validateUserPermissions(userId: string): Promise<boolean> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return false;
    }

    const userData = userDoc.data();
    const allowedRoles = ['admin', 'gestor', 'socio'];
    return allowedRoles.includes(userData.role);
  } catch (error) {
    console.error('Erro ao validar permissões:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderIds, userId } = body;

    // Validação de entrada
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: 'orderIds é obrigatório e deve ser um array não vazio' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'userId é obrigatório' },
        { status: 400 }
      );
    }

    // Validar permissões do usuário
    const hasPermission = await validateUserPermissions(userId);
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Usuário não tem permissão para importar pedidos' },
        { status: 403 }
      );
    }

    // 1. Buscar pedidos do Lunna
    const orders: LunnaOrder[] = [];
    const notFoundOrders: string[] = [];

    for (const orderId of orderIds) {
      const orderDoc = await getDoc(doc(db, 'orders', orderId));
      if (!orderDoc.exists()) {
        notFoundOrders.push(orderId);
      } else {
        orders.push({ id: orderDoc.id, ...orderDoc.data() } as LunnaOrder);
      }
    }

    if (notFoundOrders.length > 0) {
      return NextResponse.json(
        {
          error: 'Alguns pedidos não foram encontrados',
          notFoundOrders,
        },
        { status: 404 }
      );
    }

    // 2. Buscar dados completos dos clientes
    const clientsMap = new Map<string, LunnaClient>();
    const missingClients: string[] = [];

    for (const order of orders) {
      if (!clientsMap.has(order.client.id)) {
        const clientDoc = await getDoc(doc(db, 'clientes', order.client.id));
        if (clientDoc.exists()) {
          clientsMap.set(order.client.id, clientDoc.data() as LunnaClient);
        } else {
          missingClients.push(`Pedido ${order.number}: Cliente ${order.client.name} (ID: ${order.client.id}) não encontrado`);
        }
      }
    }

    if (missingClients.length > 0) {
      return NextResponse.json(
        {
          error: 'Alguns clientes não foram encontrados na coleção "clientes"',
          missingClients,
        },
        { status: 404 }
      );
    }

    // 3. Converter pedidos em stops (PlaceValue) e geocodificar
    const stopsToProcess: Array<{
      order: LunnaOrder;
      client: LunnaClient;
      addressString: string;
    }> = [];

    for (const order of orders) {
      const client = clientsMap.get(order.client.id);
      if (!client) continue;

      // Montar endereço completo com TODAS as informações
      const addressParts = [
        client.rua,
        client.numero,
        client.bairro,
        client.cidade,
        `CEP ${client.cep}`,
      ].filter(Boolean);

      const addressString = `${addressParts.join(', ')}, Brasil`;

      stopsToProcess.push({
        order,
        client,
        addressString,
      });
    }

    // Geocodificar endereços
    const geocodingResults: Array<{
      order: LunnaOrder;
      client: LunnaClient;
      geocoded: PlaceValue | null;
      addressString: string;
    }> = [];

    for (const item of stopsToProcess) {
      const geocoded = await geocodeAddress(item.addressString);
      geocodingResults.push({
        ...item,
        geocoded,
      });
    }

    // Separar sucessos e falhas
    const successfulStops: PlaceValue[] = [];
    const failedGeocodings: Array<{ orderNumber: string; reason: string }> = [];

    for (const result of geocodingResults) {
      if (result.geocoded) {
        // Geocoding bem-sucedido
        const stop: PlaceValue = {
          ...result.geocoded,
          id: `lunna-${result.order.id}-${Date.now()}`,
          customerName: result.client.nome,
          phone: result.client.telefone,
          notes: result.order.complement?.notes || `Pedido Lunna: ${result.order.number}`,
          orderNumber: result.order.number,
          complemento: result.client.complemento,
          addressString: result.addressString.replace(', Brasil', ''),
          deliveryStatus: 'pending',
        };
        successfulStops.push(stop);
      } else {
        // Geocoding falhou - criar stop com flag de problema
        const stopWithIssue: PlaceValue = {
          id: `lunna-${result.order.id}-${Date.now()}`,
          address: result.addressString.replace(', Brasil', ''),
          placeId: '',
          lat: 0,
          lng: 0,
          customerName: result.client.nome,
          phone: result.client.telefone,
          notes: result.order.complement?.notes || `Pedido Lunna: ${result.order.number}`,
          orderNumber: result.order.number,
          complemento: result.client.complemento,
          addressString: result.addressString.replace(', Brasil', ''),
          deliveryStatus: 'pending',
          hasValidationIssues: true,
          validationIssues: ['Endereço não foi geocodificado. Necessário editar manualmente.'],
        };
        successfulStops.push(stopWithIssue);
        failedGeocodings.push({
          orderNumber: result.order.number,
          reason: 'Endereço não encontrado pela API de geocoding',
        });
      }
    }

    // 4. Gerar código da rota (LN-XXXX)
    const routeCode = await generateLunnaRouteCode();

    // 5. Criar rota no Firestore
    const routeData: Partial<RouteInfo> & { plannedDate: any; createdBy: string; createdAt: any } = {
      code: routeCode,
      stops: successfulStops,
      encodedPolyline: '', // Será preenchido após otimização manual
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

    // 6. Atualizar status dos pedidos no Lunna
    for (const order of orders) {
      await updateDoc(doc(db, 'orders', order.id), {
        logisticsStatus: 'em_rota',
        rotaExataRouteId: routeRef.id,
        rotaExataRouteCode: routeCode,
        updatedAt: serverTimestamp(),
      });
    }

    // 7. Retornar resposta com estatísticas
    return NextResponse.json({
      success: true,
      routeId: routeRef.id,
      routeCode: routeCode,
      stats: {
        total: orders.length,
        success: successfulStops.filter((s) => !s.hasValidationIssues).length,
        withIssues: failedGeocodings.length,
        failedGeocodings: failedGeocodings,
      },
    });
  } catch (error) {
    console.error('Erro ao importar pedidos:', error);
    return NextResponse.json(
      {
        error: 'Erro interno ao processar pedidos',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
