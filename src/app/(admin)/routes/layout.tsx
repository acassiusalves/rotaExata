
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlusCircle, Search, X } from 'lucide-react';

const tabs = [
  { name: 'Rotas Ativas', href: '/routes' },
  { name: 'Monitoramento', href: '/routes/monitoring' },
];

// Create search context
type SearchContextType = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
};

const SearchContext = React.createContext<SearchContextType>({
  searchQuery: '',
  setSearchQuery: () => {},
});

export const useRouteSearch = () => React.useContext(SearchContext);

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = React.useState('');

  return (
    <SearchContext.Provider value={{ searchQuery, setSearchQuery }}>
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
                    <TabsTrigger key={tab.href} value={tab.href} asChild>
                      <Link href={tab.href}>{tab.name}</Link>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Search Box */}
              <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar ponto (nome, endereço, telefone, pedido...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 h-10"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

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
    </SearchContext.Provider>
  );
}
