export function summarizeServiceDispatch(routes: Array<{ status?: string; driverId?: string }>) {
  return {
    sent: routes.filter(route => Boolean(route.driverId?.trim()) && ['dispatched', 'in_progress', 'completed', 'completed_auto'].includes(route.status || '')).length,
    drafts: routes.filter(route => route.status === 'draft').length,
  };
}
