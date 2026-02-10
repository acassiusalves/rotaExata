'use client';

import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db } from '@/lib/firebase/client';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, DollarSign, Calculator } from 'lucide-react';
import type { EarningsRules } from '@/lib/types';
import { calculatePreviewEarnings, formatCurrency } from '@/lib/earnings-calculator';

const rulesSchema = z.object({
  basePayPerRoute: z.coerce.number().min(0, 'Deve ser maior ou igual a zero'),
  pricePerKm: z.coerce.number().min(0, 'Deve ser maior ou igual a zero'),
  bonusPerDelivery: z.coerce.number().min(0, 'Deve ser maior ou igual a zero'),
  bonusPerFailedAttempt: z.coerce.number().min(0, 'Deve ser maior ou igual a zero'),
  bonuses: z.object({
    earlyMorning: z.object({
      enabled: z.boolean(),
      multiplier: z.coerce.number().min(1, 'Multiplicador deve ser >= 1').max(3, 'Multiplicador deve ser <= 3'),
    }),
    lateNight: z.object({
      enabled: z.boolean(),
      multiplier: z.coerce.number().min(1).max(3),
    }),
    weekend: z.object({
      enabled: z.boolean(),
      multiplier: z.coerce.number().min(1).max(3),
    }),
  }),
  stopTiers: z.array(z.object({
    minStops: z.coerce.number().min(1),
    maxStops: z.coerce.number().min(1),
    bonus: z.coerce.number().min(0),
  })).refine((tiers) => {
    // Validar que não há sobreposição
    for (let i = 0; i < tiers.length - 1; i++) {
      if (tiers[i].maxStops >= tiers[i + 1].minStops) {
        return false;
      }
    }
    return true;
  }, 'As faixas não podem se sobrepor'),
  lunnaOrderBonus: z.coerce.number().min(0),
  notes: z.string().optional(),
});

type RulesFormValues = z.infer<typeof rulesSchema>;

export default function RegrasPage() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [currentVersion, setCurrentVersion] = React.useState(1);
  const [previewEarnings, setPreviewEarnings] = React.useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<RulesFormValues>({
    resolver: zodResolver(rulesSchema),
    defaultValues: {
      basePayPerRoute: 20,
      pricePerKm: 1.2,
      bonusPerDelivery: 2,
      bonusPerFailedAttempt: 1,
      bonuses: {
        earlyMorning: { enabled: false, multiplier: 1.2 },
        lateNight: { enabled: false, multiplier: 1.3 },
        weekend: { enabled: false, multiplier: 1.15 },
      },
      stopTiers: [
        { minStops: 10, maxStops: 20, bonus: 5 },
        { minStops: 21, maxStops: 30, bonus: 10 },
        { minStops: 31, maxStops: 999, bonus: 20 },
      ],
      lunnaOrderBonus: 1,
      notes: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'stopTiers',
  });

  // Carrega regras existentes
  React.useEffect(() => {
    const loadRules = async () => {
      try {
        const rulesRef = doc(db, 'earningsRules', 'active');
        const rulesSnap = await getDoc(rulesRef);

        if (rulesSnap.exists()) {
          const data = rulesSnap.data() as EarningsRules;
          setCurrentVersion(data.version);
          form.reset({
            basePayPerRoute: data.basePayPerRoute,
            pricePerKm: data.pricePerKm,
            bonusPerDelivery: data.bonusPerDelivery,
            bonusPerFailedAttempt: data.bonusPerFailedAttempt,
            bonuses: data.bonuses,
            stopTiers: data.stopTiers,
            lunnaOrderBonus: data.lunnaOrderBonus,
            notes: data.notes || '',
          });
          updatePreview(data);
        }
      } catch (error) {
        console.error('Error loading rules:', error);
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar as regras.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadRules();
  }, []);

  // Atualiza preview quando os campos mudam
  const watchedValues = form.watch();
  React.useEffect(() => {
    const subscription = form.watch(() => {
      const values = form.getValues();
      try {
        const rules: EarningsRules = {
          id: 'active',
          version: currentVersion,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: user?.uid || '',
          ...values,
        };
        updatePreview(rules);
      } catch (error) {
        // Ignore validation errors during typing
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch, currentVersion, user]);

  const updatePreview = (rules: EarningsRules) => {
    try {
      const preview = calculatePreviewEarnings(rules);
      setPreviewEarnings(preview);
    } catch (error) {
      setPreviewEarnings(null);
    }
  };

  const onSubmit = async (data: RulesFormValues) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Você precisa estar autenticado.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const rulesRef = doc(db, 'earningsRules', 'active');
      const newRules: EarningsRules = {
        id: 'active',
        version: currentVersion + 1,
        ...data,
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        updatedBy: user.uid,
      };

      await setDoc(rulesRef, newRules);
      setCurrentVersion(currentVersion + 1);

      toast({
        title: 'Regras salvas!',
        description: 'As regras de ganhos foram atualizadas com sucesso.',
      });
    } catch (error) {
      console.error('Error saving rules:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar as regras.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Regras de Ganhos</h2>
        <p className="text-muted-foreground">
          Configure os parâmetros para cálculo automático de ganhos dos motoristas
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Versão atual: {currentVersion}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Configuração Base */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Configuração Base
              </CardTitle>
              <CardDescription>
                Valores base de remuneração por rota
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="basePayPerRoute"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pagamento Base por Rota (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="20.00"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Valor fixo pago por rota completada
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pricePerKm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço por KM (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="1.20"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Valor pago por quilômetro rodado
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Bônus por Entrega */}
          <Card>
            <CardHeader>
              <CardTitle>Bônus por Entrega</CardTitle>
              <CardDescription>
                Valores adicionais baseados no resultado das entregas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="bonusPerDelivery"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bônus por Entrega Bem-sucedida (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="2.00"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Pago por cada entrega completada
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bonusPerFailedAttempt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bônus por Tentativa de Entrega (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="1.00"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Pago quando motorista foi ao local mas não entregou
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Multiplicadores de Horário */}
          <Card>
            <CardHeader>
              <CardTitle>Multiplicadores de Horário</CardTitle>
              <CardDescription>
                Bônus aplicados em horários específicos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Manhã Cedo */}
              <div className="space-y-4 p-4 border rounded-lg">
                <FormField
                  control={form.control}
                  name="bonuses.earlyMorning.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>Manhã Cedo (6h-8h)</FormLabel>
                        <FormDescription>
                          Entregas completadas entre 6h e 8h
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bonuses.earlyMorning.multiplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Multiplicador</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="1"
                          max="3"
                          placeholder="1.2"
                          {...field}
                          disabled={!form.watch('bonuses.earlyMorning.enabled')}
                        />
                      </FormControl>
                      <FormDescription>
                        Ex: 1.2 = +20% sobre base + distância
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Noite */}
              <div className="space-y-4 p-4 border rounded-lg">
                <FormField
                  control={form.control}
                  name="bonuses.lateNight.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>Noite (20h-23h)</FormLabel>
                        <FormDescription>
                          Entregas completadas entre 20h e 23h
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bonuses.lateNight.multiplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Multiplicador</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="1"
                          max="3"
                          placeholder="1.3"
                          {...field}
                          disabled={!form.watch('bonuses.lateNight.enabled')}
                        />
                      </FormControl>
                      <FormDescription>
                        Ex: 1.3 = +30% sobre base + distância
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Fim de Semana */}
              <div className="space-y-4 p-4 border rounded-lg">
                <FormField
                  control={form.control}
                  name="bonuses.weekend.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>Fim de Semana</FormLabel>
                        <FormDescription>
                          Entregas completadas aos sábados ou domingos
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bonuses.weekend.multiplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Multiplicador</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="1"
                          max="3"
                          placeholder="1.15"
                          {...field}
                          disabled={!form.watch('bonuses.weekend.enabled')}
                        />
                      </FormControl>
                      <FormDescription>
                        Ex: 1.15 = +15% sobre base + distância
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Faixas de Volume */}
          <Card>
            <CardHeader>
              <CardTitle>Bônus por Volume de Entregas</CardTitle>
              <CardDescription>
                Bônus fixos baseados na quantidade de paradas na rota
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex gap-4 items-start p-4 border rounded-lg"
                >
                  <div className="flex-1 grid gap-4 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name={`stopTiers.${index}.minStops`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mínimo de Paradas</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="10"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`stopTiers.${index}.maxStops`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Máximo de Paradas</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="20"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`stopTiers.${index}.bonus`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bônus (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="5.00"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ minStops: 1, maxStops: 10, bonus: 0 })
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Faixa
              </Button>
            </CardContent>
          </Card>

          {/* Bônus Especiais */}
          <Card>
            <CardHeader>
              <CardTitle>Bônus Especiais</CardTitle>
              <CardDescription>
                Bônus adicionais por tipo de pedido
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="lunnaOrderBonus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bônus por Pedido Lunna (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="1.00"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Valor adicional por cada pedido integrado do sistema Lunna
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Preview de Cálculo */}
          {previewEarnings && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Preview de Cálculo
                </CardTitle>
                <CardDescription>
                  Exemplo de cálculo com rota de 15 paradas, 25km, 13 entregas bem-sucedidas, 1 tentativa falhada e 3 pedidos Lunna
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagamento Base:</span>
                    <span className="font-medium">{formatCurrency(previewEarnings.breakdown.basePay)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Distância ({previewEarnings.routeStats.distanceKm} km):</span>
                    <span className="font-medium">{formatCurrency(previewEarnings.breakdown.distanceEarnings)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entregas Sucesso ({previewEarnings.routeStats.successfulDeliveries}):</span>
                    <span className="font-medium">{formatCurrency(previewEarnings.breakdown.deliveryBonuses)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tentativas ({previewEarnings.routeStats.failedWithAttempt}):</span>
                    <span className="font-medium">{formatCurrency(previewEarnings.breakdown.failedAttemptBonuses)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bônus Volume:</span>
                    <span className="font-medium">{formatCurrency(previewEarnings.breakdown.stopTierBonus)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pedidos Lunna ({previewEarnings.routeStats.lunnaOrderCount}):</span>
                    <span className="font-medium">{formatCurrency(previewEarnings.breakdown.lunnaBonus)}</span>
                  </div>
                  {previewEarnings.breakdown.timeBonusAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Bônus Horário ({previewEarnings.breakdown.timeBonusMultiplier}x):
                      </span>
                      <span className="font-medium">{formatCurrency(previewEarnings.breakdown.timeBonusAmount)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between font-bold text-base">
                    <span>Total:</span>
                    <span className="text-primary">{formatCurrency(previewEarnings.totalEarnings)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notas */}
          <Card>
            <CardHeader>
              <CardTitle>Notas</CardTitle>
              <CardDescription>
                Informações adicionais sobre as regras (opcional)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Adicione observações sobre as regras..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Botão Salvar */}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving} size="lg">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? 'Salvando...' : 'Salvar Regras'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
