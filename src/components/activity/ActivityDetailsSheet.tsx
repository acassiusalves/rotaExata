import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  formatDateTime,
  getCategoryLabel,
  getCategoryColor,
  getEventTypeLabel,
  formatValue,
} from '@/lib/utils/activity-helpers';
import type { ActivityLogEntry } from '@/lib/types';

interface ActivityDetailsSheetProps {
  activity: (ActivityLogEntry & { id: string }) | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityDetailsSheet({
  activity,
  isOpen,
  onClose,
}: ActivityDetailsSheetProps) {
  if (!activity) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes da Atividade</SheetTitle>
          <SheetDescription>
            {activity.entityCode} • {formatDateTime(activity.timestamp)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Card 1: Informações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-muted-foreground">Evento:</div>
                <div className="font-semibold">
                  {getEventTypeLabel(activity.eventType)}
                </div>

                <div className="text-muted-foreground">Categoria:</div>
                <div>
                  <Badge className={getCategoryColor(activity)} variant="secondary">
                    {getCategoryLabel(activity)}
                  </Badge>
                </div>

                <div className="text-muted-foreground">Usuário:</div>
                <div>{activity.userName || '-'}</div>

                <div className="text-muted-foreground">Data/Hora:</div>
                <div>{formatDateTime(activity.timestamp)}</div>

                {activity.origin && (
                  <>
                    <div className="text-muted-foreground">Origem:</div>
                    <div className="capitalize">{activity.origin.replace('_', ' ')}</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Entidade Afetada */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entidade Afetada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-muted-foreground">Tipo:</div>
                <div className="capitalize">{activity.entityType}</div>

                <div className="text-muted-foreground">Código:</div>
                <div className="font-semibold">{activity.entityCode || '-'}</div>

                {activity.serviceCode && (
                  <>
                    <div className="text-muted-foreground">Serviço:</div>
                    <div>{activity.serviceCode}</div>
                  </>
                )}

                {activity.routeCode && (
                  <>
                    <div className="text-muted-foreground">Rota:</div>
                    <div>{activity.routeCode}</div>
                  </>
                )}

                {activity.pointCode && (
                  <>
                    <div className="text-muted-foreground">Ponto:</div>
                    <div>{activity.pointCode}</div>
                  </>
                )}

                {activity.paymentId && (
                  <>
                    <div className="text-muted-foreground">ID do Pagamento:</div>
                    <div className="font-mono text-xs">{activity.paymentId}</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Detalhes do Evento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhes do Evento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium mb-1">Ação:</div>
                  <div className="text-sm text-muted-foreground">{activity.action}</div>
                </div>

                {activity.changes && activity.changes.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-sm font-medium mb-2">Mudanças:</div>
                      <div className="space-y-2">
                        {activity.changes.map((change, idx) => (
                          <div
                            key={idx}
                            className="bg-muted p-3 rounded text-sm space-y-1"
                          >
                            <div className="font-medium">
                              {change.fieldLabel || change.field}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="line-through text-muted-foreground">
                                {formatValue(change.oldValue)}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-green-600 font-medium">
                                {formatValue(change.newValue)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Metadados */}
          {activity.metadata && Object.keys(activity.metadata).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Metadados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {Object.entries(activity.metadata).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <div className="font-medium text-muted-foreground min-w-[120px]">
                        {key}:
                      </div>
                      <div className="flex-1 break-words">{formatValue(value)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
