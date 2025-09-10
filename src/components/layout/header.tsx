'use client';

import Link from 'next/link';
import {
  Home,
  LineChart,
  Package,
  PanelLeft,
  Search,
  Users,
  Settings,
  BotMessageSquare
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

export function Header() {
  const pathname = usePathname();
  const pageTitle = useMemo(() => {
    if (pathname === '/') return 'Dashboard';
    if (pathname.startsWith('/orders')) return 'Pedidos';
    if (pathname.startsWith('/drivers')) return 'Motoristas';
    if (pathname.startsWith('/reports')) return 'Relatórios';
    if (pathname.startsWith('/settings')) return 'Configurações';
    return 'RotaExata';
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="sm:hidden">
            <PanelLeft className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs">
          <nav className="grid gap-6 text-lg font-medium">
            <Link
              href="/"
              className="group flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:text-base"
            >
              <BotMessageSquare className="h-5 w-5 transition-all group-hover:scale-110" />
              <span className="sr-only">RotaExata</span>
            </Link>
            <Link href="/" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
              <Home className="h-5 w-5" />
              Dashboard
            </Link>
            <Link href="/orders" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
              <Package className="h-5 w-5" />
              Pedidos
            </Link>
            <Link href="/drivers" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
              <Users className="h-5 w-5" />
              Motoristas
            </Link>
            <Link href="/reports" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
              <LineChart className="h-5 w-5" />
              Relatórios
            </Link>
            <Link href="/settings" className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground">
              <Settings className="h-5 w-5" />
              Configurações
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
      <Breadcrumb className="hidden md:flex">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">RotaExata</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="relative ml-auto flex-1 md:grow-0">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar..."
          className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[336px]"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="overflow-hidden rounded-full"
          >
            <Image
              src="https://picsum.photos/seed/admin/36/36"
              width={36}
              height={36}
              alt="Avatar"
              className="overflow-hidden rounded-full"
              data-ai-hint="person portrait"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Perfil</DropdownMenuItem>
          <DropdownMenuItem>Suporte</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
