type DriverData = { nativeDriverProvisioningId?: string; nativeDriverReady?: boolean; nativeDriverDispatchEnabled?: boolean; role?: string; displayName?: string; name?: string; vehicle?: { type: string; plate: string } };
export function isSourceDriverAssignable(data:Pick<DriverData,'role'|'nativeDriverProvisioningId'|'nativeDriverReady'|'nativeDriverDispatchEnabled'>) {
  return data.role==='driver' && (!data.nativeDriverProvisioningId ||
    (data.nativeDriverReady===true && data.nativeDriverDispatchEnabled===true));
}
export class InvalidDispatchDriverError extends Error {}
export async function resolveDispatchDriver(uid: unknown, readUser: (uid: string) => Promise<DriverData | null>) {
  if (typeof uid !== 'string' || !uid.trim()) throw new InvalidDispatchDriverError('Motorista inválido.');
  const id = uid.trim();
  const data = await readUser(id);
  if (!data || !isSourceDriverAssignable(data)) throw new InvalidDispatchDriverError('O motorista selecionado não possui cadastro válido de entregador.');
  return { id, name: data.displayName || data.name || 'Motorista', vehicle: data.vehicle || { type: 'Carro', plate: '' } };
}
