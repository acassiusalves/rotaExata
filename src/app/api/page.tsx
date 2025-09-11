import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>API do Google Maps</CardTitle>
          <CardDescription>
            Insira suas chaves de API para habilitar o cálculo de rotas,
            autocompletar de endereços e visualização de mapas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="gmaps-server-key">
              Chave de API para Servidor (Server Key)
            </Label>
            <Input
              id="gmaps-server-key"
              type="password"
              placeholder="Cole sua chave aqui"
            />
            <p className="text-sm text-muted-foreground">
              Usada para serviços de backend, como o cálculo de rotas. Mantenha
              esta chave em segredo.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gmaps-client-key">
              Chave de API para Cliente (Browser Key)
            </Label>
            <Input
              id="gmaps-client-key"
              placeholder="Cole sua chave aqui"
            />
            <p className="text-sm text-muted-foreground">
              Usada para exibir mapas no navegador e para o recurso de
              autocompletar.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button>Salvar Configurações</Button>
        </CardFooter>
      </Card>
    </div>
  );
}