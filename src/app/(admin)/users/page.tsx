
import { PlusCircle } from 'lucide-react';
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
import { Timestamp } from 'firebase/firestore';


// Mock data, em um app real isso viria do Firestore
const users: User[] = [
  {
    uid: 'user-1',
    email: 'acassiusalves@gmail.com',
    role: 'admin',
    createdAt: Timestamp.now(),
  },
  {
    uid: 'user-2',
    email: 'vendedor1@rotaexata.com',
    role: 'vendedor',
    createdAt: Timestamp.now(),
  },
  {
    uid: 'user-3',
    email: 'motorista@rotaexata.com',
    role: 'driver',
    createdAt: Timestamp.now(),
  },
];

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Usuários</h2>
          <p className="text-muted-foreground">
            Gerencie os usuários e suas permissões no sistema.
          </p>
        </div>
        <Button>
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
          <UserTable users={users} />
        </CardContent>
      </Card>
    </div>
  );
}
