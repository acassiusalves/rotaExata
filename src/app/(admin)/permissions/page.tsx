'use client';

import * as React from 'react';
import {
  Lock,
  Users,
  Loader2,
  Save,
  Shield,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { Dialog,DialogContent,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  availableRoles,
  permissionGroups,
  defaultPagePermissions,
  alwaysAdminPages,
} from '@/lib/permissions';
import { StaffProvisioning } from '@/components/staff/staff-provisioning';
import { useStaff } from '@/components/staff/staff-session';
import { useConfirm } from '@/hooks/use-confirm';
import type { PendingStaffMetadata,StaffAccount,StaffDirectoryCommand } from '@/lib/staff/directory-contract';
import type { StaffRole } from '@/lib/staff/access';
import { EarningsRequestError } from '@/lib/earnings/session-request';

type SecurityAction=Exclude<StaffDirectoryCommand['action'],'set_role'|'edit_profile'|'cancel_metadata'>;
type AppUser=StaffAccount & {chosenRole:StaffRole};
type PolicyState={permissions:Record<string,string[]>;inactivePages:string[];revision:string|null};

export default function PermissionsPage() {
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [pendingCommands,setPendingCommands]=React.useState<PendingStaffMetadata[]>([]);
  const [permissions, setPermissions] = React.useState<Record<string, string[]>>(defaultPagePermissions);
  const [inactivePages, setInactivePages] = React.useState<Set<string>>(new Set());
  const [isSavingPermissions, setIsSavingPermissions] = React.useState(false);
  const [isSavingUsers, setIsSavingUsers] = React.useState(false);
  const [policyRevision,setPolicyRevision]=React.useState<string|null>();
  const [profileEditor,setProfileEditor]=React.useState<{account:AppUser;name:string;phone:string}>();
  const [accountBusy,setAccountBusy]=React.useState(false);
  const [dataError,setDataError]=React.useState(false);
  const [reload,setReload]=React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();
  const {userId,role:userRole,request}=useStaff();
  const {confirm}=useConfirm();
  const refresh=React.useCallback(()=>setReload(value=>value+1),[]);
  const commands=React.useRef(new Map<string,StaffDirectoryCommand>());

  // Verificar permissão de acesso
  const hasPermission = userRole === 'admin' || userRole === 'socio';

  React.useEffect(()=>{
    if (!hasPermission) {setIsLoading(false);return;}
    const controller=new AbortController();
    const input={signal:controller.signal};
    setIsLoading(true);
    setDataError(false);
    Promise.all([request<PolicyState>('/api/staff/permissions',input),
      request<{accounts:StaffAccount[];pendingCommands:PendingStaffMetadata[]}>('/api/staff/directory',input)]).then(([policy,directory])=>{
      if (controller.signal.aborted) return;
      setPermissions(policy.permissions);
      setInactivePages(new Set(policy.inactivePages));
      setPolicyRevision(policy.revision);
      setPendingCommands(directory.pendingCommands);
      setUsers(directory.accounts.map(user=>({...user,chosenRole:user.role})));
    }).catch(()=>{if (!controller.signal.aborted) setDataError(true);})
      .finally(()=>{if (!controller.signal.aborted) setIsLoading(false);});
    return ()=>controller.abort();
  },[hasPermission,request,reload]);

  // Alterar role de um usuário
  const handleRoleChange = (targetId: string, newRole: StaffRole) => {
    // Não permite que admin remova sua própria role de admin
    if (userId === targetId && userRole === 'admin' && newRole !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Você não pode remover sua própria função de administrador.',
      });
      return;
    }

    setUsers((currentUsers) =>
      currentUsers.map((u) => (u.userId === targetId ? { ...u, chosenRole: newRole } : u))
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
      if (policyRevision===undefined) return;
      const policy=await request<PolicyState>('/api/staff/permissions',{
        method:'PATCH',body:JSON.stringify({expectedRevision:policyRevision,pagePermissions:permissions,inactivePages:[...inactivePages]}),
      });
      setPolicyRevision(policy.revision);
      toast({title:'Permissões salvas',description:'As regras de acesso do RotaExata foram atualizadas.'});
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

  async function applyCommand(user:AppUser,action:SecurityAction|'set_role',targetRole?:StaffRole) {
    const fingerprint=JSON.stringify({id:user.userId,action,revision:user.revision,targetRole});
    const remembered=commands.current.get(fingerprint);
    const pending=action==='set_role' && user.pendingRole?.role===targetRole ? user.pendingRole:undefined;
    const base={targetId:user.userId,revision:pending?.revision ?? user.revision,commandId:pending?.commandId ?? crypto.randomUUID()};
    const command:StaffDirectoryCommand=remembered ?? (action==='set_role' ?
      {...base,action,role:targetRole ?? user.role}:{...base,action});
    commands.current.set(fingerprint,command);
    try {
      await request('/api/staff/directory',{method:'POST',body:JSON.stringify(command)});
      commands.current.delete(fingerprint);
    } catch(error) {
      if (error instanceof EarningsRequestError && error.status<500 && error.status!==409) commands.current.delete(fingerprint);
      throw error;
    }
  }

  async function handleSaveUsers() {
    const updated=users.filter(user=>user.role!==user.chosenRole);
    if (!updated.length) return;
    setIsSavingUsers(true);
    let saved=0;
    try {
      for (const user of updated) {
        await applyCommand(user,'set_role',user.chosenRole);
        saved++;
      }
      toast({title:'Funções salvas',description:saved+' conta(s) atualizada(s).'});
    } catch {
      toast({variant:'destructive',title:'Uma mudança ficou pendente',
        description:saved ? saved+' mudança(s) concluída(s). Confira as funções e retome a que ficou pendente.':'Confira as funções e tente novamente.'});
    } finally {
      setIsSavingUsers(false);
      refresh();
    }
  }

  async function resumeRole(user:AppUser) {
    if (!user.pendingRole) return;
    setAccountBusy(true);
    try {
      await applyCommand(user,'set_role',user.pendingRole.role);
      toast({title:'Função atualizada'});
    } catch {
      toast({variant:'destructive',title:'Não foi possível retomar a alteração de função'});
    } finally {setAccountBusy(false);refresh();}
  }

  async function saveProfile(event:React.FormEvent) {
    event.preventDefault();
    if (!profileEditor) return;
    const {account,name,phone}=profileEditor;
    const profile={name:name.trim(),phone:phone.trim()};
    const pending=account.pendingProfile;
    const revisions={revision:pending?.revision ?? account.revision,phoneRevision:pending?.phoneRevision ?? account.phoneRevision,
      sourceRevision:pending ? pending.sourceRevision:account.sourceRevision};
    const fingerprint=JSON.stringify({id:account.userId,profile,...revisions});
    const remembered=commands.current.get(fingerprint);
    const command:StaffDirectoryCommand=remembered ?? {
      action:'edit_profile',targetId:account.userId,profile,...revisions,
      commandId:pending?.commandId ?? crypto.randomUUID(),
    };
    commands.current.set(fingerprint,command);
    setAccountBusy(true);
    try {
      await request('/api/staff/directory',{method:'POST',body:JSON.stringify(command)});
      commands.current.delete(fingerprint);
      setProfileEditor(undefined);
      toast({title:'Perfil atualizado'});
    } catch {
      toast({variant:'destructive',title:'Não foi possível salvar o perfil',description:'Confira o cadastro e retome uma alteração pendente.'});
    } finally {setAccountBusy(false);refresh();}
  }

  async function cancelMetadata(commandId:string) {
    setAccountBusy(true);
    try {
      const command:StaffDirectoryCommand={action:'cancel_metadata',commandId};
      await request('/api/staff/directory',{method:'POST',body:JSON.stringify(command)});
      toast({title:'Pendência encerrada'});
    } catch {
      toast({variant:'destructive',title:'Não foi possível encerrar a pendência'});
    } finally {setAccountBusy(false);refresh();}
  }

  async function accountAction(user:AppUser,action:SecurityAction) {
    const label={
      require_password_change:'Exigir troca de senha',revoke_sessions:'Encerrar sessões',
      set_active:'Reativar acesso',set_inactive:'Bloquear acesso',
    }[action];
    if (!await confirm({title:label+' · '+user.name,
      description:'A alteração vale para a conta Supabase. Apps que ainda usam Firebase mantêm suas próprias sessões.',
      confirmText:label,cancelText:'Cancelar',variant:action==='set_active'?'default':'destructive'})) return;
    setAccountBusy(true);
    try {
      await applyCommand(user,action);
      toast({title:'Alteração registrada',description:action==='require_password_change' ?
        'A pessoa deverá entrar e definir sua nova senha.':'As sessões anteriores da conta foram encerradas.'});
      refresh();
    } catch {
      toast({variant:'destructive',title:'Não foi possível atualizar a conta',description:'Confira se os dados da conta mudaram.'});
    } finally {setAccountBusy(false);}
  }

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
  if (dataError) return <div className="space-y-3 p-6">
    <p role="alert">Não foi possível carregar o diretório de acesso.</p>
    <Button variant="outline" onClick={refresh}>Tentar novamente</Button>
  </div>;

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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[200px]">Função</TableHead>
                  <TableHead className="w-[140px] text-right">Acesso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length > 0 ? (
                  users.map((user) => (
                    <TableRow key={user.userId}>
                      <TableCell className="font-medium">
                        {user.name}
                        <div className="text-xs text-muted-foreground">{user.active?'Acesso ativo':'Acesso bloqueado'} · {user.emailVerified?'E-mail confirmado':'E-mail pendente'}{user.mustChangePassword?' · Troca de senha solicitada':''}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Select
                          value={user.chosenRole}
                          disabled={!!user.pendingRole || user.userId===userId || (user.role==='admin' && userRole!=='admin')}
                          onValueChange={(newRole) => handleRoleChange(user.userId, newRole as StaffRole)}
                        >
                          <SelectTrigger className={!user.role ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {adminRoles.filter(role=>role.key!=='admin' || userRole==='admin' || user.role==='admin').map((role) => (
                              <SelectItem key={role.key} value={role.key}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {user.pendingRole && <Button variant="outline" size="sm" disabled={accountBusy} onClick={()=>void resumeRole(user)}>
                            Retomar mudança de função
                          </Button>}
                          <Button variant="outline" size="sm" disabled={accountBusy || (user.role==='admin' && userRole!=='admin')}
                            onClick={()=>setProfileEditor({account:user,name:user.pendingProfile?.profile.name ?? user.name,
                              phone:user.pendingProfile?.profile.phone ?? user.phone ?? ''})}>
                            {user.pendingProfile ? 'Retomar edição do perfil':'Editar perfil'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={()=>void accountAction(user,'require_password_change')}
                            disabled={accountBusy || user.userId===userId || (user.role==='admin' && userRole!=='admin')}>
                            <KeyRound className="mr-1 size-4" />Exigir troca de senha
                          </Button>
                          <Button variant="ghost" size="sm" onClick={()=>void accountAction(user,'revoke_sessions')}
                            disabled={accountBusy || user.userId===userId || (user.role==='admin' && userRole!=='admin')}>Encerrar sessões</Button>
                          <Button variant="ghost" size="sm" onClick={()=>void accountAction(user,user.active?'set_inactive':'set_active')}
                            disabled={accountBusy || user.userId===userId || (user.role==='admin' && userRole!=='admin')}>
                            {user.active?'Bloquear':'Reativar'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
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
      {pendingCommands.length>0 && <Card>
        <CardHeader><CardTitle>Alterações pendentes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pendingCommands.map(command=><div key={command.commandId} className="flex items-center justify-between gap-3">
            <span>{command.name}</span>
            <Button variant="outline" disabled={accountBusy} onClick={()=>void cancelMetadata(command.commandId)}>
              Encerrar pendência
            </Button>
          </div>)}
        </CardContent>
      </Card>}
      <StaffProvisioning onReady={refresh} />
      <Dialog open={!!profileEditor} onOpenChange={open=>{if(!open&&!accountBusy) setProfileEditor(undefined);}}>
        <DialogContent>
          <DialogTitle>{profileEditor?.account.pendingProfile?'Retomar edição do perfil':'Editar perfil'}</DialogTitle>
          {profileEditor && <form className="space-y-3" onSubmit={saveProfile}>
            <div className="space-y-1"><Label htmlFor="staff-profile-name">Nome</Label>
              <Input id="staff-profile-name" value={profileEditor.name} minLength={2} maxLength={150} required
                disabled={accountBusy || !!profileEditor.account.pendingProfile}
                onChange={event=>setProfileEditor({...profileEditor,name:event.target.value})} /></div>
            <div className="space-y-1"><Label htmlFor="staff-profile-phone">Telefone</Label>
              <Input id="staff-profile-phone" type="tel" value={profileEditor.phone} maxLength={40}
                disabled={accountBusy || !!profileEditor.account.pendingProfile}
                onChange={event=>setProfileEditor({...profileEditor,phone:event.target.value})} /></div>
            <Button disabled={accountBusy}>{profileEditor.account.pendingProfile?'Retomar alteração':'Salvar perfil'}</Button>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
