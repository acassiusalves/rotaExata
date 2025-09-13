
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

function SortableStop({ stop, index, routeKey, color }: SortableStopProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: stop.id,
    data: {
      routeKey: routeKey,
      index: index,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isDragging) return;
    listeners?.onPointerDown(e);
  };
  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center"
      onClickCapture={handleClick}
    >
      {/* Connector Line */}
      <div className="h-1 w-3" style={{ backgroundColor: color }} />
      {/* Stop Box wrapped in Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <div
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md border bg-gray-100 text-xs font-semibold text-gray-700 active:cursor-grabbing"
            onPointerDown={handlePointerDown}
          >
            {index + 1}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80">
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
                  {stop.timeWindowStart && stop.timeWindowEnd
                    ? `${stop.timeWindowStart} - ${stop.timeWindowEnd}`
                    : '--'}
                </span>
              </div>
               <div className="grid grid-cols-3 items-start gap-2">
                <span className="text-muted-foreground col-span-1">Endereço</span>
                <p className="col-span-2 leading-snug">{stop.address || '--'}</p>
              </div>
              <div className="grid grid-cols-3 items-start gap-2">
                <span className="text-muted-foreground col-span-1">Obs.</span>
                <p className="col-span-2 font-medium leading-snug">{stop.notes || '--'}</p>
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
  const stopIds = stops.map((s) => s.id);

  return (
    <SortableContext items={stopIds} strategy={horizontalListSortingStrategy}>
      <div className="flex items-center">
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
            key={stop.id}
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
