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
import { useStaff } from '@/components/staff/staff-session';
import { EarningsRequestError } from '@/lib/earnings/session-request';

type MapsStatus={configured:boolean;browserConfigured:boolean;revision:string|null};

export default function ApiPage() {
  const [apiKey,setApiKey]=React.useState('');
  const [maps,setMaps]=React.useState<MapsStatus>();
  const [isLoading,setIsLoading]=React.useState(false);
  const [isSyncing,setIsSyncing]=React.useState(false);
  const [isLoadingKey,setIsLoadingKey]=React.useState(true);
  const {toast}=useToast();
  const {request}=useStaff();
  const endpoint='/api/staff/integrations/maps';
  const isSaved=maps?.configured===true && !apiKey;

  React.useEffect(()=>{
    const controller=new AbortController();
    request<MapsStatus>(endpoint,{signal:controller.signal}).then(setMaps)
      .catch(()=>{}).finally(()=>{if (!controller.signal.aborted) setIsLoadingKey(false);});
    return ()=>controller.abort();
  },[request]);

  async function handleSave() {
    if (!apiKey.trim() || !maps) return;
    setIsLoading(true);
    try {
      const update=await request<MapsStatus>(endpoint,{
        method:'PATCH',body:JSON.stringify({key:apiKey,expectedRevision:maps.revision}),
      });
      setMaps(update);
      setApiKey('');
      toast({title:'Chave atualizada',description:'A configuração do servidor foi salva.'});
    } catch(error) {
      const conflict=error instanceof EarningsRequestError && error.status===409;
      toast({variant:'destructive',title:'Não foi possível salvar a chave',
        description:conflict?'A configuração mudou. Recarregue a página.':'Confira se a chave está habilitada para a API de rotas.'});
    } finally {setIsLoading(false);}
  }

  async function handleSyncUser() {
    setIsSyncing(true);
    try {
      const current=await request<{role:string}>('/api/staff/session');
      toast({title:'Cadastro conferido',description:'Papel vigente no RotaExata: '+current.role+'.'});
    } catch {
      toast({variant:'destructive',title:'Não foi possível conferir seu cadastro'});
    } finally {setIsSyncing(false);}
  }

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
          {maps?.browserConfigured ? 'Chave do navegador configurada.':'A chave do navegador é configurada na publicação do RotaExata.'}
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
          {!isLoadingKey && !maps && <p role="alert" className="mb-3 text-sm">Não foi possível verificar a configuração.</p>}
          <div className="grid gap-2">
            <Label htmlFor="gmaps-key">Chave de API do Google Maps</Label>
            <div className="relative">
              <Input
                id="gmaps-key"
                type="password"
                placeholder={isLoadingKey ? "Carregando..." : "Cole sua chave de API aqui"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                }}
                disabled={isLoading || isLoadingKey}
                className={isSaved ? 'border-green-500 pr-10' : ''}
              />
              {isSaved && !isLoadingKey && (
                <CheckCircle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-green-500" />
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={isLoading || !apiKey || !maps}>
            {isLoading ? 'Salvando e Testando...' : 'Salvar e Testar Chave'}
          </Button>
        </CardFooter>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Cadastro da minha conta</CardTitle>
          <CardDescription>
            Consulte a função vigente da sua conta e confira se o cadastro está em dia.
          </CardDescription>
        </CardHeader>
        <CardFooter>
           <Button onClick={handleSyncUser} disabled={isSyncing} variant="secondary">
            <UserCog className="mr-2 h-4 w-4" />
            {isSyncing ? 'Verificando…' : 'Conferir meu cadastro'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
