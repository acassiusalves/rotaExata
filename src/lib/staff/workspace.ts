const staffPrefix='rotaexata:staff:';
type DraftKind='savedOrigins'|'newRouteData';

export function staffWorkspaceKey(userId:string,scopeId:string,kind:DraftKind) {
  return staffPrefix+userId+':'+scopeId+':'+kind;
}

export function clearStaffWorkspace(storage:Pick<Storage,'removeItem'|'key'|'length'>,userId?:string) {
  storage.removeItem('newRouteData');
  storage.removeItem('savedOrigins');
  if (!userId) return;
  const prefix=staffPrefix+userId+':';
  for (let index=storage.length-1;index>=0;index--) {
    const key=storage.key(index);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}
