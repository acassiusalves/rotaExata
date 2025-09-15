'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Truck, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { functions } from '@/lib/firebase/client';
import { httpsCallable } from 'firebase/functions';
import { useToast } from "@/hooks/use-toast";
import React from "react";

export default function MyRoutesPage() {
  const [isSyncing, setIsSyncing] = React.useState(false);
  const { toast } = useToast();

  const handleSyncUsers = async () => {
    setIsSyncing(true);
    try {
      const syncAuthUsers = httpsCallable(functions, 'syncAuthUsers');
      const result: any = await syncAuthUsers();
      
      toast({
        title: "Sincronização Concluída!",
        description: `${result.data.synced} usuários foram sincronizados. Por favor, deslogue e logue novamente para acessar o painel de admin.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: "Erro na Sincronização",
        description: error.message || "Não foi possível sincronizar os usuários.",
      });
       console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold mb-4">Minhas Rotas</h1>
      <Card>
        <CardHeader>
          <CardTitle>Rota de Hoje</CardTitle>
          <CardDescription>Nenhuma rota atribuída para hoje.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center p-12">
            <Truck className="h-16 w-16 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Você não tem rotas ativas no momento.</p>
            <p className="text-sm text-muted-foreground">Quando uma rota for atribuída, ela aparecerá aqui.</p>
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
          <CardTitle>Acesso de Administrador</CardTitle>
          <CardDescription>
            Se você for o administrador, clique no botão abaixo para corrigir suas permissões. Após a sincronização, saia e entre novamente no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <Button onClick={handleSyncUsers} disabled={isSyncing} variant="secondary" className="w-full">
            <UserCog className="mr-2 h-4 w-4" />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Permissões de Usuário'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
