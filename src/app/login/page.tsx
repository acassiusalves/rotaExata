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

export default function LoginPage() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const { signIn, userRole, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signIn(email, password);
      // The auth state listener in AuthProvider will handle fetching the role.
    } catch (error) {
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
            break;
          case 'auth/network-request-failed':
            title = 'Erro de Rede';
            description = 'Falha na conexão. Verifique sua internet.';
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
          <form onSubmit={handleLogin}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@rotaexata.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Senha</Label>
                </div>
                <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Login
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
