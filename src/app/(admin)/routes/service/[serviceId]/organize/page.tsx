'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/firebase/client';
import { doc, getDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import type { LunnaService, PlaceValue } from '@/lib/types';

export default function ServiceOrganizePage() {
  const router = useRouter();
  const params = useParams();
  const serviceId = params.serviceId as string;
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadServiceAndRedirect = async () => {
      try {
        // Buscar dados do serviço
        const serviceRef = doc(db, 'services', serviceId);
        const serviceSnap = await getDoc(serviceRef);

        if (!serviceSnap.exists()) {
          setError('Serviço não encontrado');
          setIsLoading(false);
          return;
        }

        const serviceData = serviceSnap.data() as LunnaService;

        console.log('📦 [ServiceOrganize] Dados do serviço carregados:', {
          code: serviceData.code,
          status: serviceData.status,
          stopsCount: serviceData.allStops?.length || 0,
          hasOrigin: !!serviceData.origin,
          originAddress: serviceData.origin?.address,
        });

        // Validar se o serviço tem stops
        if (!serviceData.allStops || serviceData.allStops.length === 0) {
          setError('Serviço não possui paradas para organizar');
          setIsLoading(false);
          return;
        }

        // Validar se o serviço tem origem
        if (!serviceData.origin || !serviceData.origin.lat || !serviceData.origin.lng) {
          setError('Serviço não possui origem definida');
          setIsLoading(false);
          return;
        }

        // Converter Timestamp do Firestore para ISO string
        let routeDateISO: string;
        if (serviceData.plannedDate instanceof Timestamp) {
          routeDateISO = serviceData.plannedDate.toDate().toISOString();
        } else if (serviceData.plannedDate instanceof Date) {
          routeDateISO = serviceData.plannedDate.toISOString();
        } else {
          routeDateISO = new Date().toISOString();
        }

        // Buscar rotas já existentes para este serviço
        const existingRoutesQuery = query(
          collection(db, 'routes'),
          where('serviceId', '==', serviceId)
        );
        const existingRoutesSnap = await getDocs(existingRoutesQuery);

        const existingServiceRoutes: Array<{
          id: string;
          code: string;
          name: string;
          stops: PlaceValue[];
          distanceMeters: number;
          duration: string;
          encodedPolyline: string;
          color: string;
          status: string;
          driverId?: string;
          driverInfo?: { name: string; vehicle: { type: string; plate: string } };
        }> = [];

        const assignedStopIds = new Set<string>();

        existingRoutesSnap.forEach((routeDoc) => {
          const routeData = routeDoc.data();
          const routeStops = (routeData.stops || []) as PlaceValue[];

          // Registrar IDs dos stops já atribuídos a rotas
          routeStops.forEach((stop) => {
            const stopId = String(stop.id ?? stop.placeId);
            if (stopId) assignedStopIds.add(stopId);
          });

          existingServiceRoutes.push({
            id: routeDoc.id,
            code: routeData.code || '',
            name: routeData.name || '',
            stops: routeStops,
            distanceMeters: routeData.distanceMeters || 0,
            duration: routeData.duration || '0s',
            encodedPolyline: routeData.encodedPolyline || '',
            color: routeData.color || '#6366f1',
            status: routeData.status || 'draft',
            driverId: routeData.driverId,
            driverInfo: routeData.driverInfo,
          });
        });

        // Filtrar stops que ainda não foram atribuídos a nenhuma rota
        const unassignedStops = serviceData.allStops.filter((stop) => {
          const stopId = String(stop.id ?? stop.placeId);
          return !assignedStopIds.has(stopId);
        });

        console.log('📦 [ServiceOrganize] Rotas existentes:', existingServiceRoutes.length);
        console.log('📦 [ServiceOrganize] Stops já atribuídos:', assignedStopIds.size);
        console.log('📦 [ServiceOrganize] Stops não atribuídos:', unassignedStops.length);

        // Preparar dados para a página de organização
        const routeData = {
          origin: serviceData.origin,
          stops: unassignedStops, // Apenas stops não atribuídos
          routeDate: routeDateISO,
          routeTime: '08:00',
          isService: true,
          serviceId: serviceId,
          serviceCode: serviceData.code,
          isExistingRoute: false,
          existingServiceRoutes: existingServiceRoutes.length > 0 ? existingServiceRoutes : undefined,
        };

        console.log('📦 [ServiceOrganize] Salvando no sessionStorage:', {
          stopsCount: routeData.stops.length,
          origin: routeData.origin?.address,
          serviceCode: routeData.serviceCode,
          isService: routeData.isService,
          existingRoutes: existingServiceRoutes.length,
        });

        sessionStorage.setItem('newRouteData', JSON.stringify(routeData));

        // Redirecionar para a página de organização
        router.push('/routes/organize/acompanhar');
      } catch (err) {
        console.error('Erro ao carregar serviço:', err);
        setError('Erro ao carregar dados do serviço');
        setIsLoading(false);
      }
    };

    if (serviceId) {
      loadServiceAndRedirect();
    }
  }, [serviceId, router]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg">{error}</p>
          <button
            onClick={() => router.push('/routes')}
            className="mt-4 text-primary underline"
          >
            Voltar para Rotas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="ml-4">Carregando serviço...</span>
    </div>
  );
}
