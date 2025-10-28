'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ResizableColumnsProps {
  children: [React.ReactNode, React.ReactNode]; // [leftColumn, rightColumn]
  defaultLeftWidth?: number; // percentage
  minLeftWidth?: number; // percentage
  minRightWidth?: number; // percentage
  className?: string;
}

export function ResizableColumns({
  children,
  defaultLeftWidth = 65,
  minLeftWidth = 40,
  minRightWidth = 20,
  className,
}: ResizableColumnsProps) {
  const [leftWidth, setLeftWidth] = React.useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startXRef = React.useRef<number>(0);
  const startWidthRef = React.useRef<number>(defaultLeftWidth);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.touches[0].clientX;
    startWidthRef.current = leftWidth;
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const deltaX = e.clientX - startXRef.current;
      const containerWidth = containerRef.current.offsetWidth;
      const deltaPercentage = (deltaX / containerWidth) * 100;
      const newWidth = startWidthRef.current + deltaPercentage;

      // Apply constraints
      const maxLeftWidth = 100 - minRightWidth;
      if (newWidth >= minLeftWidth && newWidth <= maxLeftWidth) {
        setLeftWidth(newWidth);
      } else if (newWidth < minLeftWidth) {
        setLeftWidth(minLeftWidth);
      } else if (newWidth > maxLeftWidth) {
        setLeftWidth(maxLeftWidth);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !containerRef.current) return;

      const deltaX = e.touches[0].clientX - startXRef.current;
      const containerWidth = containerRef.current.offsetWidth;
      const deltaPercentage = (deltaX / containerWidth) * 100;
      const newWidth = startWidthRef.current + deltaPercentage;

      // Apply constraints
      const maxLeftWidth = 100 - minRightWidth;
      if (newWidth >= minLeftWidth && newWidth <= maxLeftWidth) {
        setLeftWidth(newWidth);
      } else if (newWidth < minLeftWidth) {
        setLeftWidth(minLeftWidth);
      } else if (newWidth > maxLeftWidth) {
        setLeftWidth(maxLeftWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
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
  }, [isDragging, leftWidth, minLeftWidth, minRightWidth]);

  const rightWidth = 100 - leftWidth;

  return (
    <div ref={containerRef} className={cn('flex w-full', className)}>
      {/* Left Column */}
      <div style={{ width: `${leftWidth}%` }} className="shrink-0">
        {children[0]}
      </div>

      {/* Resize Handle */}
      <div
        className={cn(
          'w-1 bg-border hover:bg-primary hover:w-1.5 transition-all cursor-ew-resize flex items-center justify-center group relative shrink-0',
          isDragging && 'bg-primary w-1.5'
        )}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="absolute inset-y-0 -left-2 -right-2" />
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <svg width="8" height="24" viewBox="0 0 8 24" fill="none" className="text-muted-foreground">
            <path d="M2 3v18M6 3v18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Right Column */}
      <div style={{ width: `${rightWidth}%` }} className="shrink-0">
        {children[1]}
      </div>
    </div>
  );
}
