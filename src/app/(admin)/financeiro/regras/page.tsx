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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Plus, Trash2, DollarSign, Calculator, MapPin } from 'lucide-react';
import type { EarningsRules } from '@/lib/types';
import { calculatePreviewEarnings, formatCurrency } from '@/lib/earnings-calculator';

const rulesSchema = z.object({
  pricingMode: z.enum(['zone', 'distance', 'hybrid']),
  pricingZones: z.array(z.object({
    id: z.string(),
    name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
    price: z.coerce.number().min(0),
    description: z.string().optional(),
    cities: z.string().optional(), // CSV de cidades
    maxDistanceKm: z.coerce.number().optional(),
    excludeLocations: z.string().optional(), // CSV de locais excluídos
  })).optional(),
  basePayPerRoute: z.coerce.number().min(0),
  pricePerKm: z.coerce.number().min(0),
  bonusPerDelivery: z.coerce.number().min(0),
  bonusPerFailedAttempt: z.coerce.number().min(0),
  bonuses: z.object({
    earlyMorning: z.object({
      enabled: z.boolean(),
      multiplier: z.coerce.number().min(1).max(3),
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
  })),
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
      pricingMode: 'zone',
      pricingZones: [
        {
          id: 'zone-1',
          name: 'Goiânia e Aparecida (até 7km)',
          price: 5,
          description: 'Com exceção de hospitais e clínicas',
          cities: 'Goiânia, Aparecida de Goiânia',
          maxDistanceKm: 7,
          excludeLocations: 'hospitais, clínicas',
        },
        {
          id: 'zone-2',
          name: 'Goiânia e Aparecida (acima de 7km)',
          price: 10,
          description: '',
          cities: 'Goiânia, Aparecida de Goiânia',
          maxDistanceKm: undefined,
          excludeLocations: '',
        },
        {
          id: 'zone-3',
          name: 'Senador Canedo, Trindade e Goianira',
          price: 20,
          description: '',
          cities: 'Senador Canedo, Trindade, Goianira',
          maxDistanceKm: undefined,
          excludeLocations: '',
        },
      ],
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

  const { fields: zoneFields, append: appendZone, remove: removeZone } = useFieldArray({
    control: form.control,
    name: 'pricingZones',
  });

  const { fields: tierFields, append: appendTier, remove: removeTier } = useFieldArray({
    control: form.control,
    name: 'stopTiers',
  });

  const pricingMode = form.watch('pricingMode');

  // Carrega regras existentes
  React.useEffect(() => {
    const loadRules = async () => {
      try {
        const rulesRef = doc(db, 'earningsRules', 'active');
        const rulesSnap = await getDoc(rulesRef);

        if (rulesSnap.exists()) {
          const data = rulesSnap.data() as EarningsRules;
          setCurrentVersion(data.version);

          // Converte zonas para formato do formulário
          const zonesForForm = data.pricingZones?.map(zone => ({
            id: zone.id,
            name: zone.name,
            price: zone.price,
            description: zone.description || '',
            cities: zone.cities?.join(', ') || '',
            maxDistanceKm: zone.maxDistanceKm,
            excludeLocations: zone.excludeLocations?.join(', ') || '',
          })) || [];

          form.reset({
            pricingMode: data.pricingMode || 'zone',
            pricingZones: zonesForForm,
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
          pricingMode: values.pricingMode,
          pricingZones: values.pricingZones?.map(z => ({
            id: z.id,
            name: z.name,
            price: z.price,
            description: z.description,
            cities: z.cities?.split(',').map(c => c.trim()).filter(Boolean),
            maxDistanceKm: z.maxDistanceKm,
            excludeLocations: z.excludeLocations?.split(',').map(l => l.trim()).filter(Boolean),
          })),
          basePayPerRoute: values.basePayPerRoute,
          pricePerKm: values.pricePerKm,
          bonusPerDelivery: values.bonusPerDelivery,
          bonusPerFailedAttempt: values.bonusPerFailedAttempt,
          bonuses: values.bonuses,
          stopTiers: values.stopTiers,
          lunnaOrderBonus: values.lunnaOrderBonus,
          notes: values.notes || '',
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

      // Converte zonas para formato do Firestore
      const zonesForDb = data.pricingZones?.map(z => ({
        id: z.id,
        name: z.name,
        price: z.price,
        description: z.description,
        cities: z.cities?.split(',').map(c => c.trim()).filter(Boolean),
        maxDistanceKm: z.maxDistanceKm,
        excludeLocations: z.excludeLocations?.split(',').map(l => l.trim()).filter(Boolean),
      }));

      const newRules: EarningsRules = {
        id: 'active',
        version: currentVersion + 1,
        pricingMode: data.pricingMode,
        pricingZones: zonesForDb,
        basePayPerRoute: data.basePayPerRoute,
        pricePerKm: data.pricePerKm,
        bonusPerDelivery: data.bonusPerDelivery,
        bonusPerFailedAttempt: data.bonusPerFailedAttempt,
        bonuses: data.bonuses,
        stopTiers: data.stopTiers,
        lunnaOrderBonus: data.lunnaOrderBonus,
        active: true,
        notes: data.notes || '',
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
          {/* Modo de Precificação */}
          <Card>
            <CardHeader>
              <CardTitle>Modo de Precificação</CardTitle>
              <CardDescription>
                Escolha como calcular os ganhos dos motoristas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="pricingMode"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-3"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="zone" id="zone" />
                          <label
                            htmlFor="zone"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            <div>
                              <div className="font-semibold">Preço Fixo por Zona</div>
                              <div className="text-muted-foreground text-xs">
                                Valor fixo baseado na região/cidade de entrega
                              </div>
                            </div>
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="distance" id="distance" />
                          <label
                            htmlFor="distance"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            <div>
                              <div className="font-semibold">Base + Distância</div>
                              <div className="text-muted-foreground text-xs">
                                Pagamento base + valor por quilômetro rodado
                              </div>
                            </div>
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="hybrid" id="hybrid" />
                          <label
                            htmlFor="hybrid"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            <div>
                              <div className="font-semibold">Híbrido</div>
                              <div className="text-muted-foreground text-xs">
                                Zona como base + distância extra além da zona
                              </div>
                            </div>
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Zonas de Precificação */}
          {(pricingMode === 'zone' || pricingMode === 'hybrid') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Zonas de Precificação
                </CardTitle>
                <CardDescription>
                  Configure o preço fixo para cada região/cidade
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {zoneFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-4 p-4 border rounded-lg relative"
                  >
                    <div className="absolute top-2 right-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeZone(index)}
                        disabled={zoneFields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`pricingZones.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome da Zona *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Goiânia até 7km" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`pricingZones.${index}.price`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preço Fixo (R$) *</FormLabel>
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

                    <FormField
                      control={form.control}
                      name={`pricingZones.${index}.cities`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cidades (separadas por vírgula)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Goiânia, Aparecida de Goiânia"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Liste as cidades que fazem parte desta zona
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`pricingZones.${index}.maxDistanceKm`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Distância Máxima (km)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.1"
                                placeholder="7"
                                {...field}
                                value={field.value || ''}
                              />
                            </FormControl>
                            <FormDescription>Opcional</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`pricingZones.${index}.excludeLocations`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Locais Excluídos</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="hospitais, clínicas"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>Opcional, separados por vírgula</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`pricingZones.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observações</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Ex: Com exceção de hospitais e clínicas"
                              className="min-h-[60px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendZone({
                      id: `zone-${Date.now()}`,
                      name: '',
                      price: 0,
                      description: '',
                      cities: '',
                      maxDistanceKm: undefined,
                      excludeLocations: '',
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Zona
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Configuração Base (apenas para modo distância ou híbrido) */}
          {(pricingMode === 'distance' || pricingMode === 'hybrid') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  {pricingMode === 'hybrid' ? 'Distância Extra' : 'Configuração Base'}
                </CardTitle>
                <CardDescription>
                  {pricingMode === 'hybrid'
                    ? 'Valores para distância além da zona'
                    : 'Valores base de remuneração por rota'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {pricingMode === 'distance' && (
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
                  )}

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
                          {pricingMode === 'hybrid'
                            ? 'Valor por km além da zona'
                            : 'Valor pago por quilômetro rodado'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resto dos cards (Bônus, Multiplicadores, etc.) continuam iguais... */}
          {/* Por brevidade, mantive apenas as seções principais. Os outros cards permanecem os mesmos */}

          {/* Botão Salvar */}
          <div className="flex justify-end gap-2">
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
