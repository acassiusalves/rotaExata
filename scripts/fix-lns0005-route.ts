import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (getApps().length === 0) {
  const formattedKey = privateKey!.replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: projectId!,
      clientEmail: clientEmail!,
      privateKey: formattedKey,
    }),
    projectId: projectId,
  });
}

const db = getFirestore();

function parseAddress(address: string): {
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
} {
  // Remove ", Brasil" do final
  let cleanAddress = address.replace(/, Brasil$/, '');

  // Dividir por vírgulas
  const parts = cleanAddress.split(',').map(p => p.trim());

  const result: any = {};

  // Identificar CEP
  const cepRegex = /\b\d{5}-?\d{3}\b/;
  let cepIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (cepRegex.test(parts[i])) {
      result.cep = parts[i].match(cepRegex)?.[0];
      cepIndex = i;
      break;
    }
  }

  // Identificar Cidade - Estado
  let cityStateIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (i === cepIndex) continue;
    if (parts[i].includes(' - ') && /\b[A-Z]{2}\b/.test(parts[i])) {
      const [cityPart] = parts[i].split(' - ');
      result.cidade = cityPart.trim();
      cityStateIndex = i;
      break;
    }
  }

  // Primeira parte: Rua + número
  if (parts.length >= 1) {
    const firstPart = parts[0];

    if (firstPart.includes(' - ')) {
      const splitDash = firstPart.split(' - ');

      // Extrair número da primeira parte
      const ruaNumeroMatch = splitDash[0].match(/^(.+?),?\s*(\d+)$/);
      if (ruaNumeroMatch) {
        result.rua = ruaNumeroMatch[1].trim();
        result.numero = ruaNumeroMatch[2].trim();
      } else {
        result.rua = splitDash[0].trim();
      }

      if (splitDash.length > 1) {
        result.bairro = splitDash.slice(1).join(' - ').trim();
      }
    } else {
      // Extrair número da rua
      const ruaNumeroMatch = firstPart.match(/^(.+?),?\s*(\d+)$/);
      if (ruaNumeroMatch) {
        result.rua = ruaNumeroMatch[1].trim();
        result.numero = ruaNumeroMatch[2].trim();
      } else {
        result.rua = firstPart;
      }
    }
  }

  // Segunda parte: bairro
  if (parts.length >= 2 && cityStateIndex !== 1 && cepIndex !== 1) {
    if (!result.bairro) {
      result.bairro = parts[1];
    }
  }

  return result;
}

async function fixRoute() {
  const routeDoc = await db.collection('routes').doc('29ybmC4pNwqkShxSfyR0').get();

  if (!routeDoc.exists) {
    console.log('Rota não encontrada!');
    return;
  }

  const routeData = routeDoc.data()!;
  console.log('Rota:', routeData.code);
  console.log('Stops:', routeData.stops?.length || 0);

  if (!routeData.stops || routeData.stops.length === 0) {
    console.log('Sem stops para processar');
    return;
  }

  const updatedStops = routeData.stops.map((stop: any) => {
    console.log('\nProcessando stop:');
    console.log('Cliente:', stop.customerName);
    console.log('Address original:', stop.address);

    const parsed = parseAddress(stop.address || '');

    console.log('Parsed:');
    console.log('  rua:', parsed.rua);
    console.log('  numero:', parsed.numero);
    console.log('  bairro:', parsed.bairro);
    console.log('  cidade:', parsed.cidade);
    console.log('  cep:', parsed.cep);

    return {
      ...stop,
      ...parsed,
    };
  });

  await routeDoc.ref.update({
    stops: updatedStops,
    updatedAt: new Date(),
  });

  console.log('\n✅ Rota atualizada com sucesso!');
}

fixRoute().then(() => process.exit(0)).catch(console.error);
