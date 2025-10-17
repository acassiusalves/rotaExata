'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown, MapPin, Edit, Sparkles } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface StopChangeBadgeProps {
  modificationType?: 'address' | 'sequence' | 'data' | 'removed' | 'added';
  originalSequence?: number;
  currentSequence?: number;
  className?: string;
}

export function StopChangeBadge({
  modificationType,
  originalSequence,
  currentSequence,
  className = '',
}: StopChangeBadgeProps) {
  if (!modificationType) return null;

  const getBadgeConfig = () => {
    switch (modificationType) {
      case 'sequence':
        return {
          icon: <ArrowUpDown className="h-3 w-3" />,
          label: 'SEQUÊNCIA ALTERADA',
          color: 'bg-blue-500 hover:bg-blue-600',
          tooltip: `Posição alterada: #${originalSequence! + 1} → #${currentSequence! + 1}`,
        };
      case 'address':
        return {
          icon: <MapPin className="h-3 w-3" />,
          label: 'ENDEREÇO MODIFICADO',
          color: 'bg-orange-500 hover:bg-orange-600',
          tooltip: 'O endereço desta parada foi alterado',
        };
      case 'data':
        return {
          icon: <Edit className="h-3 w-3" />,
          label: 'DADOS ATUALIZADOS',
          color: 'bg-purple-500 hover:bg-purple-600',
          tooltip: 'Informações desta parada foram atualizadas',
        };
      case 'added':
        return {
          icon: <Sparkles className="h-3 w-3" />,
          label: 'NOVA PARADA',
          color: 'bg-green-500 hover:bg-green-600',
          tooltip: 'Esta parada foi adicionada recentemente',
        };
      default:
        return null;
    }
  };

  const config = getBadgeConfig();
  if (!config) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            className={`${config.color} text-white text-[10px] font-bold px-2 py-1 flex items-center gap-1 animate-pulse ${className}`}
          >
            {config.icon}
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
