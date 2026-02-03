import type { LucideIcon } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
};

export type DeliveryStatus = 'pending' | 'en_route' | 'arrived' | 'completed' | 'failed';

export type Payment = {
  id: string; // Um ID único para a chave no React
  method: string;
  value: number;
  installments?: number;
  pixType?: 'qrcode' | 'cnpj'; // Tipo de PIX: QR Code ou CNPJ
};


export type PlaceValue = {
  id: string;
  address: string;
  placeId: string;
  lat: number;
  lng: number;
  // Campos adicionais da planilha
  customerName?: string;
  phone?: string;
  notes?: string;
  orderNumber?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  hasTimePreference?: boolean; // Se o ponto tem preferência de horário de entrega
  addressString?: string;
  complemento?: string;
  // Campos de validação de endereço
  originalAddressParts?: Record<string, string>;
  validationIssues?: string[];
  hasValidationIssues?: boolean;
  // Campos de rastreamento
  deliveryStatus?: DeliveryStatus;
  arrivedAt?: Timestamp | Date;
  completedAt?: Timestamp | Date;
  photoUrl?: string;
  signatureUrl?: string;
  failureReason?: string;
  wentToLocation?: boolean; // Se o motorista foi até o local em caso de falha
  attemptPhotoUrl?: string; // URL da foto do local em caso de tentativa de entrega
  payments?: Payment[]; // Substituído paymentMethod e creditCardInstallments
  // Campos de conciliação
  reconciled?: boolean; // Se a entrega foi conciliada/verificada
  reconciledAt?: Timestamp | Date; // Data de conciliação
  reconciledBy?: string; // ID do usuário que conciliou
  reconciledMethod?: 'manual' | 'ai'; // Método de conciliação (manual ou IA)
  aiExtractedValue?: number; // Valor extraído pela IA do comprovante
  // Campos de alteração de rota
  wasModified?: boolean;
  modifiedAt?: Timestamp | Date;
  modificationType?: 'address' | 'sequence' | 'data' | 'removed' | 'added';
  originalSequence?: number;
  // Campos específicos para pedidos Lunna
  expectedValue?: number; // Valor total esperado do pedido (billing.finalValue)
  items?: LunnaOrderItem[]; // Lista de produtos do pedido
  deliveredItemIds?: string[]; // IDs dos itens efetivamente entregues
  hasExchangeItems?: boolean; // Se tem itens de troca
  operationType?: 'venda' | 'troca' | 'misto'; // Tipo da operação
  lunnaClientCode?: string; // Código do cliente no Lunna
};

export type DriverLocation = {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: Timestamp | Date;
};

export type DriverLocationWithInfo = DriverLocation & {
  driverName: string;
  driverId: string;
  deviceInfo?: DeviceInfo;
};

export type RouteChangeNotification = {
  id: string;
  routeId: string;
  driverId: string;
  changes: Array<{
    stopId: string;
    stopIndex: number;
    changeType: 'address' | 'sequence' | 'data' | 'removed' | 'added';
    oldValue?: any;
    newValue?: any;
  }>;
  createdAt: Timestamp | Date;
  acknowledgedAt?: Timestamp | Date;
  acknowledged: boolean;
};

export type RouteInfo = {
  code?: string; // Código sequencial único (ex: RT-0001)
  stops: PlaceValue[];
  encodedPolyline: string;
  distanceMeters: number;
  duration: string;
  color?: string; // Optional color for rendering
  visible?: boolean;
  status?: 'draft' | 'dispatched' | 'in_progress' | 'completed' | 'completed_auto';
  // Rastreamento em tempo real
  currentLocation?: DriverLocation;
  currentStopIndex?: number;
  startedAt?: Timestamp | Date;
  completedAt?: Timestamp | Date;
  actualPath?: Array<{ lat: number; lng: number; timestamp: Timestamp | Date }>;
  // Sistema de notificação de alterações
  pendingChanges?: boolean;
  lastModifiedAt?: Timestamp | Date;
  lastModifiedBy?: string;
  // Integração com sistema Lunna
  source?: 'rota-exata' | 'lunna'; // Origem da rota
  lunnaOrderIds?: string[]; // Array de números de pedidos do Lunna (ex: ['P0001', 'P0002'])
};

export type OrderStatus =
  | 'created'
  | 'assigned'
  | 'picked_up'
  | 'in_route'
  | 'delivered'
  | 'failed_attempt'
  | 'canceled';

export type Order = {
  id: string; // Document id
  code: string;
  status: OrderStatus;
  pickup: Partial<PlaceValue>;
  destination: Partial<PlaceValue>;
  distanceMeters: number;
  duration: string; // "1234s"
  encodedPolyline: string;
  price: {
    base: number;
    perKm: number;
    total: number;
  };
  createdAt: Date | Timestamp;
  notes?: string;
  assignedTo?: string;
  customer?: {
    name: string;
    address: string;
  }
};

export type DriverStatus = 'offline' | 'available' | 'busy' | 'online';

export type DeviceInfo = {
  // Informacoes do dispositivo
  userAgent?: string;
  platform?: string;
  deviceModel?: string;
  osName?: string;
  osVersion?: string;
  browserName?: string;
  browserVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
  devicePixelRatio?: number;
  language?: string;
  // Status de rede
  connectionType?: string;
  connectionEffectiveType?: string;
  downlink?: number | null;
  rtt?: number | null;
  saveData?: boolean;
  online?: boolean;
  // Status da bateria
  batteryLevel?: number | null;
  batteryCharging?: boolean | null;
  // Timestamp
  lastUpdated?: Timestamp | Date;
};

export type Driver = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: DriverStatus;
  vehicle: {
    type: string;
    plate: string;
  };
  lastSeenAt: Date;
  totalDeliveries: number;
  rating: number;
  avatarUrl: string;
  deviceInfo?: DeviceInfo;
};

export type User = {
  uid: string;
  email: string;
  role: 'admin' | 'vendedor' | 'driver' | string; // string for flexibility
  createdAt: Date | Timestamp;
  displayName?: string;
  photoURL?: string;
};


export type ActivityEvent = {
  id: string;
  type: 'status_change' | 'note' | 'assignment';
  timestamp: Date;
  actor: {
    name: string;
    role: 'admin' | 'driver';
  };
  details: string;
};

// ============================================
// TIPOS PARA INTEGRAÇÃO COM SISTEMA LUNNA
// ============================================

// Item do pedido Lunna (usado no checklist do motorista)
export type LunnaOrderItem = {
  id: string; // ID único para identificação
  code: string; // Código do produto
  description: string; // Descrição do produto
  quantity: number; // Quantidade
  subtotal: number; // Valor subtotal
  tipo: 'Venda' | 'Troca'; // Tipo da operação
};

export type LunnaOrder = {
  id: string; // ID do documento no Firestore
  number: string; // Número do pedido (P0001, P0002, etc.)
  client: {
    id: string;
    name: string;
  };
  createdAt: Timestamp | Date;
  createdBy: string;
  updatedAt?: Timestamp | Date;
  items: Array<{
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    tipo: 'Venda' | 'Troca';
    productId?: string;
  }>;
  billing: {
    finalValue: number;
  };
  shipping?: {
    deliveryDate?: Timestamp | Date;
    deliveryTimeStart?: string; // Horário início da janela de entrega (ex: "08:00")
    deliveryTimeEnd?: string;   // Horário fim da janela de entrega (ex: "12:00")
    deliveryPeriod?: 'Matutino' | 'Vespertino' | 'Integral'; // Período de entrega
  };
  complement?: {
    notes?: string;
  };
  logisticsStatus?: 'pendente' | 'em_rota' | 'entregue' | 'falha';
  rotaExataRouteId?: string; // ID da rota no Rota Exata
  rotaExataRouteCode?: string; // Código da rota (LN-0001)
};

export type LunnaClient = {
  codigo: string;
  nome: string;
  tipo: 'cpf' | 'cnpj';
  telefone: string;
  email: string;
  cpf?: string;
  cnpj?: string;
  dataNascimento?: string;
  inscricaoEstadual?: string;
  razaoSocial?: string;
  rua: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  cep: string;
};
