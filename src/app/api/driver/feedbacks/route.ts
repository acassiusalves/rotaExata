import { serveReportSubmission } from '@/lib/reporting/submit-report';
export function POST(request:Request) { return serveReportSubmission(request,'native'); }
