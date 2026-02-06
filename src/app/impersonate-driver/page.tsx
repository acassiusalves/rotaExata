'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { Loader2 } from 'lucide-react';

export default function ImpersonateDriverPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleImpersonation = async () => {
      try {
        // Pegar token e driverId dos query params
        const token = searchParams.get('token');
        const driverId = searchParams.get('driverId');
        const driverName = searchParams.get('driverName');

        if (!token) {
          setError('Token de autenticação não fornecido');
          setIsLoading(false);
          return;
        }

        if (!driverId) {
          setError('ID do motorista não fornecido');
          setIsLoading(false);
          return;
        }

        // Fazer login com o custom token
        await signInWithCustomToken(auth, token);

        // Definir flag de impersonação no localStorage
        localStorage.setItem('isImpersonating', 'true');
        if (driverName) {
          localStorage.setItem('impersonatedDriverName', driverName);
        }

        // Redirecionar para a interface do motorista
        router.push('/my-routes');
      } catch (err: any) {
        console.error('Erro ao fazer login como motorista:', err);

        let errorMessage = 'Erro ao fazer login como motorista';

        if (err.code === 'auth/invalid-custom-token') {
          errorMessage = 'Token inválido ou expirado. Por favor, tente novamente.';
        } else if (err.code === 'auth/network-request-failed') {
          errorMessage = 'Erro de rede. Verifique sua conexão e tente novamente.';
        } else if (err.message) {
          errorMessage = err.message;
        }

        setError(errorMessage);
        setIsLoading(false);
      }
    };

    handleImpersonation();
  }, [searchParams, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <h1 className="text-2xl font-semibold">Entrando como Motorista...</h1>
          <p className="text-muted-foreground">Aguarde enquanto fazemos login</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-destructive/10 p-3">
              <svg
                className="h-6 w-6 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
          </div>
          <h1 className="mb-2 text-xl font-semibold">Erro ao Entrar</h1>
          <p className="mb-6 text-muted-foreground">{error}</p>
          <button
            onClick={() => window.close()}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    );
  }

  return null;
}
