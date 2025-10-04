"use client";

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, CheckCircle, UserCog } from 'lucide-react';
import { functions } from '@/lib/firebase/client';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/hooks/use-auth';

export default function ApiPage() {
  const [apiKey, setApiKey] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const { toast } = useToast();
  const { user } = useAuth();


  const handleSave = async () => {
    if (!apiKey) {
      toast({
        variant: 'destructive',
        title: "Chave inválida",
        description: "Por favor, insira uma chave de API.",
      });
      return;
    }
    setIsLoading(true);
    setIsSaved(false);
    try {
      const response = await fetch('/api/save-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: apiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Falha ao salvar a chave.');
      }

      setIsSaved(true);
      toast({
        title: "Chave Salva!",
        description: "Sua chave de API do Google Maps foi salva com sucesso no servidor.",
      });

    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: "Erro ao salvar!",
        description: error.message || "Não foi possível salvar a chave de API.",
      });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncUser = async () => {
    if (!user || !user.email) {
      toast({ variant: 'destructive', title: "Erro", description: "Usuário não autenticado." });
      return;
    }
    setIsSyncing(true);
    try {
      const syncAuthUsers = httpsCallable(functions, 'syncAuthUsers');
      const result: any = await syncAuthUsers({ email: user.email });
      
      toast({
        title: "Sincronização Concluída!",
        description: `Usuário ${user.email} sincronizado com o papel: ${result.data.role}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: "Erro na Sincronização",
        description: error.message || "Não foi possível sincronizar o usuário.",
      });
       console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Integrações e API
        </h2>
        <p className="text-muted-foreground">
          Conecte seu sistema com serviços externos e gerencie suas chaves.
        </p>
      </div>

       <Alert>
        <Terminal className="h-4 w-4" />
        <AlertTitle>Chave de API do Cliente (Navegador)</AlertTitle>
        <AlertDescription>
          Para que os mapas interativos funcionem no navegador, a chave de API também precisa estar disponível para o cliente. Por favor, adicione sua chave ao arquivo <code className="font-semibold text-foreground">.env</code> na raiz do projeto.
          <br /><br />
          1. Abra ou crie o arquivo <code className="font-semibold text-foreground">.env</code>.<br />
          2. Adicione a linha: <code className="font-semibold text-foreground">NEXT_PUBLIC_GMAPS_KEY=&quot;SUA_CHAVE_DE_API_AQUI&quot;</code><br />
          3. Substitua &quot;SUA_CHAVE_DE_API_AQUI&quot; pela sua chave real.<br />
          4. Reinicie o servidor de desenvolvimento.
        </AlertDescription>
      </Alert>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Chave de API do Google Maps (Servidor)</CardTitle>
          <CardDescription>
            Insira sua chave de API do Google Maps aqui. Ela será armazenada de forma segura e usada para operações no servidor, como o cálculo de rotas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="gmaps-key">Chave de API do Google Maps</Label>
            <div className="relative">
              <Input
                id="gmaps-key"
                type="password"
                placeholder="Cole sua chave de API aqui"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setIsSaved(false);
                }}
                disabled={isLoading}
                className={isSaved ? 'border-green-500 pr-10' : ''}
              />
              {isSaved && (
                <CheckCircle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-green-500" />
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={isLoading || !apiKey}>
            {isLoading ? 'Salvando e Testando...' : 'Salvar e Testar Chave'}
          </Button>
        </CardFooter>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Sincronização de Usuários com Firestore</CardTitle>
          <CardDescription>
            Use este botão para forçar a criação ou atualização do seu documento de usuário no Firestore com a permissão correta. Útil se sua permissão de &apos;admin&apos; não estiver sendo reconhecida.
          </CardDescription>
        </CardHeader>
        <CardFooter>
           <Button onClick={handleSyncUser} disabled={isSyncing} variant="secondary">
            <UserCog className="mr-2 h-4 w-4" />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Meu Usuário'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
