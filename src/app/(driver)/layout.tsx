'use client';
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted items-center justify-center">
       <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Acesso ao Painel</h1>
        <p className="text-muted-foreground mb-6">
          As verificações de permissão foram desativadas.
        </p>
        <Button asChild size="lg">
          <Link href="/dashboard">
            Ir para o Dashboard de Administração
          </Link>
        </Button>
      </div>
    </div>
  );
}
