'use client';

import * as React from 'react';
import { db } from '@/lib/firebase/client';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
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
import { fixPaymentsWithoutDriver } from '@/lib/payment-actions';
import { formatCurrency } from '@/lib/earnings-calculator';
import { PaymentTable } from '@/components/financeiro/payment-table';
import { HierarchicalPaymentTable } from '@/components/financeiro/hierarchical-payment-table';

export default function PagamentosPage() {
  const [payments, setPayments] = React.useState<DriverPayment[]>([]);
  const [filteredPayments, setFilteredPayments] = React.useState<DriverPayment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isFixing, setIsFixing] = React.useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<PaymentStatus | 'all'>('all');
  const [driverFilter, setDriverFilter] = React.useState('all');
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');

  const { toast } = useToast();
  const { user } = useAuth();

  // Carrega pagamentos em tempo real
  React.useEffect(() => {
    // Não usa orderBy do Firestore para evitar problemas com índices
    // A ordenação é feita no cliente após carregar os dados
    const paymentsQuery = collection(db, 'driverPayments');

    const unsubscribe = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const paymentsData: DriverPayment[] = [];
        snapshot.forEach((doc) => {
          paymentsData.push({ id: doc.id, ...doc.data() } as DriverPayment);
        });

        // Ordena por routePlannedDate (data planejada da rota) - igual à página de relatórios
        paymentsData.sort((a, b) => {
          const dateA = a.routePlannedDate || a.routeCompletedAt || a.createdAt;
          const dateB = b.routePlannedDate || b.routeCompletedAt || b.createdAt;

          const timeA = dateA instanceof Timestamp ? dateA.toMillis() : new Date(dateA).getTime();
          const timeB = dateB instanceof Timestamp ? dateB.toMillis() : new Date(dateB).getTime();

          return timeB - timeA; // Ordem decrescente (mais recente primeiro)
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

    console.log('Aplicando filtros:', {
      total: payments.length,
      statusFilter,
      driverFilter,
      startDate: startDate ? `${startDate} (Data da Rota)` : 'Não definido',
      endDate: endDate ? `${endDate} (Data da Rota)` : 'Não definido',
      searchTerm
    });

    // Filtro de status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((p) => p.status === statusFilter);
      console.log(`Após filtro de status (${statusFilter}):`, filtered.length);
    }

    // Filtro de motorista
    if (driverFilter !== 'all') {
      filtered = filtered.filter((p) => p.driverId === driverFilter);
      console.log(`Após filtro de motorista (${driverFilter}):`, filtered.length);
    }

    // Filtro de data da rota (usa routePlannedDate - data planejada)
    if (startDate) {
      // Cria a data no fuso horário local (não UTC)
      const [year, month, day] = startDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0, 0);

      console.log(`📅 Filtro Data Inicial: ${start.toLocaleDateString('pt-BR')} (${startDate})`);

      const beforeFilter = filtered.length;
      let debugCount = 0;
      filtered = filtered.filter((p) => {
        const routeDate = p.routePlannedDate || p.routeCompletedAt || p.createdAt;

        if (!routeDate) {
          console.warn(`⚠️ Pagamento ${p.routeCode} sem data!`);
          return false;
        }

        const dateObj = routeDate instanceof Date
          ? routeDate
          : 'toDate' in routeDate && typeof routeDate.toDate === 'function'
            ? routeDate.toDate()
            : typeof routeDate === 'object' && 'seconds' in routeDate && typeof routeDate.seconds === 'number'
              ? new Date((routeDate as any).seconds * 1000)
              : new Date(routeDate as any);

        // Normaliza a data do pagamento para comparação (apenas dia/mês/ano no fuso local)
        const normalizedDate = new Date(
          dateObj.getFullYear(),
          dateObj.getMonth(),
          dateObj.getDate(),
          0, 0, 0, 0
        );

        const passes = normalizedDate >= start;

        // Log dos primeiros 5 itens e dos que passam no filtro
        if (debugCount < 5 || passes) {
          console.log(`${passes ? '✅' : '❌'} ${p.routeCode}:`, {
            routePlannedDate: p.routePlannedDate ? 'EXISTS' : 'NULL',
            dateObj: dateObj.toLocaleDateString('pt-BR'),
            normalized: normalizedDate.toLocaleDateString('pt-BR'),
            start: start.toLocaleDateString('pt-BR'),
            comparison: `${normalizedDate.getTime()} >= ${start.getTime()}`,
            passes
          });
          debugCount++;
        }

        return passes;
      });
      console.log(`📊 Após filtro de data inicial (>= ${startDate}): ${beforeFilter} -> ${filtered.length}`);
    }

    if (endDate) {
      // Cria a data no fuso horário local (não UTC)
      const [year, month, day] = endDate.split('-').map(Number);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);

      console.log(`📅 Filtro Data Final: ${end.toLocaleDateString('pt-BR')} (${endDate})`);

      const beforeFilter = filtered.length;
      let debugCount = 0;
      filtered = filtered.filter((p) => {
        const routeDate = p.routePlannedDate || p.routeCompletedAt || p.createdAt;

        if (!routeDate) {
          return false;
        }

        const dateObj = routeDate instanceof Date
          ? routeDate
          : 'toDate' in routeDate && typeof routeDate.toDate === 'function'
            ? routeDate.toDate()
            : typeof routeDate === 'object' && 'seconds' in routeDate && typeof routeDate.seconds === 'number'
              ? new Date((routeDate as any).seconds * 1000)
              : new Date(routeDate as any);

        // Normaliza a data do pagamento para comparação (apenas dia/mês/ano no fuso local)
        const normalizedDate = new Date(
          dateObj.getFullYear(),
          dateObj.getMonth(),
          dateObj.getDate(),
          23, 59, 59, 999
        );

        const passes = normalizedDate <= end;

        // Log dos primeiros 5 itens e dos que passam no filtro
        if (debugCount < 5 || passes) {
          console.log(`${passes ? '✅' : '❌'} ${p.routeCode}:`, {
            dateObj: dateObj.toLocaleDateString('pt-BR'),
            normalized: normalizedDate.toLocaleDateString('pt-BR'),
            end: end.toLocaleDateString('pt-BR'),
            comparison: `${normalizedDate.getTime()} <= ${end.getTime()}`,
            passes
          });
          debugCount++;
        }

        return passes;
      });
      console.log(`📊 Após filtro de data final (<= ${endDate}): ${beforeFilter} -> ${filtered.length}`);
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

    console.log('Total após todos os filtros:', filtered.length);
    setFilteredPayments(filtered);
  }, [payments, statusFilter, driverFilter, startDate, endDate, searchTerm]);

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
    let paymentsWithoutDriver = 0;

    payments.forEach((p) => {
      if (!p.driverId || !p.driverName) {
        paymentsWithoutDriver++;
        console.log('Pagamento sem motorista:', p.id, p.routeCode, {
          driverId: p.driverId,
          driverName: p.driverName
        });
      } else if (!uniqueDrivers.has(p.driverId)) {
        uniqueDrivers.set(p.driverId, p.driverName);
      }
    });

    const driversList = Array.from(uniqueDrivers.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log('Análise de motoristas:', {
      totalPayments: payments.length,
      paymentsWithoutDriver,
      uniqueDrivers: driversList.length,
      drivers: driversList
    });

    return driversList;
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

  // Corrige pagamentos sem motorista
  const handleFixPayments = async () => {
    setIsFixing(true);
    try {
      const fixed = await fixPaymentsWithoutDriver();

      toast({
        title: 'Pagamentos Corrigidos!',
        description: `${fixed} pagamento(s) foram atualizados com informações de motorista.`,
      });
    } catch (error) {
      console.error('Error fixing payments:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível corrigir os pagamentos.',
      });
    } finally {
      setIsFixing(false);
    }
  };

  // Exporta para CSV
  const handleExport = () => {
    const csvData = filteredPayments.map((p) => {
      // Usa routePlannedDate (data planejada da rota) - igual à página de relatórios
      const dataRota = p.routePlannedDate || p.routeCompletedAt || p.createdAt;
      const dataFormatada = dataRota instanceof Timestamp
        ? dataRota.toDate().toLocaleDateString('pt-BR')
        : new Date(dataRota).toLocaleDateString('pt-BR');

      return {
        Código: p.routeCode,
        Motorista: p.driverName,
        'Data da Rota': dataFormatada,
        'Data Conclusão': p.routeCompletedAt instanceof Timestamp
          ? p.routeCompletedAt.toDate().toLocaleDateString('pt-BR')
          : new Date(p.routeCompletedAt).toLocaleDateString('pt-BR'),
        Paradas: p.routeStats.totalStops,
        Entregas: p.routeStats.successfulDeliveries,
        'Distância (km)': p.routeStats.distanceKm.toFixed(2),
        'Total (R$)': p.totalEarnings.toFixed(2),
        Status: p.status,
      };
    });

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
          {drivers.length === 0 && payments.length > 0 && (
            <Button
              variant="secondary"
              onClick={handleFixPayments}
              disabled={isFixing}
            >
              {isFixing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Corrigindo...
                </>
              ) : (
                <>
                  Corrigir Dados de Motoristas
                </>
              )}
            </Button>
          )}
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
          <div className="space-y-4">
            {/* Linha 1: Busca, Status, Motorista */}
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

            {/* Linha 2: Filtros de Data */}
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium mb-2 block">Data da Rota (De)</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Data da Rota (Até)</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setDriverFilter('all');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="w-full"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
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
          <HierarchicalPaymentTable payments={filteredPayments} />
        </CardContent>
      </Card>
    </div>
  );
}
