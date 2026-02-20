import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Package, DollarSign, Truck } from 'lucide-react';
import type { ActivityStats } from '@/lib/utils/activity-helpers';

interface StatsCardsProps {
  stats: ActivityStats;
  loading?: boolean;
}

export function StatsCards({ stats, loading = false }: StatsCardsProps) {
  const cards = [
    {
      title: 'Total de Eventos',
      value: stats.totalEventos,
      description: 'Registros no sistema',
      icon: Activity,
      color: 'text-blue-600',
    },
    {
      title: 'Entregas Hoje',
      value: stats.entregasHoje,
      description: 'Completadas',
      icon: Package,
      color: 'text-green-600',
    },
    {
      title: 'Pagamentos Hoje',
      value: stats.pagamentosHoje,
      description: 'Processados',
      icon: DollarSign,
      color: 'text-emerald-600',
    },
    {
      title: 'Rotas Ativas',
      value: stats.rotasAtivas,
      description: 'Em andamento',
      icon: Truck,
      color: 'text-orange-600',
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${card.color}`}>
                {card.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
