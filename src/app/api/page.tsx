import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Terminal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ApiPage() {
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
            configurar sua chave de API do Google Maps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>Ação Manual Necessária</AlertTitle>
            <AlertDescription>
              <p>
                Por segurança, sua chave de API deve ser adicionada
                diretamente no arquivo de configuração de ambiente.
              </p>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>
                  Abra o arquivo <code>.env</code> na raiz do seu projeto.
                </li>
                <li>
                  Cole sua chave de API do Google Maps nos valores das
                  variáveis <code>GMAPS_SERVER_KEY</code> e{" "}
                  <code>NEXT_PUBLIC_GMAPS_KEY</code>.
                </li>
                <li>
                  Salve o arquivo. A aplicação será recarregada
                  automaticamente.
                </li>
              </ol>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}