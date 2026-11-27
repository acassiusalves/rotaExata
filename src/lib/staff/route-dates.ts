const dates=new Set([
  'arrivedAt','completedAt','reconciledAt','modifiedAt','movedAt','unlinkedAt','plannedDate','createdAt',
  'updatedAt','dispatchedAt','autoCompletedAt','startedAt','lastModifiedAt','resentAt','timestamp','lastSeenAt',
]);

export function staffRouteDates<T>(value:unknown):T {
  const revive=(entry:unknown):unknown=>{
    if (Array.isArray(entry)) return entry.map(revive);
    if (!entry || typeof entry!=='object') return entry;
    return Object.fromEntries(Object.entries(entry).map(([key,item])=>{
      if (dates.has(key) && typeof item==='string') {
        const date=new Date(item);
        if (Number.isFinite(date.valueOf())) return [key,date];
      }
      return [key,revive(item)];
    }));
  };
  return revive(value) as T;
}
