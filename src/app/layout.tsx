
import type { Metadata } from 'next';
import './globals.css';
// import { Toaster } from '@/components/ui/toaster'; // Removido daqui
import { AuthProviderWrapper } from '@/components/providers/auth-provider-wrapper';
import React from 'react';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker-registration';

export const metadata: Metadata = {
  title: 'RotaExata - Gestão de Entregas',
  description: 'Sistema de gestão de entregas para administradores e motoristas.',
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
        <meta name="theme-color" content="#2962FF" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png"></link>
      </head>
      <body className="font-body antialiased">
        <AuthProviderWrapper>
          {children}
        </AuthProviderWrapper>
        {/* <Toaster /> Foi movido para o AuthProvider */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
