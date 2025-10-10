
'use client';

import Link from 'next/link';
import {
  Home,
  LineChart,
  Package,
  Search,
  Users,
  BotMessageSquare,
  Route,
  ChevronDown,
  Code,
  History,
  LogOut,
  Settings,
  LayoutDashboard,
  Smartphone,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';


interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Header({ sidebarOpen, onToggleSidebar }: HeaderProps) {
  const pathname = usePathname();
  const { user, userRole, signOut } = useAuth();
  const isDriver = userRole === 'driver';

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/users', icon: Users, label: 'Usuários' },
    { href: '/drivers', icon: Users, label: 'Motoristas' },
    { href: '/history', icon: History, label: 'Histórico' },
    { href: '/reports', icon: LineChart, label: 'Relatórios' },
  ];

  const driverNavItems = [
    { href: '/my-routes', icon: Route, label: 'Rotas Ativas' },
    { href: '/my-routes/history', icon: History, label: 'Histórico' },
  ];

  const isActive = (href: string) => {
    // Special case for root for driver
    if (href === '/my-routes' && pathname === '/my-routes') return true;
    if (href === '/dashboard' && pathname === '/dashboard') return true;

    // For other routes, check if the pathname starts with the href
    // This handles nested routes like /routes/new or /my-routes/history correctly
    return href !== '/' && pathname.startsWith(href);
  };
  
  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name.substring(0, 2);
  };


  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b bg-background px-4 md:px-6">
      {/* Sidebar toggle button for desktop */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        className="hidden md:flex h-8 w-8"
        title={sidebarOpen ? 'Ocultar menu' : 'Mostrar menu'}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="h-4 w-4" />
        ) : (
          <PanelLeftOpen className="h-4 w-4" />
        )}
      </Button>
      {/* Mobile menu button */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="shrink-0 md:hidden">
            <BotMessageSquare className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu de navegação</SheetTitle>
            <SheetDescription>Selecione uma seção do painel.</SheetDescription>
          </SheetHeader>
          <nav className="grid gap-6 text-lg font-medium">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <BotMessageSquare className="h-6 w-6 text-primary" />
              <span className="sr-only">RotaExata</span>
            </Link>
             {!isDriver ? (
              <>
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn('hover:text-foreground', {
                      'text-muted-foreground': !isActive(item.href),
                    })}
                  >
                    {item.label}
                  </Link>
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(
                      'flex items-center gap-1 text-lg font-medium hover:text-foreground',
                      {
                        'text-muted-foreground': !isActive('/routes'),
                      }
                    )}
                  >
                    Rotas
                    <ChevronDown className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem asChild>
                      <Link href="/routes">Ver Rotas</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/routes/monitoring">Monitoramento</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/routes/new">Nova Rota</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
                <>
                {driverNavItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                        'flex items-center gap-4 hover:text-foreground',
                        isActive(item.href) ? 'text-foreground' : 'text-muted-foreground'
                        )}
                    >
                        <item.icon className="h-5 w-5" />
                        {item.label}
                    </Link>
                ))}
                </>
            )}
          </nav>
        </SheetContent>
      </Sheet>
      {/* Page title for desktop */}
      <div className="hidden md:block">
        <h1 className="text-lg font-semibold">
          {pathname === '/dashboard' && 'Dashboard'}
          {pathname === '/users' && 'Usuários'}
          {pathname === '/drivers' && 'Motoristas'}
          {pathname === '/history' && 'Histórico'}
          {pathname === '/reports' && 'Relatórios'}
          {pathname === '/settings' && 'Configurações'}
          {pathname === '/api' && 'API'}
          {pathname === '/routes' && 'Rotas Ativas'}
          {pathname === '/routes/new' && 'Criar Nova Rota'}
          {pathname === '/routes/organize' && 'Organizar Rota'}
          {pathname === '/routes/monitoring' && 'Monitoramento'}
          {pathname === '/my-routes' && 'Minhas Rotas'}
          {pathname === '/my-routes/history' && 'Histórico de Rotas'}
        </h1>
      </div>
      <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
        {/* Hide search bar on organize page to save space */}
        {pathname !== '/routes/organize' && (
          <form className="ml-auto flex-1 sm:flex-initial">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar..."
                className="pl-8 sm:w-[300px] md:w-[200px] lg:w-[300px]"
              />
            </div>
          </form>
        )}
        {pathname === '/routes/organize' && <div className="ml-auto" />}
      </div>
    </header>
  );
}
