import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Route, PlusCircle } from "lucide-react";
import Link from "next/link";

export default function RoutesPage() {
  return (
    <div className="flex-1 space-y-4">
       <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Rotas</h2>
          <p className="text-muted-foreground">
            Otimize e gerencie as rotas de entrega.
          </p>
        </div>
        <Button asChild>
          <Link href="/routes/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Nova Rota
          </Link>
        </Button>
      </div>
      <Card className="min-h-[400px] flex items-center justify-center">
        <CardContent className="text-center">
            <Route className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Gerenciamento de Rotas</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie novas rotas ou visualize rotas existentes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
