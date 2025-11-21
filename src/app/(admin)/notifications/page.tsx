'use client';

import * as React from 'react';
import {
  Bell,
  CheckCircle,
  AlertCircle,
  Info,
  Trash2,
  Eye,
  EyeOff,
  Filter,
  Search,
  Calendar,
  Plus,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { db } from '@/lib/firebase/client';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CreateNotificationDialog } from '@/components/notifications/create-notification-dialog';

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
  createdBy?: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterType, setFilterType] = React.useState<string>('all');
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [notificationToDelete, setNotificationToDelete] = React.useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const { toast } = useToast();

  // Load notifications from Firestore
  React.useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
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
        setFilteredNotifications(notifs);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading notifications:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar notificações',
          description: 'Não foi possível carregar as notificações.',
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [toast]);

  // Filter notifications
  React.useEffect(() => {
    let filtered = notifications;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter((n) => n.type === filterType);
    }

    // Filter by status (read/unread)
    if (filterStatus === 'read') {
      filtered = filtered.filter((n) => n.read);
    } else if (filterStatus === 'unread') {
      filtered = filtered.filter((n) => !n.read);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.title.toLowerCase().includes(term) ||
          n.message.toLowerCase().includes(term) ||
          n.driverName?.toLowerCase().includes(term) ||
          n.routeName?.toLowerCase().includes(term)
      );
    }

    setFilteredNotifications(filtered);
  }, [notifications, filterType, filterStatus, searchTerm]);

  const handleMarkAsRead = async (notificationId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: !currentStatus,
      });
      toast({
        title: !currentStatus ? 'Marcado como lido' : 'Marcado como não lido',
        description: 'Status da notificação atualizado.',
      });
    } catch (error) {
      console.error('Error updating notification:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar a notificação.',
      });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter((n) => !n.read);
      await Promise.all(
        unreadNotifications.map((n) =>
          updateDoc(doc(db, 'notifications', n.id), { read: true })
        )
      );
      toast({
        title: 'Todas marcadas como lidas',
        description: `${unreadNotifications.length} notificações foram marcadas como lidas.`,
      });
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível marcar todas como lidas.',
      });
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
      toast({
        title: 'Notificação excluída',
        description: 'A notificação foi removida com sucesso.',
      });
      setNotificationToDelete(null);
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível excluir a notificação.',
      });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'route_change':
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case 'route_assigned':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'route_completed':
        return <CheckCircle className="h-5 w-5 text-blue-500" />;
      case 'alert':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Info className="h-5 w-5 text-slate-500" />;
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

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">Alta</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">Média</Badge>;
      default:
        return <Badge variant="outline">Baixa</Badge>;
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Notificações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e envie notificações para motoristas
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="bg-primary/10 text-primary px-3 py-1">
              {unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'}
            </Badge>
          )}
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllAsRead}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Marcar todas como lidas
            </Button>
          )}
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Notificação
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notifications.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Todas as notificações
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Não Lidas</CardTitle>
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{unreadCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Aguardando leitura
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hoje</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {
                notifications.filter((n) => {
                  if (!n.timestamp) return false;
                  const today = new Date();
                  const notifDate = n.timestamp.toDate();
                  return (
                    notifDate.getDate() === today.getDate() &&
                    notifDate.getMonth() === today.getMonth() &&
                    notifDate.getFullYear() === today.getFullYear()
                  );
                }).length
              }
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Recebidas hoje
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prioridade Alta</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {notifications.filter((n) => n.priority === 'high').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Requerem atenção
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Filtre as notificações por tipo, status ou pesquisa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar notificações..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de notificação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="route_change">Alteração de Rota</SelectItem>
                <SelectItem value="route_assigned">Rota Atribuída</SelectItem>
                <SelectItem value="route_completed">Rota Concluída</SelectItem>
                <SelectItem value="alert">Alerta</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="unread">Não lidas</SelectItem>
                <SelectItem value="read">Lidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filteredNotifications.length} Notificaç{filteredNotifications.length === 1 ? 'ão' : 'ões'}
          </CardTitle>
          <CardDescription>
            {filterType !== 'all' || filterStatus !== 'all' || searchTerm
              ? 'Resultados filtrados'
              : 'Todas as notificações do sistema'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-sm text-muted-foreground">Carregando notificações...</p>
              </div>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Nenhuma notificação encontrada
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {searchTerm || filterType !== 'all' || filterStatus !== 'all'
                  ? 'Tente ajustar os filtros para ver mais resultados.'
                  : 'Você não tem notificações no momento.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-lg border transition-colors',
                    notification.read
                      ? 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                      : 'bg-white dark:bg-slate-900 border-primary/20 shadow-sm'
                  )}
                >
                  {/* Icon */}
                  <div className="mt-1">{getTypeIcon(notification.type)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h4 className={cn(
                          'text-sm font-semibold',
                          notification.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-slate-100'
                        )}>
                          {notification.title}
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                      </div>
                      {getPriorityBadge(notification.priority)}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {notification.timestamp && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(notification.timestamp.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      {notification.driverName && (
                        <span>• Motorista: {notification.driverName}</span>
                      )}
                      {notification.routeName && (
                        <span>• {notification.routeName}</span>
                      )}
                      {notification.opened && notification.openedAt && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          <Eye className="h-3 w-3 mr-1" />
                          Aberta {format(notification.openedAt.toDate(), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </Badge>
                      )}
                      {!notification.opened && notification.read && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          <Send className="h-3 w-3 mr-1" />
                          Enviada
                        </Badge>
                      )}
                      <Badge variant="outline" className="ml-auto text-xs">
                        {getTypeLabel(notification.type)}
                      </Badge>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMarkAsRead(notification.id, notification.read)}
                    >
                      {notification.read ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setNotificationToDelete(notification.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!notificationToDelete} onOpenChange={(open) => !open && setNotificationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir notificação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A notificação será permanentemente removida do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => notificationToDelete && handleDeleteNotification(notificationToDelete)}
              className="bg-red-500 hover:bg-red-600"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Notification Dialog */}
      <CreateNotificationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
