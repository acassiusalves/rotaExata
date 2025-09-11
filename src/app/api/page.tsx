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
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>API do Google Maps</CardTitle>
          <CardDescription>
            Insira sua chave de API para habilitar o cálculo de rotas,
            autocompletar de endereços e visualização de mapas no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="gmaps-key">
              Chave de API do Google Maps
            </Label>
            <Input
              id="gmaps-key"
              type="password"
              placeholder="Cole sua chave de API unificada aqui"
            />
            <p className="text-sm text-muted-foreground">
              Esta chave será usada para os serviços de mapas e rotas.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button>Salvar Chave</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
