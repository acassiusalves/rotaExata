import { db } from './client';
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';

/**
 * Gera o próximo código sequencial único para uma rota
 * Formato: RT-0001, RT-0002, RT-0003, etc.
 *
 * Usa transação do Firestore para garantir que não haja códigos duplicados
 */
export async function generateRouteCode(): Promise<string> {
  const counterRef = doc(db, 'counters', 'routeCode');

  try {
    const newCount = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);

      let currentCount = 0;
      if (counterDoc.exists()) {
        currentCount = counterDoc.data().count || 0;
      }

      const nextCount = currentCount + 1;

      // Atualizar o contador
      transaction.set(counterRef, { count: nextCount }, { merge: true });

      return nextCount;
    });

    // Formatar o código com padding de zeros (ex: RT-0001)
    const code = `RT-${String(newCount).padStart(4, '0')}`;

    return code;
  } catch (error) {
    console.error('Erro ao gerar código da rota:', error);
    throw new Error('Não foi possível gerar o código da rota');
  }
}

/**
 * Retorna o contador atual de rotas (para exibição/debug)
 */
export async function getCurrentRouteCount(): Promise<number> {
  const counterRef = doc(db, 'counters', 'routeCode');

  try {
    const counterDoc = await getDoc(counterRef);

    if (counterDoc.exists()) {
      return counterDoc.data().count || 0;
    }

    return 0;
  } catch (error) {
    console.error('Erro ao buscar contador de rotas:', error);
    return 0;
  }
}
