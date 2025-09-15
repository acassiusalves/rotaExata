import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { History } from "lucide-react";

export default function HistoryPage() {
  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Histórico de Rotas</h2>
          <p className="text-muted-foreground">
            Consulte as rotas que já foram concluídas ou arquivadas.
          </p>
        </div>
      </div>
      <Card className="min-h-[400px] flex items-center justify-center">
        <CardContent className="text-center">
            <History className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Nenhuma Rota no Histórico</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            As rotas finalizadas aparecerão aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
