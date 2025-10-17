'use client';

import * as React from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useFCMToken } from '@/hooks/use-fcm-token';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

interface NotificationPermissionPromptProps {
  userId: string;
  userRole: string;
}

export function NotificationPermissionPrompt({
  userId,
  userRole,
}: NotificationPermissionPromptProps) {
  const { token, notificationPermission, requestPermission } = useFCMToken();
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isRequesting, setIsRequesting] = React.useState(false);

  // Salvar token no Firestore quando obtido
  React.useEffect(() => {
    if (token && userId) {
      const userRef = doc(db, 'users', userId);
      updateDoc(userRef, {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date(),
      }).catch(error => {
        console.error('Erro ao salvar FCM token:', error);
      });
    }
  }, [token, userId]);

  // Não mostrar para roles que não precisam (admin, gestor, socio)
  if (userRole !== 'driver') {
    return null;
  }

  // Não mostrar se já tem permissão ou foi dispensado
  if (notificationPermission === 'granted' || isDismissed) {
    return null;
  }

  // Não mostrar se foi negado permanentemente
  if (notificationPermission === 'denied') {
    return null;
  }

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      await requestPermission();
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    // Salvar preferência de dismissal no localStorage
    localStorage.setItem('notification-prompt-dismissed', 'true');
  };

  // Verificar se foi dispensado anteriormente
  React.useEffect(() => {
    const dismissed = localStorage.getItem('notification-prompt-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-4">
      <Card className="border-2 border-primary shadow-lg">
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <Bell className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Ativar Notificações</CardTitle>
              <CardDescription className="text-sm">
                Receba atualizações instantâneas sobre suas rotas
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Ative as notificações para receber alertas quando:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>O administrador alterar sua rota</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Mudanças na sequência de paradas</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Endereços forem atualizados</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Novas paradas forem adicionadas</span>
            </li>
          </ul>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            onClick={handleRequestPermission}
            disabled={isRequesting}
            className="flex-1"
          >
            <Bell className="mr-2 h-4 w-4" />
            {isRequesting ? 'Ativando...' : 'Ativar Notificações'}
          </Button>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="flex-1"
          >
            <BellOff className="mr-2 h-4 w-4" />
            Agora Não
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
