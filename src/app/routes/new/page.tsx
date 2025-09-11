import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { drivers } from '@/lib/data';

export default function NewRoutePage() {
  return (
    <div className="flex-1 space-y-4">
      <h2 className="text-3xl font-bold tracking-tight">Criar Nova Rota</h2>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Rota</CardTitle>
          <CardDescription>
            Preencha as informações abaixo para criar uma nova rota otimizada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="route-name">Nome da Rota</Label>
            <Input id="route-name" placeholder="Ex: Rota Matutina - Setor Bueno" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="driver">Motorista</Label>
            <Select>
              <SelectTrigger id="driver">
                <SelectValue placeholder="Selecione um motorista" />
              </SelectTrigger>
              <SelectContent>
                {drivers
                  .filter((d) => d.status !== 'offline')
                  .map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name} - ({driver.vehicle.plate})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="orders">Pedidos da Rota</Label>
            <p className="text-sm text-muted-foreground">
              Adicione os códigos dos pedidos que farão parte desta rota.
            </p>
            <Textarea
              id="orders"
              placeholder="Cole aqui os códigos dos pedidos, um por linha..."
              className="min-h-[120px]"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button>Criar e Otimizar Rota</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
