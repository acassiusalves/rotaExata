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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function Header() {
  const pathname = usePathname();
  const navItems = [
    { href: '/', icon: Home, label: 'Dashboard' },
    { href: '/orders', icon: Package, label: 'Pedidos' },
    { href: '/drivers', icon: Users, label: 'Motoristas' },
    // { href: '/routes', icon: Route, label: 'Rotas' }, // Will be handled separately as a dropdown
    { href: '/reports', icon: LineChart, label: 'Relatórios' },
  ];

  const isActive = (href: string) => {
    // Make parent 'Rotas' active if on any sub-route
    if (href.startsWith('/routes')) {
      return pathname.startsWith('/routes');
    }
    return pathname === href;
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold md:text-base"
        >
          <BotMessageSquare className="h-6 w-6 text-primary" />
          <span className="sr-only">RotaExata</span>
        </Link>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'transition-colors hover:text-foreground',
              isActive(item.href)
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground'
            )}
          >
            {item.label}
          </Link>
        ))}
        {/* Routes Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'gap-1 px-3 py-2 transition-colors hover:text-foreground md:flex',
                isActive('/routes')
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground'
              )}
            >
              <Route className="h-4 w-4" />
              Rotas
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem asChild>
              <Link href="/routes/new">Criar Nova Rota</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="shrink-0 md:hidden">
            <BotMessageSquare className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <nav className="grid gap-6 text-lg font-medium">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <BotMessageSquare className="h-6 w-6 text-primary" />
              <span className="sr-only">RotaExata</span>
            </Link>
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
             <Link
                href="/routes"
                className={cn('hover:text-foreground', {
                  'text-muted-foreground': !isActive('/routes'),
                })}
              >
                Rotas
              </Link>
          </nav>
        </SheetContent>
      </Sheet>
      <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
        <form className="ml-auto flex-1 sm:flex-initial">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar pedidos..."
              className="pl-8 sm:w-[300px] md:w-[200px] lg:w-[300px]"
            />
          </div>
        </form>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="rounded-full">
              <Image
                src="https://picsum.photos/seed/admin/36/36"
                width={36}
                height={36}
                alt="Avatar"
                className="rounded-full"
                data-ai-hint="person portrait"
              />
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Configurações</Link>
            </DropdownMenuItem>
            <DropdownMenuItem>Suporte</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Sair</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
