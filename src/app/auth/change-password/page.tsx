
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BotMessageSquare, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'As senhas não coincidem',
        description: 'Por favor, verifique e tente novamente.',
      });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Senha muito curta',
        description: 'A nova senha deve ter pelo menos 6 caracteres.',
      });
      return;
    }
    if (!user) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Usuário não autenticado.' });
        return;
    }

    setIsLoading(true);
    try {
      // Step 1: Update password in Firebase Auth
      await updatePassword(user, newPassword);

      // Step 2: Update the 'mustChangePassword' flag in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        mustChangePassword: false,
        updatedAt: new Date(),
      });

      toast({
        title: 'Senha Alterada com Sucesso!',
        description: 'Você será redirecionado para suas rotas.',
      });

      // Force a reload of auth state or wait a moment before redirecting
      setTimeout(() => {
        // This will trigger the DriverLayout to re-evaluate the condition
         window.location.href = '/my-routes';
      }, 1500);

    } catch (error: any) {
      console.error('Password Change Error:', error);
      toast({
        variant: 'destructive',
        title: 'Falha ao Alterar Senha',
        description: error.message || 'Ocorreu um erro desconhecido.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
     return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <BotMessageSquare className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Alterar Senha</CardTitle>
          <CardDescription>
            Por segurança, você precisa criar uma nova senha para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Nova Senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
