import { parseArgs } from 'node:util';
import { drainEarningsQueue } from '../src/lib/server/earnings/issuance.ts';
import { earningsSupabaseUrl } from '../src/lib/server/earnings/transport.ts';

async function main() {
  const { values } = parseArgs({ options: { target: { type:'string' }, limit:{ type:'string',default:'6' } } });
  const limit = Number(values.limit);
  if (!values.target || new URL(values.target).origin !== earningsSupabaseUrl() || !Number.isInteger(limit) || limit<1 || limit>20) {
    throw new Error('Destino ou limite inválido');
  }
  const handled = await drainEarningsQueue(limit);
  console.log(JSON.stringify({ handled }));
}
main().catch(() => { console.error('Falha ao processar a fila. Confirme o destino e a configuração.'); process.exitCode=1; });
