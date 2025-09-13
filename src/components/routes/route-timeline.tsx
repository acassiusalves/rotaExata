
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

      {/* Ponto de arraste */}
       <div
        {...listeners}
        className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md border bg-gray-100 text-xs font-semibold text-gray-700 active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        aria-label={`Arrastar parada ${index + 1}`}
        title={`Parada ${index + 1}: ${stop.customerName}`}
      >
        {index + 1}
      </div>
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
      <div className="flex items-center overflow-x-auto py-1">
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
