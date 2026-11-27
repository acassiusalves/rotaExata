type Factor = { id: string; factor_type: string; status: string };
type MfaAuthority = {
  getAuthenticatorAssuranceLevel: () => Promise<{ data: { currentLevel: string | null; nextLevel: string | null } | null; error: unknown }>;
  listFactors: () => Promise<{ data: { all: Factor[] } | null; error: unknown }>;
};
export type EarningsFactor = { id: string; kind: 'totp' | 'phone' | 'webauthn' };

export async function requiredEarningsFactors(authority: MfaAuthority): Promise<EarningsFactor[]> {
  const assurance = await authority.getAuthenticatorAssuranceLevel();
  if (assurance.error || !assurance.data?.currentLevel) throw new Error('Sessão indisponível');
  if (assurance.data.currentLevel==='aal2' || assurance.data.nextLevel!=='aal2') return [];
  const factors = await authority.listFactors();
  if (factors.error || !factors.data) throw new Error('Verificação em duas etapas indisponível');
  const verified: EarningsFactor[] = [];
  for (const factor of factors.data.all) {
    const kind = factor.factor_type;
    if (factor.status==='verified' && (kind==='totp' || kind==='phone' || kind==='webauthn')) {
      verified.push({id:factor.id,kind});
    }
  }
  if (!verified.length) throw new Error('Nenhum fator de verificação disponível');
  return verified;
}
