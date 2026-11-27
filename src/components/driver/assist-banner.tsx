'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

type Props = { driverName: string; staffName: string; onEnd: () => void };

/** Faixa fixa do modo operador: deixa claro em nome de quem se age e no nome de quem fica o registro. */
export function AssistBanner({ driverName, staffName, onEnd }: Props) {
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b bg-amber-100 px-3 py-2 text-xs text-amber-950">
      <span>
        Operando como <strong>{driverName}</strong> · as ações ficam registradas no nome de {staffName}
      </span>
      <Button size="sm" variant="ghost" onClick={onEnd}>Encerrar</Button>
    </div>
  );
}
