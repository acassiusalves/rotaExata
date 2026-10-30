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
import { useFCMToken } from '@/hooks/use-fcm-token';

interface DriverSettings {
  notifications: boolean;
  darkMode: boolean;
  autoNavigation: boolean;
  keepScreenOn: boolean;
}

export default function DriverSettingsPage() {
  const { user, userRole } = useAuth();
  const { registrationState, requestPermission, isRegistering, disable: disablePush } = useFCMToken(userRole === 'driver' ? user?.uid ?? null : null, false);
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<DriverSettings>({
    notifications: false,
    darkMode: false,
    autoNavigation: false,
    keepScreenOn: true,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const wakeLockRef = React.useRef<WakeLockSentinel | null>(null);

  React.useEffect(() => {
    if (registrationState === 'enabled' || registrationState === 'disabled') {
      setSettings(previous => ({ ...previous, notifications: registrationState === 'enabled' }));
    }
  }, [registrationState]);

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
    if (!user) return false;

    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'preferences'), {
        darkMode: newSettings.darkMode, autoNavigation: newSettings.autoNavigation, keepScreenOn: newSettings.keepScreenOn,
      }, { merge: true });
      setSettings(newSettings);
      return true;
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
      });
      return false;
    }
  };

  // Wake Lock API para manter tela ligada
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (error) {
      console.error('Erro ao ativar Wake Lock:', error);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // Handlers para cada configuração
  const handleNotificationsChange = async (checked: boolean) => {
    if (!checked) {
      try { await disablePush(); }
      catch {
        toast({ variant: 'destructive', title: 'Não foi possível desativar os avisos', description: 'Tente novamente.' });
        return;
      }
    }
    if (checked && !await requestPermission()) {
      toast({ variant: 'destructive', title: 'Notificações não ativadas', description: 'Verifique a permissão de notificações do site e tente novamente. Se continuar, entre em contato com a equipe.' });
      return;
    }
    setSettings(previous => ({ ...previous, notifications: checked }));
    if (checked) {
      toast({ title: 'Notificações ativadas', description: 'Este dispositivo foi cadastrado para receber os avisos.' });
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
              checked={registrationState === 'enabled'}
              disabled={isRegistering}
              onCheckedChange={handleNotificationsChange}
            />
          </div>
          {['error', 'blocked', 'unsupported', 'impersonating'].includes(registrationState) && (
            <p className="text-sm text-muted-foreground" role="status">
              {registrationState === 'blocked' ? 'Notificações bloqueadas nas permissões do site.'
                : registrationState === 'impersonating' ? 'O modo teste não cadastra notificações para o entregador.'
                  : registrationState === 'unsupported' ? 'Este navegador não oferece suporte a notificações push.'
                    : 'O cadastro de notificações falhou. Tente ativar novamente.'}
            </p>
          )}
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
