'use client';

import * as React from 'react';
import { Smartphone, Truck, Mail, Phone, Clock, Star, Package, BatteryCharging, Wifi } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Driver } from '@/lib/types';

interface DriverDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  driver: Driver | null;
}

const statusLabelMap = {
  available: 'Disponível',
  online: 'Online',
  busy: 'Ocupado',
  offline: 'Offline',
} as const;

function formatDate(date: Date | null | undefined) {
  if (!date || date.getTime() === 0) return 'Sem registro';
  return date.toLocaleString('pt-BR');
}

function formatPhone(phone?: string) {
  if (!phone || phone === 'N/A') return 'Não informado';

  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return phone;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{value}</div>
    </div>
  );
}

export function DriverDetailsDialog({
  isOpen,
  onClose,
  driver,
}: DriverDetailsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cadastro do Motorista</DialogTitle>
          <DialogDescription>
            Visão consolidada do cadastro e do último estado operacional do motorista.
          </DialogDescription>
        </DialogHeader>

        {driver ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{driver.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{driver.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{formatPhone(driver.phone)}</span>
                </div>
              </div>
              <Badge variant={driver.status === 'offline' ? 'secondary' : 'default'}>
                {statusLabelMap[driver.status] || 'Offline'}
              </Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow
                label="Veículo"
                value={
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span>{driver.vehicle.type} {driver.vehicle.plate !== 'N/A' ? `- ${driver.vehicle.plate}` : ''}</span>
                  </div>
                }
              />
              <DetailRow
                label="Última atividade"
                value={
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDate(driver.lastSeenAt)}</span>
                  </div>
                }
              />
              <DetailRow
                label="Entregas concluídas"
                value={
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span>{driver.totalDeliveries}</span>
                  </div>
                }
              />
              <DetailRow
                label="Avaliação"
                value={
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span>{driver.rating}</span>
                  </div>
                }
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold">Dispositivo</h4>
                <p className="text-sm text-muted-foreground">
                  Informações do último dispositivo reportado pelo app do motorista.
                </p>
              </div>

              {driver.deviceInfo ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailRow
                    label="Modelo"
                    value={
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <span>{driver.deviceInfo.deviceModel || 'Desconhecido'}</span>
                      </div>
                    }
                  />
                  <DetailRow
                    label="Sistema"
                    value={`${driver.deviceInfo.osName || 'N/A'} ${driver.deviceInfo.osVersion || ''}`.trim()}
                  />
                  <DetailRow
                    label="Conexão"
                    value={
                      <div className="flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {(driver.deviceInfo.connectionEffectiveType || driver.deviceInfo.connectionType || 'Desconhecida').toUpperCase()}
                        </span>
                      </div>
                    }
                  />
                  <DetailRow
                    label="Bateria"
                    value={
                      <div className="flex items-center gap-2">
                        <BatteryCharging className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {driver.deviceInfo.batteryLevel ?? 'N/A'}%
                          {driver.deviceInfo.batteryCharging ? ' • carregando' : ''}
                        </span>
                      </div>
                    }
                  />
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Ainda não há telemetria de dispositivo para este motorista.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-6 text-sm text-muted-foreground">
            Nenhum motorista selecionado.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
