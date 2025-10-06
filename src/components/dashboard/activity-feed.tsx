import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Package,
  UserCheck,
  FileText,
  Truck,
  CheckCircle,
  XCircle,
  Route,
} from 'lucide-react';
import type { RouteInfo } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';


type ActivityEvent = {
  id: string;
  type: 'route_created' | 'route_dispatched';
  timestamp: Date;
  actor: {
    name: string;
  };
  details: string;
};

const eventIcons = {
  route_created: Route,
  route_dispatched: Truck,
};

interface ActivityFeedProps {
  routes: (RouteInfo & { id: string, name: string, status: string, plannedDate: Timestamp, driverInfo?: { name: string } | null, createdAt?: Timestamp })[];
}

export function ActivityFeed({ routes }: ActivityFeedProps) {

  const sortedRoutes = routes
    .filter(route => route.createdAt)
    .sort((a, b) => b.createdAt!.toMillis() - a.createdAt!.toMillis());

  return (
    <Card className="col-span-1 lg:col-span-1">
      <CardHeader>
        <CardTitle>Atividade Recente</CardTitle>
        <CardDescription>
          Últimas rotas criadas e despachadas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-6">
            {sortedRoutes.map((route) => {
              const Icon = route.status === 'dispatched' || route.status === 'in_progress' ? Truck : Route;
              const details = route.status === 'dispatched' || route.status === 'in_progress'
                ? `Rota "${route.name}" despachada para ${route.driverInfo?.name || 'motorista'}.`
                : `Rota "${route.name}" foi criada.`;

              return (
                <div key={route.id} className="flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{details}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(route.createdAt!.toDate(), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              )
            })}
             {sortedRoutes.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    Nenhuma atividade recente.
                </div>
             )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
