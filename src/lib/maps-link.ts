/**
 * Extração de coordenadas de URLs do Google Maps.
 *
 * Ordem de preferência importa: `!3d<lat>!4d<lng>` é a coordenada do local em si,
 * enquanto `@<lat>,<lng>` é apenas o centro da câmera do mapa. Nos links de place
 * elas costumam coincidir, mas quando divergem a do local é a correta.
 *
 * Links curtos (maps.app.goo.gl) não carregam coordenada nenhuma — precisam ser
 * expandidos antes, o que exige servidor. Use isShortMapsLink para detectá-los.
 */

const PADROES: RegExp[] = [
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,                        // coordenada do local
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,                            // centro do mapa
  /[?&](?:q|ll|center|daddr)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,   // parâmetros de query
];

export function extractCoordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  if (!url || typeof url !== 'string') return null;

  for (const padrao of PADROES) {
    const m = url.match(padrao);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lat === 0 && lng === 0) continue;
    return { lat, lng };
  }
  return null;
}

/** Links encurtados do Maps não contêm coordenadas — só o destino do redirect tem. */
export function isShortMapsLink(url: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(url.trim());
}
