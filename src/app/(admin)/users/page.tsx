
'use client';

import * as React from 'react';
import { PlusCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UserTable } from '@/components/users/user-table';
import { User } from '@/lib/types';
import { db } from '@/lib/firebase/client';
import { collection, onSnapshot, Timestamp, query } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { InviteUserDialog } from '@/components/users/invite-user-dialog';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Helper to convert Firestore Timestamps to a serializable format with formatted date string
const formatUsersForTable = (users: User[]) => {
  return users.map(user => {
    const { createdAt, ...rest } = user;
    let createdAtString = 'Data inválida';

    if (createdAt instanceof Timestamp) {
      createdAtString = format(createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } else if (createdAt instanceof Date) {
      createdAtString = format(createdAt, 'dd/MM/yyyy HH:mm', { locale: ptBR });
    }
    
    return {
      ...rest,
      createdAt: createdAtString
    };
  });
};


export default function UsersPage() {
  const { userRole, loading: authLoading } = useAuth();
  const [users, setUsers] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false);

  // Verificar se o usuário tem permissão (apenas sócios podem acessar)
  const hasPermission = userRole === 'socio' || userRole === 'admin';

  React.useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const usersData: User[] = [];
        querySnapshot.forEach((doc) => {
          usersData.push({ uid: doc.id, ...doc.data() } as User);
        });
        const formattedUsers = formatUsersForTable(usersData);
        setUsers(formattedUsers);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching users: ", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);
  
  // Mostrar loading enquanto verifica autenticação
  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Mostrar alerta se não tiver permissão
  if (!hasPermission) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Usuários</h2>
          <p className="text-muted-foreground">
            Gerencie os usuários e suas permissões no sistema.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Acesso Negado</AlertTitle>
          <AlertDescription>
            Você não tem permissão para acessar esta página. Apenas usuários com a função "Sócio" ou "Admin" podem gerenciar usuários do sistema.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Usuários</h2>
            <p className="text-muted-foreground">
              Gerencie os usuários e suas permissões no sistema.
            </p>
          </div>
          <Button onClick={() => setIsInviteDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Convidar Usuário
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados</CardTitle>
            <CardDescription>
              Lista de todos os usuários com acesso ao sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <UserTable users={users} />
            )}
          </CardContent>
        </Card>
      </div>
      <InviteUserDialog
        isOpen={isInviteDialogOpen}
        onClose={() => setIsInviteDialogOpen(false)}
      />
    </>
  );
}
