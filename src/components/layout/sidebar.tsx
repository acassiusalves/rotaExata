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
    { href: '/routes/organize', icon: Wand2, label: 'Organizar Rota' },
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
    if (href === '/my-routes' && pathname === '/my-routes') return true;
    if (href === '/dashboard' && pathname === '/dashboard') return true;
    if (href === '/routes' && pathname === '/routes') return true;
    return href !== '/' && pathname.startsWith(href);
  };

  if (isDriver) {
    return (
      <aside className={cn(
        "hidden md:flex flex-col border-r bg-background transition-all duration-300",
        isOpen ? "w-64" : "w-0 border-r-0"
      )}>
        <div className={cn(
          "flex h-12 items-center border-b px-6 overflow-hidden",
          !isOpen && "opacity-0"
        )}>
          <Link href="/" className="flex items-center gap-2 font-semibold whitespace-nowrap">
            <BotMessageSquare className="h-6 w-6 text-primary" />
            <span>RotaExata</span>
          </Link>
        </div>
        <nav className={cn(
          "flex-1 overflow-y-auto p-4 overflow-hidden",
          !isOpen && "opacity-0"
        )}>
          <div className="space-y-1">
            {driverNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        {/* User Profile Footer */}
        <div className={cn(
          "border-t p-4 overflow-hidden",
          !isOpen && "opacity-0"
        )}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 px-3 py-2 h-auto">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.photoURL ?? undefined} />
                  <AvatarFallback>{getInitials(user?.displayName || user?.email)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start overflow-hidden">
                  <p className="text-sm font-medium truncate w-full">{user?.displayName || 'Motorista'}</p>
                  <p className="text-xs text-muted-foreground truncate w-full">{user?.email}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    );
  }

  return (
    <aside className={cn(
      "hidden md:flex flex-col border-r bg-background transition-all duration-300",
      isOpen ? "w-64" : "w-0 border-r-0"
    )}>
      <div className={cn(
        "flex h-12 items-center border-b px-6 overflow-hidden",
        !isOpen && "opacity-0"
      )}>
        <Link href="/" className="flex items-center gap-2 font-semibold whitespace-nowrap">
          <BotMessageSquare className="h-6 w-6 text-primary" />
          <span>RotaExata</span>
        </Link>
      </div>
      <nav className={cn(
        "flex-1 overflow-y-auto p-4 overflow-hidden",
        !isOpen && "opacity-0"
      )}>
        <div className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}

          {/* Routes Collapsible */}
          <Collapsible open={routesOpen} onOpenChange={setRoutesOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'w-full justify-start gap-3 px-3 py-2 text-sm font-medium',
                  pathname.startsWith('/routes')
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Route className="h-4 w-4" />
                <span className="flex-1 text-left">Rotas</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    routesOpen && 'rotate-180'
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-6 mt-1 space-y-1">
              {routeItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Settings Section */}
        <div className="mt-auto pt-4 space-y-1">
          {settingsItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      {/* User Profile Footer */}
      <div className={cn(
        "border-t p-4 overflow-hidden",
        !isOpen && "opacity-0"
      )}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 px-3 py-2 h-auto">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.photoURL ?? undefined} />
                <AvatarFallback>{getInitials(user?.displayName || user?.email)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start overflow-hidden">
                <p className="text-sm font-medium truncate w-full">{user?.displayName || 'Usuário'}</p>
                <p className="text-xs text-muted-foreground truncate w-full">{user?.email}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sair</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
