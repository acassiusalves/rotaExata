import { execSync } from 'node:child_process';
import type {NextConfig} from 'next';
import withPWA from 'next-pwa';

function getGitCommitSha() {
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function normalizeBuildId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return /^[0-9a-f]{40}$/i.test(trimmed) ? trimmed.slice(0, 12) : trimmed;
}

function resolveBuildId() {
  const explicitBuildId =
    process.env.BUILD_ID_OVERRIDE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    getGitCommitSha();

  const normalizedBuildId = normalizeBuildId(explicitBuildId);

  if (normalizedBuildId) {
    return normalizedBuildId;
  }

  if (process.env.NODE_ENV === 'production') {
    return new Date().toISOString();
  }

  return 'development';
}

const buildId = resolveBuildId();

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
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
