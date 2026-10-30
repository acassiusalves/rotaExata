type DriverData = { role?: string; displayName?: string; name?: string; vehicle?: { type: string; plate: string } };
export class InvalidDispatchDriverError extends Error {}
export async function resolveDispatchDriver(uid: unknown, readUser: (uid: string) => Promise<DriverData | null>) {
  if (typeof uid !== 'string' || !uid.trim()) throw new InvalidDispatchDriverError('Motorista inválido.');
  const id = uid.trim();
  const data = await readUser(id);
  if (!data || data.role !== 'driver') throw new InvalidDispatchDriverError('O motorista selecionado não possui cadastro válido de entregador.');
  return { id, name: data.displayName || data.name || 'Motorista', vehicle: data.vehicle || { type: 'Carro', plate: '' } };
}
