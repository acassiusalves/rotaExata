export type PushOutcome = { outcome: 'accepted'; messageId: string } | { outcome: 'skipped_no_token' } | { outcome: 'failed'; errorCode: string };
export async function persistPushOutcome(write: () => Promise<unknown>): Promise<boolean> {
  try { await write(); return true; }
  catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 9 || code === 5) return false; // Changed or deleted since this dispatch.
    throw error;
  }
}
export async function sendPushWithOutcome(hasToken: boolean, send: () => Promise<string>): Promise<PushOutcome> {
  if (!hasToken) return { outcome: 'skipped_no_token' };
  try {
    return { outcome: 'accepted', messageId: await send() };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return { outcome: 'failed', errorCode: typeof code === 'string' ? code : 'messaging/unknown-error' };
  }
}
