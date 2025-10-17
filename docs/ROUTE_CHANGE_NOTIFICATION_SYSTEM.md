# Sistema de Notificação de Alterações de Rota

## Visão Geral

Este sistema foi implementado para notificar motoristas sobre alterações feitas pelo administrador em rotas que estão em andamento. Quando o administrador edita pontos de entrega ou altera a sequência de paradas, o motorista recebe uma notificação visual e deve confirmar que recebeu as mudanças.

## Componentes do Sistema

### 1. **Tipos TypeScript** (`src/lib/types.ts`)

Novos tipos adicionados:

```typescript
// Campos adicionados em PlaceValue para marcar paradas modificadas
wasModified?: boolean;
modifiedAt?: Timestamp | Date;
modificationType?: 'address' | 'sequence' | 'data' | 'removed' | 'added';
originalSequence?: number;

// Tipo de notificação de mudança de rota
RouteChangeNotification {
  id: string;
  routeId: string;
  driverId: string;
  changes: Array<RouteChange>;
  createdAt: Timestamp | Date;
  acknowledgedAt?: Timestamp | Date;
  acknowledged: boolean;
}

// Campos adicionados em RouteInfo
pendingChanges?: boolean;
lastModifiedAt?: Timestamp | Date;
lastModifiedBy?: string;
```

### 2. **Utilitário de Rastreamento** (`src/lib/route-change-tracker.ts`)

Funções principais:

- **`detectRouteChanges(oldStops, newStops)`**: Compara duas versões de paradas e retorna as mudanças
- **`markModifiedStops(stops, changes)`**: Adiciona flags visuais nas paradas alteradas
- **`createNotification(routeId, driverId, changes)`**: Cria objeto de notificação

### 3. **Componentes de UI**

#### **RouteChangesNotification** (`src/components/driver/route-changes-notification.tsx`)
- Dialog modal que aparece para o motorista
- Mostra todas as alterações de forma destacada
- Botão de confirmação para o motorista

#### **StopChangeBadge** (`src/components/driver/stop-change-badge.tsx`)
- Badge visual que aparece em paradas modificadas
- Cores diferentes por tipo de mudança:
  - 🔵 Azul: Sequência alterada
  - 🟠 Laranja: Endereço modificado
  - 🟣 Roxo: Dados atualizados
  - 🟢 Verde: Nova parada adicionada
  - 🔴 Vermelho: Parada removida

### 4. **Cloud Function** (`functions/src/index.ts`)

**`notifyRouteChanges`**:
- Cria notificação no Firestore (`routeChangeNotifications/{routeId}`)
- Marca a rota com `pendingChanges: true`
- Registra `lastModifiedAt` e `lastModifiedBy`

### 5. **Integração no Admin** (`src/app/(admin)/routes/organize/page.tsx`)

Ao atualizar uma rota:
1. Busca a versão atual do Firestore
2. Detecta mudanças entre versão antiga e nova
3. Marca paradas modificadas com flags
4. Salva no Firestore
5. Se houver mudanças e rota estiver `in_progress`, chama `notifyRouteChanges`

### 6. **Integração no App do Motorista** (`src/app/(driver)/my-routes/[id]/page.tsx`)

- **Listener de notificações**: Monitora `routeChangeNotifications/{routeId}`
- **Badge visual**: Mostra badges em paradas com `wasModified === true`
- **Dialog de confirmação**: Aparece automaticamente quando há notificação não confirmada
- **Função de confirmação**: Marca notificação como `acknowledged` e limpa flags das paradas

### 7. **Indicador no Admin** (`src/app/(admin)/routes/page.tsx`)

Badge laranja pulsante em rotas com alterações pendentes de confirmação:
```
🔔 Aguardando confirmação
```

## Fluxo de Funcionamento

### Cenário 1: Administrador altera sequência de paradas

1. Admin acessa `/routes/organize` com rota existente
2. Admin reorganiza as paradas (drag & drop)
3. Admin clica em "Atualizar Rota Existente"
4. Sistema detecta:
   - Parada #1 → #3 (mudança de sequência)
   - Parada #2 → #1 (mudança de sequência)
5. Paradas são marcadas com:
   ```typescript
   {
     wasModified: true,
     modificationType: 'sequence',
     originalSequence: 0, // posição anterior
     modifiedAt: Timestamp.now()
   }
   ```
6. Notificação é criada em Firestore
7. Motorista recebe dialog popup imediatamente
8. Motorista vê badges azuis pulsantes nas paradas alteradas
9. Motorista clica em "Confirmar Recebimento"
10. Flags são limpos e badge some

### Cenário 2: Administrador altera endereço

1. Admin edita coordenadas de uma parada
2. Sistema detecta mudança de endereço
3. Parada é marcada com `modificationType: 'address'`
4. Motorista vê badge laranja "ENDEREÇO MODIFICADO"

### Cenário 3: Administrador adiciona nova parada

1. Admin adiciona parada à rota em andamento
2. Sistema detecta nova parada
3. Parada é marcada com `modificationType: 'added'`
4. Motorista vê badge verde "NOVA PARADA"

## Estrutura no Firestore

### Collection: `routes/{routeId}`
```json
{
  "stops": [
    {
      "id": "stop1",
      "address": "Rua A, 123",
      "wasModified": true,
      "modificationType": "sequence",
      "originalSequence": 0,
      "modifiedAt": "2025-01-15T10:30:00Z"
    }
  ],
  "pendingChanges": true,
  "lastModifiedAt": "2025-01-15T10:30:00Z",
  "lastModifiedBy": "adminUserId"
}
```

### Collection: `routeChangeNotifications/{routeId}`
```json
{
  "routeId": "route123",
  "driverId": "driver456",
  "changes": [
    {
      "stopId": "stop1",
      "stopIndex": 2,
      "changeType": "sequence",
      "oldValue": 0,
      "newValue": 2
    }
  ],
  "createdAt": "2025-01-15T10:30:00Z",
  "acknowledged": false
}
```

## Deploy das Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions:notifyRouteChanges
```

## Testes

### Testar notificação manualmente:

1. Faça login como admin
2. Acesse uma rota em andamento
3. Reordene as paradas
4. Clique em "Atualizar Rota Existente"
5. Em outra aba, faça login como o motorista daquela rota
6. Acesse a página da rota `/my-routes/{routeId}`
7. Deve aparecer o dialog de notificação automaticamente
8. Verifique os badges nas paradas alteradas
9. Clique em "Confirmar Recebimento"
10. Na aba do admin, o badge laranja deve desaparecer

## Melhorias Futuras

- [ ] Push notifications para mobile
- [ ] Histórico de alterações de rota
- [ ] Opção de reverter alterações
- [ ] Notificações por email/SMS
- [ ] Analytics de confirmação (tempo até confirmar)
- [ ] Suporte a comentários do motorista sobre alterações

## Troubleshooting

**Notificação não aparece para o motorista:**
- Verifique se a rota está com `status: 'in_progress'`
- Confirme que `driverId` está definido na rota
- Verifique o console do navegador para erros
- Confirme que a Cloud Function foi deployada

**Badge não desaparece após confirmação:**
- Verifique se o listener está ativo
- Confirme que `acknowledged: true` foi salvo no Firestore
- Limpe o cache do navegador

**Alterações não são detectadas:**
- Verifique se `currentRouteId` está definido
- Confirme que a rota é `isExistingRoute: true`
- Revise logs do console para erros na função `detectRouteChanges`
