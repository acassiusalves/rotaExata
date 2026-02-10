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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle, DollarSign } from 'lucide-react';
import type { DriverPayment } from '@/lib/types';
import { updatePaymentValue } from '@/lib/payment-actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/earnings-calculator';

interface EditPaymentDialogProps {
  payment: DriverPayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const editSchema = z.object({
  newValue: z.coerce.number().min(0, 'Valor deve ser positivo'),
  reason: z.string().min(10, 'O motivo deve ter pelo menos 10 caracteres'),
});

type EditFormValues = z.infer<typeof editSchema>;

export function EditPaymentDialog({
  payment,
  open,
  onOpenChange,
}: EditPaymentDialogProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      newValue: payment.totalEarnings,
      reason: '',
    },
  });

  // Reset form quando o payment muda
  React.useEffect(() => {
    if (open) {
      form.reset({
        newValue: payment.totalEarnings,
        reason: '',
      });
    }
  }, [open, payment.totalEarnings, form]);

  const onSubmit = async (data: EditFormValues) => {
    if (!user) return;

    // Verifica se o valor mudou
    if (data.newValue === payment.totalEarnings) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'O novo valor deve ser diferente do valor atual.',
      });
      return;
    }

    setIsSaving(true);
    try {
      await updatePaymentValue(payment.id, data.newValue, user.uid, data.reason);

      toast({
        title: 'Valor Atualizado',
        description: `Pagamento ${payment.routeCode} foi atualizado com sucesso.`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar o pagamento.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const newValue = form.watch('newValue');
  const difference = newValue - payment.totalEarnings;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Valor do Pagamento</DialogTitle>
          <DialogDescription>
            Altere o valor do pagamento se necessário. Um registro será mantido da alteração.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção</AlertTitle>
          <AlertDescription>
            Esta ação só deve ser usada para ajustes manuais. O sistema registrará o motivo da alteração.
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
            <span className="text-muted-foreground">Valor Atual:</span>
            <span className="font-bold text-primary">{formatCurrency(payment.totalEarnings)}</span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="newValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Novo Valor (R$) *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="pl-10"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  {difference !== 0 && (
                    <FormDescription className={difference > 0 ? 'text-green-600' : 'text-red-600'}>
                      {difference > 0 ? '+' : ''}{formatCurrency(difference)} em relação ao valor atual
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo da Alteração *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explique o motivo da alteração do valor..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Seja específico sobre o motivo da alteração manual
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
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? 'Salvando...' : 'Salvar Alteração'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
