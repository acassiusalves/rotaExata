
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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';


// Mock data, em um app real isso viria do Firestore
const users: User[] = [
  {
    uid: 'user-1',
    email: 'acassiusalves@gmail.com',
    role: 'admin',
    createdAt: new Timestamp(1726513200, 0), // Sep 16 2024 16:00:00 GMT-0300 (Brasilia Time)
  },
  {
    uid: 'user-2',
    email: 'vendedor1@rotaexata.com',
    role: 'vendedor',
    createdAt: new Timestamp(1726426800, 0), // Sep 15 2024 16:00:00 GMT-0300
  },
  {
    uid: 'user-3',
    email: 'motorista@rotaexata.com',
    role: 'driver',
    createdAt: new Timestamp(1726340400, 0), // Sep 14 2024 16:00:00 GMT-0300
  },
];

// Helper to convert Firestore Timestamps to a serializable format with formatted date string
const serializeUsers = (users: User[]) => {
  return users.map(user => {
    const { createdAt, ...rest } = user;
    let createdAtString = 'Data inválida';

    if (createdAt instanceof Timestamp) {
      // Format date on the server to prevent hydration issues
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
  const serializableUsers = serializeUsers(users);
  
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
          <UserTable users={serializableUsers} />
        </CardContent>
      </Card>
    </div>
  );
}
