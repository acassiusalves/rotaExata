
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
import { BotMessageSquare, Loader2, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { FirebaseError } from 'firebase/app';

// Validação de senha forte
const validatePassword = (password: string): string[] => {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Uma letra maiúscula');
  if (!/[a-z]/.test(password)) errors.push('Uma letra minúscula');
  if (!/[0-9]/.test(password)) errors.push('Um número');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Um caractere especial (!@#$%...)');
  return errors;
};

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [passwordErrors, setPasswordErrors] = React.useState<string[]>([]);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // Validar senha em tempo real
  React.useEffect(() => {
    if (newPassword) {
      setPasswordErrors(validatePassword(newPassword));
    } else {
      setPasswordErrors([]);
    }
  }, [newPassword]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar senha forte
    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Senha fraca',
        description: `A senha precisa ter: ${errors.join(', ')}`,
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'As senhas não coincidem',
        description: 'Por favor, verifique e tente novamente.',
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

      // Aguardar um momento antes de redirecionar para o toast ser exibido
      setTimeout(() => {
        router.push('/my-routes');
      }, 1500);

    } catch (error) {
      const firebaseError = error instanceof FirebaseError ? error : null;
      let description = 'Ocorreu um erro desconhecido.';

      if (firebaseError?.code === 'auth/weak-password') {
        description = 'A senha é muito fraca. Escolha uma senha mais forte.';
      } else if (firebaseError?.code === 'auth/requires-recent-login') {
        description = 'Por segurança, faça login novamente antes de alterar a senha.';
      } else if (firebaseError?.message) {
        description = firebaseError.message;
      }

      toast({
        variant: 'destructive',
        title: 'Falha ao Alterar Senha',
        description,
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
                {newPassword && (
                  <div className="text-xs space-y-1 mt-1">
                    <p className="text-muted-foreground font-medium">Requisitos:</p>
                    <div className="grid grid-cols-2 gap-1">
                      <span className={`flex items-center gap-1 ${newPassword.length >= 8 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {newPassword.length >= 8 ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        8+ caracteres
                      </span>
                      <span className={`flex items-center gap-1 ${/[A-Z]/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {/[A-Z]/.test(newPassword) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Maiúscula
                      </span>
                      <span className={`flex items-center gap-1 ${/[a-z]/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {/[a-z]/.test(newPassword) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Minúscula
                      </span>
                      <span className={`flex items-center gap-1 ${/[0-9]/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {/[0-9]/.test(newPassword) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Número
                      </span>
                      <span className={`flex items-center gap-1 ${/[^A-Za-z0-9]/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {/[^A-Za-z0-9]/.test(newPassword) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Especial
                      </span>
                    </div>
                  </div>
                )}
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
