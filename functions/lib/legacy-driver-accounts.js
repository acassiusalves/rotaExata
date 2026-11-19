"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blocksLegacyDriverAccountAction = blocksLegacyDriverAccountAction;
function blocksLegacyDriverAccountAction(phase, action) {
    if (phase?.mode !== "supabase")
        return false;
    if ("role" in action)
        return action.role === "driver";
    const uids = phase.driverUids;
    // Uma fase nativa incompleta não permite identificar com segurança a
    // autoridade de uma alteração de credencial ou de cadastro.
    return !Array.isArray(uids) || uids.length === 0 || uids.some(uid => typeof uid !== "string") || uids.includes(action.uid);
}
//# sourceMappingURL=legacy-driver-accounts.js.map