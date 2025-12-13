import { NextRequest, NextResponse } from "next/server";
import { getGoogleMapsApiKey, verifyAuthToken, hasAllowedRole } from '@/lib/firebase/admin';
import { rateLimit, rateLimitConfigs, getClientIP, rateLimitHeaders } from '@/lib/rate-limit';

const ALLOWED_ROLES = ['admin', 'gestor', 'socio'];

export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    const rateLimitResult = rateLimit(clientIP, rateLimitConfigs.authenticated);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED", detail: "Muitas requisições. Tente novamente em alguns segundos." },
        { status: 429, headers: rateLimitHeaders(rateLimitResult) }
      );
    }

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    const user = await verifyAuthToken(authHeader);

    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", detail: "Token de autenticação inválido ou ausente" },
        { status: 401 }
      );
    }

    // Verificar se tem permissão
    if (!hasAllowedRole(user.role, ALLOWED_ROLES)) {
      return NextResponse.json(
        { error: "FORBIDDEN", detail: "Você não tem permissão para acessar este recurso" },
        { status: 403 }
      );
    }

    const apiKey = await getGoogleMapsApiKey();

    if (!apiKey) {
      return NextResponse.json({ key: null }, { status: 200 });
    }

    return NextResponse.json({ key: apiKey }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch API key";
    console.error('Failed to fetch API key:', error);
    return NextResponse.json(
      { error: "SERVER_ERROR", detail: errorMessage },
      { status: 500 }
    );
  }
}
