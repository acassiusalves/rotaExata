/**
 * Guarda do `inviteUser`.
 *
 * Rota e Luna compartilham o mesmo projeto Firebase: a mesma colecao `users` e
 * UM UNICO campo `role` por pessoa. Convidar alguem cujo e-mail ja existe no
 * Auth nao cria um cadastro novo -- reescreve o cadastro que ja estava la.
 *
 * Em 09/09/2026 um administrador digitou o proprio e-mail no cadastro de
 * motorista. O convite achou a conta dele, gravou role:'driver' por cima e
 * derrubou o acesso dele aos DOIS sistemas de uma vez.
 *
 * Por isso convite so serve para e-mail livre. Mudanca de papel de quem ja
 * existe e feita na tela de Permissoes, que e explicita sobre o que altera.
 */

export type InviteConflict =
  | {blocked: false}
  | {blocked: true; message: string};

export type InviteConflictInput = {
  /** E-mail digitado no convite, ja normalizado. */
  email: string;
  /** Papel que o convite quer aplicar. */
  requestedRole: string;
  /** `true` quando `auth.getUserByEmail` encontrou uma conta. */
  authUserExists: boolean;
  /** Papel atual em `users/{uid}`, se o documento existir. */
  existingRole: string | undefined;
};

export function checkInviteConflict(
  input: InviteConflictInput
): InviteConflict {
  if (!input.authUserExists) {
    return {blocked: false};
  }

  const alvo = input.existingRole ?
    `Este e-mail ja pertence a um usuario do sistema ` +
      `(papel atual: "${input.existingRole}")` :
    "Este e-mail ja pertence a uma conta do sistema";

  return {
    blocked: true,
    message:
      `${alvo}: ${input.email}. Nenhum cadastro foi alterado. ` +
      "Para cadastrar um motorista, use um e-mail que ainda nao esteja em uso; " +
      "para mudar o papel de quem ja existe, use a tela de Permissoes.",
  };
}
