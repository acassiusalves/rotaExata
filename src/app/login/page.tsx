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
import { BotMessageSquare, Loader2 } from "lucide-react"
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const { signIn, userRole } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userCredential = await signIn(email, password);
      // The auth state listener in AuthProvider will handle fetching the role.
      // We just need to wait for it to propagate. A small delay or a more robust
      // state management solution could handle this. For now, we rely on the
      // redirect logic within the layouts.
    } catch (error: any) {
      console.error("Login Error:", error, "Code:", error.code);
      let description = 'Ocorreu um erro desconhecido. Tente novamente.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        description = 'Email ou senha inválidos. Verifique suas credenciais.';
      } else if (error.code === 'auth/invalid-email') {
        description = 'O formato do email é inválido.';
      }
      toast({
        variant: 'destructive',
        title: 'Falha no Login',
        description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // This effect will run when the userRole is determined after login
  React.useEffect(() => {
    if (userRole) {
      if (userRole === 'admin') {
        router.push('/');
      } else {
        router.push('/driver/my-routes'); // Example driver page
      }
    }
  }, [userRole, router]);


  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
            <div className="flex justify-center items-center mb-4">
                 <BotMessageSquare className="h-8 w-8 text-primary" />
            </div>
          <CardTitle className="text-2xl">RotaExata</CardTitle>
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
