
'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Route,
  History,
  LineChart,
  Settings,
  Code,
  BotMessageSquare,
  ChevronDown,
  Monitor,
  Plus,
  Wand2,
  LogOut,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const pathname = usePathname();
  const { user, userRole, signOut } = useAuth();
  const isDriver = userRole === 'driver';
  const [routesOpen, setRoutesOpen] = useState(pathname.startsWith('/routes'));

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name.substring(0, 2);
  };

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/users', icon: Users, label: 'Usuários' },
    { href: '/drivers', icon: Users, label: 'Motoristas' },
    { href: '/history', icon: History, label: 'Histórico' },
    { href: '/reports', icon: LineChart, label: 'Relatórios' },
  ];

  const routeItems = [
    { href: '/routes', icon: Route, label: 'Rotas Ativas' },
    { href: '/routes/new', icon: Plus, label: 'Nova Rota' },
    { href: '/routes/monitoring', icon: Monitor, label: 'Monitoramento' },
  ];

  const driverNavItems = [
    { href: '/my-routes', icon: Route, label: 'Rotas Ativas' },
    { href: '/my-routes/history', icon: History, label: 'Histórico' },
  ];

  const settingsItems = [
    { href: '/settings', icon: Settings, label: 'Configurações' },
    { href: '/api', icon: Code, label: 'API' },
  ];

  const isActive = (href: string) => {
    if (href === '/' && pathname === '/') return true;
    if (href === '/dashboard' && pathname.startsWith('/dashboard')) return true;
    if (href !== '/' && pathname.startsWith(href)) return true;
    return false;
  };

  if (isDriver) {
    // A simplified sidebar or no sidebar for drivers
    return null;
  }

  return (
    <aside className={cn(
      "hidden md:flex flex-col border-r bg-background transition-all duration-300",
      isOpen ? "w-64" : "w-20"
    )}>
      <div className={cn(
        "flex h-16 items-center border-b px-6",
        !isOpen && "justify-center px-2"
      )}>
        <Link href="/" className="flex items-center gap-2 font-semibold whitespace-nowrap">
          <BotMessageSquare className="h-6 w-6 text-primary" />
          {isOpen && <span>RotaExata</span>}
        </Link>
      </div>

      <nav className={cn("flex-1 overflow-y-auto p-2")}>
        <div className="space-y-1">
          {navItems.map((item) => (
            <TooltipProvider key={item.href} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive(item.href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                      !isOpen && "justify-center"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {isOpen && item.label}
                  </Link>
                </TooltipTrigger>
                {!isOpen && (
                  <TooltipContent side="right">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
        <div className="mt-4 space-y-1">
          <Collapsible open={routesOpen} onOpenChange={setRoutesOpen}>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                   <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start gap-3 px-3 py-2 text-sm font-medium',
                          pathname.startsWith('/routes')
                            ? 'text-primary'
                            : 'text-muted-foreground',
                          !isOpen && 'justify-center'
                        )}
                      >
                        <Route className="h-5 w-5" />
                        {isOpen && (
                          <>
                            <span className="flex-1 text-left">Rotas</span>
                            <ChevronDown
                              className={cn('h-4 w-4 transition-transform', routesOpen && 'rotate-180')}
                            />
                          </>
                        )}
                      </Button>
                    </CollapsibleTrigger>
                </TooltipTrigger>
                 {!isOpen && (
                  <TooltipContent side="right">
                    Rotas
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            
            {isOpen && (
               <CollapsibleContent className="ml-4 space-y-1 border-l pl-4">
                  {routeItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive(item.href)
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  ))}
               </CollapsibleContent>
            )}
          </Collapsible>
        </div>
      </nav>
      {/* Footer / Settings and User profile */}
      <div className={cn("mt-auto border-t p-2", !isOpen && "space-y-2")}>
        {settingsItems.map((item) => (
            <TooltipProvider key={item.href} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive(item.href)
                        ? 'bg-muted'
                        : 'text-muted-foreground hover:bg-muted',
                      !isOpen && "justify-center"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {isOpen && item.label}
                  </Link>
                </TooltipTrigger>
                {!isOpen && (
                  <TooltipContent side="right">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          ))}
      </div>
    </aside>
  );
}
