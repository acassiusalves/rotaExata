'use client';
import React from 'react';
import { Header } from '@/components/layout/header';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  return (
    <div className="flex min-h-screen w-full flex-col">
      {/* O Header é compartilhado, mas o conteúdo principal é diferente */}
      <Header />
      <main className="flex-1 bg-muted/40">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
