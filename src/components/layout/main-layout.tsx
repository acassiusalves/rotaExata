
'use client';
import { Header } from '@/components/layout/header';
import { usePathname } from 'next/navigation';
import React from 'react';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Special layout for new route page
  const isFullHeightPage = ['/routes/new', '/routes/organize'].includes(pathname) || pathname.startsWith('/routes/map/');


  if (isFullHeightPage) {
     return (
      <div className="flex h-[100dvh] min-h-0 w-full flex-col">
        {/* Do not render header on map page */}
        {!pathname.startsWith('/routes/map/') && <Header />}
        <main className="flex-1 min-h-0 overflow-auto md:overflow-hidden">{children}</main>
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 bg-muted/40 p-4 md:gap-8 md:p-8">
        {children}
      </main>
    </div>
  );
}
