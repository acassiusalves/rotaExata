'use client';
import React from 'react';
import { MainLayout } from '@/components/layout/main-layout';


export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  return (
    <MainLayout>
        <div className="max-w-md mx-auto w-full">{children}</div>
    </MainLayout>
  );
}
