import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
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
  id: string;
  code: string;
  status: OrderStatus;
  createdAt: Date;
  customer: {
    name: string;
    address: string;
    phone?: string;
  };
  pickup: {
    address: string;
    name?: string;
  };
  assignedTo?: string; // driverId
  price: {
    total: number;
  };
  notes?: string;
};

export type DriverStatus = 'offline' | 'available' | 'busy';

export type Driver = {
  id: string;
  name: string;
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
