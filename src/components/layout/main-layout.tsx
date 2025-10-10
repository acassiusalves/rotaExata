
'use client';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Special layout for new route page and map page
  const isFullHeightPage = ['/routes/new', '/routes/organize'].includes(pathname) || pathname.startsWith('/routes/map/');

  if (isFullHeightPage) {
     return (
      <div className="flex h-[100dvh] min-h-0 w-full">
        {/* Sidebar on the left for full-height pages (except map) */}
        {!pathname.startsWith('/routes/map/') && <Sidebar isOpen={sidebarOpen} />}
        <div className="flex flex-1 flex-col min-h-0">
          <main className="flex-1 min-h-0 overflow-auto md:overflow-hidden">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar isOpen={sidebarOpen} />
      <div className="flex flex-1 flex-col">
        <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex flex-1 flex-col gap-4 bg-muted/40 p-4 md:gap-8 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
