import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { drivers } from '@/lib/data';
import { DriverTable } from '@/components/drivers/driver-table';

export default function DriversPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Motoristas</h2>
          <p className="text-muted-foreground">
            Gerencie sua equipe de motoristas.
          </p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adicionar Motorista
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DriverTable drivers={drivers} />
        </CardContent>
      </Card>
    </div>
  );
}
