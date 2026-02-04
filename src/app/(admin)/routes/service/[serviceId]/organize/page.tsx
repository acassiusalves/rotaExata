'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import type { LunnaService } from '@/lib/types';

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

        // Preparar dados para a página de organização
        // Salvar no sessionStorage para a página de organização consumir
        const routeData = {
          origin: serviceData.origin,
          stops: serviceData.allStops,
          routeDate: serviceData.plannedDate instanceof Date
            ? serviceData.plannedDate.toISOString()
            : new Date().toISOString(),
          routeTime: '08:00',
          isService: true, // Flag para indicar que é um serviço
          serviceId: serviceId,
          serviceCode: serviceData.code,
          isExistingRoute: false, // É um novo fluxo de organização
        };

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
