'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bell,Home } from 'lucide-react';
import { DriverRuntimeProvider,useDriverRuntime } from '@/components/driver/driver-runtime';
import { DriverNavigationDrawer } from '@/components/driver/driver-navigation-drawer';
import { useDeviceInfo } from '@/hooks/use-device-info';
import { useDriverResource } from '@/hooks/use-driver-resource';
import { NotificationPermissionPrompt } from '@/components/notifications/notification-permission-prompt';
import { Avatar,AvatarFallback,AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { driverQuery } from '@/lib/driver/runtime-client';
import type { DriverInbox } from '@/lib/driver/runtime-contract';
import { FloatingFeedbackButton } from '@/components/FloatingFeedbackButton';

function DriverLayoutContent({children}:{children:ReactNode}) {
  const {profile,userId,endpoint,readOnly,native,signOut}=useDriverRuntime();
  const pathname=usePathname();
  const {data}=useDriverResource<{notifications:DriverInbox[]}>(driverQuery(endpoint,'inbox'));
  const unread=data?.notifications.filter(item=>!item.opened).length ?? 0;
  const initials=(profile.displayName || profile.email || 'Motorista').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  useDeviceInfo(!readOnly);

  return <div className="flex min-h-screen w-full flex-col">
    {readOnly && <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b bg-amber-100 px-3 py-2 text-xs text-amber-950">
      <span>Modo teste · {profile.displayName}</span>
      <Button size="sm" variant="ghost" onClick={()=>void signOut()}>Sair do modo teste</Button>
    </div>}
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:h-16">
      <DriverNavigationDrawer />
      {pathname!=='/my-routes' && <Button variant="ghost" size="icon" asChild>
        <Link href="/my-routes"><Home className="h-5 w-5" /><span className="sr-only">Voltar às rotas</span></Link>
      </Button>}
      <div className="flex-1" />
      <Button variant="ghost" size="icon" className="relative" asChild>
        <Link href="/driver/notifications"><Bell className="h-5 w-5" />
          {unread>0 && <Badge variant="destructive" className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-xs">{unread>9?'9+':unread}</Badge>}
          <span className="sr-only">Notificações</span></Link>
      </Button>
      <Avatar className="h-8 w-8"><AvatarImage src={profile.photoURL} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
    </header>
    <main className="flex-1 bg-muted/40"><div className="mx-auto w-full max-w-md">{children}</div></main>
    {!readOnly && <NotificationPermissionPrompt userId={userId} userRole="driver" />}
    {native && <><FloatingFeedbackButton /><Toaster /></>}
  </div>;
}

export default function DriverLayout({children}:{children:ReactNode}) {
  return <DriverRuntimeProvider><DriverLayoutContent>{children}</DriverLayoutContent></DriverRuntimeProvider>;
}
