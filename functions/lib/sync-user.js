"use strict";
/**
 * Regra do `syncAuthUsers`.
 *
 * Sincronizar existe para REPARAR um cadastro que ficou faltando no Firestore
 * (conta existe no Auth, documento em `users` nao). Nao e uma ferramenta de
 * mudanca de papel -- isso e a tela de Permissoes.
 *
 * A versao anterior gravava `role:'vendedor'` (ou 'admin' para um e-mail
 * especifico) em QUALQUER e-mail passado, sem checar quem chamava. Bastava
 * chamar com o e-mail de um administrador para derruba-lo -- e, como Rota e
 * Luna compartilham a colecao `users` e um unico campo `role`, derruba-lo nos
 * dois sistemas. Ela tambem gravava `displayName: authDisplayName || ''`, o
 * que APAGAVA o nome de quem nao tinha displayName no Auth.
 *
 * Agora o patch so acrescenta o que falta e nunca reescreve o que ja existe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSyncPatch = buildSyncPatch;
/** E-mail que recebe 'admin' quando o cadastro esta sendo criado do zero. */
const EMAIL_DO_DONO = "acassiusalves@gmail.com";
/** Papel atribuido a um cadastro novo que nao seja o do dono. */
const PAPEL_PADRAO = "vendedor";
function buildSyncPatch(input) {
    const patch = {};
    // Papel so e definido quando ainda nao ha nenhum. Quem ja tem papel fica
    // como esta -- foi exatamente essa reescrita que rebaixava administradores.
    if (!input.currentRole) {
        patch.role = input.email === EMAIL_DO_DONO ? "admin" : PAPEL_PADRAO;
    }
    // Nome so e preenchido quando falta. Nunca sobrescreve, e nunca apaga com "".
    if (!input.currentDisplayName && input.authDisplayName) {
        patch.displayName = input.authDisplayName;
    }
    return patch;
}
//# sourceMappingURL=sync-user.js.map