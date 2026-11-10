import 'server-only';

// Reporting has larger legitimate snapshots than MCP. Bound the whole input,
// including passthrough fields, before any schema walks its collections.
const MAX_BYTES = 2_097_152;
const MAX_ELEMENTS = 16_384;
const MAX_DEPTH = 16;
const READ_TIMEOUT_MS = 5_000;

export class FeedbackJsonError extends Error {
  constructor(readonly status: 400 | 408 | 413 | 415, message: string) {super(message);}
}
const invalid = () => new FeedbackJsonError(400, 'JSON inválido.');
const excessive = () => new FeedbackJsonError(413, 'Requisição grande ou complexa demais.');

async function readBytes(request: Request): Promise<Uint8Array> {
  const encoding = request.headers.get('content-encoding')?.trim().toLowerCase();
  if (encoding && encoding !== 'identity') throw new FeedbackJsonError(415, 'Corpo comprimido não suportado.');
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw invalid();
    if (Number(length) > MAX_BYTES) throw excessive();
  }
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  const expired = () => new FeedbackJsonError(408, 'Leitura da requisição interrompida ou expirada.');
  const deadline = Date.now() + READ_TIMEOUT_MS;
  let stop!: (error: FeedbackJsonError) => void;
  const stopped = new Promise<never>((_resolve, reject) => {stop = reject;});
  const timer = setTimeout(() => stop(expired()), READ_TIMEOUT_MS);
  const abort = () => stop(expired());
  request.signal.addEventListener('abort', abort, {once: true});
  if (request.signal.aborted) abort();
  const chunks: Uint8Array[] = [];
  let bytes = 0, complete = false;
  try {
    while (true) {
      const part = await Promise.race([reader.read(), stopped]);
      if (Date.now() >= deadline || request.signal.aborted) throw expired();
      if (part.done) {complete = true; break;}
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) throw excessive();
      chunks.push(part.value);
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    // An untrusted producer must not delay rejection by hanging cancel().
    if (!complete) void reader.cancel().catch(() => undefined);
    try {reader.releaseLock();} catch { /* Pending read is being cancelled. */ }
  }
}

function inspectJson(input: unknown): void {
  const stack = [{value: input, depth: 1}];
  let elements = 0;
  while (stack.length) {
    const {value, depth} = stack.pop()!;
    if (typeof value === 'number' && !Number.isFinite(value)) throw invalid();
    if (value === null || typeof value !== 'object') continue;
    if (depth > MAX_DEPTH) throw excessive();
    const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
    elements += children.length;
    if (elements > MAX_ELEMENTS) throw excessive();
    for (const child of children) stack.push({value: child, depth: depth + 1});
  }
}

export async function readFeedbackJson(request: Request): Promise<unknown> {
  let input: unknown;
  try {
    const bytes = await readBytes(request);
    // Like Request.json(), accept JSON independent of Content-Type; all media
    // representations get the same byte/structure budget. Do not decompress.
    input = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } catch (error) {
    if (error instanceof FeedbackJsonError) throw error;
    throw invalid();
  }
  inspectJson(input);
  return input;
}
