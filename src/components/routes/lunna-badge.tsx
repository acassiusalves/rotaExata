import { Moon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface LunnaBadgeProps {
  className?: string;
}

export function LunnaBadge({ className }: LunnaBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={`gap-1 bg-[#0095F6]/10 text-[#0095F6] hover:bg-[#0095F6]/20 border-[#0095F6]/20 ${className || ''}`}
    >
      <Moon className="h-3 w-3 fill-[#0095F6]" />
      <span className="font-semibold">Lunna</span>
    </Badge>
  );
}
