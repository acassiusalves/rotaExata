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
  ChevronDown,
  Monitor,
  Plus,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
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
  onToggleSidebar: () => void;
}

export function Sidebar({ isOpen, onToggleSidebar }: SidebarProps) {
  const pathname = usePathname();
  const { user, userRole, signOut } = useAuth();
  const isDriver = userRole === 'driver';
  const [routesOpen, setRoutesOpen] = useState(pathname.startsWith('/routes'));
  const [historyOpen, setHistoryOpen] = useState(pathname.startsWith('/history'));

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
    { href: '/reports', icon: LineChart, label: 'Relatórios' },
  ];

  const routeItems = [
    { href: '/routes', icon: Route, label: 'Rotas Ativas' },
    { href: '/routes/new', icon: Plus, label: 'Nova Rota' },
    { href: '/routes/monitoring', icon: Monitor, label: 'Monitoramento' },
  ];

  const historyItems = [
    { href: '/history/motorista', icon: Users, label: 'Histórico Motorista' },
    { href: '/history/rotas', icon: Route, label: 'Histórico Rotas' },
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
    return null;
  }

  return (
    <aside className={cn(
      "hidden md:flex flex-col border-r border-border transition-all duration-300 uber-sidebar uber-scrollbar",
      isOpen ? "w-64" : "w-14"
    )}>
      <div className={cn(
        "flex h-16 items-center border-b border-border px-6 animate-fade-in",
        !isOpen && "justify-center px-2"
      )}>
        <Link href="/" className="transition-all duration-300 hover:scale-105">
          <Logo size={32} showText={isOpen} />
        </Link>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto p-2 uber-scrollbar">
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <TooltipProvider key={item.href} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300',
                      isActive(item.href)
                        ? 'sidebar-link-active shadow-button-primary'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      !isOpen && "justify-center"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {isOpen && <span className="animate-fade-in">{item.label}</span>}
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
          <Collapsible open={routesOpen} onOpenChange={setRoutesOpen}>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                   <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-300',
                          pathname.startsWith('/routes')
                            ? 'text-primary bg-primary/10 hover:bg-primary/20'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          !isOpen && 'justify-center'
                        )}
                      >
                        <Route className="h-5 w-5" />
                        {isOpen && (
                          <>
                            <span className="flex-1 text-left animate-fade-in">Rotas</span>
                            <ChevronDown
                              className={cn('h-4 w-4 transition-transform duration-300', routesOpen && 'rotate-180')}
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
               <CollapsibleContent className="ml-4 space-y-1 border-l border-border/50 pl-4 animate-slide-up">
                  {routeItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300',
                        isActive(item.href)
                          ? 'sidebar-link-active shadow-button-primary'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="animate-fade-in">{item.label}</span>
                    </Link>
                  ))}
               </CollapsibleContent>
            )}
          </Collapsible>

          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                   <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-300',
                          pathname.startsWith('/history')
                            ? 'text-primary bg-primary/10 hover:bg-primary/20'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          !isOpen && 'justify-center'
                        )}
                      >
                        <History className="h-5 w-5" />
                        {isOpen && (
                          <>
                            <span className="flex-1 text-left animate-fade-in">Histórico</span>
                            <ChevronDown
                              className={cn('h-4 w-4 transition-transform duration-300', historyOpen && 'rotate-180')}
                            />
                          </>
                        )}
                      </Button>
                    </CollapsibleTrigger>
                </TooltipTrigger>
                 {!isOpen && (
                  <TooltipContent side="right">
                    Histórico
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {isOpen && (
               <CollapsibleContent className="ml-4 space-y-1 border-l border-border/50 pl-4 animate-slide-up">
                  {historyItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300',
                        isActive(item.href)
                          ? 'sidebar-link-active shadow-button-primary'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="animate-fade-in">{item.label}</span>
                    </Link>
                  ))}
               </CollapsibleContent>
            )}
          </Collapsible>
        </nav>
        
        {/* Spacer to push items below to the bottom */}
        <div className="mt-auto" />

        {/* Bottom items */}
        <div className={cn("space-y-1 border-t pt-2", !isOpen && "space-y-2")}>
          {settingsItems.map((item) => (
              <TooltipProvider key={item.href} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300',
                        isActive(item.href)
                          ? 'sidebar-link-active shadow-button-primary'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        !isOpen && "justify-center"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {isOpen && <span className="animate-fade-in">{item.label}</span>}
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
            
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                  <TooltipTrigger asChild>
                      <button
                          onClick={onToggleSidebar}
                          className={cn(
                              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                              !isOpen && "justify-center"
                          )}
                      >
                          {isOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                          {isOpen && <span className="animate-fade-in">{isOpen ? 'Minimizar Menu' : 'Expandir Menu'}</span>}
                      </button>
                  </TooltipTrigger>
                  {!isOpen && (
                      <TooltipContent side="right">
                          {isOpen ? 'Minimizar Menu' : 'Expandir Menu'}
                      </TooltipContent>
                  )}
              </Tooltip>
          </TooltipProvider>
          
          {user && (
            <DropdownMenu>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <div className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer',
                        !isOpen && "justify-center"
                      )}>
                        <Avatar className="h-8 w-8 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/50">
                          <AvatarImage src={user.photoURL ?? undefined} />
                          <AvatarFallback className="bg-primary/20 text-primary">{getInitials(user.displayName || user.email)}</AvatarFallback>
                        </Avatar>
                        {isOpen && (
                          <div className="flex-1 truncate animate-fade-in">
                            <p className="font-semibold text-foreground truncate">{user.displayName || user.email}</p>
                          </div>
                        )}
                      </div>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  {!isOpen && (
                    <TooltipContent side="right">
                      {user.displayName || user.email}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent side="right" align="end" className="w-56 mb-2">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.displayName || 'Usuário'}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </aside>
  );
}
