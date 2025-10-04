'use client';

import * as React from 'react';
import { PlusCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Driver } from '@/lib/types';
import { DriverTable } from '@/components/drivers/driver-table';
import { AddDriverDialog } from '@/components/drivers/add-driver-dialog';

export default function DriversPage() {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  React.useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'driver'));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const driversData: Driver[] = [];
        querySnapshot.forEach((doc) => {
          // Adapt the structure from 'users' collection to 'Driver' type
          const data = doc.data();
          driversData.push({
            id: doc.id,
            name: data.displayName || data.email, // Use displayName or fallback to email
            phone: data.phone || 'N/A',
            email: data.email,
            status: data.status || 'offline', // Assuming a default status
            vehicle: data.vehicle || { type: 'N/A', plate: 'N/A' },
            lastSeenAt: data.lastSeenAt?.toDate() || new Date(0),
            totalDeliveries: data.totalDeliveries || 0,
            rating: data.rating || 0,
            avatarUrl: data.photoURL || `https://i.pravatar.cc/150?u=${doc.id}`,
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
          <Button onClick={() => setIsDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Adicionar Motorista
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DriverTable drivers={drivers} />
            )}
          </CardContent>
        </Card>
      </div>
      <AddDriverDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </>
  );
}
