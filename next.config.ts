
import type {NextConfig} from 'next';
import withPWA from 'next-pwa';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

// Configuração do PWA - desabilitado temporariamente para debug
// O Service Worker está causando problema com Firebase (client offline)
const pwaConfig = withPWA({
  dest: 'public',
  register: false,
  skipWaiting: true,
  clientsClaim: true,
  // TEMPORÁRIO: Desabilitar PWA até resolver conflito com Firebase
  disable: process.env.NODE_ENV === 'development' || process.env.VERCEL === '1',
  sw: 'sw.js',
  reloadOnOnline: true,
  fallbacks: {
    document: '/offline.html',
  },
  buildExcludes: [/middleware-manifest\.json$/],
  publicExcludes: ['!firebase-messaging-sw.js'],
});

export default pwaConfig(nextConfig);
