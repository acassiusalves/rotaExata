import { serveDriverOnboarding } from '@/lib/server/driver/onboarding';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=serveDriverOnboarding;
export const POST=serveDriverOnboarding;
