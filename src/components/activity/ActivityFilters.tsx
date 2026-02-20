import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';
import { CATEGORIAS, getEventTypeLabel } from '@/lib/utils/activity-helpers';
import type { ActivityEventType } from '@/lib/types';

export interface FilterState {
  searchTerm: string;
  categoria: string;
  tipoEvento: string;
  dataInicio: string;
  dataFim: string;
  usuario: string;
}

interface ActivityFiltersProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  usuarios: Array<{ id: string; name: string }>;
}

const TODOS_EVENTOS: ActivityEventType[] = [
  'service_created',
  'route_created',
  'point_created',
  'point_moved_to_route',
  'point_reordered',
  'point_removed_from_route',
  'point_added_to_route',
  'service_updated',
  'route_updated',
  'point_data_updated',
  'point_delivery_started',
  'point_arrived',
  'point_completed',
  'point_failed',
  'route_dispatched',
  'driver_assigned',
  'driver_unassigned',
  'route_auto_completed',
  'route_resent',
  'payment_approved',
  'payment_marked_as_paid',
  'payment_cancelled',
  'payment_batch_approved',
  'bank_reconciliation',
  'stock_entry',
  'stock_exit',
  'stock_adjustment',
  'stock_reservation',
  'stock_release',
  'customer_data_updated',
  'order_data_updated',
  'price_changed',
  'lunna_order_synced',
  'lunna_status_updated',
];

export function ActivityFilters({
  filters,
  onFilterChange,
  usuarios,
}: ActivityFiltersProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" />
          <CardTitle className="text-base">Filtros</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Busca por texto */}
          <div className="col-span-1 md:col-span-2">
            <Label htmlFor="search">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Código, nome, usuário..."
                value={filters.searchTerm}
                onChange={(e) => onFilterChange('searchTerm', e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Filtro de Categoria */}
          <div className="col-span-1">
            <Label htmlFor="categoria">Categoria</Label>
            <Select
              value={filters.categoria}
              onValueChange={(value) => onFilterChange('categoria', value)}
            >
              <SelectTrigger id="categoria">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Categorias</SelectItem>
                {Object.entries(CATEGORIAS)
                  .filter(([key]) => key !== 'all')
                  .map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro de Tipo de Evento */}
          <div className="col-span-1">
            <Label htmlFor="tipoEvento">Tipo de Evento</Label>
            <Select
              value={filters.tipoEvento}
              onValueChange={(value) => onFilterChange('tipoEvento', value)}
            >
              <SelectTrigger id="tipoEvento">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Eventos</SelectItem>
                {TODOS_EVENTOS.map((evento) => (
                  <SelectItem key={evento} value={evento}>
                    {getEventTypeLabel(evento)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data Início */}
          <div className="col-span-1">
            <Label htmlFor="dataInicio">Data Início</Label>
            <Input
              id="dataInicio"
              type="date"
              value={filters.dataInicio}
              onChange={(e) => onFilterChange('dataInicio', e.target.value)}
            />
          </div>

          {/* Data Fim */}
          <div className="col-span-1">
            <Label htmlFor="dataFim">Data Fim</Label>
            <Input
              id="dataFim"
              type="date"
              value={filters.dataFim}
              onChange={(e) => onFilterChange('dataFim', e.target.value)}
            />
          </div>

          {/* Filtro de Usuário */}
          <div className="col-span-1 md:col-span-3 lg:col-span-1">
            <Label htmlFor="usuario">Usuário</Label>
            <Select
              value={filters.usuario}
              onValueChange={(value) => onFilterChange('usuario', value)}
            >
              <SelectTrigger id="usuario">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Usuários</SelectItem>
                {usuarios.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
