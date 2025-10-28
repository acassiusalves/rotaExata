'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { GripHorizontal } from 'lucide-react';

interface ResizableDividerProps {
  children: [React.ReactNode, React.ReactNode]; // [top content, bottom content]
  defaultTopHeight?: number; // Altura inicial do painel superior em pixels ou porcentagem
  minTopHeight?: number; // Altura mínima do painel superior
  minBottomHeight?: number; // Altura mínima do painel inferior
  className?: string;
}

export function ResizableDivider({
  children,
  defaultTopHeight = 60, // 60% por padrão
  minTopHeight = 30,
  minBottomHeight = 20,
  className,
}: ResizableDividerProps) {
  const [topHeight, setTopHeight] = React.useState(defaultTopHeight);
  const [isDragging, setIsDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerHeight = containerRect.height;

      // Calcular nova altura baseada na posição do mouse
      const mouseY = e.clientY - containerRect.top;
      const newTopHeightPercent = (mouseY / containerHeight) * 100;

      // Aplicar limites
      const clampedHeight = Math.max(
        minTopHeight,
        Math.min(100 - minBottomHeight, newTopHeightPercent)
      );

      setTopHeight(clampedHeight);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerHeight = containerRect.height;

      const touch = e.touches[0];
      const touchY = touch.clientY - containerRect.top;
      const newTopHeightPercent = (touchY / containerHeight) * 100;

      const clampedHeight = Math.max(
        minTopHeight,
        Math.min(100 - minBottomHeight, newTopHeightPercent)
      );

      setTopHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minTopHeight, minBottomHeight]);

  return (
    <div ref={containerRef} className={cn('relative h-full w-full flex flex-col', className)}>
      {/* Painel Superior */}
      <div
        style={{ height: `${topHeight}%` }}
        className="overflow-hidden relative"
      >
        {children[0]}
      </div>

      {/* Divisor Arrastável */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={cn(
          'relative h-2 bg-border hover:bg-primary/20 transition-colors cursor-ns-resize flex items-center justify-center group z-10',
          isDragging && 'bg-primary/30'
        )}
      >
        <div className="absolute inset-x-0 h-4 -translate-y-1" /> {/* Área de clique maior */}
        <GripHorizontal className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>

      {/* Painel Inferior */}
      <div
        style={{ height: `${100 - topHeight}%` }}
        className="overflow-hidden relative flex-1"
      >
        {children[1]}
      </div>
    </div>
  );
}
