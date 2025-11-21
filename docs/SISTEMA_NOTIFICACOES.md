# Sistema de Notificações do RotaExata

## Visão Geral

O sistema de notificações do RotaExata permite que administradores enviem notificações customizadas para motoristas através de dois canais:

1. **Notificações In-App**: Aparece na lista de notificações dentro do aplicativo
2. **Notificações Push (FCM)**: Aparece mesmo quando o app está fechado

## Funcionalidades Principais

### 1. Página de Notificações (`/notifications`)

Acessível por administradores, gestores e sócios, permite:

- ✅ **Criar notificações customizadas** para motoristas específicos ou todos
- ✅ **Visualizar todas as notificações** do sistema
- ✅ **Rastrear status** de cada notificação (enviada, aberta, quando foi aberta)
- ✅ **Filtrar notificações** por tipo, status (lida/não lida), busca
- ✅ **Estatísticas** em tempo real (total, não lidas, hoje, alta prioridade)
- ✅ **Marcar como lida/não lida** individualmente ou em massa
- ✅ **Excluir notificações**

### 2. Criação de Notificações Customizadas

#### Campos do Formulário:

- **Título** (obrigatório, máx. 100 caracteres)
- **Mensagem** (obrigatório, máx. 500 caracteres)
- **Tipo**:
  - Sistema
  - Alerta
  - Rota Atribuída
  - Alteração de Rota
  - Rota Concluída
- **Prioridade**:
  - Baixa
  - Média
  - Alta (notificações de alta prioridade não desaparecem automaticamente)
- **Destinatários**:
  - Selecionar motoristas específicos
  - Enviar para todos os motoristas
- **Push Notification**: Opção de enviar notificação push ou apenas in-app

## Modelo de Dados

### Estrutura de uma Notificação no Firestore

```javascript
{
  // Identificação
  id: "abc123",

  // Conteúdo
  title: "Atenção - Nova política de entregas",
  message: "A partir de hoje, todas as entregas devem...",
  type: "system", // ou "alert", "route_assigned", "route_change", "route_completed"
  priority: "high", // ou "medium", "low"

  // Destinatário
  driverId: "driver123",
  driverName: "João Silva",

  // Status de rastreamento
  read: false, // Marcado como lido pelo admin
  opened: false, // O motorista abriu a notificação
  openedAt: null, // Timestamp de quando foi aberta

  // Metadados
  timestamp: Timestamp, // Quando foi criada
  createdBy: "admin123", // Quem criou

  // Opcional (se relacionado a rota)
  routeId: "route456",
  routeName: "RT-0123"
}
```

## Fluxo de Funcionamento

### Fluxo Completo: Criação de Notificação Customizada

```
┌─────────────────────────────────────────────────────────────────┐
│  1. ADMIN ABRE PÁGINA /notifications                            │
│     - Clica em "Nova Notificação"                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. DIALOG DE CRIAÇÃO ABRE                                      │
│     (CreateNotificationDialog)                                  │
│                                                                 │
│     - Carrega lista de motoristas do Firestore                 │
│     - Admin preenche formulário                                │
│     - Seleciona destinatários                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. SUBMIT DO FORMULÁRIO                                        │
│                                                                 │
│     Para cada motorista selecionado:                           │
│     ┌─────────────────────────────────────────────────┐       │
│     │ addDoc(collection(db, 'notifications'), {        │       │
│     │   title, message, type, priority,               │       │
│     │   driverId, driverName,                         │       │
│     │   read: false,                                  │       │
│     │   opened: false,                                │       │
│     │   timestamp: serverTimestamp()                  │       │
│     │ })                                              │       │
│     └─────────────────────────────────────────────────┘       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. SE PUSH NOTIFICATION ESTIVER ATIVADO                        │
│                                                                 │
│     Chama Cloud Function:                                       │
│     ┌─────────────────────────────────────────────────┐       │
│     │ httpsCallable('sendCustomNotification')({       │       │
│     │   title, message, driverIds, priority, type     │       │
│     │ })                                              │       │
│     └─────────────────────────────────────────────────┘       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. CLOUD FUNCTION: sendCustomNotification                      │
│     (functions/src/index.ts:458-568)                            │
│                                                                 │
│     - Verifica permissões (admin/socio/gestor)                 │
│     - Para cada motorista:                                     │
│       1. Busca fcmToken no Firestore                          │
│       2. Monta mensagem FCM                                    │
│       3. Envia via Firebase Cloud Messaging                    │
│       4. Registra sucesso/falha                                │
│     - Retorna estatísticas de envio                           │
└────────────────────────┬─────��──────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. FIREBASE SERVERS ENTREGAM NOTIFICAÇÃO                       │
│                                                                 │
│     Se app ABERTO:                                             │
│     → useFCMToken.onMessage() mostra toast + notificação       │
│                                                                 │
│     Se app FECHADO:                                            │
│     → Service Worker mostra notificação do SO                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. MOTORISTA VÊ A NOTIFICAÇÃO                                  │
│                                                                 │
│     - Notificação aparece no dispositivo                       │
│     - Clica na notificação                                     │
│     - App abre na tela /driver/notifications                   │
│     - Notificação fica marcada como "opened"                   │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes do Sistema

### Frontend (Cliente)

#### 1. **CreateNotificationDialog**
- **Arquivo**: `src/components/notifications/create-notification-dialog.tsx`
- **Função**: Dialog para criar notificações customizadas
- **Responsabilidades**:
  - Carregar lista de motoristas
  - Validar formulário
  - Criar notificações no Firestore
  - Chamar Cloud Function para push notifications

#### 2. **NotificationsPage**
- **Arquivo**: `src/app/(admin)/notifications/page.tsx`
- **Função**: Página principal de gerenciamento
- **Responsabilidades**:
  - Listar todas as notificações em tempo real
  - Filtrar por tipo, status, busca
  - Mostrar estatísticas
  - Marcar como lida/não lida
  - Excluir notificações
  - Abrir dialog de criação

#### 3. **useFCMToken Hook**
- **Arquivo**: `src/hooks/use-fcm-token.tsx`
- **Função**: Gerenciar FCM tokens e mensagens em foreground
- **Responsabilidades**:
  - Solicitar permissão de notificações
  - Obter FCM token do dispositivo
  - Salvar token no Firestore
  - Escutar mensagens quando app está aberto

#### 4. **NotificationPermissionPrompt**
- **Arquivo**: `src/components/notifications/notification-permission-prompt.tsx`
- **Função**: Prompt para solicitar permissão de notificações
- **Responsabilidades**:
  - Aparecer para motoristas na primeira vez
  - Solicitar permissão do navegador
  - Salvar fcmToken no documento do usuário

### Backend (Firebase)

#### 1. **Cloud Function: sendCustomNotification**
- **Arquivo**: `functions/src/index.ts:458-568`
- **Tipo**: Callable Function (2nd Gen)
- **Região**: southamerica-east1
- **Função**: Enviar notificações push customizadas

**Fluxo**:
```javascript
1. Verificar autenticação
2. Verificar permissão (admin/socio/gestor)
3. Validar dados (título, mensagem, destinatários)
4. Para cada motorista:
   - Buscar fcmToken do Firestore
   - Montar mensagem FCM
   - Enviar via messaging.send()
5. Retornar estatísticas (sucessos/falhas)
```

**Estrutura da Mensagem FCM**:
```javascript
{
  notification: {
    title: "Título da notificação",
    body: "Mensagem da notificação"
  },
  data: {
    type: "system",
    priority: "high",
    customNotification: "true",
    title: "Título da notificação",
    body: "Mensagem da notificação"
  },
  token: "fcmToken_do_motorista",
  android: {
    priority: "high", // ou "normal"
    notification: {
      title: "Título da notificação", // Explícito para evitar "from RotaExata"
      body: "Mensagem da notificação",
      sound: "default",
      priority: "high", // ou "default"
      channelId: "custom_notifications",
      icon: "@mipmap/ic_launcher",
      color: "#2962FF"
    }
  },
  webpush: {
    notification: {
      title: "Título da notificação", // Explícito
      body: "Mensagem da notificação",
      icon: "/icons/pwa-192.png",
      badge: "/icons/pwa-192.png",
      requireInteraction: true, // Se prioridade alta
      tag: "custom-timestamp"
    },
    fcmOptions: {
      link: "/driver/notifications" // Onde abrir ao clicar
    }
  }
}
```

#### 2. **Service Worker: firebase-messaging-sw.js**
- **Arquivo**: `public/firebase-messaging-sw.js`
- **Função**: Receber notificações em background
- **Responsabilidades**:
  - Escutar mensagens quando app está fechado
  - Mostrar notificação nativa do SO
  - Detectar cliques e abrir app

### Firestore

#### Collection: `notifications`

**Regras de Segurança**:
```javascript
match /notifications/{notificationId} {
  // Admins/gestores/sócios podem fazer tudo
  allow read, create, update, delete: if isAppAdmin();

  // Motoristas podem apenas ler suas próprias notificações
  allow read: if request.auth != null && resource.data.driverId == request.auth.uid;

  // Motoristas podem atualizar apenas os campos opened e openedAt
  allow update: if request.auth != null
    && resource.data.driverId == request.auth.uid
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['opened', 'openedAt']);
}
```

**Índices Necessários**:
- `timestamp` (DESC) - Para ordenação padrão
- `driverId` + `timestamp` (DESC) - Para filtrar por motorista
- `type` + `timestamp` (DESC) - Para filtrar por tipo
- `driverId` + `opened` (ASC) - Para contar não lidas

## Diferenças entre Tipos de Notificação

### Notificações Automáticas do Sistema

| Tipo | Quando é Criada | Criada Por | Push |
|------|----------------|------------|------|
| `route_change` | Quando admin altera rota em andamento | Cloud Function `notifyRouteChanges` | ✅ Sim |
| `route_assigned` | Quando admin atribui rota a motorista | Cloud Function (se implementado) | ✅ Sim |
| `route_completed` | Quando rota é marcada como concluída | Cloud Function (se implementado) | ❌ Não |

### Notificações Customizadas

| Tipo | Quando é Criada | Criada Por | Push |
|------|----------------|------------|------|
| `system` | Admin cria manualmente | Admin via UI | ✅ Opcional |
| `alert` | Admin cria manualmente | Admin via UI | ✅ Opcional |

## Rastreamento de Status

### Estados de uma Notificação

1. **Criada** (`read: false, opened: false`)
   - Notificação acabou de ser criada
   - Ainda não foi visualizada pelo motorista
   - Badge: "Enviada" (azul)

2. **Aberta** (`read: false, opened: true, openedAt: Timestamp`)
   - Motorista abriu a notificação no app
   - `openedAt` registra quando foi aberta
   - Badge: "Aberta dd/MM às HH:mm" (verde)

3. **Marcada como lida** (`read: true`)
   - Admin marcou manualmente como lida
   - Usado para organização administrativa
   - Não afeta o status de "opened"

## Estatísticas da Página

### Cards de Estatísticas

1. **Total**: Contador de todas as notificações
2. **Não Lidas**: Notificações com `read: false`
3. **Hoje**: Notificações criadas hoje (comparação de data)
4. **Alta Prioridade**: Notificações com `priority: 'high'`

### Filtros Disponíveis

- **Por Tipo**: Todos, Alteração de Rota, Rota Atribuída, Rota Concluída, Alerta, Sistema
- **Por Status**: Todos, Não lidas, Lidas
- **Por Busca**: Busca em título, mensagem, nome do motorista, nome da rota

## Deploy e Configuração

### Deploy da Cloud Function

```bash
cd /Users/acassiusalves/rotaExata/functions
npm run build
firebase deploy --only functions:sendCustomNotification
```

### Verificar Deploy

```bash
firebase functions:log --only sendCustomNotification
```

### Testar Manualmente

1. Acesse http://localhost:2000/notifications
2. Clique em "Nova Notificação"
3. Preencha o formulário
4. Selecione um motorista
5. Marque "Enviar notificação push"
6. Clique em "Enviar Notificação"
7. Verifique os logs da Cloud Function
8. Verifique se o motorista recebeu a notificação

## Solução de Problemas

### Notificação não aparece para o motorista

**Causas possíveis**:
- Motorista não aceitou permissão de notificações
- FCM token não foi salvo no Firestore
- Service Worker não está registrado
- Erro na Cloud Function

**Como verificar**:
```javascript
// No console do navegador do motorista
console.log('Permission:', Notification.permission);
console.log('FCM Token:', /* verificar no Firestore */);
```

### Push notification não é enviada

**Causas possíveis**:
- Cloud Function falhou
- FCM token inválido ou expirado
- Configuração incorreta do Firebase

**Como verificar**:
```bash
# Ver logs da Cloud Function
firebase functions:log --only sendCustomNotification --limit 50
```

### Notificação duplicada

**Causas possíveis**:
- Motorista está em múltiplos dispositivos
- FCM token desatualizado
- Múltiplos listeners ativos

**Solução**:
- Implementar lógica de deduplicação usando `tag` nas notificações

### Aparece "from RotaExata" na notificação

**Causa**: Android adiciona automaticamente o nome do app

**Solução**: Definir explicitamente `title` e `body` em `android.notification` e `webpush.notification`

## Melhorias Futuras

- [ ] Agendamento de notificações (enviar em data/hora específica)
- [ ] Templates de notificações (mensagens pré-definidas)
- [ ] Histórico de notificações enviadas por admin
- [ ] Analytics de abertura (taxa de abertura, tempo até abrir)
- [ ] Suporte a imagens e ações customizadas nas notificações
- [ ] Notificações por SMS/Email como fallback
- [ ] Categorias de notificações (urgente, informativo, lembretes)
- [ ] Rich notifications com botões de ação
- [ ] Suporte a notificações em grupo
- [ ] Dashboard de estatísticas de engajamento
