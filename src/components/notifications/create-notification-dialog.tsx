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
import { db, functions } from '@/lib/firebase/client';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface Driver {
  id: string;
  displayName: string;
  email: string;
}

interface CreateNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateNotificationDialog({
  open,
  onOpenChange,
}: CreateNotificationDialogProps) {
  const [title, setTitle] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [type, setType] = React.useState<string>('system');
  const [priority, setPriority] = React.useState<string>('medium');
  const [selectedDrivers, setSelectedDrivers] = React.useState<string[]>([]);
  const [sendToAll, setSendToAll] = React.useState(false);
  const [sendPushNotification, setSendPushNotification] = React.useState(true);
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingDrivers, setLoadingDrivers] = React.useState(false);
  const { toast } = useToast();

  // Carregar lista de motoristas quando o dialog abrir
  React.useEffect(() => {
    if (open) {
      loadDrivers();
    }
  }, [open]);

  const loadDrivers = async () => {
    setLoadingDrivers(true);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'driver'));
      const snapshot = await getDocs(q);
      const driversList: Driver[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        driversList.push({
          id: doc.id,
          displayName: data.displayName || data.email || 'Sem nome',
          email: data.email || '',
        });
      });
      setDrivers(driversList);
    } catch (error) {
      console.error('Erro ao carregar motoristas:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar a lista de motoristas.',
      });
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleToggleDriver = (driverId: string) => {
    setSelectedDrivers((prev) =>
      prev.includes(driverId)
        ? prev.filter((id) => id !== driverId)
        : [...prev, driverId]
    );
  };

  const handleToggleAll = () => {
    if (selectedDrivers.length === drivers.length) {
      setSelectedDrivers([]);
    } else {
      setSelectedDrivers(drivers.map((d) => d.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !message.trim()) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigatórios',
        description: 'Preencha o título e a mensagem da notificação.',
      });
      return;
    }

    if (!sendToAll && selectedDrivers.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Selecione destinatários',
        description: 'Selecione pelo menos um motorista ou marque "Enviar para todos".',
      });
      return;
    }

    setLoading(true);

    try {
      const recipients = sendToAll ? drivers.map((d) => d.id) : selectedDrivers;

      // Criar notificação para cada destinatário
      for (const driverId of recipients) {
        const driver = drivers.find((d) => d.id === driverId);

        await addDoc(collection(db, 'notifications'), {
          type,
          title: title.trim(),
          message: message.trim(),
          priority,
          driverId,
          driverName: driver?.displayName || driver?.email || 'Motorista',
          read: false,
          opened: false,
          openedAt: null,
          timestamp: serverTimestamp(),
          createdBy: 'admin', // TODO: pegar do contexto de autenticação
        });
      }

      // Se a opção de enviar push notification estiver marcada, chamar Cloud Function
      if (sendPushNotification) {
        try {
          const sendNotificationFn = httpsCallable(functions, 'sendCustomNotification');
          await sendNotificationFn({
            title: title.trim(),
            message: message.trim(),
            driverIds: recipients,
            priority,
            type,
          });
        } catch (pushError) {
          console.error('❌ Erro ao enviar push notifications:', pushError);
          // Não falhar a operação inteira se apenas o push falhar
          toast({
            variant: 'default',
            title: 'Notificação criada',
            description: 'Notificação criada, mas o push notification falhou.',
          });
        }
      }

      toast({
        title: 'Notificação enviada!',
        description: `Notificação enviada para ${recipients.length} motorista${recipients.length > 1 ? 's' : ''}.`,
      });

      // Resetar formulário
      setTitle('');
      setMessage('');
      setType('system');
      setPriority('medium');
      setSelectedDrivers([]);
      setSendToAll(false);
      setSendPushNotification(true);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao criar notificação:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível criar a notificação.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <Select value={type} onValueChange={setType}>
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
              <Select value={priority} onValueChange={setPriority}>
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
                onCheckedChange={(checked) => {
                  setSendToAll(checked as boolean);
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

            {!sendToAll && (
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
                      >
                        {selectedDrivers.length === drivers.length ? 'Desmarcar todos' : 'Selecionar todos'}
                      </Button>
                    </div>
                    {drivers.map((driver) => (
                      <div key={driver.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`driver-${driver.id}`}
                          checked={selectedDrivers.includes(driver.id)}
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
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
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
