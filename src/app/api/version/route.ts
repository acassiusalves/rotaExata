import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || 'development';
  const runtimeRevision = process.env.K_REVISION || null;
  const runtimeService = process.env.K_SERVICE || null;
  const runtimeConfiguration = process.env.K_CONFIGURATION || null;

  return NextResponse.json(
    {
      buildId,
      runtimeRevision,
      runtimeService,
      runtimeConfiguration,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
