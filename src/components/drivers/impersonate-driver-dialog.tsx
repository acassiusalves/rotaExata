'use client';

import React from 'react';
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
import { Loader2, Smartphone } from 'lucide-react';

interface ImpersonateDriverDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  driverName: string;
  isLoading: boolean;
}

export function ImpersonateDriverDialog({
  isOpen,
  onClose,
  onConfirm,
  driverName,
  isLoading,
}: ImpersonateDriverDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Testar como Motorista</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Você está prestes a abrir uma nova janela simulando a visualização mobile do
            motorista{' '}
            <span className="font-semibold text-foreground">{driverName}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm">
            <p className="font-medium text-yellow-900 mb-1">⚠️ Importante:</p>
            <ul className="list-disc list-inside space-y-1 text-yellow-800">
              <li>Esta ação será registrada para auditoria</li>
              <li>O token expira em 1 hora</li>
              <li>A visualização não afeta o status real do motorista</li>
              <li>Use apenas para testes e validações</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            A janela abrirá automaticamente com uma visualização mobile da interface do motorista.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={onConfirm} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando Token...
                </>
              ) : (
                <>
                  <Smartphone className="mr-2 h-4 w-4" />
                  Continuar como Motorista
                </>
              )}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
