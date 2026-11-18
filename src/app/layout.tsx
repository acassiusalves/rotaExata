
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
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/pwa-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/pwa-512.png" />

        {/* PWA Meta Tags */}
        <meta name="theme-color" content="#2962FF" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="RotaExata" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="144x144" href="/icons/icon-144x144.png" />
      </head>
      <body className="font-sans antialiased transition-colors duration-300">
        <AuthProviderWrapper>
          {children}
        </AuthProviderWrapper>
        {/* <Toaster /> Foi movido para o AuthProvider */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
