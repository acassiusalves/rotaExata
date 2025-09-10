import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { activityFeed } from '@/lib/data';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Package,
  UserCheck,
  FileText,
  Truck,
  CheckCircle,
  XCircle,
} from 'lucide-react';

const eventIcons = {
  status_change: Package,
  assignment: UserCheck,
  note: FileText,
};

const getStatusIcon = (details: string) => {
  if (details.includes('em rota'))
    return <Truck className="h-4 w-4 text-blue-500" />;
  if (details.includes('entregue'))
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (details.includes('cancelado'))
    return <XCircle className="h-4 w-4 text-red-500" />;
  if (details.includes('coleta realizada'))
    return <Package className="h-4 w-4 text-yellow-500" />;
  return <FileText className="h-4 w-4 text-gray-500" />;
};

export function ActivityFeed() {
  return (
    <Card className="col-span-1 lg:col-span-1">
      <CardHeader>
        <CardTitle>Atividade Recente</CardTitle>
        <CardDescription>
          Últimas atualizações de pedidos e motoristas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-6">
            {activityFeed.map((event) => (
              <div key={event.id} className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  {getStatusIcon(event.details)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{event.details}</p>
                  <p className="text-xs text-muted-foreground">
                    por {event.actor.name}
                    {' - '}
                    {formatDistanceToNow(event.timestamp, {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
