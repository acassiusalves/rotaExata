import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function Logo({ className, size = 32, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/logo.svg"
        alt="Rota Exata Logo"
        width={size}
        height={size}
        priority
        className="shrink-0"
      />
      {showText && (
        <span className="text-lg font-semibold text-foreground whitespace-nowrap">
          Rota Exata
        </span>
      )}
    </div>
  );
}
