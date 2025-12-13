"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { FirebaseError } from 'firebase/app';

// Rate limiting no cliente - máximo de tentativas antes de bloquear
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 60000; // 1 minuto

export default function LoginPage() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [attempts, setAttempts] = React.useState(0);
  const [lockoutUntil, setLockoutUntil] = React.useState<number | null>(null);
  const { signIn, userRole, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // Verifica se está em lockout
  const isLockedOut = lockoutUntil && Date.now() < lockoutUntil;

  // Timer para atualizar UI durante lockout
  React.useEffect(() => {
    if (!lockoutUntil) return;

    const interval = setInterval(() => {
      if (Date.now() >= lockoutUntil) {
        setLockoutUntil(null);
        setAttempts(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verifica lockout
    if (isLockedOut) {
      const remainingSeconds = Math.ceil((lockoutUntil! - Date.now()) / 1000);
      toast({
        variant: 'destructive',
        title: 'Aguarde',
        description: `Muitas tentativas. Tente novamente em ${remainingSeconds} segundos.`,
      });
      return;
    }

    // Validação básica do email no cliente
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        variant: 'destructive',
        title: 'Email Inválido',
        description: 'Por favor, insira um email válido.',
      });
      return;
    }

    // Validação básica da senha
    if (password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Senha Inválida',
        description: 'A senha deve ter pelo menos 6 caracteres.',
      });
      return;
    }

    setIsLoading(true);

    try {
      await signIn(email, password);
      // Reset attempts on success
      setAttempts(0);
    } catch (error) {
      // Incrementa tentativas em caso de erro de credenciais
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      // Ativa lockout se exceder tentativas
      if (newAttempts >= MAX_ATTEMPTS) {
        setLockoutUntil(Date.now() + LOCKOUT_TIME);
        toast({
          variant: 'destructive',
          title: 'Muitas Tentativas',
          description: 'Aguarde 1 minuto antes de tentar novamente.',
        });
        setIsLoading(false);
        return;
      }

      let title = 'Erro no Login';
      let description = 'Ocorreu um erro desconhecido. Tente novamente.';

      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            title = 'Credenciais Incorretas';
            description = 'Email ou senha incorretos. Por favor, revise suas informações e tente novamente.';
            break;
          case 'auth/invalid-email':
            title = 'Email Inválido';
            description = 'O formato do email é inválido. Por favor, verifique e tente novamente.';
            break;
          case 'auth/too-many-requests':
            title = 'Muitas Tentativas';
            description = 'Muitas tentativas de login. Por favor, aguarde alguns minutos e tente novamente.';
            // Firebase também bloqueou, sincroniza com nosso lockout
            setLockoutUntil(Date.now() + LOCKOUT_TIME * 3);
            break;
          case 'auth/network-request-failed':
            title = 'Erro de Rede';
            description = 'Falha na conexão. Verifique sua internet.';
            // Não incrementa tentativas para erros de rede
            setAttempts(prev => prev - 1);
            break;
        }
      }

      toast({
        variant: 'destructive',
        title,
        description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Redirect when userRole is determined after login
  React.useEffect(() => {
    if (!loading && userRole) {
      if (['admin', 'socio', 'gestor'].includes(userRole)) {
        router.push('/dashboard');
      } else if (userRole === 'driver') {
        router.push('/my-routes');
      }
    }
  }, [userRole, loading, router]);

  const remainingAttempts = MAX_ATTEMPTS - attempts;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
            <div className="flex justify-center items-center mb-4">
                 <Logo size={48} showText={false} />
            </div>
          <CardTitle className="text-2xl">Rota Exata</CardTitle>
          <CardDescription>
            Acesse o painel para gerenciar suas entregas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} autoComplete="off">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  disabled={isLoading || isLockedOut}
                  autoComplete="username"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading || isLockedOut}
                    autoComplete="current-password"
                />
              </div>
              {attempts > 0 && attempts < MAX_ATTEMPTS && (
                <p className="text-xs text-muted-foreground text-center">
                  {remainingAttempts} tentativa{remainingAttempts !== 1 ? 's' : ''} restante{remainingAttempts !== 1 ? 's' : ''}
                </p>
              )}
              {isLockedOut && (
                <p className="text-xs text-destructive text-center">
                  Aguarde {Math.ceil((lockoutUntil! - Date.now()) / 1000)}s para tentar novamente
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isLoading || isLockedOut}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLockedOut ? 'Aguarde...' : 'Login'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
