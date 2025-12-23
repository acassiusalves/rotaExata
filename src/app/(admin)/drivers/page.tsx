'use client';

import * as React from 'react';
import { PlusCircle, RefreshCw } from 'lucide-react';
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
import { ForceLogoutDialog } from '@/components/drivers/force-logout-dialog';
import { useToast } from '@/hooks/use-toast';
import { functions } from '@/lib/firebase/client';
import { httpsCallable } from 'firebase/functions';


export default function DriversPage() {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [driverToDelete, setDriverToDelete] = React.useState<Driver | null>(null);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [driverToLogout, setDriverToLogout] = React.useState<Driver | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'driver'));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const driversData: Driver[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();

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
            deviceInfo: data.deviceInfo || undefined,
          });
        });

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

  const handleForceLogout = async () => {
    if (!driverToLogout) return;
    setIsLoggingOut(true);

    try {
      const forceLogoutFn = httpsCallable(functions, 'forceLogoutDriver');
      await forceLogoutFn({ uid: driverToLogout.id });

      toast({
        title: 'Motorista Deslogado!',
        description: `O motorista ${driverToLogout.name} foi deslogado com sucesso.`,
      });

      setDriverToLogout(null);
    } catch (error: any) {
      console.error('Error forcing logout:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Deslogar',
        description: error.message || 'Não foi possível deslogar o motorista.',
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleRefreshStatus = async () => {
    setIsRefreshingStatus(true);

    try {
      const forceCleanupFn = httpsCallable<void, { ok: boolean; updated: number; message: string }>(
        functions,
        'forceCleanupOfflineDrivers'
      );
      const result = await forceCleanupFn();

      toast({
        title: 'Status Atualizado!',
        description: result.data.message,
      });
    } catch (error: any) {
      console.error('Error refreshing status:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Atualizar',
        description: error.message || 'Não foi possível atualizar o status dos motoristas.',
      });
    } finally {
      setIsRefreshingStatus(false);
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefreshStatus}
              disabled={isRefreshingStatus}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
              {isRefreshingStatus ? 'Atualizando...' : 'Atualizar Status'}
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Adicionar Motorista
            </Button>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <DriverTableSkeleton />
            ) : (
              <DriverTable
                drivers={drivers}
                onDeleteClick={(driver) => setDriverToDelete(driver)}
                onForceLogoutClick={(driver) => setDriverToLogout(driver)}
              />
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
      <ForceLogoutDialog
        isOpen={!!driverToLogout}
        onClose={() => setDriverToLogout(null)}
        onConfirm={handleForceLogout}
        driverName={driverToLogout?.name}
        isLoading={isLoggingOut}
      />
    </>
  );
}
