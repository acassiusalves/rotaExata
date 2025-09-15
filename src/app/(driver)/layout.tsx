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
        {children}
    </MainLayout>
  );
}
