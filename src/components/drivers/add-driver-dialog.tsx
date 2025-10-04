'use client';

import * as React from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase/client';
import { Loader2 } from 'lucide-react';

const driverSchema = z.object({
  firstName: z.string().min(2, 'O nome é obrigatório.'),
  lastName: z.string().min(2, 'O sobrenome é obrigatório.'),
  email: z.string().email('O email fornecido é inválido.'),
  phone: z.string().min(10, 'O celular é obrigatório.'),
});

type DriverFormValues = z.infer<typeof driverSchema>;

interface AddDriverDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddDriverDialog({ isOpen, onClose }: AddDriverDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
  });

  const onSubmit = async (data: DriverFormValues) => {
    setIsLoading(true);
    try {
      const inviteUser = httpsCallable(functions, 'inviteUser');
      const result: any = await inviteUser({
        email: data.email,
        role: 'driver',
        displayName: `${data.firstName} ${data.lastName}`,
        phone: data.phone,
      });

      if (result.data.ok) {
        toast({
          title: 'Convite Enviado!',
          description: `Um email foi enviado para ${data.email} para que o motorista defina a senha e acesse o app.`,
        });
        form.reset();
        onClose();
      } else {
        throw new Error(result.data.error || 'Falha ao convidar motorista.');
      }
    } catch (error: any) {
      console.error('Error inviting driver:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Convidar',
        description: error.message || 'Não foi possível completar o cadastro.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Motorista</DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo. O motorista receberá um email para criar
            sua senha e acessar o aplicativo.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="João" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sobrenome</FormLabel>
                    <FormControl>
                      <Input placeholder="Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="joao.silva@email.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Celular</FormLabel>
                  <FormControl>
                    <Input placeholder="(62) 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Convidar Motorista
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
