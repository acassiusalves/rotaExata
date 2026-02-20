import { startOfDay, endOfDay } from 'date-fns';
import type { ActivityEventType, ActivityLogEntry, Timestamp } from '../types';

// ============================================================================
// TIPOS
// ============================================================================

export interface ActivityStats {
  totalEventos: number;
  entregasHoje: number;
  pagamentosHoje: number;
  rotasAtivas: number;
}

// ============================================================================
// CATEGORIAS E LABELS
// ============================================================================

export const CATEGORIAS = {
  all: 'Todas',
  logistica: 'Logística',
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  outros: 'Outros',
};

/**
 * Mapeia tipo de evento para categoria
 */
export function getCategoriaFromEventType(eventType: ActivityEventType): string {
  // Logística
  if (
    eventType.includes('service') ||
    eventType.includes('route') ||
    eventType.includes('point') ||
    eventType.includes('driver')
  ) {
    return 'logistica';
  }

  // Financeiro
  if (eventType.includes('payment') || eventType.includes('reconciliation')) {
    return 'financeiro';
  }

  // Estoque
  if (eventType.includes('stock')) {
    return 'estoque';
  }

  return 'outros';
}

/**
 * Retorna label da categoria
 */
export function getCategoryLabel(activity: ActivityLogEntry): string {
  if (activity.category) {
    const categoryMap: Record<string, string> = {
      LIFECYCLE: 'Ciclo de Vida',
      MODIFICATION: 'Modificação',
      WORKFLOW: 'Workflow',
      LOGISTICS: 'Logística',
      FINANCIAL: 'Financeiro',
      INVENTORY: 'Estoque',
      INTEGRATION: 'Integração',
      SYSTEM: 'Sistema',
    };
    return categoryMap[activity.category] || activity.category;
  }

  const categoria = getCategoriaFromEventType(activity.eventType);
  return CATEGORIAS[categoria as keyof typeof CATEGORIAS] || 'Outros';
}

/**
 * Retorna classes Tailwind para cor da categoria
 */
export function getCategoryColor(activity: ActivityLogEntry): string {
  const categoria = activity.category || getCategoriaFromEventType(activity.eventType);

  const colorMap: Record<string, string> = {
    LOGISTICS: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    logistica: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    FINANCIAL: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    financeiro: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    INVENTORY: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    estoque: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    LIFECYCLE: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    WORKFLOW: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    MODIFICATION: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    INTEGRATION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    SYSTEM: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  };

  return colorMap[categoria] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

/**
 * Retorna label legível do tipo de evento
 */
export function getEventTypeLabel(eventType: ActivityEventType): string {
  const labels: Record<ActivityEventType, string> = {
    // Criação
    service_created: 'Serviço Criado',
    route_created: 'Rota Criada',
    point_created: 'Ponto Criado',
    // Movimentação
    point_moved_to_route: 'Ponto Movido',
    point_reordered: 'Ponto Reordenado',
    point_removed_from_route: 'Ponto Removido',
    point_added_to_route: 'Ponto Adicionado',
    // Edições
    service_updated: 'Serviço Atualizado',
    route_updated: 'Rota Atualizada',
    point_data_updated: 'Dados do Ponto Atualizados',
    // Status de entrega
    point_delivery_started: 'Entrega Iniciada',
    point_arrived: 'Chegou no Local',
    point_completed: 'Entrega Completada',
    point_failed: 'Entrega Falhou',
    // Atribuições
    route_dispatched: 'Rota Despachada',
    driver_assigned: 'Motorista Atribuído',
    driver_unassigned: 'Motorista Removido',
    // Sistema
    route_auto_completed: 'Rota Auto-Completada',
    route_resent: 'Rota Reenviada',
    // Financeiro
    payment_approved: 'Pagamento Aprovado',
    payment_marked_as_paid: 'Pagamento Pago',
    payment_cancelled: 'Pagamento Cancelado',
    payment_batch_approved: 'Lote Aprovado',
    bank_reconciliation: 'Conciliação Bancária',
    // Estoque
    stock_entry: 'Entrada de Estoque',
    stock_exit: 'Saída de Estoque',
    stock_adjustment: 'Ajuste de Estoque',
    stock_reservation: 'Estoque Reservado',
    stock_release: 'Estoque Liberado',
    // Edições de dados
    customer_data_updated: 'Dados do Cliente Atualizados',
    order_data_updated: 'Dados do Pedido Atualizados',
    price_changed: 'Preço Alterado',
    // Integrações
    lunna_order_synced: 'Pedido Lunna Sincronizado',
    lunna_status_updated: 'Status Lunna Atualizado',
  };

  return labels[eventType] || eventType;
}

/**
 * Retorna cor do badge do evento
 */
export function getEventColor(eventType: ActivityEventType): string {
  // Eventos de sucesso
  if (eventType.includes('completed') || eventType.includes('approved') || eventType.includes('paid')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }

  // Eventos de falha
  if (eventType.includes('failed') || eventType.includes('cancelled')) {
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  }

  // Eventos de criação
  if (eventType.includes('created')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }

  // Eventos de atualização
  if (eventType.includes('updated')) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
  }

  // Padrão
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

// ============================================================================
// CÁLCULO DE ESTATÍSTICAS
// ============================================================================

/**
 * Calcula estatísticas das atividades
 */
export function calcularEstatisticas(activities: (ActivityLogEntry & { id: string })[]): ActivityStats {
  const hoje = startOfDay(new Date());
  const fimHoje = endOfDay(new Date());

  return {
    totalEventos: activities.length,

    // Entregas completadas hoje
    entregasHoje: activities.filter(a => {
      const timestamp = a.timestamp as Timestamp;
      const date = timestamp.toDate();
      return (
        a.eventType === 'point_completed' &&
        date >= hoje &&
        date <= fimHoje
      );
    }).length,

    // Eventos de pagamento/financeiro hoje
    pagamentosHoje: activities.filter(a => {
      const timestamp = a.timestamp as Timestamp;
      const date = timestamp.toDate();
      return (
        (a.eventType.includes('payment') || a.category === 'FINANCIAL') &&
        date >= hoje &&
        date <= fimHoje
      );
    }).length,

    // Rotas despachadas hoje (rotas ativas)
    rotasAtivas: activities.filter(a => {
      const timestamp = a.timestamp as Timestamp;
      const date = timestamp.toDate();
      return (
        a.eventType === 'route_dispatched' &&
        date >= hoje &&
        date <= fimHoje
      );
    }).length,
  };
}

// ============================================================================
// FORMATAÇÃO
// ============================================================================

/**
 * Formata data/hora para exibição
 */
export function formatDateTime(timestamp: Timestamp | Date): string {
  const date = timestamp instanceof Date ? timestamp : timestamp.toDate();

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formata valores para exibição
 */
export function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'number') {
    // Se for um valor monetário (tem centavos), formatar como moeda
    if (value % 1 !== 0) {
      return `R$ ${value.toFixed(2).replace('.', ',')}`;
    }
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (value && typeof value === 'object' && '_seconds' in value) {
    const date = new Date(value._seconds * 1000);
    return formatDateTime(date as any);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

/**
 * Extrai lista única de usuários das atividades
 */
export function extrairUsuarios(activities: (ActivityLogEntry & { id: string })[]): Array<{ id: string; name: string }> {
  const uniqueUsers = new Map<string, string>();

  activities.forEach(a => {
    if (a.userId && a.userName) {
      uniqueUsers.set(a.userId, a.userName);
    }
  });

  return Array.from(uniqueUsers.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
