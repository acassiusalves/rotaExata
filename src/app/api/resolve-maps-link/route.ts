import { NextRequest, NextResponse } from 'next/server';
import { extractCoordsFromMapsUrl, isShortMapsLink } from '@/lib/maps-link';

/** Só seguimos redirect para domínios do próprio Google — evita usar a rota como proxy aberto. */
const DOMINIOS_PERMITIDOS = /^https?:\/\/([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl)\//i;

export async function POST(req: NextRequest) {
  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Informe o link do Google Maps.' }, { status: 400 });
  }
  if (!DOMINIOS_PERMITIDOS.test(url.trim())) {
    return NextResponse.json(
      { error: 'Só aceitamos links do Google Maps (google.com/maps ou maps.app.goo.gl).' },
      { status: 400 },
    );
  }

  // Link longo já traz a coordenada: nem precisa de rede.
  const direto = extractCoordsFromMapsUrl(url);
  if (direto) return NextResponse.json({ ...direto, expandedUrl: url });

  if (!isShortMapsLink(url)) {
    return NextResponse.json(
      { error: 'Não encontrei coordenadas neste link. Abra o local no Google Maps e copie o link novamente.' },
      { status: 400 },
    );
  }

  try {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 8000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controle.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RotaExata/1.0)' },
    });
    clearTimeout(limite);

    const expandida = res.url;
    const coords = extractCoordsFromMapsUrl(expandida);
    if (!coords) {
      return NextResponse.json(
        { error: 'O link abriu, mas não encontrei coordenadas nele. Copie o link direto do local no Google Maps.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ...coords, expandedUrl: expandida });
  } catch (erro) {
    const abortado = erro instanceof Error && erro.name === 'AbortError';
    console.error('[resolve-maps-link] falha ao expandir:', erro);
    return NextResponse.json(
      { error: abortado ? 'O Google demorou demais para responder. Tente de novo.' : 'Não consegui abrir o link.' },
      { status: 400 },
    );
  }
}
