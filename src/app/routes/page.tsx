import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Route } from "lucide-react";
import Link from "next/link";

export default function RoutesPage() {
  return (
    <div className="flex-1 space-y-4">
       <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Rotas</h2>
          <p className="text-muted-foreground">
            Visualize e gerencie as rotas de entrega existentes.
          </p>
        </div>
        <Button asChild>
          <Link href="/routes/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Criar Nova Rota
          </Link>
        </Button>
      </div>
      <Card className="min-h-[400px] flex items-center justify-center">
        <CardContent className="text-center">
            <Route className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Nenhuma Rota Ativa</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            As rotas criadas e em andamento aparecerão aqui.
          </p>
           <Button className="mt-4" asChild>
             <Link href="/routes/new">Criar Nova Rota</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
