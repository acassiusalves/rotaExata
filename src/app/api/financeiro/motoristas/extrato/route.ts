import { postSupportStatement } from '@/lib/server/earnings/support-statement';

export const runtime = 'nodejs';

export function POST(request: Request) {
  return postSupportStatement(request);
}
