'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Driver } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { functions } from '@/lib/firebase/client';

interface EditDriverDialogProps {
  isOpen: boolean;
  onClose: () => void;
  driver: Driver | null;
}

interface UpdateDriverProfileResponse {
  ok: boolean;
  updatedRoutes: number;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function EditDriverDialog({
  isOpen,
  onClose,
  driver,
}: EditDriverDialogProps) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [vehicleType, setVehicleType] = React.useState('');
  const [vehiclePlate, setVehiclePlate] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen || !driver) return;

    setName(driver.name || '');
    setPhone(driver.phone && driver.phone !== 'N/A' ? formatPhone(driver.phone) : '');
    setVehicleType(driver.vehicle.type && driver.vehicle.type !== 'N/A' ? driver.vehicle.type : '');
    setVehiclePlate(driver.vehicle.plate && driver.vehicle.plate !== 'N/A' ? driver.vehicle.plate : '');
  }, [driver, isOpen]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!driver) return;

    if (!name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe o nome do motorista antes de salvar.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const updateDriverProfile = httpsCallable<
        {
          uid: string;
          displayName: string;
          phone: string;
          vehicle: { type: string; plate: string };
        },
        UpdateDriverProfileResponse
      >(functions, 'updateDriverProfile');

      const result = await updateDriverProfile({
        uid: driver.id,
        displayName: name.trim(),
        phone: normalizePhone(phone),
        vehicle: {
          type: vehicleType.trim(),
          plate: vehiclePlate.trim().toUpperCase(),
        },
      });

      toast({
        title: 'Motorista atualizado!',
        description:
          result.data.updatedRoutes > 0
            ? `Cadastro salvo e ${result.data.updatedRoutes} rota(s) ativa(s) receberam os dados novos.`
            : 'Cadastro salvo com sucesso.',
      });

      onClose();
    } catch (error: any) {
      console.error('Error updating driver profile:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar',
        description: error.message || 'Não foi possível atualizar o motorista.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Editar Motorista</DialogTitle>
            <DialogDescription>
              Atualize os dados cadastrais e o veículo usado nas rotas ativas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="driver-name">Nome completo</Label>
            <Input
              id="driver-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
              placeholder="Nome do motorista"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="driver-email">Email</Label>
            <Input
              id="driver-email"
              value={driver?.email || ''}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="driver-phone">Celular</Label>
            <Input
              id="driver-phone"
              value={phone}
              onChange={(event) => setPhone(formatPhone(event.target.value))}
              disabled={isSubmitting}
              placeholder="(62) 99999-9999"
              maxLength={16}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="driver-vehicle-type">Tipo de veículo</Label>
              <Input
                id="driver-vehicle-type"
                value={vehicleType}
                onChange={(event) => setVehicleType(event.target.value)}
                disabled={isSubmitting}
                placeholder="Moto, carro, van..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="driver-vehicle-plate">Placa</Label>
              <Input
                id="driver-vehicle-plate"
                value={vehiclePlate}
                onChange={(event) => setVehiclePlate(event.target.value.toUpperCase())}
                disabled={isSubmitting}
                placeholder="ABC-1234"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
