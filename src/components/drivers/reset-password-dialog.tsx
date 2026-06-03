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
import { KeyRound, Loader2 } from 'lucide-react';

interface ResetPasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entityLabel?: string;
  userName?: string;
  userEmail?: string;
  driverName?: string;
  driverEmail?: string;
  isLoading: boolean;
}

export function ResetPasswordDialog({
  isOpen,
  onClose,
  onConfirm,
  entityLabel = 'motorista',
  userName,
  userEmail,
  driverName,
  driverEmail,
  isLoading,
}: ResetPasswordDialogProps) {
  const displayName = userName || driverName || 'usuário selecionado';
  const displayEmail = userEmail || driverEmail;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resetar senha do {entityLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso irá definir a senha temporária <span className="font-semibold">123456</span> para{' '}
            <span className="font-semibold">{displayName}</span>
            {displayEmail ? ` (${displayEmail})` : ''}. No próximo acesso, o {entityLabel} será direcionado
            para criar uma nova senha antes de continuar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={onConfirm} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              {isLoading ? 'Resetando...' : 'Sim, resetar senha'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
