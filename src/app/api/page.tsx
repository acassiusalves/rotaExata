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
import { Terminal } from 'lucide-react';

export default function ApiPage() {
  const [apiKey, setApiKey] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/save-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: apiKey }),
      });

      if (!response.ok) {
        throw new Error('Falha ao salvar a chave.');
      }

      toast({
        title: "Chave Salva!",
        description: "Sua chave de API do Google Maps foi salva com sucesso.",
      });

    } catch (error) {
       toast({
        variant: 'destructive',
        title: "Erro!",
        description: "Não foi possível salvar a chave de API.",
      });
      console.error(error);
    } finally {
      setIsLoading(false);
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
        <AlertTitle>Ação Manual Necessária</AlertTitle>
        <AlertDescription>
          Para que a aplicação funcione corretamente, você deve configurar sua chave de API do Google Maps como uma variável de ambiente. O formulário abaixo simula o salvamento, mas a chave precisa ser adicionada manualmente ao arquivo <code className="font-semibold text-foreground">.env</code> na raiz do projeto.
          <br /><br />
          1. Abra ou crie o arquivo <code className="font-semibold text-foreground">.env</code>.<br />
          2. Adicione a linha: <code className="font-semibold text-foreground">NEXT_PUBLIC_GMAPS_KEY="SUA_CHAVE_DE_API_AQUI"</code><br />
          3. Substitua "SUA_CHAVE_DE_API_AQUI" pela sua chave real.<br />
          4. Reinicie o servidor de desenvolvimento.
        </AlertDescription>
      </Alert>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>API do Google Maps</CardTitle>
          <CardDescription>
            Para habilitar o cálculo de rotas e os mapas, você precisa
            configurar sua chave de API do Google Maps. A chave será usada tanto no cliente (mapas) quanto no servidor (rotas).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="gmaps-key">Chave de API do Google Maps</Label>
            <Input
              id="gmaps-key"
              type="password"
              placeholder="Cole sua chave de API aqui"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Salvando...' : 'Salvar Chave'}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
