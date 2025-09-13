"use client";

import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RouteTimelineProps {
  numberOfStops: number;
  color?: string;
}

export function RouteTimeline({ numberOfStops, color = '#888888' }: RouteTimelineProps) {
  if (numberOfStops === 0) {
    return null;
  }

  const stops = Array.from({ length: numberOfStops }, (_, i) => i + 1);

  return (
    <div className="flex items-center">
      {/* Home Icon */}
      <div 
        className="flex h-6 w-6 items-center justify-center rounded-md"
        style={{ backgroundColor: color }}
      >
        <Home className="h-4 w-4 text-white" />
      </div>

      {/* Stops */}
      {stops.map((stopNumber) => (
        <div key={stopNumber} className="flex items-center">
          {/* Connector Line */}
          <div 
            className="h-1 w-3"
            style={{ backgroundColor: color }}
          />
          {/* Stop Box */}
          <div className="flex h-6 w-6 items-center justify-center rounded-md border bg-gray-100 text-xs font-semibold text-gray-700">
            {stopNumber}
          </div>
        </div>
      ))}
    </div>
  );
}
