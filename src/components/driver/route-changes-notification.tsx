'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, ArrowUpDown, MapPin, Plus, Trash2, Edit } from 'lucide-react';
import type { RouteChangeNotification } from '@/lib/types';

interface RouteChangesNotificationProps {
  notification: RouteChangeNotification | null;
  onAcknowledge: () => Promise<void>;
  isAcknowledging: boolean;
}

const getChangeIcon = (type: string) => {
  switch (type) {
    case 'sequence':
      return <ArrowUpDown className="h-4 w-4" />;
    case 'address':
      return <MapPin className="h-4 w-4" />;
    case 'added':
      return <Plus className="h-4 w-4" />;
    case 'removed':
      return <Trash2 className="h-4 w-4" />;
    default:
      return <Edit className="h-4 w-4" />;
  }
};

const getChangeLabel = (type: string) => {
  switch (type) {
    case 'sequence':
      return 'Sequência alterada';
    case 'address':
      return 'Endereço modificado';
    case 'added':
      return 'Nova parada adicionada';
    case 'removed':
      return 'Parada removida';
    case 'data':
      return 'Dados atualizados';
    default:
      return 'Modificação';
  }
};

const getChangeBadgeColor = (type: string) => {
  switch (type) {
    case 'sequence':
      return 'bg-blue-500 hover:bg-blue-600';
    case 'address':
      return 'bg-orange-500 hover:bg-orange-600';
    case 'added':
      return 'bg-green-500 hover:bg-green-600';
    case 'removed':
      return 'bg-red-500 hover:bg-red-600';
    case 'data':
      return 'bg-purple-500 hover:bg-purple-600';
    default:
      return 'bg-gray-500 hover:bg-gray-600';
  }
};

export function RouteChangesNotification({
  notification,
  onAcknowledge,
  isAcknowledging,
}: RouteChangesNotificationProps) {
  if (!notification || notification.acknowledged) {
    return null;
  }

  return (
    <AlertDialog open={true}>
      <AlertDialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            <AlertDialogTitle>Alterações na Rota</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            O administrador fez alterações em sua rota. Revise as mudanças abaixo e confirme o recebimento.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-4">
          <p className="text-sm font-semibold text-muted-foreground">
            {notification.changes.length} {notification.changes.length === 1 ? 'alteração' : 'alterações'} {notification.changes.length === 1 ? 'detectada' : 'detectadas'}:
          </p>

          {notification.changes.map((change, index) => (
            <Card key={index} className="border-l-4" style={{ borderLeftColor: getChangeBadgeColor(change.changeType).split(' ')[0].replace('bg-', '') }}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${getChangeBadgeColor(change.changeType)} text-white`}>
                    {getChangeIcon(change.changeType)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={`${getChangeBadgeColor(change.changeType)} text-white`}>
                        {getChangeLabel(change.changeType)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Parada #{change.stopIndex + 1}
                      </span>
                    </div>

                    {change.changeType === 'sequence' && (
                      <p className="text-sm">
                        Posição alterada: <span className="font-semibold">#{change.oldValue + 1}</span> → <span className="font-semibold">#{change.newValue + 1}</span>
                      </p>
                    )}

                    {change.changeType === 'address' && (
                      <div className="text-sm space-y-1">
                        <p className="text-muted-foreground line-through">{change.oldValue}</p>
                        <p className="font-semibold text-green-600">{change.newValue}</p>
                      </div>
                    )}

                    {change.changeType === 'added' && (
                      <p className="text-sm">
                        Nova parada adicionada à rota
                      </p>
                    )}

                    {change.changeType === 'removed' && (
                      <p className="text-sm text-red-600">
                        Esta parada foi removida da rota
                      </p>
                    )}

                    {change.changeType === 'data' && (
                      <p className="text-sm">
                        Informações da parada foram atualizadas
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onAcknowledge}
            disabled={isAcknowledging}
            className="w-full"
          >
            {isAcknowledging ? 'Confirmando...' : 'Confirmar Recebimento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
