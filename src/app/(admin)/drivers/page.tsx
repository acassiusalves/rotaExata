'use client';

import * as React from 'react';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DriverTableSkeleton } from '@/components/skeletons/table-skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Driver } from '@/lib/types';
import { DriverTable } from '@/components/drivers/driver-table';
import { AddDriverDialog } from '@/components/drivers/add-driver-dialog';
import { DeleteDriverDialog } from '@/components/drivers/delete-driver-dialog';
import { useToast } from '@/hooks/use-toast';
import { functions } from '@/lib/firebase/client';
import { httpsCallable } from 'firebase/functions';


export default function DriversPage() {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [driverToDelete, setDriverToDelete] = React.useState<Driver | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'driver'));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const driversData: Driver[] = [];
        console.log('🚗 [drivers] Total de motoristas encontrados:', querySnapshot.size);

        querySnapshot.forEach((doc) => {
          const data = doc.data();

          console.log('🚗 [drivers] Dados do motorista:', {
            id: doc.id,
            email: data.email,
            role: data.role,
            status: data.status,
            statusType: typeof data.status,
            lastSeenAt: data.lastSeenAt,
          });

          driversData.push({
            id: doc.id,
            name: data.displayName || data.name || 'Motorista sem nome',
            phone: data.phone || 'N/A',
            email: data.email,
            status: data.status || 'offline',
            vehicle: data.vehicle || { type: 'N/A', plate: 'N/A' },
            lastSeenAt: data.lastSeenAt?.toDate() || new Date(0),
            totalDeliveries: data.totalDeliveries || 0,
            rating: data.rating || 0,
            avatarUrl: data.photoURL,
          });
        });

        console.log('🚗 [drivers] Motoristas processados:', driversData.map(d => ({
          email: d.email,
          status: d.status,
        })));

        setDrivers(driversData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching drivers: ', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);
  
  const handleDeleteDriver = async () => {
    if (!driverToDelete) return;
    setIsDeleting(true);

    try {
      const deleteUserFn = httpsCallable(functions, 'deleteUser');
      await deleteUserFn({ uid: driverToDelete.id });

      toast({
        title: 'Motorista Removido!',
        description: `O motorista ${driverToDelete.name} foi removido com sucesso.`,
      });

      setDriverToDelete(null); // Close dialog
    } catch (error: any) {
      console.error('Error deleting driver:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Remover',
        description: error.message || 'Não foi possível remover o motorista.',
      });
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Motoristas</h2>
            <p className="text-muted-foreground">
              Gerencie sua equipe de motoristas.
            </p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Adicionar Motorista
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <DriverTableSkeleton />
            ) : (
              <DriverTable drivers={drivers} onDeleteClick={(driver) => setDriverToDelete(driver)} />
            )}
          </CardContent>
        </Card>
      </div>
      <AddDriverDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
      <DeleteDriverDialog
        isOpen={!!driverToDelete}
        onClose={() => setDriverToDelete(null)}
        onConfirm={handleDeleteDriver}
        driverName={driverToDelete?.name}
        isDeleting={isDeleting}
      />
    </>
  );
}
