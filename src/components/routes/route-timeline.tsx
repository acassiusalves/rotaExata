
"use client";

import { Home, Trash2, Info, XCircle } from 'lucide-react';
import * as React from 'react';
import { PlaceValue } from '@/lib/types';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface SortableStopProps {
  stop: PlaceValue;
  index: number;
  originalIndex?: number; // Original position number to display
  routeKey: string;
  color?: string;
  onStopClick?: (stop: PlaceValue, index: number) => void;
  onRemoveFromRoute?: (stop: PlaceValue, index: number) => void;
  onDeleteStop?: (stop: PlaceValue, index: number) => void;
  onShowInfo?: (stop: PlaceValue, index: number) => void;
  dragDelay?: number; // ms (mesmo do PointerSensor)
}

function SortableStop({
  stop,
  index,
  originalIndex,
  routeKey,
  color,
  onStopClick,
  onRemoveFromRoute,
  onDeleteStop,
  onShowInfo,
  dragDelay = 200,
}: SortableStopProps) {
  const {
    attributes,
    listeners: sortableListeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: `${routeKey}-${stop.id ?? stop.placeId ?? index}`,
    data: { routeKey, index, stop },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pressStart = React.useRef<number>(0);
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const isManual = stop.isManuallyAdded;

  // Check if this specific stop was moved by the user
  const wasMoved = (stop as any)._wasMoved === true;
  const movedFromRoute = (stop as any)._movedFromRoute;
  const originalRouteColor = (stop as any)._originalRouteColor;
  const isRecentlyInserted = (stop as any)._recentlyInserted === true;

  // Apply different styles based on status
  let buttonBgColor, buttonTextColor, buttonBorderColor;

  if (isRecentlyInserted) {
    // Black highlight for recently inserted stops from unassigned
    buttonBgColor = 'bg-slate-900 dark:bg-slate-800';
    buttonTextColor = 'text-white';
    buttonBorderColor = 'border-slate-700 border-2';
  } else if (wasMoved) {
    // Yellow/amber highlight for moved stops
    buttonBgColor = 'bg-amber-100';
    buttonTextColor = 'text-amber-900';
    buttonBorderColor = 'border-amber-400 border-2';
  } else if (isManual) {
    buttonBgColor = 'bg-green-100';
    buttonTextColor = 'text-green-700';
    buttonBorderColor = 'border-green-300';
  } else {
    buttonBgColor = 'bg-gray-100';
    buttonTextColor = 'text-gray-700';
    buttonBorderColor = 'border-gray-300';
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center relative" id={`stop-${stop.id}`}>
      <div className="h-1 w-3" style={{ backgroundColor: color }} />
      <Popover open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <PopoverTrigger asChild onClick={(e) => e.preventDefault()}>
          <button
            ref={buttonRef}
            type="button"
            // dnd listeners (com activationConstraint no DndContext)
            {...sortableListeners}
            onPointerDown={(e) => {
              pressStart.current = performance.now();
              sortableListeners?.onPointerDown?.(e as any);
            }}
            onClick={(e) => {
              e.stopPropagation();
              const dt = performance.now() - pressStart.current;
              if (dt < dragDelay + 50) {
                // clique curto -> abre InfoWindow no mapa
                onStopClick?.(stop, index);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenuOpen(true);
            }}
            className={`relative flex h-6 w-6 cursor-grab items-center justify-center rounded-md border ${buttonBgColor} ${buttonTextColor} ${buttonBorderColor} text-xs ${wasMoved || isRecentlyInserted ? 'font-extrabold' : 'font-semibold'} active:cursor-grabbing`}
            style={{ touchAction: "none" }}
            title={`Parada ${(originalIndex ?? index) + 1}: ${stop.customerName ?? ""}${isManual ? " (Adicionado manualmente)" : ""}${isRecentlyInserted ? " (Recém-inserido)" : ""}${wasMoved ? " (Posição alterada)" : ""}${movedFromRoute ? ` (Veio da rota ${movedFromRoute})` : ""}`}
          >
            {(originalIndex ?? index) + 1}
            {/* Show original route color indicator if moved from another route */}
            {wasMoved && originalRouteColor && (
              <div
                className="absolute -top-1 -right-1 h-2 w-2 rounded-full border border-white"
                style={{ backgroundColor: originalRouteColor }}
                title={`Veio da rota ${movedFromRoute}`}
              />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-56 p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col">
            <button
              onClick={() => {
                onRemoveFromRoute?.(stop, index);
                setContextMenuOpen(false);
              }}
              className="flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Remover da Rota
            </button>
            <button
              onClick={() => {
                onDeleteStop?.(stop, index);
                setContextMenuOpen(false);
              }}
              className="flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir o Ponto
            </button>
            <button
              onClick={() => {
                onShowInfo?.(stop, index);
                setContextMenuOpen(false);
              }}
              className="flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
            >
              <Info className="mr-2 h-4 w-4" />
              Informações do Serviço
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}


interface RouteTimelineProps {
  stops: PlaceValue[];
  originalStops?: PlaceValue[]; // Original order to show original numbers
  color?: string;
  routeKey: string;
  onStopClick?: (stop: PlaceValue, index: number) => void;
  onRemoveFromRoute?: (stop: PlaceValue, index: number) => void;
  onDeleteStop?: (stop: PlaceValue, index: number) => void;
  onShowInfo?: (stop: PlaceValue, index: number) => void;
  dragDelay?: number;
}

function EmptyRouteDropZone({ routeKey, color }: { routeKey: string; color: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${routeKey}-dropzone`,
    data: { routeKey, index: 0 }, // When dropped here, it will be at index 0
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 w-full min-h-[40px] px-2 py-2 rounded transition-colors ${
        isOver ? 'bg-primary/10' : ''
      }`}
    >
      {/* Home Icon */}
      <div
        className="flex h-6 w-6 items-center justify-center rounded-md flex-shrink-0"
        style={{ backgroundColor: color }}
      >
        <Home className="h-4 w-4 text-white" />
      </div>
      {/* Empty drop zone - expands to fill space */}
      <div
        className={`flex-1 px-4 py-2 text-xs italic border-2 border-dashed rounded transition-colors ${
          isOver
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
        }`}
      >
        Arraste pontos para cá
      </div>
    </div>
  );
}

export function RouteTimeline({
  stops,
  originalStops,
  color = '#888888',
  routeKey,
  onStopClick,
  onRemoveFromRoute,
  onDeleteStop,
  onShowInfo,
  dragDelay = 200,
}: RouteTimelineProps) {
  // If empty route, show a drop zone
  if (stops.length === 0) {
    return <EmptyRouteDropZone routeKey={routeKey} color={color} />;
  }

  // Generate unique IDs that include routeKey to force re-render when moving between routes
  const stopIds = stops.map((s, i) => `${routeKey}-${s.id ?? s.placeId ?? i}`);

  // Create a droppable zone for the entire timeline
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${routeKey}-timeline`,
    data: { routeKey, index: stops.length }, // Drop at the end by default
  });

  return (
    <div
      ref={setDropRef}
      className={`w-full min-h-[40px] px-2 py-1 rounded transition-colors ${
        isOver ? 'bg-primary/10' : ''
      }`}
    >
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
          {stops.map((stop, index) => {
          // Use _originalIndex if available (stored in stop), otherwise find in originalStops
          let originalIndex: number | undefined = (stop as any)._originalIndex;

          if (originalIndex === undefined && originalStops) {
            const foundIndex = originalStops.findIndex(
              s => String(s.id ?? s.placeId) === String(stop.id ?? stop.placeId)
            );
            originalIndex = foundIndex >= 0 ? foundIndex : undefined;
          }

          return (
            <SortableStop
              key={stopIds[index]}
              stop={stop}
              index={index}
              originalIndex={originalIndex}
              routeKey={routeKey}
              color={color}
              onStopClick={onStopClick}
              onRemoveFromRoute={onRemoveFromRoute}
              onDeleteStop={onDeleteStop}
              onShowInfo={onShowInfo}
              dragDelay={dragDelay}
            />
          );
        })}
      </div>
    </SortableContext>
    </div>
  );
}
