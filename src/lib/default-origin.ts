import type { PlaceValue } from '@/lib/types';

/**
 * Origem de último recurso, usada só quando não há nada em settings/defaultOrigin.
 *
 * Verificada contra a API do Google em 31/08/2026: o place ID resolve e o endereço
 * textual geocodifica para estas mesmas coordenadas (precisão ROOFTOP).
 *
 * NÃO duplique este literal. Antes desta constante existir havia 12 cópias dele no
 * repositório, com coordenadas que não correspondiam ao próprio endereço ao lado,
 * e quatro scripts chamados fix-*origins* que "corrigiram" os dados para o valor errado.
 * Para trocar a loja, edite settings/defaultOrigin pela tela de Configurações.
 */
export const FALLBACK_ORIGIN: PlaceValue = {
  id: 'default-origin-sol-de-maria',
  customerName: 'Sol de Maria',
  address: 'Av. Circular, 1028 - Qd.50 - Lt.08 - St. Pedro Ludovico, Goiânia - GO, 74823-020',
  placeId: 'ChIJ1V3toTXyXpMR-1qQO17BY8c',
  lat: -16.7123299,
  lng: -49.2511399,
  phone: '',
};

/** Uma origem só serve se tiver coordenadas numéricas e diferentes de zero (0,0 é o Atlântico). */
export function isValidOrigin(o: PlaceValue | undefined | null): boolean {
  return !!(
    o &&
    typeof o.lat === 'number' &&
    typeof o.lng === 'number' &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng) &&
    o.lat !== 0 &&
    o.lng !== 0
  );
}
