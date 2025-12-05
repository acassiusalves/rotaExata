// ============================================
// SISTEMA DE PERMISSÕES - ROTA EXATA
// Define as roles e permissões padrão do sistema
// ============================================

// Roles disponíveis no sistema
export const availableRoles = [
  { key: 'admin', name: 'Administrador', description: 'Acesso total ao sistema' },
  { key: 'socio', name: 'Sócio', description: 'Gerenciamento completo' },
  { key: 'gestor', name: 'Gestor', description: 'Gerenciamento operacional' },
  { key: 'driver', name: 'Motorista', description: 'Acesso às rotas atribuídas' },
] as const;

export type RoleKey = typeof availableRoles[number]['key'];

// Estrutura de grupos de páginas para organização
export const permissionGroups = [
  {
    name: 'Dashboard e Visão Geral',
    pages: [
      { path: '/dashboard', name: 'Dashboard', description: 'Painel principal com métricas' },
    ],
  },
  {
    name: 'Gerenciamento de Usuários',
    pages: [
      { path: '/drivers', name: 'Motoristas', description: 'Gerenciar motoristas' },
    ],
  },
  {
    name: 'Rotas e Entregas',
    pages: [
      { path: '/routes', name: 'Rotas Ativas', description: 'Visualizar rotas ativas' },
      { path: '/routes/new', name: 'Nova Rota', description: 'Criar novas rotas' },
      { path: '/routes/organize', name: 'Organizar Rotas', description: 'Organizar e otimizar rotas' },
      { path: '/routes/monitoring', name: 'Monitoramento', description: 'Monitorar rotas em tempo real' },
    ],
  },
  {
    name: 'Histórico',
    pages: [
      { path: '/history', name: 'Histórico', description: 'Página principal de histórico' },
      { path: '/history/motorista', name: 'Histórico Motorista', description: 'Histórico por motorista' },
      { path: '/history/rotas', name: 'Histórico Rotas', description: 'Histórico de rotas' },
    ],
  },
  {
    name: 'Relatórios',
    pages: [
      { path: '/reports', name: 'Relatórios', description: 'Página principal de relatórios' },
      { path: '/reports/general', name: 'Relatório Geral', description: 'Relatório geral de entregas' },
      { path: '/reports/numbers', name: 'Lista de Clientes', description: 'Lista de clientes das rotas' },
    ],
  },
  {
    name: 'Sistema',
    pages: [
      { path: '/notifications', name: 'Notificações', description: 'Central de notificações' },
      { path: '/settings', name: 'Configurações', description: 'Configurações do sistema' },
      { path: '/api', name: 'API', description: 'Integrações e API' },
      { path: '/permissions', name: 'Permissões', description: 'Gerenciar permissões de acesso' },
    ],
  },
];

// Permissões padrão por página
// Define quais roles têm acesso a cada página por padrão
export const defaultPagePermissions: Record<string, RoleKey[]> = {
  // Dashboard
  '/dashboard': ['admin', 'socio', 'gestor'],

  // Motoristas
  '/drivers': ['admin', 'socio', 'gestor'],

  // Rotas
  '/routes': ['admin', 'socio', 'gestor'],
  '/routes/new': ['admin', 'socio', 'gestor'],
  '/routes/organize': ['admin', 'socio', 'gestor'],
  '/routes/monitoring': ['admin', 'socio', 'gestor'],

  // Histórico
  '/history': ['admin', 'socio', 'gestor'],
  '/history/motorista': ['admin', 'socio', 'gestor'],
  '/history/rotas': ['admin', 'socio', 'gestor'],

  // Relatórios
  '/reports': ['admin', 'socio', 'gestor'],
  '/reports/general': ['admin', 'socio', 'gestor'],
  '/reports/numbers': ['admin', 'socio', 'gestor'],

  // Sistema
  '/notifications': ['admin', 'socio', 'gestor'],
  '/settings': ['admin', 'socio'],
  '/api': ['admin', 'socio'],
  '/permissions': ['admin', 'socio'],
};

// Páginas que não devem aparecer no gerenciamento de permissões
export const excludedRoutes = ['/login', '/auth', '/track'];

// Páginas que sempre devem estar acessíveis para admin
export const alwaysAdminPages = ['/permissions', '/settings'];

// Função para verificar se um usuário tem permissão para uma página
export function hasPermission(
  userRole: string | null,
  pagePath: string,
  permissions: Record<string, string[]> = defaultPagePermissions
): boolean {
  // Admin sempre tem acesso
  if (userRole === 'admin') return true;

  // Se não há role, não tem acesso
  if (!userRole) return false;

  // Verifica permissão específica da página
  const pagePermissions = permissions[pagePath];
  if (pagePermissions) {
    return pagePermissions.includes(userRole);
  }

  // Verifica permissões de páginas pai (ex: /routes/new herda de /routes)
  const parentPath = pagePath.split('/').slice(0, -1).join('/');
  if (parentPath && permissions[parentPath]) {
    return permissions[parentPath].includes(userRole);
  }

  // Por padrão, nega acesso
  return false;
}

// Função para obter todas as páginas como lista plana
export function getAllPages() {
  return permissionGroups.flatMap(group =>
    group.pages.map(page => ({
      ...page,
      group: group.name,
    }))
  );
}
