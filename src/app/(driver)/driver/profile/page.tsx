'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, User, Mail, Phone, Car, Calendar } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

export default function DriverProfilePage() {
  const { user } = useAuth();
  const [driverData, setDriverData] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadDriverData() {
      if (!user) return;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setDriverData(userDoc.data());
        }
      } catch (error) {
        console.error('Erro ao carregar dados do motorista:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadDriverData();
  }, [user]);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name.substring(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Perfil do Motorista</h1>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4">
            <Avatar className="w-24 h-24 border-4 border-primary/20">
              <AvatarImage src={user?.photoURL ?? undefined} />
              <AvatarFallback className="text-2xl font-bold">
                {getInitials(user?.displayName || user?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h2 className="text-xl font-bold">{user?.displayName || 'Motorista'}</h2>
              <p className="text-sm text-muted-foreground">
                {driverData?.role === 'driver' ? 'Motorista' : 'Usuário'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações Pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          {driverData?.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Telefone</p>
                <p className="text-sm text-muted-foreground">{driverData.phone}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {driverData?.vehicle && (
        <Card>
          <CardHeader>
            <CardTitle>Informações do Veículo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Car className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Veículo</p>
                <p className="text-sm text-muted-foreground">
                  {driverData.vehicle.type} - {driverData.vehicle.plate}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Estatísticas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Total de Entregas</p>
              <p className="text-sm text-muted-foreground">
                {driverData?.totalDeliveries || 0} entregas realizadas
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
