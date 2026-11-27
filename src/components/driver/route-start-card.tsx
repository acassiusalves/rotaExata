'use client';

import * as React from 'react';
import { Loader2, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Props = { starting: boolean; disabled: boolean; onStart: () => void };

/** Aviso da rota despachada: o botão que inicia a rota fica junto da explicação. */
export function RouteStartCard({ starting, disabled, onStart }: Props) {
  return (
    <Card className="border-blue-300 bg-blue-50">
      <CardContent className="space-y-3 pt-6">
        <div>
          <p className="font-semibold text-blue-900">Rota pronta para iniciar</p>
          <p className="text-sm text-blue-700">
            Inicie a rota para começar as entregas. O botão &quot;Confirmar&quot; de cada parada é liberado depois disso.
          </p>
        </div>
        <Button size="lg" className="w-full" onClick={onStart} disabled={starting || disabled}>
          {starting
            ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            : <PlayCircle className="mr-2 h-5 w-5" aria-hidden="true" />}
          {starting ? 'Iniciando...' : 'Iniciar rota'}
        </Button>
      </CardContent>
    </Card>
  );
}
