import { z } from 'zod';

export const staffRoles = ['admin', 'socio', 'gestor'] as const;
export type StaffRole = typeof staffRoles[number];
export const staffPolicySchema = z.object({
  pagePermissions:z.record(z.string(),z.array(z.string())),
  inactivePages:z.array(z.string()),
});
export type StaffPolicy = z.infer<typeof staffPolicySchema>;
export const defaultStaffPolicy: StaffPolicy = { pagePermissions:{}, inactivePages:[] };
const administrators = ['admin','socio'] as const;

const staffPages = {
  '/dashboard':staffRoles,
  '/drivers':staffRoles,
  '/routes':staffRoles,
  '/routes/new':staffRoles,
  '/routes/organize':staffRoles,
  '/routes/monitoring':staffRoles,
  '/history':staffRoles,
  '/history/atividades':staffRoles,
  '/history/motorista':staffRoles,
  '/history/rotas':staffRoles,
  '/reports':staffRoles,
  '/reports/general':staffRoles,
  '/reports/numbers':staffRoles,
  '/notifications':staffRoles,
  '/settings':administrators,
  '/api':administrators,
  '/permissions':administrators,
  '/admin/erros':staffRoles,
  '/admin/migrate-codes':['admin'],
  '/financeiro':staffRoles,
  '/financeiro/regras':administrators,
  '/financeiro/pagamentos':staffRoles,
  '/driver/admin/accounts':staffRoles,
} as const satisfies Record<string,readonly StaffRole[]>;

export type StaffPage = keyof typeof staffPages;
export type StaffAccess = { role:StaffRole; policy:StaffPolicy; rotaPolicy:StaffPolicy };

const operations = {
  'dashboard:read':['/dashboard'],
  'routes:list':['/routes'],
  'route:read':['/routes'],
  'route:create':['/routes/new'],
  'route:edit':['/routes'],
  'route:organize':['/routes/organize'],
  'route:rename':['/routes'],
  'route:assign':['/routes'],
  'route:duplicate':['/routes'],
  'route:delete':['/routes'],
  'route:complete':['/routes',administrators],
  'route:resend':['/history/rotas',administrators],
  'routes:monitor':['/routes/monitoring'],
  'service:read':['/routes'],
  'service:plan':['/routes/organize'],
  'service:force-complete':['/routes',administrators],
  'driver:location':['/routes'],
  'drivers:list':['/drivers'],
  'driver:edit':['/drivers'],
  'driver:preview':['/drivers',administrators],
  'drivers:cleanup':['/drivers'],
  'history:activity':['/history/atividades'],
  'history:driver':['/history/motorista'],
  'history:routes':['/history/rotas'],
  'routes:repair-codes':['/admin/migrate-codes'],
  'reports:general':['/reports/general'],
  'reports:numbers':['/reports/numbers'],
  'reports:edit':['/reports/general'],
  'reports:reconcile':['/reports/general'],
  'notifications:list':['/notifications'],
  'notification:change':['/notifications'],
  'notification:send':['/notifications'],
  'route:notify':['/routes'],
  'feedbacks:manage':['/admin/erros'],
  'settings:manage':['/settings'],
  'integration:manage':['/api'],
  'permissions:manage':['/permissions'],
  'directory:read':['/permissions'],
} as const satisfies Record<string, readonly [StaffPage, (readonly StaffRole[])?]>;
export type StaffOperation = 'session' | keyof typeof operations;

function ancestors(page:StaffPage) {
  if (page==='/driver/admin/accounts') return ['/drivers',page];
  return Object.keys(staffPages).filter(path=>page===path || page.startsWith(path+'/')).sort((a,b)=>a.length-b.length);
}

function policyPermits(policy:StaffPolicy,paths:string[],role:StaffRole) {
  if (paths.some(path=>policy.inactivePages.includes(path))) return false;
  const override=[...paths].reverse().find(path=>Object.hasOwn(policy.pagePermissions,path));
  return !override || policy.pagePermissions[override].includes(role);
}

function pageAllowed(actor:StaffAccess,page:StaffPage) {
  const base:readonly StaffRole[] = staffPages[page];
  const paths=ancestors(page);
  return base.includes(actor.role) && policyPermits(actor.policy,paths,actor.role) &&
    policyPermits(actor.rotaPolicy,paths,actor.role);
}

export function allowedStaffPaths(actor:StaffAccess) {
  return (Object.keys(staffPages) as StaffPage[]).filter(page=>pageAllowed(actor,page));
}

export function staffOperationAllowed(actor:StaffAccess,operation:StaffOperation) {
  if (operation==='session') return true;
  const [page,roles] = operations[operation];
  return pageAllowed(actor,page) && (!roles || (roles as readonly StaffRole[]).includes(actor.role));
}

export function staffPageForPath(pathname:string):StaffPage|null {
  if (Object.hasOwn(staffPages,pathname)) return pathname as StaffPage;
  if (/^\/routes\/organize\/acompanhar\/?$/.test(pathname) ||
      /^\/routes\/service\/[^/]+\/organize\/?$/.test(pathname)) return '/routes/organize';
  if (/^\/track\/[^/]+\/?$/.test(pathname)) return '/routes';
  if (/^\/routes\/(?:service\/)?[^/]+\/acompanhar\/?$/.test(pathname)) return '/routes';
  return null;
}

export function staffReturnPath(value:unknown) {
  if (typeof value!=='string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return null;
  const url=new URL(value,'https://rota-exata.invalid');
  return url.origin==='https://rota-exata.invalid' && staffPageForPath(url.pathname) ? url.pathname+url.search+url.hash : null;
}
