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
import { MoreHorizontal, Star } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

const statusMap: Record<
  DriverStatus,
  { label: string; className: string }
> = {
  available: { label: 'Disponível', className: 'bg-green-500' },
  online: { label: 'Online', className: 'bg-emerald-500' },
  busy: { label: 'Ocupado', className: 'bg-yellow-500' },
  offline: { label: 'Offline', className: 'bg-gray-500' },
};

export const columns: ColumnDef<Driver>[] = [
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
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as DriverStatus;
      const { label, className } = statusMap[status] || { label: 'Offline', className: 'bg-gray-400' };

      console.log('🎨 [driver-table] Renderizando status:', {
        driverId: row.original.id,
        email: row.original.email,
        status: status,
        statusType: typeof status,
        label: label,
        isInMap: status in statusMap
      });

      return (
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${className}`} />
          <span>{label}</span>
        </div>
      );
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
    id: 'actions',
    cell: ({ row }) => {
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
                    <DropdownMenuItem className="text-destructive">Desativar</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      )
    },
  },
];

export function DriverTable({ drivers }: { drivers: Driver[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  
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
