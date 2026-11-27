'use client';

import { createContext, useContext } from 'react';

type RouteSearch = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
};

export const RouteSearchContext = createContext<RouteSearch>({
  searchQuery: '',
  setSearchQuery: () => {},
});

export const useRouteSearch = () => useContext(RouteSearchContext);
