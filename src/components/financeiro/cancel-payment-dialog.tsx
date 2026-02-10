'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { DriverPayment } from '@/lib/types';
import { cancelPayment } from '@/lib/payment-actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/earnings-calculator';

interface CancelPaymentDialogProps {
  payment: DriverPayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const cancelSchema = z.object({
  reason: z.string().min(10, 'O motivo deve ter pelo menos 10 caracteres'),
});

type CancelFormValues = z.infer<typeof cancelSchema>;

export function CancelPaymentDialog({
  payment,
  open,
  onOpenChange,
}: CancelPaymentDialogProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<CancelFormValues>({
    resolver: zodResolver(cancelSchema),
    defaultValues: {
      reason: '',
    },
  });

  const onSubmit = async (data: CancelFormValues) => {
    if (!user) return;

    setIsSaving(true);
    try {
      await cancelPayment(payment.id, user.uid, data.reason);

      toast({
        title: 'Pagamento Cancelado',
        description: `Pagamento ${payment.routeCode} foi cancelado com sucesso.`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível cancelar o pagamento.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar Pagamento</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O pagamento será marcado como cancelado.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção</AlertTitle>
          <AlertDescription>
            Você está prestes a cancelar o pagamento de {formatCurrency(payment.totalEarnings)} para {payment.driverName}.
          </AlertDescription>
        </Alert>

        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Rota:</span>
            <span className="font-medium">{payment.routeCode}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Motorista:</span>
            <span className="font-medium">{payment.driverName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Valor:</span>
            <span className="font-bold text-primary">{formatCurrency(payment.totalEarnings)}</span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo do Cancelamento *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explique o motivo do cancelamento deste pagamento..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Seja específico sobre o motivo do cancelamento
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Voltar
              </Button>
              <Button type="submit" variant="destructive" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
