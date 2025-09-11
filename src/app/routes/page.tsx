import { Card, CardContent } from "@/components/ui/card";
import { Route } from "lucide-react";

export default function RoutesPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Rotas</h2>
      </div>
      <Card className="min-h-[400px] flex items-center justify-center">
        <CardContent className="text-center">
            <Route className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Página de Rotas</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Otimize e gerencie as rotas de entrega.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
