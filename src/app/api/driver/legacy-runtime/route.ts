import { serveDriverRuntime } from '@/lib/server/driver/runtime';
export const runtime='nodejs';
export function GET(request:Request) { return serveDriverRuntime(request,'legacy'); }
export function POST(request:Request) { return serveDriverRuntime(request,'legacy'); }
