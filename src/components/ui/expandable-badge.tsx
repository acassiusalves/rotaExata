'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ExpandableBadgeProps {
  icon: React.ReactNode;
  title: string;
  className?: string;
  iconClassName?: string;
  hoverColor?: string;
}

export function ExpandableBadge({
  icon,
  title,
  className,
  iconClassName,
  hoverColor = '#eee',
}: ExpandableBadgeProps) {
  return (
    <div className="relative group">
      <div
        className={cn(
          "inline-flex justify-center items-center",
          "w-[70px] h-[50px] rounded-lg",
          "relative z-10 overflow-hidden",
          "transition-all duration-200 ease-in-out",
          "origin-center-left",
          "hover:w-[130px] focus:w-[130px]",
          "cursor-pointer",
          className
        )}
        style={{
          transformOrigin: 'center left',
        }}
      >
        {/* Background hover effect */}
        <div
          className={cn(
            "absolute z-0 inset-0 rounded-lg",
            "w-full h-full",
            "translate-x-full",
            "transition-transform duration-200 ease-in-out",
            "origin-center-right",
            "group-hover:translate-x-0",
            "group-focus:translate-x-0"
          )}
          style={{
            backgroundColor: hoverColor,
            transformOrigin: 'center right',
          }}
        />

        {/* Icon */}
        <div
          className={cn(
            "w-7 h-7 flex-shrink-0",
            "absolute left-[18px]",
            "z-10",
            iconClassName
          )}
        >
          {icon}
        </div>

        {/* Title */}
        <span
          className={cn(
            "block text-center w-full",
            "translate-x-full opacity-0",
            "transition-all duration-200 ease-in-out",
            "origin-center-right",
            "group-hover:translate-x-0 group-hover:opacity-100",
            "group-focus:translate-x-0 group-focus:opacity-100",
            "text-sm font-medium",
            "pl-7"
          )}
          style={{
            transformOrigin: 'center right',
          }}
        >
          {title}
        </span>
      </div>
    </div>
  );
}

// Variante com cores customizadas para diferentes status
interface StatusBadgeProps extends Omit<ExpandableBadgeProps, 'hoverColor'> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'lunna';
}

export function StatusBadge({
  variant = 'default',
  ...props
}: StatusBadgeProps) {
  const variants = {
    default: {
      bg: 'bg-gray-100',
      hover: '#e5e7eb',
      text: 'text-gray-700',
    },
    success: {
      bg: 'bg-green-100',
      hover: '#dcfce7',
      text: 'text-green-700',
    },
    warning: {
      bg: 'bg-yellow-100',
      hover: '#fef3c7',
      text: 'text-yellow-700',
    },
    danger: {
      bg: 'bg-red-100',
      hover: '#fee2e2',
      text: 'text-red-700',
    },
    info: {
      bg: 'bg-blue-100',
      hover: '#dbeafe',
      text: 'text-blue-700',
    },
    lunna: {
      bg: 'bg-[#0095F6]/10',
      hover: 'rgba(0, 149, 246, 0.2)',
      text: 'text-[#0095F6]',
    },
  };

  const colors = variants[variant];

  return (
    <ExpandableBadge
      {...props}
      className={cn(colors.bg, colors.text, props.className)}
      hoverColor={colors.hover}
    />
  );
}
