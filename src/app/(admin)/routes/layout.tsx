'use client';

import { useState, type ReactNode } from 'react';
import { RouteSearchContext } from '@/components/routes/route-search-context';

export default function RoutesLayout({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <RouteSearchContext.Provider value={{ searchQuery, setSearchQuery }}>
      <div className="flex-1 space-y-4">{children}</div>
    </RouteSearchContext.Provider>
  );
}
