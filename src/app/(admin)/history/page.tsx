'use client';

import * as React from 'react';
import Link from 'next/link';
import { History, User, Route as RouteIcon, ArrowRight, Activity } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HistoryPage() {
  return (
    <div className="flex-1 space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Histórico</h2>
        <p className="text-muted-foreground">
          Consulte o histórico de rotas, motoristas e atividades do sistema
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/history/motorista">
          <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>Histórico Motorista</CardTitle>
                  <CardDescription>
                    Consulte rotas concluídas por motorista
                  </CardDescription>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Selecione um motorista e visualize todas as rotas que ele completou, incluindo detalhes de entregas e performance.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/history/rotas">
          <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <RouteIcon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>Histórico Rotas</CardTitle>
                  <CardDescription>
                    Consulte todas as rotas concluídas
                  </CardDescription>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Visualize todas as rotas concluídas do sistema, com filtros por data, status e outros critérios.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/history/atividades">
          <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>Histórico de Atividades</CardTitle>
                  <CardDescription>
                    Todas as movimentações do sistema
                  </CardDescription>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Visualize criações, edições, movimentações de pontos, despachos e status de entregas com filtros avançados.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
