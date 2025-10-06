'use client';

import * as React from 'react';
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
import { db } from '@/lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const [deliveryDistanceValidation, setDeliveryDistanceValidation] = React.useState(false);
  const [maxDeliveryDistance, setMaxDeliveryDistance] = React.useState(0.5);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'general');
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setDeliveryDistanceValidation(data.deliveryDistanceValidation ?? false);
          setMaxDeliveryDistance(data.maxDeliveryDistance ?? 0.5);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSaveDeliveryValidation = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'general');
      await setDoc(settingsRef, {
        deliveryDistanceValidation,
        maxDeliveryDistance,
      }, { merge: true });

      toast({
        title: 'Configurações salvas!',
        description: 'As configurações de validação de entrega foram atualizadas.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar as configurações.',
      });
    }
  };

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

        <Card>
          <CardHeader>
            <CardTitle>Validação de Entrega</CardTitle>
            <CardDescription>
              Configure a validação por distância para confirmação de entregas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <Label htmlFor="delivery-validation" className="flex flex-col space-y-1">
                <span>Validar Localização na Entrega</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Exigir que o motorista esteja próximo ao endereço para confirmar a entrega.
                </span>
              </Label>
              <Switch
                id="delivery-validation"
                checked={deliveryDistanceValidation}
                onCheckedChange={setDeliveryDistanceValidation}
                disabled={isLoading}
              />
            </div>
            {deliveryDistanceValidation && (
              <div className="space-y-2">
                <Label htmlFor="max-delivery-distance">
                  Distância Máxima Permitida (Km)
                </Label>
                <Input
                  id="max-delivery-distance"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={maxDeliveryDistance}
                  onChange={(e) => setMaxDeliveryDistance(parseFloat(e.target.value) || 0.5)}
                  placeholder="Ex: 0.5"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  O motorista só poderá confirmar a entrega se estiver a até {maxDeliveryDistance} km do endereço cadastrado.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={handleSaveDeliveryValidation} disabled={isLoading}>
              Salvar Validação
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
