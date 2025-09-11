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

export default function ApiPage() {
  const [apiKey, setApiKey] = React.useState('');
  const { toast } = useToast();

  const handleSave = () => {
    // Em um aplicativo real, isso faria uma chamada de API segura para o backend
    // para salvar a chave. Por motivos de segurança e limitações do ambiente,
    // estamos apenas simulando o salvamento e mostrando uma notificação.
    console.log("Simulating API Key save:", apiKey);
    toast({
      title: "Chave Salva!",
      description: "Sua chave de API do Google Maps foi salva com sucesso.",
    });
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
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave}>Salvar Chave</Button>
        </CardFooter>
      </Card>
    </div>
  );
}