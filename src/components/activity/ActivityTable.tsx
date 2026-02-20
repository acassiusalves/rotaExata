import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import {
  formatDateTime,
  getCategoryLabel,
  getCategoryColor,
  getEventTypeLabel,
  getEventColor,
} from '@/lib/utils/activity-helpers';
import type { ActivityLogEntry } from '@/lib/types';

interface ActivityTableProps {
  activities: (ActivityLogEntry & { id: string })[];
  onViewDetails: (activity: ActivityLogEntry & { id: string }) => void;
}

export function ActivityTable({ activities, onViewDetails }: ActivityTableProps) {
  if (activities.length === 0) {
    return (
      <Card>
        <div className="p-12 text-center text-muted-foreground">
          Nenhuma atividade encontrada
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Data/Hora</TableHead>
            <TableHead className="w-[120px]">Categoria</TableHead>
            <TableHead className="w-[180px]">Evento</TableHead>
            <TableHead className="w-[120px]">Entidade</TableHead>
            <TableHead className="w-[140px]">Usuário</TableHead>
            <TableHead className="text-right w-[80px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity) => (
            <TableRow key={activity.id}>
              <TableCell className="font-mono text-xs">
                {formatDateTime(activity.timestamp)}
              </TableCell>
              <TableCell>
                <Badge className={getCategoryColor(activity)} variant="secondary">
                  {getCategoryLabel(activity)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={getEventColor(activity.eventType)} variant="outline">
                  {getEventTypeLabel(activity.eventType)}
                </Badge>
              </TableCell>
              <TableCell className="font-semibold">
                {activity.entityCode || '-'}
              </TableCell>
              <TableCell className="text-sm">{activity.userName || '-'}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewDetails(activity)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
