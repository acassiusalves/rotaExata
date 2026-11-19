const staffPrefix='rotaexata:staff:';
type DraftKind='savedOrigins'|'newRouteData'|'recent-report-ranges';

export function staffWorkspaceKey(userId:string,scopeId:string,kind:DraftKind) {
  return staffPrefix+userId+':'+scopeId+':'+kind;
}

export function clearStaffWorkspace(storage:Pick<Storage,'removeItem'|'key'|'length'>,userId?:string) {
  storage.removeItem('newRouteData');
  storage.removeItem('savedOrigins');
  storage.removeItem('recent-report-ranges');
  if (!userId) return;
  const prefix=staffPrefix+userId+':';
  for (let index=storage.length-1;index>=0;index--) {
    const key=storage.key(index);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}

export const staffWorkspaceOwnerKey='rotaexata:staff-workspace-owner';
type OwnerStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'|'key'|'length'>;

export function receiveWorkspaceOwnerChange(tab:Pick<Storage,'removeItem'|'key'|'length'>,before:string|null,next:string|null) {
  if (before!==next) clearStaffWorkspace(tab,before ?? undefined);
}

export function claimStaffWorkspace(shared:OwnerStorage,tab:OwnerStorage,next:string|null) {
  const previous=shared.getItem(staffWorkspaceOwnerKey);
  if (previous===next) return previous;
  receiveWorkspaceOwnerChange(shared,previous,next);
  receiveWorkspaceOwnerChange(tab,previous,next);
  if (next) shared.setItem(staffWorkspaceOwnerKey,next);
  else shared.removeItem(staffWorkspaceOwnerKey);
  return previous;
}
