"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistPushOutcome = persistPushOutcome;
exports.sendPushWithOutcome = sendPushWithOutcome;
async function persistPushOutcome(write) {
    try {
        await write();
        return true;
    }
    catch (error) {
        const code = error?.code;
        if (code === 9 || code === 5)
            return false; // Changed or deleted since this dispatch.
        throw error;
    }
}
async function sendPushWithOutcome(hasToken, send) {
    if (!hasToken)
        return { outcome: 'skipped_no_token' };
    try {
        return { outcome: 'accepted', messageId: await send() };
    }
    catch (error) {
        const code = error?.code;
        return { outcome: 'failed', errorCode: typeof code === 'string' ? code : 'messaging/unknown-error' };
    }
}
//# sourceMappingURL=push-outcome.js.map