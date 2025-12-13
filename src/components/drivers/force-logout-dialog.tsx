'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut } from 'lucide-react';

interface ForceLogoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  driverName?: string;
  isLoading: boolean;
}

export function ForceLogoutDialog({
  isOpen,
  onClose,
  onConfirm,
  driverName,
  isLoading,
}: ForceLogoutDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deslogar Motorista?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso irá forçar o logout do motorista{' '}
            <span className="font-semibold">{driverName}</span> em todos os dispositivos.
            O motorista precisará fazer login novamente para continuar usando o aplicativo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="default"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              {isLoading ? 'Deslogando...' : 'Sim, deslogar'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
