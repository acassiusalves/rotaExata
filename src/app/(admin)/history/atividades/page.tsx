'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { ActivityLogEntry } from '@/lib/firebase/activity-log';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ActivityPage() {
  const [activities, setActivities] = useState<(ActivityLogEntry & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');

  useEffect(() => {
    loadActivities();
  }, [eventTypeFilter, entityTypeFilter]);

  const loadActivities = async () => {
    setLoading(true);

    try {
      let q = query(
        collection(db, 'activity_log'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );

      // Aplicar filtros
      if (eventTypeFilter !== 'all') {
        q = query(
          collection(db, 'activity_log'),
          where('eventType', '==', eventTypeFilter),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
      }
      if (entityTypeFilter !== 'all' && eventTypeFilter === 'all') {
        q = query(
          collection(db, 'activity_log'),
          where('entityType', '==', entityTypeFilter),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as (ActivityLogEntry & { id: string })[];

      setActivities(data);
      console.log(`Carregadas ${data.length} atividades com sucesso`);
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
      console.error('Detalhes do erro:', {
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code,
        eventTypeFilter,
        entityTypeFilter,
      });
    } finally {
      setLoading(false);
    }
  };

  const getEventTypeLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      service_created: 'Serviço Criado',
      route_created: 'Rota Criada',
      route_dispatched: 'Rota Despachada',
      point_created: 'Pontos Criados',
      point_moved_to_route: 'Ponto Movido',
      point_reordered: 'Ponto Reordenado',
      point_removed_from_route: 'Ponto Removido',
      point_added_to_route: 'Ponto Adicionado',
      service_updated: 'Serviço Atualizado',
      route_updated: 'Rota Atualizada',
      point_data_updated: 'Dados do Ponto Atualizados',
      point_delivery_started: 'Entrega Iniciada',
      point_arrived: 'Chegou no Local',
      point_completed: 'Entrega Completada',
      point_failed: 'Entrega Falhada',
      driver_assigned: 'Motorista Atribuído',
      driver_unassigned: 'Motorista Removido',
    };
    return labels[eventType] || eventType;
  };

  const getEventColor = (eventType: string) => {
    if (eventType.includes('created')) return 'bg-blue-100 text-blue-700';
    if (eventType.includes('completed')) return 'bg-green-100 text-green-700';
    if (eventType.includes('failed')) return 'bg-red-100 text-red-700';
    if (eventType.includes('moved') || eventType.includes('reordered')) return 'bg-yellow-100 text-yellow-700';
    if (eventType.includes('dispatched')) return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Histórico de Atividades</h1>
        <p className="text-gray-600 mt-2">
          Visualize todas as movimentações e mudanças no sistema
        </p>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Tipo de Evento</label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os Eventos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Eventos</SelectItem>
                  <SelectItem value="service_created">Serviços Criados</SelectItem>
                  <SelectItem value="route_created">Rotas Criadas</SelectItem>
                  <SelectItem value="route_dispatched">Rotas Despachadas</SelectItem>
                  <SelectItem value="point_moved_to_route">Pontos Movidos</SelectItem>
                  <SelectItem value="point_reordered">Pontos Reordenados</SelectItem>
                  <SelectItem value="point_completed">Entregas Completadas</SelectItem>
                  <SelectItem value="point_failed">Entregas Falhadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Tipo de Entidade</label>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as Entidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Entidades</SelectItem>
                  <SelectItem value="service">Serviços</SelectItem>
                  <SelectItem value="route">Rotas</SelectItem>
                  <SelectItem value="point">Pontos</SelectItem>
                  <SelectItem value="driver">Motoristas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Atividades */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {activities.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                Nenhuma atividade encontrada
              </CardContent>
            </Card>
          ) : (
            activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} getEventTypeLabel={getEventTypeLabel} getEventColor={getEventColor} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Componente para exibir cada atividade
function ActivityCard({
  activity,
  getEventTypeLabel,
  getEventColor
}: {
  activity: ActivityLogEntry & { id: string };
  getEventTypeLabel: (eventType: string) => string;
  getEventColor: (eventType: string) => string;
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
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
                  {activity.userName?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <span className="font-semibold text-sm">{activity.userName || 'Usuário'}</span>
                  <span className="text-xs text-gray-500 block">
                    {formatTimestamp(activity.timestamp)}
                  </span>
                </div>
              </div>
            </div>

            {/* Ação principal */}
            <p className="text-gray-900 mb-3 font-medium">{activity.action}</p>

            {/* Mudanças detalhadas */}
            {activity.changes && activity.changes.length > 0 && (
              <div className="mt-3 border-t pt-3 bg-gray-50 rounded-md p-3">
                <p className="text-sm font-semibold mb-2 text-gray-700">Mudanças:</p>
                <div className="space-y-2">
                  {activity.changes.map((change, idx) => (
                    <div key={idx} className="text-sm flex items-start gap-2">
                      <span className="font-medium text-gray-600 min-w-[100px]">
                        {change.fieldLabel || change.field}:
                      </span>
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <span className="line-through text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                          {formatValue(change.oldValue)}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded font-medium">
                          {formatValue(change.newValue)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadados (colapsável) */}
            {activity.metadata && Object.keys(activity.metadata).length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                  Ver informações adicionais
                </summary>
                <div className="mt-2 bg-gray-50 p-3 rounded text-xs">
                  <dl className="space-y-1">
                    {Object.entries(activity.metadata).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <dt className="font-semibold text-gray-600 min-w-[120px]">{key}:</dt>
                        <dd className="text-gray-800">{formatValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </details>
            )}
          </div>

          {/* Badges laterais */}
          <div className="flex flex-col items-end gap-2 min-w-[140px]">
            {activity.entityCode && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
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

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object' && value.toDate) {
    return format(value.toDate(), 'dd/MM/yyyy HH:mm', { locale: ptBR });
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
