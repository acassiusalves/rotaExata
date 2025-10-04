import type { LucideIcon } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
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
};

export type RouteInfo = {
  stops: PlaceValue[];
  encodedPolyline: string;
  distanceMeters: number;
  duration: string;
  color?: string; // Optional color for rendering
  visible?: boolean;
  status?: 'dispatched' | 'in_progress' | 'completed';
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
