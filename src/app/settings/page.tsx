import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground">
          Ajuste as configurações gerais e regras do sistema.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Automação</CardTitle>
            <CardDescription>
              Regras para atribuição automática e reatribuição de pedidos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <Label htmlFor="auto-assign" className="flex flex-col space-y-1">
                <span>Atribuição Automática</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Atribuir novos pedidos automaticamente ao motorista mais próximo.
                </span>
              </Label>
              <Switch id="auto-assign" defaultChecked />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reassign-timeout">
                Timeout para Reatribuição (minutos)
              </Label>
              <Input
                id="reassign-timeout"
                type="number"
                defaultValue="5"
                placeholder="Ex: 5"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button>Salvar Automação</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Precificação</CardTitle>
            <CardDescription>
              Defina os valores base para o cálculo dos fretes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="base-price">Preço Base (R$)</Label>
              <Input
                id="base-price"
                type="number"
                defaultValue="5.00"
                placeholder="Ex: 5.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="per-km-price">Preço por Km (R$)</Label>
              <Input
                id="per-km-price"
                type="number"
                defaultValue="1.20"
                placeholder="Ex: 1.20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="extra-per-kg-price">Extra por Kg (R$)</Label>
              <Input
                id="extra-per-kg-price"
                type="number"
                defaultValue="0.50"
                placeholder="Ex: 0.50"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button>Salvar Preços</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Área de Serviço</CardTitle>
            <CardDescription>
              Defina o raio máximo de operação e a área de cobertura.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="max-distance">Raio Máximo de Atribuição (Km)</Label>
              <Input
                id="max-distance"
                type="number"
                defaultValue="10"
                placeholder="Ex: 10"
              />
            </div>
            <div className="aspect-video w-full rounded-lg bg-muted flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Mapa da área de serviço (placeholder)
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button>Salvar Área</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
