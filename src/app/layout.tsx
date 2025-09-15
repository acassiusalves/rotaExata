
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { MainLayout } from '@/components/layout/main-layout';
import { AuthProvider } from '@/hooks/use-auth';
import React from 'react';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker-registration';

export const metadata: Metadata = {
  title: 'RotaExata - Gestão de Entregas',
  description: 'Sistema de gestão de entregas para administradores.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#224F33" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
            <MainLayout>{children}</MainLayout>
        </AuthProvider>
        <Toaster />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
