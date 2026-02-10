'use client';

import * as React from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  DollarSign,
  Calculator,
  CheckCircle,
  Clock,
  XCircle,
  Download,
  Filter,
  Search
} from 'lucide-react';
import type { DriverPayment, PaymentStatus } from '@/lib/types';
import { generatePendingPayments } from '@/lib/payment-generator';
import { formatCurrency } from '@/lib/earnings-calculator';
import { PaymentTable } from '@/components/financeiro/payment-table';

export default function PagamentosPage() {
  const [payments, setPayments] = React.useState<DriverPayment[]>([]);
  const [filteredPayments, setFilteredPayments] = React.useState<DriverPayment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isGenerating, setIsGenerating] = React.useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<PaymentStatus | 'all'>('all');
  const [driverFilter, setDriverFilter] = React.useState('all');

  const { toast } = useToast();
  const { user } = useAuth();

  // Carrega pagamentos em tempo real
  React.useEffect(() => {
    const paymentsQuery = query(
      collection(db, 'driverPayments'),
      orderBy('routeCompletedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const paymentsData: DriverPayment[] = [];
        snapshot.forEach((doc) => {
          paymentsData.push({ id: doc.id, ...doc.data() } as DriverPayment);
        });
        setPayments(paymentsData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error loading payments:', error);
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar os pagamentos.',
        });
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [toast]);

  // Aplica filtros
  React.useEffect(() => {
    let filtered = [...payments];

    // Filtro de status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Filtro de motorista
    if (driverFilter !== 'all') {
      filtered = filtered.filter((p) => p.driverId === driverFilter);
    }

    // Busca por código de rota ou nome do motorista
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.routeCode.toLowerCase().includes(term) ||
          p.driverName.toLowerCase().includes(term)
      );
    }

    setFilteredPayments(filtered);
  }, [payments, statusFilter, driverFilter, searchTerm]);

  // Calcula estatísticas
  const stats = React.useMemo(() => {
    const pending = payments.filter((p) => p.status === 'pending');
    const approved = payments.filter((p) => p.status === 'approved');

    // Pagos neste mês
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const paidThisMonth = payments.filter((p) => {
      if (p.status !== 'paid' || !p.paidAt) return false;
      const paidDate = p.paidAt instanceof Timestamp ? p.paidAt.toDate() : new Date(p.paidAt);
      return paidDate >= firstDayOfMonth;
    });

    // Médias
    const completedPayments = payments.filter((p) => p.status === 'paid');
    const avgEarnings = completedPayments.length > 0
      ? completedPayments.reduce((sum, p) => sum + p.totalEarnings, 0) / completedPayments.length
      : 0;

    return {
      pending: {
        count: pending.length,
        total: pending.reduce((sum, p) => sum + p.totalEarnings, 0),
      },
      approved: {
        count: approved.length,
        total: approved.reduce((sum, p) => sum + p.totalEarnings, 0),
      },
      paidThisMonth: {
        count: paidThisMonth.length,
        total: paidThisMonth.reduce((sum, p) => sum + p.totalEarnings, 0),
      },
      avgEarnings,
    };
  }, [payments]);

  // Lista de motoristas únicos para filtro
  const drivers = React.useMemo(() => {
    const uniqueDrivers = new Map<string, string>();
    payments.forEach((p) => {
      if (!uniqueDrivers.has(p.driverId)) {
        uniqueDrivers.set(p.driverId, p.driverName);
      }
    });
    return Array.from(uniqueDrivers.entries()).map(([id, name]) => ({ id, name }));
  }, [payments]);

  // Gera pagamentos pendentes
  const handleGeneratePayments = async () => {
    setIsGenerating(true);
    try {
      const result = await generatePendingPayments();

      toast({
        title: 'Pagamentos Gerados!',
        description: `${result.generated} pagamento(s) pendente(s) foram criados com sucesso.`,
      });

      if (result.errors.length > 0) {
        console.warn('Erros durante geração:', result.errors);
        toast({
          variant: 'destructive',
          title: 'Alguns pagamentos não foram gerados',
          description: `${result.errors.length} rota(s) tiveram problemas. Verifique o console.`,
        });
      }
    } catch (error) {
      console.error('Error generating payments:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível gerar os pagamentos.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Exporta para CSV
  const handleExport = () => {
    const csvData = filteredPayments.map((p) => ({
      Código: p.routeCode,
      Motorista: p.driverName,
      'Data Conclusão': p.routeCompletedAt instanceof Timestamp
        ? p.routeCompletedAt.toDate().toLocaleDateString('pt-BR')
        : new Date(p.routeCompletedAt).toLocaleDateString('pt-BR'),
      Paradas: p.routeStats.totalStops,
      Entregas: p.routeStats.successfulDeliveries,
      'Distância (km)': p.routeStats.distanceKm.toFixed(2),
      'Total (R$)': p.totalEarnings.toFixed(2),
      Status: p.status,
    }));

    const csv = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map((row) => Object.values(row).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pagamentos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Pagamentos</h2>
          <p className="text-muted-foreground">
            Gerencie e aprove pagamentos aos motoristas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={filteredPayments.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button onClick={handleGeneratePayments} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                Calcular Pendentes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending.count}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.pending.total)} a aprovar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved.count}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.approved.total)} a pagar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos este Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paidThisMonth.count}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.paidThisMonth.total)} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média por Rota</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.avgEarnings)}</div>
            <p className="text-xs text-muted-foreground">
              Baseado em {payments.filter(p => p.status === 'paid').length} pagamentos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código ou motorista..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filtro de Status */}
            <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="all" value="all">Todos os Status</SelectItem>
                <SelectItem key="pending" value="pending">Pendente</SelectItem>
                <SelectItem key="approved" value="approved">Aprovado</SelectItem>
                <SelectItem key="paid" value="paid">Pago</SelectItem>
                <SelectItem key="cancelled" value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro de Motorista */}
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Motorista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="all" value="all">Todos os Motoristas</SelectItem>
                {drivers.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Pagamentos */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Pagamentos</CardTitle>
          <CardDescription>
            {filteredPayments.length} pagamento(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentTable payments={filteredPayments} />
        </CardContent>
      </Card>
    </div>
  );
}
