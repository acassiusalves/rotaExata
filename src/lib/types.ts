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
  payments?: Payment[]; // Substituído paymentMethod e creditCardInstallments
  // Campos de conciliação
  reconciled?: boolean; // Se a entrega foi conciliada/verificada
  reconciledAt?: Timestamp | Date; // Data de conciliação
  reconciledBy?: string; // ID do usuário que conciliou
  // Campos de alteração de rota
  wasModified?: boolean;
  modifiedAt?: Timestamp | Date;
  modificationType?: 'address' | 'sequence' | 'data' | 'removed' | 'added';
  originalSequence?: number;
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
  stops: PlaceValue[];
  encodedPolyline: string;
  distanceMeters: number;
  duration: string;
  color?: string; // Optional color for rendering
  visible?: boolean;
  status?: 'dispatched' | 'in_progress' | 'completed';
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
