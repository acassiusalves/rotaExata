'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Truck } from "lucide-react";

export default function MyRoutesPage() {
  return (
    <div>
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
    </div>
  );
}
