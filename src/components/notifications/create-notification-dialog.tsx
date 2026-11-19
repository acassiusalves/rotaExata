'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DriverRequest } from '@/lib/driver/runtime-client';
import type { StaffNotificationCreate, StaffNotificationDriver, StaffNotificationDrivers, StaffNotificationReceipt } from '@/lib/staff/notification-contract';
import { staffNotificationError } from './staff-notification-messages';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface CreateNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: DriverRequest;
  onCreated?: () => void;
}

const maxRecipients=200;

export function CreateNotificationDialog({open,onOpenChange,request,onCreated}:CreateNotificationDialogProps) {
  const [title,setTitle]=React.useState('');
  const [message,setMessage]=React.useState('');
  const [type,setType]=React.useState<StaffNotificationCreate['type']>('system');
  const [priority,setPriority]=React.useState<StaffNotificationCreate['priority']>('medium');
  const [selectedDrivers,setSelectedDrivers]=React.useState<string[]>([]);
  const [sendToAll,setSendToAll]=React.useState(false);
  const [sendPushNotification,setSendPushNotification]=React.useState(true);
  const [drivers,setDrivers]=React.useState<StaffNotificationDriver[]>([]);
  const [loading,setLoading]=React.useState(false);
  const [loadingDrivers,setLoadingDrivers]=React.useState(false);
  const [driversError,setDriversError]=React.useState('');
  const [retry,setRetry]=React.useState(0);
  const command=React.useRef<{key:string;id:string}>();
  const action=React.useRef<AbortController>();
  const {toast}=useToast();
  React.useEffect(()=>()=>action.current?.abort(),[]);

  React.useEffect(()=>{
    if (!open) return;
    const controller=new AbortController();
    setLoadingDrivers(true);
    setDriversError('');
    async function load() {
      try {
        let rows:StaffNotificationDriver[];
        if (request) {
          rows=[];
          const seen=new Set<string>();
          let cursor:string|null=null;
          do {
            const page:StaffNotificationDrivers=await request('/api/staff/notifications/drivers'+
              (cursor ? '?'+new URLSearchParams({cursor}):''),{signal:controller.signal});
            rows.push(...page.drivers);
            cursor=page.cursor;
            if (cursor && seen.has(cursor)) throw new Error('Cursor repetido.');
            if (cursor) seen.add(cursor);
          } while (cursor && !controller.signal.aborted);
        } else {
          rows=await (await import('./legacy-notification-data')).legacyNotificationDrivers();
        }
        if (!controller.signal.aborted) {
          setDrivers(rows);
          setSelectedDrivers(previous=>previous.filter(id=>rows.some(driver=>driver.id===id)));
          if (request && rows.length>maxRecipients) setSendToAll(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) setDriversError(staffNotificationError(error,'Não foi possível carregar os motoristas.'));
      } finally {
        if (!controller.signal.aborted) setLoadingDrivers(false);
      }
    }
    void load();
    return ()=>controller.abort();
  },[open,request,retry]);

  const canSelectAll=!request || drivers.length<=maxRecipients;
  const handleToggleDriver=(id:string)=>setSelectedDrivers(previous=>previous.includes(id)
    ? previous.filter(item=>item!==id)
    : !request || previous.length<maxRecipients ? [...previous,id]:previous);
  const handleToggleAll=()=>setSelectedDrivers(previous=>previous.length===drivers.length ? []:drivers.map(driver=>driver.id));
  function close(next:boolean) {
    if (!action.current) onOpenChange(next);
  }

  async function handleSubmit(event:React.FormEvent) {
    event.preventDefault();
    if (action.current || loadingDrivers || driversError) return;
    const driverIds=sendToAll ? drivers.map(driver=>driver.id):selectedDrivers;
    if (!title.trim() || !message.trim() || !driverIds.length) {
      toast({variant:'destructive',title:'Campos obrigatórios',description:'Preencha o título e a mensagem e selecione os destinatários.'});
      return;
    }
    const input={title:title.trim(),message:message.trim(),driverIds:[...driverIds].sort(),priority,type,push:sendPushNotification};
    const key=JSON.stringify(input);
    if (command.current?.key!==key) command.current={key,id:crypto.randomUUID()};
    const current=new AbortController();
    action.current=current;
    setLoading(true);
    try {
      if (request) {
        const result=await request<StaffNotificationReceipt>('/api/staff/notifications',{
          method:'POST',body:JSON.stringify({...input,commandId:command.current.id}),signal:current.signal,
        });
        if (current.signal.aborted) return;
        const count=(status:StaffNotificationReceipt['deliveries'][number]['push'])=>result.deliveries.filter(row=>row.push===status).length;
        const status=sendPushNotification ? [
          count('accepted')>0 && `${count('accepted')} push aceito(s)`,
          count('skipped')>0 && `${count('skipped')} sem vínculo ou permissão de push`,
          count('failed')>0 && `${count('failed')} falha(s)`,
          count('uncertain')>0 && `${count('uncertain')} sem confirmação do envio`,
        ].filter(Boolean).join(' · '):'';
        toast({title:`Notificação registrada para ${result.deliveries.length} motorista(s)`,description:status || undefined});
      } else {
        const failed=await (await import('./legacy-notification-data')).createLegacyNotifications(input,drivers);
        if (current.signal.aborted) return;
        toast(failed ? {title:'Notificação registrada',description:'O envio de push falhou.'}
          : {title:'Notificação enviada',description:`Destinatários selecionados: ${driverIds.length}`});
      }
      command.current=undefined;
      setTitle('');
      setMessage('');
      setType('system');
      setPriority('medium');
      setSelectedDrivers([]);
      setSendToAll(false);
      setSendPushNotification(true);
      onCreated?.();
      onOpenChange(false);
    } catch (error) {
      if (!current.signal.aborted) toast({variant:'destructive',title:'Não foi possível concluir o envio',
        description:staffNotificationError(error,'Tente novamente com os mesmos dados para conferir o resultado do envio.')});
    } finally {
      if (action.current===current) {
        action.current=undefined;
        if (!current.signal.aborted) setLoading(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Nova Notificação</DialogTitle>
          <DialogDescription>
            Envie uma notificação customizada para motoristas específicos ou para todos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Ex: Atenção - Nova política de entregas"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
            />
          </div>

          {/* Mensagem */}
          <div className="space-y-2">
            <Label htmlFor="message">Mensagem *</Label>
            <Textarea
              id="message"
              placeholder="Digite a mensagem da notificação..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={500}
              required
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/500 caracteres
            </p>
          </div>

          {/* Tipo e Prioridade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select value={type} onValueChange={value=>setType(value as typeof type)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">Sistema</SelectItem>
                  <SelectItem value="alert">Alerta</SelectItem>
                  <SelectItem value="route_assigned">Rota Atribuída</SelectItem>
                  <SelectItem value="route_change">Alteração de Rota</SelectItem>
                  <SelectItem value="route_completed">Rota Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Prioridade</Label>
              <Select value={priority} onValueChange={value=>setPriority(value as typeof priority)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Destinatários */}
          <div className="space-y-3">
            <Label>Destinatários *</Label>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendToAll"
                checked={sendToAll}
                disabled={!canSelectAll || loadingDrivers || !!driversError || loading}
                onCheckedChange={(checked) => {
                  setSendToAll(checked === true);
                  if (checked) {
                    setSelectedDrivers(drivers.map((d) => d.id));
                  }
                }}
              />
              <Label
                htmlFor="sendToAll"
                className="text-sm font-normal cursor-pointer"
              >
                Enviar para todos os motoristas ({drivers.length})
              </Label>
            </div>

            {!canSelectAll && <p className="text-xs text-muted-foreground">Selecione até {maxRecipients} motoristas por envio.</p>}
            {driversError && <div role="alert" className="text-sm text-destructive">
              {driversError} <Button variant="link" type="button" onClick={()=>setRetry(current=>current+1)}>Tentar novamente</Button>
            </div>}
            {!sendToAll && !driversError && (
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {loadingDrivers ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : drivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum motorista encontrado
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between pb-2 border-b">
                      <span className="text-sm text-muted-foreground">
                        {selectedDrivers.length} selecionado{selectedDrivers.length !== 1 ? 's' : ''}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleAll}
                        disabled={!canSelectAll || loading}
                      >
                        {selectedDrivers.length === drivers.length ? 'Desmarcar todos' : 'Selecionar todos'}
                      </Button>
                    </div>
                    {drivers.map((driver) => (
                      <div key={driver.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`driver-${driver.id}`}
                          checked={selectedDrivers.includes(driver.id)}
                          disabled={loading || (!!request && selectedDrivers.length>=maxRecipients && !selectedDrivers.includes(driver.id))}
                          onCheckedChange={() => handleToggleDriver(driver.id)}
                        />
                        <Label
                          htmlFor={`driver-${driver.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {driver.displayName}
                          <span className="text-xs text-muted-foreground ml-2">
                            ({driver.email})
                          </span>
                        </Label>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Push Notification */}
          <div className="flex items-center space-x-2 pt-2 border-t">
            <Checkbox
              id="sendPush"
              checked={sendPushNotification}
              onCheckedChange={(checked) => setSendPushNotification(checked as boolean)}
            />
            <Label
              htmlFor="sendPush"
              className="text-sm font-normal cursor-pointer"
            >
              Enviar notificação push (aparece mesmo com app fechado)
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || loadingDrivers || !!driversError || !drivers.length}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Notificação
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
