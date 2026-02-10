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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { DriverPayment, PaymentMethod } from '@/lib/types';
import { markAsPaid } from '@/lib/payment-actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/earnings-calculator';

interface MarkAsPaidDialogProps {
  payment: DriverPayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const paidSchema = z.object({
  paymentMethod: z.enum(['pix', 'bank_transfer', 'cash', 'other'], {
    required_error: 'Selecione um método de pagamento',
  }),
  paymentReference: z.string().optional(),
  paidDate: z.string().optional(),
  notes: z.string().optional(),
});

type PaidFormValues = z.infer<typeof paidSchema>;

const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: 'PIX',
  bank_transfer: 'Transferência Bancária',
  cash: 'Dinheiro',
  other: 'Outro',
};

export function MarkAsPaidDialog({
  payment,
  open,
  onOpenChange,
}: MarkAsPaidDialogProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<PaidFormValues>({
    resolver: zodResolver(paidSchema),
    defaultValues: {
      paymentMethod: 'pix',
      paymentReference: '',
      paidDate: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  const onSubmit = async (data: PaidFormValues) => {
    if (!user) return;

    setIsSaving(true);
    try {
      const paidDate = data.paidDate ? new Date(data.paidDate) : undefined;

      await markAsPaid(
        payment.id,
        user.uid,
        data.paymentMethod,
        data.paymentReference,
        paidDate
      );

      // Adiciona nota se fornecida
      if (data.notes) {
        // Nota será adicionada via payment-actions
      }

      toast({
        title: 'Pagamento Registrado',
        description: `Pagamento ${payment.routeCode} foi marcado como pago.`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível marcar como pago.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como Pago</DialogTitle>
          <DialogDescription>
            Registre as informações do pagamento para {payment.driverName}
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 p-4 bg-muted rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">Valor a Pagar</p>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(payment.totalEarnings)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Rota</p>
              <p className="font-medium">{payment.routeCode}</p>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de Pagamento *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o método" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(paymentMethodLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Como o pagamento foi realizado
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentReference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referência do Pagamento</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ID da transação, número do comprovante, etc."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Opcional: ID da transação ou número do comprovante
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paidDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do Pagamento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>
                    Data em que o pagamento foi efetivamente realizado
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Adicione observações sobre este pagamento (opcional)"
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
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
                {isSaving ? 'Salvando...' : 'Confirmar Pagamento'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
