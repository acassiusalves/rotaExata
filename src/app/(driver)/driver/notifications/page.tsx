'use client';

import * as React from 'react';
import {
  Bell,
  CheckCircle,
  AlertCircle,
  Info,
  Calendar,
  MapPin,
  Truck,
  Settings,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase/client';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

interface Notification {
  id: string;
  type: 'route_change' | 'route_assigned' | 'route_completed' | 'system' | 'alert';
  title: string;
  message: string;
  read: boolean;
  opened?: boolean;
  openedAt?: Timestamp | null;
  routeId?: string;
  routeName?: string;
  driverId?: string;
  driverName?: string;
  timestamp: Timestamp;
  priority: 'low' | 'medium' | 'high';
}

export default function DriverNotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Carregar notificações do motorista
  React.useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('driverId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs: Notification[] = [];
        snapshot.forEach((doc) => {
          notifs.push({ id: doc.id, ...doc.data() } as Notification);
        });
        setNotifications(notifs);
        setLoading(false);
      },
      (error) => {
        console.error('Erro ao carregar notificações:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Marcar notificação como aberta quando visualizada
  const handleMarkAsOpened = async (notificationId: string, alreadyOpened: boolean) => {
    if (alreadyOpened) {
      console.log('📱 [DriverNotifications] Notificação já foi aberta:', notificationId);
      return;
    }

    console.log('📱 [DriverNotifications] Marcando notificação como aberta:', notificationId);

    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        opened: true,
        openedAt: serverTimestamp(),
      });
      console.log('✅ [DriverNotifications] Notificação marcada como aberta com sucesso');
    } catch (error) {
      console.error('❌ [DriverNotifications] Erro ao marcar notificação como aberta:', error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'route_change':
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case 'route_assigned':
        return <Truck className="h-5 w-5 text-green-500" />;
      case 'route_completed':
        return <CheckCircle className="h-5 w-5 text-blue-500" />;
      case 'alert':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Settings className="h-5 w-5 text-slate-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'route_change':
        return 'Alteração de Rota';
      case 'route_assigned':
        return 'Rota Atribuída';
      case 'route_completed':
        return 'Rota Concluída';
      case 'alert':
        return 'Alerta';
      case 'system':
        return 'Sistema';
      default:
        return 'Notificação';
    }
  };

  const unreadCount = notifications.filter((n) => !n.opened).length;

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Carregando notificações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0 ? (
              <span className="text-primary font-medium">
                {unreadCount} nova{unreadCount > 1 ? 's' : ''}
              </span>
            ) : (
              'Você está em dia!'
            )}
          </p>
        </div>
        <Badge variant="secondary" className="bg-primary/10 text-primary">
          <Bell className="h-3 w-3 mr-1" />
          {notifications.length}
        </Badge>
      </div>

      {/* Lista de Notificações */}
      {notifications.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma notificação</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Você não tem notificações no momento. Quando houver atualizações importantes, elas aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={cn(
                'transition-all duration-300 cursor-pointer hover:shadow-md',
                !notification.opened
                  ? 'border-l-4 border-l-primary bg-blue-50 dark:bg-blue-950/30'
                  : 'bg-card border-l-4 border-l-transparent opacity-75'
              )}
              onClick={() => handleMarkAsOpened(notification.id, notification.opened || false)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getTypeIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <CardTitle className={cn(
                        "text-base transition-all",
                        !notification.opened ? "font-bold" : "font-semibold"
                      )}>
                        {notification.title}
                      </CardTitle>
                      {!notification.opened && (
                        <Badge variant="default" className="shrink-0 text-xs bg-primary">
                          Nova
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-sm">
                      {notification.message}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {notification.timestamp && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(notification.timestamp.toDate(), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                  {notification.routeName && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {notification.routeName}
                    </span>
                  )}
                  <Badge variant="outline" className="ml-auto text-xs">
                    {getTypeLabel(notification.type)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
