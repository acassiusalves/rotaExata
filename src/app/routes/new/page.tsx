"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AutocompleteInput } from "@/components/maps/AutocompleteInput";
import { RouteMap } from "@/components/maps/RouteMap";
import { getFirestore, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Package } from "lucide-react";

// --- Firebase client init (ajuste com seu config) ---
const firebaseApp = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
});
const db = getFirestore(firebaseApp);

// --- Schema do formulário ---
const placeSchema = z.object({
  address: z.string().min(5, "Endereço deve ter pelo menos 5 caracteres"),
  placeId: z.string(),
  lat: z.number(),
  lng: z.number(),
}).nullable();


const schema = z.object({
  pickup: placeSchema.refine(val => val !== null, { message: "Campo de coleta é obrigatório" }),
  destination: placeSchema.refine(val => val !== null, { message: "Campo de entrega é obrigatório" }),
  base: z.coerce.number().min(0).default(5),   // tarifa base
  perKm: z.coerce.number().min(0).default(2.5) // R$/km
});

type FormData = z.infer<typeof schema>;

export default function NewRoutePage() {
  const { register, setValue, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { base: 5, perKm: 2.5, pickup: null, destination: null }
  });

  const { toast } = useToast();

  const pickup = watch("pickup");
  const destination = watch("destination");
  const base = watch("base");
  const perKm = watch("perKm");

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [encodedPolyline, setEncodedPolyline] = React.useState<string | null>(null);
  const [distanceMeters, setDistanceMeters] = React.useState<number>(0);
  const [duration, setDuration] = React.useState<string>("");

  async function onComputeRoute() {
    if (!pickup || !destination) return;
    setLoading(true);
    try {
      const r = await fetch("/api/compute-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: pickup.lat, lng: pickup.lng },
          destination: { lat: destination.lat, lng: destination.lng }
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail || "Erro ao calcular rota");
      setEncodedPolyline(data.encodedPolyline || null);
      setDistanceMeters(data.distanceMeters || 0);
      setDuration(data.duration || "0s");
      toast({ title: 'Rota calculada!', description: 'Distância e preço foram estimados.'});
    } catch (e: any) {
       toast({ variant: 'destructive', title: 'Falha ao calcular rota', description: e.message });
    } finally {
      setLoading(false);
    }
  }

  function priceTotal() {
    const km = distanceMeters / 1000;
    return Number(base || 0) + Number(perKm || 0) * (isFinite(km) ? km : 0);
  }

  const onSubmit = async (data: FormData) => {
    if (!distanceMeters || !encodedPolyline) {
      toast({ variant: 'destructive', title: 'Calcule a rota antes de salvar.' });
      return;
    }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "orders"), {
        code: `OR-${Date.now()}`,
        status: "created",
        pickup: data.pickup,
        destination: data.destination,
        distanceMeters,
        duration,
        encodedPolyline,
        price: { base: data.base, perKm: data.perKm, total: Number(priceTotal().toFixed(2)) },
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Pedido salvo com sucesso!', description: `ID do pedido: ${ref.id}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar pedido', description: e.message });
    } finally {
        setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Lançar nova rota</h1>
      <p className="text-muted-foreground">Preencha os dados abaixo para calcular e salvar um novo pedido de entrega.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AutocompleteInput
          label="Endereço de Coleta"
          value={pickup}
          onChange={(v) => setValue("pickup", v, { shouldValidate: true })}
        />
        <AutocompleteInput
          label="Endereço de Entrega"
          value={destination}
          onChange={(v) => setValue("destination", v, { shouldValidate: true })}
        />
      </div>
      {(errors.pickup || errors.destination) && (
        <p className="text-sm text-destructive">É necessário preencher os endereços de coleta e entrega.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">Tarifa base (R$)</label>
          <Input type="number" step="0.01" {...register("base")} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Preço por km (R$)</label>
          <Input type="number" step="0.01" {...register("perKm")} />
        </div>
        <Button
          onClick={onComputeRoute}
          disabled={loading || !watch("pickup") || !watch("destination")}
        >
          {loading ? "Calculando..." : "Calcular Rota"}
        </Button>
      </div>

      <RouteMap
        origin={pickup ? { lat: pickup.lat, lng: pickup.lng } : null}
        destination={destination ? { lat: destination.lat, lng: destination.lng } : null}
        encodedPolyline={encodedPolyline}
        height={420}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Distância" value={`${(distanceMeters/1000).toFixed(2)} km`} icon={Package} />
        <KpiCard title="Duração Estimada" value={duration.replace("s","s")} icon={Package} />
        <KpiCard title="Preço Estimado" value={`R$ ${priceTotal().toFixed(2)}`} icon={Package} />
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button onClick={handleSubmit(onSubmit)} disabled={saving || !encodedPolyline}>
          {saving ? 'Salvando...' : 'Salvar Pedido'}
        </Button>
        <Button variant="outline" onClick={() => { setEncodedPolyline(null); setDistanceMeters(0); setDuration("0s"); }}>
          Limpar Rota
        </Button>
      </div>
    </div>
  );
}
