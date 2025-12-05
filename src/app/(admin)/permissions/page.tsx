'use client';

import * as React from 'react';
import {
  Lock,
  Users,
  Loader2,
  Save,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  availableRoles,
  permissionGroups,
  defaultPagePermissions,
  alwaysAdminPages,
} from '@/lib/permissions';
import {
  loadPermissions,
  savePermissions,
  loadUsersWithRoles,
  updateUserRole,
  type AppUser,
} from '@/lib/permissions-service';

export default function PermissionsPage() {
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [permissions, setPermissions] = React.useState<Record<string, string[]>>(defaultPagePermissions);
  const [inactivePages, setInactivePages] = React.useState<Set<string>>(new Set());
  const [isSavingPermissions, setIsSavingPermissions] = React.useState(false);
  const [isSavingUsers, setIsSavingUsers] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();
  const { user: currentUser, userRole } = useAuth();

  // Verificar permissão de acesso
  const hasPermission = userRole === 'admin' || userRole === 'socio';

  // Carregar dados iniciais
  React.useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [permissionsData, usersData] = await Promise.all([
          loadPermissions(),
          loadUsersWithRoles(),
        ]);

        if (permissionsData) {
          // Mesclar permissões salvas com as padrão
          const mergedPermissions = { ...defaultPagePermissions };
          for (const page in permissionsData.permissions) {
            mergedPermissions[page] = permissionsData.permissions[page];
          }
          setPermissions(mergedPermissions);

          if (permissionsData.inactivePages) {
            setInactivePages(new Set(permissionsData.inactivePages));
          }
        }

        setUsers(usersData);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar as configurações.',
        });
      } finally {
        setIsLoading(false);
      }
    }

    if (hasPermission) {
      loadData();
    } else {
      setIsLoading(false);
    }
  }, [hasPermission, toast]);

  // Alterar role de um usuário
  const handleRoleChange = (userId: string, newRole: string) => {
    // Não permite que admin remova sua própria role de admin
    if (currentUser?.uid === userId && userRole === 'admin' && newRole !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Você não pode remover sua própria função de administrador.',
      });
      return;
    }

    setUsers((currentUsers) =>
      currentUsers.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
  };

  // Alterar permissão de uma página
  const handlePermissionChange = (page: string, role: string, checked: boolean) => {
    setPermissions((prev) => {
      const newPermissions = { ...prev };
      const pageRoles = newPermissions[page] || [];

      if (checked) {
        if (!pageRoles.includes(role)) {
          newPermissions[page] = [...pageRoles, role];
        }
      } else {
        newPermissions[page] = pageRoles.filter((r) => r !== role);
      }

      return newPermissions;
    });
  };

  // Ativar/desativar página
  const handlePageActiveChange = (page: string, isActive: boolean) => {
    // Não permite desativar páginas essenciais
    if (alwaysAdminPages.includes(page) && !isActive) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Esta página não pode ser desativada.',
      });
      return;
    }

    setInactivePages((prev) => {
      const newInactive = new Set(prev);
      if (isActive) {
        newInactive.delete(page);
      } else {
        newInactive.add(page);
      }
      return newInactive;
    });
  };

  // Salvar permissões
  const handleSavePermissions = async () => {
    setIsSavingPermissions(true);
    try {
      const success = await savePermissions(
        permissions,
        Array.from(inactivePages),
        currentUser?.uid
      );

      if (success) {
        toast({
          title: 'Permissões Salvas!',
          description: 'As regras de acesso foram atualizadas com sucesso.',
        });
      } else {
        throw new Error('Falha ao salvar');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar as permissões.',
      });
    } finally {
      setIsSavingPermissions(false);
    }
  };

  // Salvar roles dos usuários
  const handleSaveUsers = async () => {
    setIsSavingUsers(true);
    try {
      const validUsers = users.filter((user) => user.role && user.role.trim() !== '');

      if (validUsers.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Nenhum usuário com função definida para salvar.',
        });
        return;
      }

      const updatePromises = validUsers.map((user) => updateUserRole(user.id, user.role));
      await Promise.all(updatePromises);

      toast({
        title: 'Funções Salvas!',
        description: `${validUsers.length} usuário(s) atualizado(s) com sucesso.`,
      });
    } catch (error) {
      console.error('Erro ao salvar funções:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar as funções dos usuários.',
      });
    } finally {
      setIsSavingUsers(false);
    }
  };

  // Verificar se o usuário não tem permissão
  if (!hasPermission && !isLoading) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Acesso Negado</AlertTitle>
          <AlertDescription>
            Você não tem permissão para acessar esta página. Apenas usuários com a função
            &quot;Administrador&quot; ou &quot;Sócio&quot; podem gerenciar permissões do sistema.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  // Filtrar roles para não mostrar driver nas permissões de páginas admin
  const adminRoles = availableRoles.filter((r) => r.key !== 'driver');

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Gerenciamento de Permissões</h1>
        </div>
        <p className="text-muted-foreground">
          Gerencie o acesso dos usuários às páginas e funcionalidades do sistema.
        </p>
      </div>

      {/* Card de Permissões por Função */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Permissões por Função
          </CardTitle>
          <CardDescription>
            Defina quais funções podem acessar cada página do sistema. Administradores sempre têm
            acesso total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="min-w-[250px]">Página do Sistema</TableHead>
                  {adminRoles.map((role) => (
                    <TableHead key={role.key} className="text-center min-w-[100px]">
                      {role.name}
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[80px]">Ativa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissionGroups.map((group) => (
                  <React.Fragment key={group.name}>
                    {/* Header do grupo */}
                    <TableRow className="bg-muted/50">
                      <TableCell
                        colSpan={adminRoles.length + 2}
                        className="font-semibold text-muted-foreground"
                      >
                        {group.name}
                      </TableCell>
                    </TableRow>

                    {/* Páginas do grupo */}
                    {group.pages.map((page) => (
                      <TableRow key={page.path} className="hover:bg-muted/30">
                        <TableCell>
                          <div>
                            <p className="font-medium">{page.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{page.path}</p>
                          </div>
                        </TableCell>
                        {adminRoles.map((role) => {
                          const isAdmin = role.key === 'admin';
                          const isChecked = isAdmin || permissions[page.path]?.includes(role.key);

                          return (
                            <TableCell key={`${page.path}-${role.key}`} className="text-center">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) =>
                                  handlePermissionChange(page.path, role.key, !!checked)
                                }
                                disabled={isAdmin}
                                className="mx-auto"
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          <Switch
                            checked={!inactivePages.has(page.path)}
                            onCheckedChange={(checked) =>
                              handlePageActiveChange(page.path, checked)
                            }
                            disabled={alwaysAdminPages.includes(page.path)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="justify-end pt-6">
          <Button onClick={handleSavePermissions} disabled={isSavingPermissions}>
            {isSavingPermissions ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Permissões
          </Button>
        </CardFooter>
      </Card>

      {/* Card de Gestão de Usuários */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestão de Usuários
          </CardTitle>
          <CardDescription>
            Atribua funções para controlar o nível de acesso de cada usuário no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.filter((u) => !u.role).length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Atenção:</strong> {users.filter((u) => !u.role).length} usuário(s) sem
                função definida. Usuários sem função não conseguirão acessar o sistema corretamente.
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[200px]">Função</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length > 0 ? (
                  users.map((user) => (
                    <TableRow key={user.id} className={!user.role ? 'bg-destructive/10' : ''}>
                      <TableCell className="font-medium">
                        {user.displayName || 'Sem nome'}
                        {!user.role && (
                          <span className="text-xs text-destructive ml-2">(Sem função)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role || ''}
                          onValueChange={(newRole) => handleRoleChange(user.id, newRole)}
                        >
                          <SelectTrigger className={!user.role ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles.map((role) => (
                              <SelectItem key={role.key} value={role.key}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="justify-end pt-6">
          <Button onClick={handleSaveUsers} disabled={isSavingUsers}>
            {isSavingUsers ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Funções
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
