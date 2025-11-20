'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell, Moon, Navigation, Smartphone } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useToast } from '@/hooks/use-toast';

interface DriverSettings {
  notifications: boolean;
  darkMode: boolean;
  autoNavigation: boolean;
  keepScreenOn: boolean;
}

export default function DriverSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<DriverSettings>({
    notifications: true,
    darkMode: false,
    autoNavigation: false,
    keepScreenOn: true,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const wakeLockRef = React.useRef<WakeLockSentinel | null>(null);

  // Carregar configurações salvas
  React.useEffect(() => {
    async function loadSettings() {
      if (!user) return;

      try {
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'settings', 'preferences'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data() as DriverSettings;
          setSettings(data);

          // Aplicar modo escuro se estiver ativado
          if (data.darkMode) {
            document.documentElement.classList.add('dark');
          }

          // Aplicar keep screen on se estiver ativado
          if (data.keepScreenOn) {
            requestWakeLock();
          }
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [user]);

  // Salvar configurações no Firestore
  const saveSettings = async (newSettings: DriverSettings) => {
    if (!user) return;

    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'preferences'), newSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
      });
    }
  };

  // Wake Lock API para manter tela ligada
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Wake Lock ativado');
      }
    } catch (error) {
      console.error('Erro ao ativar Wake Lock:', error);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('Wake Lock desativado');
    }
  };

  // Handlers para cada configuração
  const handleNotificationsChange = async (checked: boolean) => {
    const newSettings = { ...settings, notifications: checked };
    await saveSettings(newSettings);

    if (checked) {
      // Solicitar permissão de notificação
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          toast({
            title: 'Notificações ativadas',
            description: 'Você receberá alertas de novas rotas.',
          });
        }
      }
    }
  };

  const handleDarkModeChange = async (checked: boolean) => {
    const newSettings = { ...settings, darkMode: checked };
    await saveSettings(newSettings);

    // Aplicar ou remover classe dark
    if (checked) {
      document.documentElement.classList.add('dark');
      toast({
        title: 'Modo escuro ativado',
        description: 'O tema escuro foi aplicado.',
      });
    } else {
      document.documentElement.classList.remove('dark');
      toast({
        title: 'Modo claro ativado',
        description: 'O tema claro foi aplicado.',
      });
    }
  };

  const handleAutoNavigationChange = async (checked: boolean) => {
    const newSettings = { ...settings, autoNavigation: checked };
    await saveSettings(newSettings);

    toast({
      title: checked ? 'Navegação automática ativada' : 'Navegação automática desativada',
      description: checked
        ? 'O GPS será aberto automaticamente ao iniciar rotas.'
        : 'Você precisará abrir o GPS manualmente.',
    });
  };

  const handleKeepScreenOnChange = async (checked: boolean) => {
    const newSettings = { ...settings, keepScreenOn: checked };
    await saveSettings(newSettings);

    if (checked) {
      await requestWakeLock();
      toast({
        title: 'Tela sempre ligada',
        description: 'A tela não desligará durante as entregas.',
      });
    } else {
      await releaseWakeLock();
      toast({
        title: 'Modo normal',
        description: 'A tela pode desligar normalmente.',
      });
    }
  };

  // Limpar wake lock ao desmontar
  React.useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
          <CardDescription>Gerencie como você recebe notificações</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="notifications">Notificações Push</Label>
                <p className="text-sm text-muted-foreground">
                  Receber alertas de novas rotas
                </p>
              </div>
            </div>
            <Switch
              id="notifications"
              checked={settings.notifications}
              onCheckedChange={handleNotificationsChange}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
          <CardDescription>Personalize a aparência do aplicativo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Moon className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="darkMode">Modo Escuro</Label>
                <p className="text-sm text-muted-foreground">
                  Ativar tema escuro
                </p>
              </div>
            </div>
            <Switch
              id="darkMode"
              checked={settings.darkMode}
              onCheckedChange={handleDarkModeChange}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navegação</CardTitle>
          <CardDescription>Configure o comportamento da navegação</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Navigation className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="autoNavigation">Navegação Automática</Label>
                <p className="text-sm text-muted-foreground">
                  Abrir GPS automaticamente ao iniciar rota
                </p>
              </div>
            </div>
            <Switch
              id="autoNavigation"
              checked={settings.autoNavigation}
              onCheckedChange={handleAutoNavigationChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="keepScreenOn">Manter Tela Ligada</Label>
                <p className="text-sm text-muted-foreground">
                  Evitar que a tela desligue durante entregas
                </p>
              </div>
            </div>
            <Switch
              id="keepScreenOn"
              checked={settings.keepScreenOn}
              onCheckedChange={handleKeepScreenOnChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
