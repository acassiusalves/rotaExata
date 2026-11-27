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
import Link from 'next/link';
import { CreateNotificationDialog } from '@/components/notifications/create-notification-dialog';
import { staffNotificationError } from '@/components/notifications/staff-notification-messages';
import { useOptionalStaff } from '@/components/staff/staff-session';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import type { StaffNotification, StaffNotificationChange, StaffNotificationsPage, StaffPushReason } from '@/lib/staff/notification-contract';

const endpoint='/api/staff/notifications';
const skippedPushLabels:Record<StaffPushReason,string>={
  recipient_unavailable:'Motorista indisponível',
  consent_missing:'Push sem permissão',
  token_missing:'Push sem dispositivo',
  token_unlinked:'Dispositivo sem vínculo',
  binding_invalid:'Vínculo de push indisponível',
  destination_changed:'Destino do push mudou',
};
type NotificationAction=Omit<Extract<StaffNotificationChange,{action:'mark'}>,'commandId'> |
  Omit<Extract<StaffNotificationChange,{action:'delete'}>,'commandId'>;

export default function NotificationsPage() {
  const staff=useOptionalStaff();
  if (nativeStaffEnabled && !staff) return null;
  return <Notifications key={staff ? `${staff.userId}:${staff.scopeId}`:'legacy'} staff={staff} />;
}

function Notifications({staff}:{staff:ReturnType<typeof useOptionalStaff>}) {
  const request=staff?.request;
  const [notifications,setNotifications]=React.useState<StaffNotification[]>([]);
  const [loading,setLoading]=React.useState(true);
  const [error,setError]=React.useState('');
  const [searchTerm,setSearchTerm]=React.useState('');
  const [filterType,setFilterType]=React.useState('all');
  const [filterStatus,setFilterStatus]=React.useState('all');
  const [notificationToDelete,setNotificationToDelete]=React.useState<StaffNotification|null>(null);
  const [createDialogOpen,setCreateDialogOpen]=React.useState(false);
  const [pages,setPages]=React.useState<string[]>([]);
  const [nextCursor,setNextCursor]=React.useState<string|null>(null);
  const [refresh,setRefresh]=React.useState(0);
  const [saving,setSaving]=React.useState(false);
  const action=React.useRef<AbortController>();
  const pending=React.useRef<{key:string;id:string}>();
  const {toast}=useToast();
  const cursor=pages.at(-1);
  const canManage=!staff || staff.paths.includes('/notifications');
  const canViewReports=!staff || staff.paths.includes('/admin/erros');

  React.useEffect(()=>()=>action.current?.abort(),[]);
  React.useEffect(()=>{
    if (request) return;
    let active=true;
    let unsubscribe:(()=>void)|undefined;
    function fail() {
      if (active) {setError('Não foi possível carregar as notificações.');setLoading(false);}
    }
    void import('@/components/notifications/legacy-notification-data').then(({watchLegacyNotifications})=>{
      if (!active) return;
      unsubscribe=watchLegacyNotifications(rows=>{
        if (!active) return;
        setNotifications(rows);
        setLoading(false);
        setError('');
      },fail);
    }).catch(fail);
    return ()=>{active=false;unsubscribe?.();};
  },[request,refresh]);

  React.useEffect(()=>{
    if (!request) return;
    const controller=new AbortController();
    const params=new URLSearchParams();
    if (filterType!=='all') params.set('type',filterType);
    if (filterStatus!=='all') params.set('status',filterStatus);
    if (searchTerm) params.set('search',searchTerm);
    if (cursor) params.set('cursor',cursor);
    let wait=20_000;
    let inFlight=false;
    let timer:number|undefined;
    setLoading(true);
    setError('');
    async function load() {
      if (controller.signal.aborted || inFlight || !request) return;
      inFlight=true;
      window.clearTimeout(timer);
      try {
        const result=await request<StaffNotificationsPage>(endpoint+'?'+params,{signal:controller.signal});
        if (controller.signal.aborted) return;
        setNotifications(result.notifications);
        setNextCursor(result.cursor);
        setError('');
        wait=20_000;
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(staffNotificationError(error,'Não foi possível carregar as notificações.'));
          setNextCursor(null);
          wait=Math.min(60_000,wait*2);
        }
      } finally {
        inFlight=false;
        if (!controller.signal.aborted) {
          setLoading(false);
          timer=window.setTimeout(visible,wait);
        }
      }
    }
    function visible() {
      if (document.visibilityState==='visible') void load();
    }
    timer=window.setTimeout(load,150);
    window.addEventListener('focus',visible);
    document.addEventListener('visibilitychange',visible);
    return ()=>{
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener('focus',visible);
      document.removeEventListener('visibilitychange',visible);
    };
  },[request,filterType,filterStatus,searchTerm,cursor,refresh]);

  const filteredNotifications=request ? notifications : notifications.filter(item=>{
    const term=searchTerm.toLowerCase();
    return (filterType==='all' || item.type===filterType) &&
      (filterStatus==='all' || item.read===(filterStatus==='read')) &&
      (!term || [item.title,item.message,item.driverName,item.routeName].some(value=>value?.toLowerCase().includes(term)));
  });

  function changeFilter(set:(value:string)=>void,value:string) {
    if (request) setPages([]);
    set(value);
  }
  function reload() {setRefresh(current=>current+1);}

  async function changeNotification(command:NotificationAction) {
    if (!canManage || action.current) return;
    const controller=new AbortController();
    action.current=controller;
    setSaving(true);
    const key=JSON.stringify(command);
    if (pending.current?.key!==key) pending.current={key,id:crypto.randomUUID()};
    try {
      if (request) {
        await request(endpoint,{method:'PATCH',signal:controller.signal,body:JSON.stringify({...command,commandId:pending.current.id})});
        if (controller.signal.aborted) return;
        reload();
      } else {
        const legacy=await import('@/components/notifications/legacy-notification-data');
        if (command.action==='delete') await legacy.deleteLegacyNotification(command.item.id);
        else await legacy.markLegacyNotifications(command.items.map(item=>item.id),command.read);
      }
      if (controller.signal.aborted) return;
      pending.current=undefined;
      if (command.action==='delete') setNotificationToDelete(null);
      toast({title:command.action==='delete' ? 'Notificação excluída':'Leitura atualizada'});
    } catch (error) {
      if (!controller.signal.aborted) {
        toast({variant:'destructive',title:'Erro ao atualizar as notificações',
          description:staffNotificationError(error,'Tente novamente para conferir o resultado.')});
        if (request) reload();
      }
    } finally {
      if (action.current===controller) {
        action.current=undefined;
        if (!controller.signal.aborted) setSaving(false);
      }
    }
  }

  const asCommandItem=({id,revision}:StaffNotification)=>({id,revision});
  const unread=notifications.filter(item=>item.canChange && !item.read);

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
          {canManage && unread.length > 0 && (
            <Button variant="outline" disabled={loading || saving || !!error} onClick={()=>void changeNotification({action:'mark',items:unread.map(asCommandItem),read:true})}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {request ? 'Marcar lidas nesta página':'Marcar todas como lidas'}
            </Button>
          )}
          {canManage && <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Notificação
          </Button>}
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
              {request ? 'Notificações nesta página':'Todas as notificações'}
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
                  const notifDate = new Date(n.timestamp);
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
                onChange={(event) => changeFilter(setSearchTerm,event.target.value)}
                maxLength={200}
                className="pl-8"
              />
            </div>

            <Select value={filterType} onValueChange={value=>changeFilter(setFilterType,value)}>
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

            <Select value={filterStatus} onValueChange={value=>changeFilter(setFilterStatus,value)}>
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
              : request ? 'Página de notificações':'Todas as notificações do sistema'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="space-y-2" role="alert">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" onClick={reload}>Tentar novamente</Button>
            </div>
          ) : loading ? (
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
                  key={notification.kind+':'+notification.id}
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
                        {notification.reportId && canViewReports && (
                          <Link className="mt-2 inline-block text-sm font-medium underline"
                            href={`/admin/erros?report=${encodeURIComponent(notification.reportId)}`}>
                            Abrir chamado
                          </Link>
                        )}
                      </div>
                      {getPriorityBadge(notification.priority)}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {notification.timestamp && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(notification.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      {notification.driverName && (
                        <span>• Motorista: {notification.driverName}</span>
                      )}
                      {notification.author && <span>• Autor: {notification.author}</span>}
                      {notification.routeId && staff?.paths.includes('/routes') && (
                        <Link className="underline" href={`/routes/${encodeURIComponent(notification.routeId)}/acompanhar`}>Abrir rota</Link>
                      )}
                      {notification.routeName && (
                        <span>• {notification.routeName}</span>
                      )}
                      {notification.opened && notification.openedAt && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          <Eye className="h-3 w-3 mr-1" />
                          Aberta {format(new Date(notification.openedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </Badge>
                      )}
                      {!request && !notification.opened && notification.read && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          <Send className="h-3 w-3 mr-1" />
                          Enviada
                        </Badge>
                      )}
                      {request && notification.push && notification.push!=='not_requested' && (
                        <Badge variant="outline">{
                          notification.push==='skipped' && notification.pushReason ? skippedPushLabels[notification.pushReason] :
                            {accepted:'Push aceito',failed:'Falha de push',skipped:'Push indisponível',uncertain:'Push sem confirmação'}[notification.push]
                        }</Badge>
                      )}
                      <Badge variant="outline" className="ml-auto text-xs">
                        {getTypeLabel(notification.type)}
                      </Badge>
                    </div>
                  </div>

                  {/* Actions */}
                  {canManage && notification.canChange && <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={notification.read ? 'Marcar como não lida':'Marcar como lida'}
                      disabled={saving}
                      onClick={()=>void changeNotification({action:'mark',items:[asCommandItem(notification)],read:!notification.read})}
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
                      aria-label="Excluir notificação"
                      disabled={saving}
                      onClick={() => setNotificationToDelete(notification)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>}
                </div>
              ))}
            </div>
          )}
          {request && !error && (pages.length>0 || nextCursor) && <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={loading || !pages.length} onClick={()=>setPages(current=>current.slice(0,-1))}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={loading || !nextCursor} onClick={()=>nextCursor && setPages(current=>[...current,nextCursor])}>Mais antigas</Button>
          </div>}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!notificationToDelete} onOpenChange={(open) => !open && !saving && setNotificationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir notificação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A notificação será permanentemente removida do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={event=>{
                event.preventDefault();
                if (notificationToDelete) void changeNotification({action:'delete',item:asCommandItem(notificationToDelete)});
              }}
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
        request={request}
        onCreated={reload}
      />
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
