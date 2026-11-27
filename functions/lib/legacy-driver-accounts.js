"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blocksLegacyDriverAccountAction = blocksLegacyDriverAccountAction;
exports.isNativeDriverUuid = isNativeDriverUuid;
exports.sourceDriverAssignable = sourceDriverAssignable;
function blocksLegacyDriverAccountAction(phase, action, profile) {
    if ("uid" in action && typeof profile?.nativeDriverProvisioningId === "string" && profile.nativeDriverProvisioningId)
        return true;
    if (phase?.mode !== "supabase")
        return false;
    if ("role" in action)
        return action.role === "driver";
    const uids = phase.driverUids;
    // Uma fase nativa incompleta não permite identificar com segurança a
    // autoridade de uma alteração de credencial ou de cadastro.
    return !Array.isArray(uids) || uids.length === 0 || uids.some(uid => typeof uid !== "string") || uids.includes(action.uid);
}
function isNativeDriverUuid(uid) {
    return typeof uid === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uid);
}
function sourceDriverAssignable(uid, profile) {
    return !isNativeDriverUuid(uid) || (profile?.role === "driver" && (!profile.nativeDriverProvisioningId ||
        (profile.nativeDriverReady === true && profile.nativeDriverDispatchEnabled === true)));
}
//# sourceMappingURL=legacy-driver-accounts.js.map