'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, limit as firestoreLimit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Activity, RefreshCw, FileDown, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatsCards } from '@/components/activity/StatsCards';
import { ActivityFilters, type FilterState } from '@/components/activity/ActivityFilters';
import { ActivityTable } from '@/components/activity/ActivityTable';
import { ActivityPagination } from '@/components/activity/ActivityPagination';
import { ActivityDetailsSheet } from '@/components/activity/ActivityDetailsSheet';
import {
  calcularEstatisticas,
  extrairUsuarios,
  getCategoriaFromEventType,
  formatDateTime,
  getEventTypeLabel,
  getEventColor,
  formatValue,
} from '@/lib/utils/activity-helpers';
import type { ActivityLogEntry } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/hooks/use-auth';

const ITEMS_PER_PAGE = 50;

type ViewMode = 'table' | 'cards';

export default function ActivityPage() {
  // Autenticação
  const { user, loading: authLoading } = useAuth();

  // Estados principais
  const [activities, setActivities] = useState<(ActivityLogEntry & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    categoria: 'all',
    tipoEvento: 'all',
    dataInicio: '',
    dataFim: '',
    usuario: 'all',
  });

  // Visualização e paginação
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal de detalhes
  const [selectedActivity, setSelectedActivity] = useState<(ActivityLogEntry & { id: string }) | null>(null);

  // Carregar atividades apenas quando autenticado
  useEffect(() => {
    if (!authLoading && user) {
      loadActivities();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [authLoading, user]);

  const loadActivities = async () => {
    // Verifica se usuário está autenticado antes de fazer query
    if (!user) {
      console.warn('[ActivityPage] Tentativa de carregar atividades sem usuário autenticado');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log('[ActivityPage] Iniciando carregamento de atividades...');
      console.log('[ActivityPage] Usuário autenticado:', user.email, '| UID:', user.uid);

      const q = query(
        collection(db, 'activity_log'),
        orderBy('timestamp', 'desc'),
        firestoreLimit(200) // Aumentado de 100 para 200
      );

      console.log('[ActivityPage] Query criada, executando getDocs...');
      const snapshot = await getDocs(q);

      console.log('[ActivityPage] Snapshot recebido, docs:', snapshot.size);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as (ActivityLogEntry & { id: string })[];

      setActivities(data);
      console.log(`[ActivityPage] ✅ ${data.length} atividades carregadas com sucesso`);
    } catch (error: any) {
      console.error('[ActivityPage] ❌ Erro ao carregar atividades:', error);
      console.error('[ActivityPage] Código do erro:', error?.code);
      console.error('[ActivityPage] Mensagem:', error?.message);
      console.error('[ActivityPage] Stack:', error?.stack);

      // Mostrar erro amigável para o usuário
      if (error?.code === 'permission-denied') {
        alert('Erro de permissão ao carregar atividades. Verifique se você está autenticado e tem permissão para acessar esta página.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Estatísticas computadas
  const stats = useMemo(() => calcularEstatisticas(activities), [activities]);

  // Lista de usuários computada
  const usuarios = useMemo(() => extrairUsuarios(activities), [activities]);

  // Filtrar atividades
  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      // Filtro de busca por texto
      if (filters.searchTerm) {
        const search = filters.searchTerm.toLowerCase();
        const matches =
          activity.routeCode?.toLowerCase().includes(search) ||
          activity.serviceCode?.toLowerCase().includes(search) ||
          activity.pointCode?.toLowerCase().includes(search) ||
          activity.entityCode?.toLowerCase().includes(search) ||
          activity.userName?.toLowerCase().includes(search) ||
          activity.action.toLowerCase().includes(search);

        if (!matches) return false;
      }

      // Filtro de categoria
      if (filters.categoria !== 'all') {
        const activityCategoria = activity.category || getCategoriaFromEventType(activity.eventType);
        const categoriaMap: Record<string, string> = {
          logistica: 'LOGISTICS',
          financeiro: 'FINANCIAL',
          estoque: 'INVENTORY',
          outros: 'SYSTEM',
        };
        const expectedCategory = categoriaMap[filters.categoria] || filters.categoria;
        if (activityCategoria !== expectedCategory) return false;
      }

      // Filtro de tipo de evento
      if (filters.tipoEvento !== 'all' && activity.eventType !== filters.tipoEvento) {
        return false;
      }

      // Filtro de data início
      if (filters.dataInicio) {
        const dataInicioObj = new Date(filters.dataInicio);
        const timestamp = activity.timestamp as Timestamp;
        if (timestamp.toDate() < dataInicioObj) return false;
      }

      // Filtro de data fim
      if (filters.dataFim) {
        const dataFimObj = new Date(filters.dataFim);
        dataFimObj.setHours(23, 59, 59, 999);
        const timestamp = activity.timestamp as Timestamp;
        if (timestamp.toDate() > dataFimObj) return false;
      }

      // Filtro de usuário
      if (filters.usuario !== 'all' && activity.userId !== filters.usuario) {
        return false;
      }

      return true;
    });
  }, [activities, filters]);

  // Aplicar paginação
  const totalPages = Math.ceil(filteredActivities.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredActivities.length);
  const paginatedActivities = useMemo(() => {
    return filteredActivities.slice(startIndex, endIndex);
  }, [filteredActivities, startIndex, endIndex]);

  // Reset de página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Handler de mudança de filtro
  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Handler de mudança de página
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Exportar CSV
  const exportarCSV = () => {
    const headers = [
      'Data/Hora',
      'Categoria',
      'Evento',
      'Entidade',
      'Código',
      'Usuário',
      'Ação',
    ];

    const rows = filteredActivities.map(a => [
      formatDateTime(a.timestamp),
      a.category || getCategoriaFromEventType(a.eventType),
      getEventTypeLabel(a.eventType),
      a.entityType,
      a.entityCode || '-',
      a.userName || '-',
      a.action,
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `atividades-${new Date().toISOString()}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Histórico de Atividades</h1>
        </div>
        <p className="text-muted-foreground">
          Visualize todas as movimentações e mudanças no sistema
        </p>
      </div>

      {/* Cards de Estatísticas */}
      <StatsCards stats={stats} loading={loading} />

      {/* Filtros */}
      <ActivityFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        usuarios={usuarios}
      />

      {/* Barra de ações */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredActivities.length} evento(s) encontrado(s)
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadActivities}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            disabled={filteredActivities.length === 0}
          >
            <FileDown className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
          <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as ViewMode)}>
            <ToggleGroupItem value="table" aria-label="Visualização em tabela">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="cards" aria-label="Visualização em cards">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Conteúdo */}
      {(authLoading || loading) ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {authLoading ? 'Autenticando...' : 'Carregando atividades...'}
            </p>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <ActivityTable
          activities={paginatedActivities}
          onViewDetails={setSelectedActivity}
        />
      ) : (
        <div className="space-y-4">
          {paginatedActivities.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Nenhuma atividade encontrada
                </h3>
                <p className="text-sm text-muted-foreground">
                  Tente ajustar os filtros ou verifique novamente mais tarde
                </p>
              </CardContent>
            </Card>
          ) : (
            paginatedActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onViewDetails={() => setSelectedActivity(activity)}
              />
            ))
          )}
        </div>
      )}

      {/* Paginação */}
      {filteredActivities.length > 0 && (
        <ActivityPagination
          currentPage={currentPage}
          totalPages={totalPages}
          startIndex={startIndex}
          endIndex={endIndex}
          total={filteredActivities.length}
          onPageChange={handlePageChange}
        />
      )}

      {/* Modal de Detalhes */}
      <ActivityDetailsSheet
        activity={selectedActivity}
        isOpen={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />
    </div>
  );
}

// Componente para exibir cada atividade no modo cards
function ActivityCard({
  activity,
  onViewDetails,
}: {
  activity: ActivityLogEntry & { id: string };
  onViewDetails: () => void;
}) {
  const formatTimestamp = (timestamp: Timestamp) => {
    try {
      return format(timestamp.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {/* Header com usuário e data */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-medium">
                  {activity.userName?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <span className="font-semibold text-sm">{activity.userName || 'Usuário'}</span>
                  <span className="text-xs text-muted-foreground block">
                    {formatTimestamp(activity.timestamp)}
                  </span>
                </div>
              </div>
            </div>

            {/* Ação principal */}
            <p className="mb-3 font-medium">{activity.action}</p>

            {/* Mudanças detalhadas */}
            {activity.changes && activity.changes.length > 0 && (
              <div className="mt-3 border-t pt-3 bg-muted rounded-md p-3">
                <p className="text-sm font-semibold mb-2">Mudanças:</p>
                <div className="space-y-2">
                  {activity.changes.map((change, idx) => (
                    <div key={idx} className="text-sm flex items-start gap-2">
                      <span className="font-medium text-muted-foreground min-w-[100px]">
                        {change.fieldLabel || change.field}:
                      </span>
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <span className="line-through text-muted-foreground bg-background px-2 py-0.5 rounded">
                          {formatValue(change.oldValue)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded font-medium">
                          {formatValue(change.newValue)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botão para ver mais */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewDetails}
              className="mt-3"
            >
              Ver Detalhes Completos
            </Button>
          </div>

          {/* Badges laterais */}
          <div className="flex flex-col items-end gap-2 min-w-[140px]">
            {activity.entityCode && (
              <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                {activity.entityCode}
              </Badge>
            )}
            <Badge className={getEventColor(activity.eventType)}>
              {getEventTypeLabel(activity.eventType)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {activity.entityType}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
