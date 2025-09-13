
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

interface SortableStopProps {
  stop: PlaceValue;
  index: number;
  routeKey: string;
}

function SortableStop({ stop, index, routeKey }: SortableStopProps) {
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
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md border bg-gray-100 text-xs font-semibold text-gray-700 active:cursor-grabbing"
    >
      {index + 1}
    </div>
  );
}


interface RouteTimelineProps {
  stops: PlaceValue[];
  color?: string;
  routeKey: string;
}

export function RouteTimeline({ stops, color = '#888888', routeKey }: RouteTimelineProps) {
  if (stops.length === 0) {
    return null;
  }
  const stopIds = stops.map(s => s.id);

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
                <React.Fragment key={stop.id}>
                    {/* Connector Line */}
                    <div
                        className="h-1 w-3"
                        style={{ backgroundColor: color }}
                    />
                    {/* Stop Box */}
                    <SortableStop stop={stop} index={index} routeKey={routeKey} />
                </React.Fragment>
            ))}
        </div>
    </SortableContext>
  );
}
