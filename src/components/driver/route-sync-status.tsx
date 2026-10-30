'use client';

import * as React from 'react';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DriverRoutesState } from '@/lib/driver-routes-sync';

type Props = { state: DriverRoutesState; isRefreshing: boolean; lastServerSyncAt: number | null; onRefresh: () => void };

export function RouteSyncStatus({ state, isRefreshing, lastServerSyncAt, onRefresh }: Props) {
  const hasProblem = state === 'error' || state === 'offline';
  const Icon = state === 'offline' ? WifiOff : AlertCircle;

  return (
    <div className="px-4 py-3">
      {hasProblem && (
        <div role={state === 'error' ? 'alert' : 'status'} className="mb-3 flex items-start gap-3 rounded-lg border bg-card p-4">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{state === 'offline' ? 'Sem conexão' : 'Não foi possível atualizar suas rotas'}</p>
            <p className="text-sm text-muted-foreground">
              {state === 'offline'
                ? 'As rotas serão atualizadas quando a conexão voltar.'
                : 'Tente novamente. Se o problema continuar, entre em contato com a equipe.'}
              {lastServerSyncAt !== null && ' As últimas rotas carregadas continuam disponíveis abaixo.'}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {isRefreshing || state === 'loading'
            ? 'Atualizando rotas…'
            : lastServerSyncAt !== null
              ? `Última atualização: ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(lastServerSyncAt)}`
              : 'Aguardando atualização das rotas'}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {isRefreshing ? 'Atualizando…' : hasProblem ? 'Tentar novamente' : 'Atualizar rotas'}
        </Button>
      </div>
    </div>
  );
}
