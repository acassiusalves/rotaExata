
"use client";

import { Home } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { PlaceValue } from '@/lib/types';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface SortableStopProps {
  stop: PlaceValue;
  index: number;
  routeKey: string;
  color?: string;
}

function getFullAddress(stop: any) {
  // tenta as chaves mais comuns que usamos no app
  return (
    stop.address ||
    stop.formattedAddress ||
    stop.addressString ||
    stop?.place?.formatted_address ||
    '--'
  );
}

function SortableStop({ stop, index, routeKey, color }: SortableStopProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: stop.id ?? stop.placeId ?? `${routeKey}-${index}`,
      data: { routeKey, index },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center">
      {/* Conector */}
      <div className="h-1 w-3" style={{ backgroundColor: color }} />

      {/* Ponto + Popover */}
      <Popover>
        {/* O TRIGGER é um wrapper; NÃO colocamos listeners nele */}
        <PopoverTrigger asChild>
          <div className="relative flex h-6 w-6 items-center justify-center rounded-md border bg-gray-100 text-xs font-semibold text-gray-700">
            {index + 1}

            {/* HANDLE DE ARRASTE (lado direito do ponto) */}
            <span
              // área ~ metade direita do círculo; ajuste se quiser menor
              className="absolute right-0 top-0 h-6 w-3 cursor-grab active:cursor-grabbing"
              // impede que o clique do handle abra o popover
              onClick={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.stopPropagation();
                // passa o evento para o dnd-kit iniciar o arraste
                listeners?.onPointerDown?.(e as any);
              }}
              // importante para Pointer events em touch
              style={{ touchAction: 'none' }}
              aria-label="Arrastar parada"
              title="Arrastar"
            />
          </div>
        </PopoverTrigger>

        <PopoverContent side="top" align="center" className={cn(
          'w-80 relative rounded-xl border bg-popover text-popover-foreground shadow-lg',
          "after:content-[''] after:absolute after:-bottom-2 after:left-10 after:border-[10px] after:border-transparent after:border-t-background"
        )}>
          <div className="grid gap-4">
            <h4 className="font-medium leading-none">Detalhes da Parada</h4>
            <div className="grid gap-2 text-sm">
              <div className="grid grid-cols-3 items-center gap-2">
                <span className="text-muted-foreground col-span-1">Cliente</span>
                <span className="col-span-2 font-medium">{stop.customerName || '--'}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-2">
                <span className="text-muted-foreground col-span-1">Pedido Nº</span>
                <span className="col-span-2">{stop.orderNumber || '--'}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-2">
                <span className="text-muted-foreground col-span-1">Telefone</span>
                <span className="col-span-2">{stop.phone || '--'}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-2">
                <span className="text-muted-foreground col-span-1">Janela</span>
                <span className="col-span-2">
                  {stop.timeWindowStart && stop.timeWindowEnd ? `${stop.timeWindowStart} - ${stop.timeWindowEnd}` : '--'}
                </span>
              </div>
              <div className="grid grid-cols-3 items-start gap-2">
                <span className="text-muted-foreground col-span-1">Endereço</span>
                <p className="col-span-2 leading-snug break-words">
                  {stop.address || stop.formattedAddress || stop.addressString || stop?.place?.formatted_address || '--'}
                </p>
              </div>
              <div className="grid grid-cols-3 items-start gap-2">
                <span className="text-muted-foreground col-span-1">Observações</span>
                <p className="col-span-2 leading-snug">{stop.notes || '--'}</p>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}


interface RouteTimelineProps {
  stops: PlaceValue[];
  color?: string;
  routeKey: string;
}

export function RouteTimeline({
  stops,
  color = '#888888',
  routeKey,
}: RouteTimelineProps) {
  if (stops.length === 0) {
    return null;
  }
  const stopIds = stops.map((s) => s.id ?? s.placeId ?? `${routeKey}-${stops.indexOf(s)}`);

  return (
    <SortableContext items={stopIds} strategy={horizontalListSortingStrategy}>
      <div className="flex items-center overflow-x-auto">
        {/* Home Icon */}
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: color }}
        >
          <Home className="h-4 w-4 text-white" />
        </div>

        {/* Stops */}
        {stops.map((stop, index) => (
          <SortableStop
            key={stop.id ?? stop.placeId ?? index}
            stop={stop}
            index={index}
            routeKey={routeKey}
            color={color}
          />
        ))}
      </div>
    </SortableContext>
  );
}
