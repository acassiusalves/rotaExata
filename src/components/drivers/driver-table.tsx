'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Driver, DriverStatus } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { MoreHorizontal, Star, Trash2, Smartphone, Wifi, WifiOff, Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryFull, LogOut, Clock } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { DeviceInfo } from '@/lib/types';

// Helper para obter icone de bateria
function getBatteryIcon(level: number | null | undefined, charging: boolean | null | undefined) {
  if (level === null || level === undefined) return Battery;
  if (charging) return BatteryCharging;
  if (level <= 20) return BatteryLow;
  if (level <= 50) return BatteryMedium;
  return BatteryFull;
}

// Helper para cor da bateria
function getBatteryColor(level: number | null | undefined) {
  if (level === null || level === undefined) return 'text-muted-foreground';
  if (level <= 20) return 'text-red-500';
  if (level <= 50) return 'text-yellow-500';
  return 'text-green-500';
}

// Helper para cor da conexao
function getConnectionColor(type: string | undefined) {
  if (!type || type === 'unknown') return 'text-muted-foreground';
  if (type === '4g' || type === '5g') return 'text-green-500';
  if (type === '3g') return 'text-yellow-500';
  return 'text-orange-500';
}

// Helper para formatar tempo relativo
function formatRelativeTime(date: Date | undefined | null): string {
  if (!date) return 'N/A';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'agora';
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Helper para cor do tempo baseado na idade
function getTimeColor(date: Date | undefined | null): string {
  if (!date) return 'text-muted-foreground';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 1000 / 60);

  if (diffMins <= 2) return 'text-green-500';  // Atualizado há menos de 2 min
  if (diffMins <= 10) return 'text-yellow-500'; // Atualizado há menos de 10 min
  return 'text-muted-foreground';  // Mais antigo
}

const statusMap: Record<
  DriverStatus,
  { label: string; className: string }
> = {
  available: { label: 'Disponível', className: 'bg-green-500' },
  online: { label: 'Online', className: 'bg-emerald-500' },
  busy: { label: 'Ocupado', className: 'bg-yellow-500' },
  offline: { label: 'Offline', className: 'bg-gray-500' },
};

// Prioridade para ordenação: online/available primeiro, offline por último
const statusPriority: Record<DriverStatus, number> = {
  online: 1,
  available: 2,
  busy: 3,
  offline: 4,
};

const getDriverColumns = (
  onDeleteClick: (driver: Driver) => void,
  onForceLogoutClick: (driver: Driver) => void,
  onImpersonateClick: (driver: Driver) => void
): ColumnDef<Driver>[] => [
  {
    accessorKey: 'name',
    header: 'Motorista',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={row.original.avatarUrl} alt={row.original.name} />
          <AvatarFallback>{row.original.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className='flex flex-col'>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.email}</div>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Status
        <ChevronsUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const status = row.getValue('status') as DriverStatus;
      const { label, className } = statusMap[status] || { label: 'Offline', className: 'bg-gray-400' };

      return (
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${className}`} />
          <span>{label}</span>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const statusA = rowA.getValue('status') as DriverStatus;
      const statusB = rowB.getValue('status') as DriverStatus;
      const priorityA = statusPriority[statusA] || 99;
      const priorityB = statusPriority[statusB] || 99;
      return priorityA - priorityB;
    },
  },
  {
    accessorKey: 'vehicle',
    header: 'Veículo',
    cell: ({ row }) => (
      <div>
        <div>{row.original.vehicle.type}</div>
        <div className="text-xs text-muted-foreground">{row.original.vehicle.plate}</div>
      </div>
    ),
  },
    {
    accessorKey: 'rating',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Avaliação
        <ChevronsUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
        <div className="flex items-center gap-1">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            {row.getValue('rating')}
        </div>
    ),
  },
  {
    accessorKey: 'totalDeliveries',
    header: () => <div className="text-right">Total de Entregas</div>,
    cell: ({ row }) => {
      return <div className="text-right font-medium">{row.getValue('totalDeliveries')}</div>;
    },
  },
  {
    accessorKey: 'deviceInfo',
    header: 'Dispositivo',
    cell: ({ row }) => {
      const deviceInfo = row.original.deviceInfo as DeviceInfo | undefined;
      const lastSeenAt = row.original.lastSeenAt;

      if (!deviceInfo) {
        return (
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">
              Sem dados
            </div>
            {/* Última atualização mesmo sem deviceInfo */}
            {lastSeenAt && (
              <div className={`flex items-center gap-1 ${getTimeColor(lastSeenAt)}`}>
                <Clock className="h-3 w-3" />
                <span className="text-xs">{formatRelativeTime(lastSeenAt)}</span>
              </div>
            )}
          </div>
        );
      }

      const BatteryIcon = getBatteryIcon(deviceInfo.batteryLevel, deviceInfo.batteryCharging);
      const batteryColor = getBatteryColor(deviceInfo.batteryLevel);
      const connectionColor = getConnectionColor(deviceInfo.connectionEffectiveType);
      const timeColor = getTimeColor(lastSeenAt);

      return (
        <TooltipProvider>
          <div className="flex flex-col gap-1">
            {/* Modelo do dispositivo */}
            <div className="flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium truncate max-w-[120px]">
                {deviceInfo.deviceModel || 'Desconhecido'}
              </span>
            </div>

            {/* OS e indicadores */}
            <div className="flex items-center gap-2">
              {/* OS Version */}
              <span className="text-xs text-muted-foreground">
                {deviceInfo.osName} {deviceInfo.osVersion?.split('.')[0]}
              </span>

              {/* Bateria */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-0.5 ${batteryColor}`}>
                    <BatteryIcon className="h-3.5 w-3.5" />
                    {deviceInfo.batteryLevel !== null && deviceInfo.batteryLevel !== undefined && (
                      <span className="text-xs">{deviceInfo.batteryLevel}%</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Bateria: {deviceInfo.batteryLevel ?? 'N/A'}%</p>
                  <p>{deviceInfo.batteryCharging ? 'Carregando' : 'Descarregando'}</p>
                </TooltipContent>
              </Tooltip>

              {/* Conexao */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-0.5 ${connectionColor}`}>
                    {deviceInfo.online === false ? (
                      <WifiOff className="h-3.5 w-3.5" />
                    ) : (
                      <Wifi className="h-3.5 w-3.5" />
                    )}
                    <span className="text-xs uppercase">
                      {deviceInfo.connectionEffectiveType || '?'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Conexao: {deviceInfo.connectionEffectiveType?.toUpperCase() || 'Desconhecido'}</p>
                  <p>Velocidade: {deviceInfo.downlink ? `${deviceInfo.downlink} Mbps` : 'N/A'}</p>
                  <p>Latencia: {deviceInfo.rtt ? `${deviceInfo.rtt}ms` : 'N/A'}</p>
                  <p>Status: {deviceInfo.online ? 'Online' : 'Offline'}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Última atualização */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-1 ${timeColor}`}>
                  <Clock className="h-3 w-3" />
                  <span className="text-xs">{formatRelativeTime(lastSeenAt)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Última atualização: {lastSeenAt?.toLocaleString('pt-BR') || 'N/A'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      );
    },
  },
   {
    id: 'actions',
    cell: ({ row }) => {
      const driver = row.original;
      return (
        <div className="text-right">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Abrir menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                    <DropdownMenuItem>Editar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onImpersonateClick(driver)}>
                       <Smartphone className="mr-2 h-4 w-4" />
                       Testar como Motorista
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onForceLogoutClick(driver)}>
                       <LogOut className="mr-2 h-4 w-4" />
                       Deslogar Motorista
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => onDeleteClick(driver)}>
                       <Trash2 className="mr-2 h-4 w-4" />
                       Remover
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      )
    },
  },
];

export function DriverTable({
  drivers,
  onDeleteClick,
  onForceLogoutClick,
  onImpersonateClick
}: {
  drivers: Driver[],
  onDeleteClick: (driver: Driver) => void,
  onForceLogoutClick: (driver: Driver) => void,
  onImpersonateClick: (driver: Driver) => void
}) {
  // Ordenação padrão: status ascendente (online/available primeiro, offline por último)
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'status', desc: false }
  ]);

  const columns = React.useMemo(() => getDriverColumns(onDeleteClick, onForceLogoutClick, onImpersonateClick), [onDeleteClick, onForceLogoutClick, onImpersonateClick]);

  const table = useReactTable({
    data: drivers,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  return (
    <div className="w-full">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Nenhum motorista encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Próximo
        </Button>
      </div>
    </div>
  );
}
