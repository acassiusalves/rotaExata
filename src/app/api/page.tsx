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
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="gmaps-key">Chave de API do Google Maps</Label>
            <Input
              id="gmaps-key"
              type="password"
              placeholder="Cole sua chave de API aqui"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button>Salvar Chave</Button>
        </CardFooter>
      </Card>
    </div>
  );
}