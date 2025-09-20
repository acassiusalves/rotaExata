
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

const tabs = [
  { name: 'Rotas Ativas', href: '/routes' },
  { name: 'Monitoramento', href: '/routes/monitoring' },
];

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
         <div>
            <h2 className="text-3xl font-bold tracking-tight">Rotas</h2>
            <p className="text-muted-foreground">
              Gerencie, monitore e crie suas rotas.
            </p>
          </div>
        <div className="flex items-center gap-2">
            <Tabs value={pathname}>
              <TabsList>
                {tabs.map((tab) => (
                  <Link key={tab.href} href={tab.href} passHref>
                    <TabsTrigger value={tab.href} asChild>
                      <a>{tab.name}</a>
                    </TabsTrigger>
                  </Link>
                ))}
              </TabsList>
            </Tabs>
             <Button asChild>
              <Link href="/routes/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Criar Nova Rota
              </Link>
            </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
