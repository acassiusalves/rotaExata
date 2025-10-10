
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
        
        {children}
      </div>
    </SearchContext.Provider>
  );
}
