'use client';

import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MoreHorizontal, CheckCircle, XCircle, Eye, ChevronsUpDown, Edit } from 'lucide-react';
import type { DriverPayment, PaymentStatus, Timestamp } from '@/lib/types';
import { formatCurrency } from '@/lib/earnings-calculator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { approvePayment, approvePaymentsBatch } from '@/lib/payment-actions';
import { PaymentDetailsDialog } from './payment-details-dialog';
import { MarkAsPaidDialog } from './mark-as-paid-dialog';
import { CancelPaymentDialog } from './cancel-payment-dialog';
import { EditPaymentDialog } from './edit-payment-dialog';

interface PaymentTableProps {
  payments: DriverPayment[];
}

const statusMap: Record<PaymentStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  approved: { label: 'Aprovado', variant: 'default' },
  paid: { label: 'Pago', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

export function PaymentTable({ payments }: PaymentTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState({});
  const [selectedPayment, setSelectedPayment] = React.useState<DriverPayment | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [payDialogOpen, setPayDialogOpen] = React.useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [isApproving, setIsApproving] = React.useState(false);

  const { toast } = useToast();
  const { user } = useAuth();

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatDate = (date: Date | Timestamp) => {
    const d = date instanceof Date ? date : 'toDate' in date ? date.toDate() : new Date(date);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleApprove = async (payment: DriverPayment) => {
    if (!user) return;

    try {
      await approvePayment(payment.id, user.uid);
      toast({
        title: 'Pagamento Aprovado',
        description: `Pagamento ${payment.routeCode} foi aprovado com sucesso.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível aprovar o pagamento.',
      });
    }
  };

  const handleBulkApprove = async () => {
    if (!user) return;

    const selectedIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key as any])
      .map((index) => payments[parseInt(index)].id);

    if (selectedIds.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum pagamento selecionado',
        description: 'Selecione ao menos um pagamento para aprovar.',
      });
      return;
    }

    setIsApproving(true);
    try {
      const result = await approvePaymentsBatch(selectedIds, user.uid);

      toast({
        title: 'Aprovação em Lote Concluída',
        description: `${result.success} pagamento(s) aprovado(s)${result.errors.length > 0 ? `, ${result.errors.length} erro(s)` : ''}.`,
      });

      setRowSelection({});
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível aprovar os pagamentos.',
      });
    } finally {
      setIsApproving(false);
    }
  };

  const columns: ColumnDef<DriverPayment>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          disabled={row.original.status !== 'pending'}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'routeCode',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Rota
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono">
          {row.original.routeCode}
        </Badge>
      ),
    },
    {
      accessorKey: 'driverName',
      header: 'Motorista',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{getInitials(row.original.driverName)}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{row.original.driverName}</span>
        </div>
      ),
    },
    {
      accessorKey: 'routeCompletedAt',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Conclusão
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => formatDate(row.original.routeCompletedAt),
    },
    {
      accessorKey: 'routeStats',
      header: 'Estatísticas',
      cell: ({ row }) => {
        const stats = row.original.routeStats;
        return (
          <div className="text-sm">
            <div>{stats.totalStops} paradas</div>
            <div className="text-muted-foreground">
              {stats.successfulDeliveries} entregas · {stats.distanceKm.toFixed(1)} km
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'totalEarnings',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Ganhos
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-bold text-primary cursor-help">
                  {formatCurrency(row.original.totalEarnings)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-sm">
                  <div key="base" className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Base:</span>
                    <span>{formatCurrency(row.original.breakdown.basePay)}</span>
                  </div>
                  <div key="distance" className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Distância:</span>
                    <span>{formatCurrency(row.original.breakdown.distanceEarnings)}</span>
                  </div>
                  <div key="deliveries" className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Entregas:</span>
                    <span>{formatCurrency(row.original.breakdown.deliveryBonuses)}</span>
                  </div>
                  {row.original.breakdown.timeBonusAmount > 0 && (
                    <div key="timeBonus" className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Bônus Horário:</span>
                      <span>{formatCurrency(row.original.breakdown.timeBonusAmount)}</span>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {row.original.manuallyEdited && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs">
                    <Edit className="h-3 w-3 mr-1" />
                    Manual
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Valor editado manualmente</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = statusMap[row.original.status];
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
    {
      accessorKey: 'paidAt',
      header: 'Data Pagamento',
      cell: ({ row }) => {
        const paidAt = row.original.paidAt;
        if (!paidAt) return <span className="text-muted-foreground">-</span>;
        return <span className="text-sm">{formatDate(paidAt)}</span>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const payment = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setSelectedPayment(payment);
                  setDetailsOpen(true);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                Ver Detalhes
              </DropdownMenuItem>

              {(payment.status === 'pending' || payment.status === 'approved') && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedPayment(payment);
                      setEditDialogOpen(true);
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Editar Valor
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {payment.status === 'pending' && (
                <>
                  <DropdownMenuItem onClick={() => handleApprove(payment)}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Aprovar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      setSelectedPayment(payment);
                      setCancelDialogOpen(true);
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancelar
                  </DropdownMenuItem>
                </>
              )}

              {(payment.status === 'approved' || payment.status === 'pending') && (
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedPayment(payment);
                    setPayDialogOpen(true);
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Marcar como Pago
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: payments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="space-y-4">
      {/* Ações em lote */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectedCount} pagamento(s) selecionado(s)
          </span>
          <Button onClick={handleBulkApprove} disabled={isApproving} size="sm">
            {isApproving ? (
              <>Aprovando...</>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Aprovar Selecionados
              </>
            )}
          </Button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Nenhum pagamento encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} de{' '}
          {table.getFilteredRowModel().rows.length} linha(s) selecionada(s).
        </div>
        <div className="flex items-center space-x-2">
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

      {/* Dialogs */}
      {selectedPayment && (
        <>
          <PaymentDetailsDialog
            payment={selectedPayment}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
          />
          <EditPaymentDialog
            payment={selectedPayment}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
          <MarkAsPaidDialog
            payment={selectedPayment}
            open={payDialogOpen}
            onOpenChange={setPayDialogOpen}
          />
          <CancelPaymentDialog
            payment={selectedPayment}
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
          />
        </>
      )}
    </div>
  );
}
