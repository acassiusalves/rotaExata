
"use client";

import { Home } from 'lucide-react';
import * as React from 'react';
import { PlaceValue } from '@/lib/types';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableStopProps {
  stop: PlaceValue;
  index: number;
  routeKey: string;
  color?: string;
  onStopClick?: (stop: PlaceValue, index: number) => void;
  dragDelay?: number; // ms (mesmo do PointerSensor)
}

function SortableStop({
  stop,
  index,
  routeKey,
  color,
  onStopClick,
  dragDelay = 200,
}: SortableStopProps) {
  const {
    attributes,
    listeners: sortableListeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: stop.id ?? stop.placeId ?? `${routeKey}-${index}`,
    data: { routeKey, index },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pressStart = React.useRef<number>(0);

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center">
      <div className="h-1 w-3" style={{ backgroundColor: color }} />
      <button
        type="button"
        // dnd listeners (com activationConstraint no DndContext)
        {...sortableListeners}
        onPointerDown={(e) => {
          pressStart.current = performance.now();
          sortableListeners?.onPointerDown?.(e as any);
        }}
        onClick={(e) => {
          const dt = performance.now() - pressStart.current;
          if (dt < dragDelay + 50) {
            // clique curto -> abre InfoWindow no mapa
            onStopClick?.(stop, index);
          }
        }}
        className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md border bg-gray-100 text-xs font-semibold text-gray-700 active:cursor-grabbing"
        style={{ touchAction: "none" }}
        title={`Parada ${index + 1}: ${stop.customerName ?? ""}`}
      >
        {index + 1}
      </button>
    </div>
  );
}


interface RouteTimelineProps {
  stops: PlaceValue[];
  color?: string;
  routeKey: string;
  onStopClick?: (stop: PlaceValue, index: number) => void;
  dragDelay?: number;
}

export function RouteTimeline({
  stops,
  color = '#888888',
  routeKey,
  onStopClick,
  dragDelay = 200,
}: RouteTimelineProps) {
  if (stops.length === 0) {
    return null;
  }
  const stopIds = stops.map((s, i) => s.id ?? s.placeId ?? `${routeKey}-${i}`);

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
            key={stopIds[index]}
            stop={stop}
            index={index}
            routeKey={routeKey}
            color={color}
            onStopClick={onStopClick}
            dragDelay={dragDelay}
          />
        ))}
      </div>
    </SortableContext>
  );
}
