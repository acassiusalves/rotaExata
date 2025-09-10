import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Users,
  Package,
  Clock,
  CheckCircle2,
  MapPin,
  LineChart,
} from 'lucide-react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import {
  DeliveriesChart,
  StatusChart,
} from '@/components/dashboard/charts';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import Image from 'next/image';
import { placeholderImages } from '@/lib/placeholder-images';

export default function DashboardPage() {
  const mapImage = placeholderImages.find((p) => p.id === 'map1');

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total de Entregas (Hoje)"
          value="125"
          icon={Package}
          trend="+15.3% desde ontem"
        />
        <KpiCard
          title="Tempo Médio de Entrega"
          value="28 min"
          icon={Clock}
          trend="-2.1% esta semana"
        />
        <KpiCard
          title="SLA Cumprido"
          value="98.2%"
          icon={CheckCircle2}
          trend="+0.5% desde ontem"
        />
        <KpiCard
          title="Motoristas Ativos"
          value="12 / 15"
          icon={Users}
          trend="2 offline"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5" />
              Entregas por Hora
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <DeliveriesChart />
          </CardContent>
        </Card>
        <Card className="col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Status dos Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusChart />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActivityFeed />
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Localização dos Motoristas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg">
              {mapImage && (
                <Image
                  src={mapImage.imageUrl}
                  alt="Mapa com a localização dos motoristas"
                  fill
                  className="object-cover"
                  data-ai-hint={mapImage.imageHint}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              <div className="absolute bottom-4 left-4">
                <p className="text-sm font-semibold text-white">
                  Visualização em tempo real
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
