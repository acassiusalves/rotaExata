'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import {
  Route,
  History,
  User,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
} from 'lucide-react';

interface NavigationItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const navigationItems: NavigationItem[] = [
  { href: '/my-routes', icon: Route, label: 'Minhas Rotas Ativas' },
  { href: '/my-routes/history', icon: History, label: 'Histórico de Entregas' },
  { href: '/driver/profile', icon: User, label: 'Perfil do Motorista' },
  { href: '/driver/settings', icon: Settings, label: 'Configurações' },
  { href: '/driver/help', icon: HelpCircle, label: 'Ajuda & Suporte' },
];

export function DriverNavigationDrawer() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name.substring(0, 2);
  };

  const isActive = (href: string) => {
    if (href === '/my-routes' && pathname === '/my-routes') return true;
    return href !== '/my-routes' && pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  const handleNavigation = (href: string) => {
    router.push(href);
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0">
          <Image src="/logo.svg" alt="RotaExata" width={20} height={20} />
          <span className="sr-only">Abrir menu de navegação</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-4/5 max-w-[320px] p-4">
        <SheetHeader>
          <VisuallyHidden>
            <SheetTitle>Menu de Navegação</SheetTitle>
          </VisuallyHidden>
        </SheetHeader>
        {/* Profile Section */}
        <div className="flex flex-col items-start gap-4 p-2 mb-4">
          <Avatar className="w-16 h-16 border-2 border-primary/50">
            <AvatarImage src={user?.photoURL ?? undefined} />
            <AvatarFallback className="text-lg font-bold">
              {getInitials(user?.displayName || user?.email)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-bold leading-tight tracking-tight">
              {user?.displayName || 'Motorista'}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <p className="text-sm font-medium leading-tight text-muted-foreground">
                Online
              </p>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <ul className="flex flex-1 flex-col gap-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.href}>
                <button
                  onClick={() => handleNavigation(item.href)}
                  className={cn(
                    'flex w-full h-12 items-center gap-4 rounded-lg px-3 transition-colors duration-200',
                    active
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className={cn('h-5 w-5', active && 'fill-primary')} />
                  <p className="text-base font-semibold leading-tight truncate">
                    {item.label}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Footer Section */}
        <div className="pt-4 mt-auto">
          <div className="h-px bg-border mb-4"></div>
          <ul className="flex flex-col gap-2">
            <li>
              <button
                onClick={handleSignOut}
                className="flex w-full h-12 items-center gap-4 rounded-lg px-3 text-red-500 hover:bg-red-500/10 transition-colors duration-200"
              >
                <LogOut className="h-5 w-5" />
                <p className="text-base font-medium leading-tight truncate">Sair</p>
              </button>
            </li>
          </ul>
          <p className="text-muted-foreground text-xs font-normal text-center leading-normal pt-4">
            Versão do aplicativo v1.2.3
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
