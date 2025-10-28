'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase/client';
import { collection, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { generateRouteCode } from '@/lib/firebase/route-code';
import { Progress } from '@/components/ui/progress';

export default function MigrateCodesPage() {
  const [isRunning, setIsRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [updated, setUpdated] = React.useState(0);
  const [skipped, setSkipped] = React.useState(0);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<'idle' | 'running' | 'success' | 'error'>('idle');

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const runMigration = async () => {
    setIsRunning(true);
    setStatus('running');
    setLogs([]);
    setProgress(0);
    setUpdated(0);
    setSkipped(0);

    try {
      addLog('🚀 Iniciando migração de códigos de rotas...');

      // Buscar todas as rotas
      const routesRef = collection(db, 'routes');
      const q = query(routesRef, orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);

      const totalRoutes = snapshot.size;
      setTotal(totalRoutes);
      addLog(`📊 Total de rotas encontradas: ${totalRoutes}`);

      let processedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const routeDoc of snapshot.docs) {
        const routeData = routeDoc.data();

        // Verificar se a rota já tem código
        if (routeData.code) {
          addLog(`⏭️  Rota ${routeData.name || routeDoc.id} já possui código: ${routeData.code}`);
          skippedCount++;
        } else {
          // Gerar novo código
          const newCode = await generateRouteCode();

          // Atualizar a rota
          await updateDoc(doc(db, 'routes', routeDoc.id), {
            code: newCode,
          });

          addLog(`✅ Rota "${routeData.name || 'Sem nome'}" atualizada com código: ${newCode}`);
          updatedCount++;
        }

        processedCount++;
        setProgress((processedCount / totalRoutes) * 100);
        setUpdated(updatedCount);
        setSkipped(skippedCount);

        // Pequeno delay para evitar sobrecarga
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      addLog('🎉 Migração concluída!');
      addLog(`📝 Rotas atualizadas: ${updatedCount}`);
      addLog(`⏭️  Rotas ignoradas (já tinham código): ${skippedCount}`);
      addLog(`📊 Total processado: ${totalRoutes}`);

      setStatus('success');
    } catch (error) {
      console.error('Erro durante a migração:', error);
      addLog(`❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      setStatus('error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex-1 space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Migração de Códigos de Rotas</h2>
        <p className="text-muted-foreground">
          Adicione códigos sequenciais únicos às rotas existentes
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Atenção</AlertTitle>
        <AlertDescription>
          Este processo irá adicionar códigos sequenciais (RT-0001, RT-0002, etc.) a todas as rotas que ainda não possuem código.
          Rotas que já possuem código serão ignoradas.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Executar Migração</CardTitle>
          <CardDescription>
            Clique no botão abaixo para iniciar o processo de migração
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={runMigration}
            disabled={isRunning}
            size="lg"
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              'Iniciar Migração'
            )}
          </Button>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progresso</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Total: {total}</span>
                <span>Atualizadas: {updated}</span>
                <span>Ignoradas: {skipped}</span>
              </div>
            </div>
          )}

          {status === 'success' && (
            <Alert className="border-green-500 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-600">Sucesso!</AlertTitle>
              <AlertDescription className="text-green-600">
                Migração concluída com sucesso. {updated} rotas foram atualizadas.
              </AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>
                Ocorreu um erro durante a migração. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Logs de Execução</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-muted p-4 font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
