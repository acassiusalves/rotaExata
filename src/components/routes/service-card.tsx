'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ChevronDown,
  ChevronRight,
  Package,
  Route,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  MapPin,
  User,
  Settings,
} from 'lucide-react';
import { LunnaBadge } from './lunna-badge';
import type { LunnaService, LunnaServiceStatus, RouteInfo, Driver } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';

interface ServiceCardProps {
  service: LunnaService;
  routes: Array<{ id: string; data: RouteInfo; driverInfo?: { name: string; vehicle: { type: string; plate: string } } }>;
  onOrganize?: (serviceId: string) => void;
  onExpandRoute?: (routeId: string) => void;
  defaultExpanded?: boolean;
}

const statusConfig: Record<LunnaServiceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  organizing: {
    label: 'Organizando',
    color: 'bg-amber-500 hover:bg-amber-600',
    icon: <Settings className="h-3 w-3" />,
  },
  dispatched: {
    label: 'Despachado',
    color: 'bg-blue-500 hover:bg-blue-600',
    icon: <Route className="h-3 w-3" />,
  },
  in_progress: {
    label: 'Em Andamento',
    color: 'bg-purple-500 hover:bg-purple-600',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: 'Concluído',
    color: 'bg-green-500 hover:bg-green-600',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  partial: {
    label: 'Parcial',
    color: 'bg-orange-500 hover:bg-orange-600',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

const routeStatusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-gray-500' },
  dispatched: { label: 'Despachada', color: 'bg-blue-500' },
  in_progress: { label: 'Em Andamento', color: 'bg-purple-500' },
  completed: { label: 'Concluída', color: 'bg-green-500' },
  completed_auto: { label: 'Concluída (Auto)', color: 'bg-green-500' },
};

export function ServiceCard({
  service,
  routes,
  onOrganize,
  onExpandRoute,
  defaultExpanded = false,
}: ServiceCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  const statusInfo = statusConfig[service.status];
  const totalStops = service.stats?.totalDeliveries || service.allStops?.length || 0;

  // Formatar data
  const plannedDate = service.plannedDate instanceof Timestamp
    ? service.plannedDate.toDate()
    : service.plannedDate instanceof Date
      ? service.plannedDate
      : new Date();

  return (
    <Card className="overflow-hidden">
      {/* Header do Serviço */}
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Ícone de expansão */}
            <Button variant="ghost" size="icon" className="h-6 w-6">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>

            {/* Código e Badge Luna */}
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold">{service.code}</CardTitle>
              <LunnaBadge />
            </div>
          </div>

          {/* Status e Ações */}
          <div className="flex items-center gap-2">
            <Badge className={`${statusInfo.color} text-white flex items-center gap-1`}>
              {statusInfo.icon}
              {statusInfo.label}
            </Badge>

            {service.status === 'organizing' && onOrganize && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onOrganize(service.id);
                }}
              >
                Organizar Rotas
              </Button>
            )}
          </div>
        </div>

        {/* Descrição */}
        <CardDescription className="flex items-center gap-4 mt-2">
          <span className="flex items-center gap-1">
            <Package className="h-4 w-4" />
            {totalStops} paradas
          </span>
          <span className="flex items-center gap-1">
            <Route className="h-4 w-4" />
            {routes.length || service.stats?.totalRoutes || 0} rotas
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {format(plannedDate, "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </CardDescription>

        {/* Estatísticas */}
        {service.stats && (service.stats.completedDeliveries > 0 || service.stats.failedDeliveries > 0) && (
          <div className="flex items-center gap-4 mt-2 text-sm">
            {service.stats.completedDeliveries > 0 && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                {service.stats.completedDeliveries} entregues
              </span>
            )}
            {service.stats.failedDeliveries > 0 && (
              <span className="text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {service.stats.failedDeliveries} falhas
              </span>
            )}
          </div>
        )}
      </CardHeader>

      {/* Lista de Rotas (expandível) */}
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="border-t pt-4 space-y-2">
            {routes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma rota criada. Clique em "Organizar Rotas" para dividir as paradas em rotas.
              </p>
            ) : (
              routes.map((route) => {
                const routeStatus = routeStatusConfig[route.data.status || 'draft'];
                return (
                  <div
                    key={route.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => onExpandRoute?.(route.id)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Cor da rota */}
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: route.data.color || '#6366f1' }}
                      />

                      {/* Código da rota */}
                      <span className="font-medium">{route.data.code}</span>

                      {/* Número de paradas */}
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {route.data.stops?.length || 0} paradas
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Motorista */}
                      {route.driverInfo ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback>{route.driverInfo.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{route.driverInfo.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Sem motorista
                        </span>
                      )}

                      {/* Status da rota */}
                      <Badge className={`${routeStatus.color} text-white text-xs`}>
                        {routeStatus.label}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
