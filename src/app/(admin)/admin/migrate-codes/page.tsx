'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useOptionalStaff } from '@/components/staff/staff-session';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { reportErrorMessage, useStaffReportCommandIds } from '@/components/reports/use-staff-report-data';
import { Progress } from '@/components/ui/progress';

export default function MigrateCodesPage() {
  return nativeStaffEnabled ? <NativeMigrateCodes />:<LegacyMigrateCodes />;
}

type Candidate={id:string;name:string;revision:string};
type Preview={routes:Candidate[];checked:number;cursor:string|null};
function NativeMigrateCodes() {
  const staff=useOptionalStaff();
  const commandId=useStaffReportCommandIds();
  const [preview,setPreview]=React.useState<Omit<Preview,'cursor'>>();
  const [applied,setApplied]=React.useState<{id:string;code:string}[]>([]);
  const [running,setRunning]=React.useState<'preview'|'apply'>();
  const [error,setError]=React.useState('');
  async function simulate() {
    if (!staff || running) return;
    setRunning('preview');
    setPreview(undefined);
    setApplied([]);
    setError('');
    try {
      const routes:Candidate[]=[];
      let checked=0;
      let cursor:string|null=null;
      do {
        const query=new URLSearchParams({view:'codes'});
        if (cursor) query.set('cursor',cursor);
        const page:Preview=await staff.request('/api/staff/history/codes?'+query);
        if (page.cursor && page.cursor===cursor) throw new Error('Invalid pagination cursor');
        cursor=page.cursor;
        routes.push(...page.routes);
        checked+=page.checked;
      } while (cursor);
      setPreview({routes,checked});
    } catch (error) {
      setError(reportErrorMessage(error));
    } finally {
      setRunning(undefined);
    }
  }
  async function apply() {
    if (!staff || !preview?.routes.length || running) return;
    if (!window.confirm(`Preencher o código de ${preview.routes.length} rota(s) da simulação?`)) return;
    setRunning('apply');
    setError('');
    try {
      const rows=preview.routes.filter(route=>!applied.some(row=>row.id===route.id));
      for (let start=0;start<rows.length;start+=50) {
        const routes=rows.slice(start,start+50).map(({id,revision})=>({id,revision}));
        const result=await staff.request<{routes:typeof applied}>('/api/staff/history/codes',{
          method:'POST',body:JSON.stringify({routes,commandId:commandId(routes)}),
        });
        setApplied(previous=>[...previous,...result.routes]);
      }
    } catch (error) {
      setError(reportErrorMessage(error));
    } finally {
      setRunning(undefined);
    }
  }
  return <div className="flex-1 space-y-4">
    <div>
      <h2 className="text-3xl font-bold tracking-tight">Migração de Códigos de Rotas</h2>
      <p className="text-muted-foreground">Preencha códigos sequenciais em rotas que ainda não possuem código.</p>
    </div>
    <Card>
      <CardHeader><CardTitle>Simulação e migração</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>void simulate()} disabled={!staff || !!running}>
            {running==='preview' ? 'Consultando rotas…':'Simular migração'}
          </Button>
          <Button onClick={()=>void apply()} disabled={!staff || !!running || !preview || preview.routes.length<=applied.length}>
            {running==='apply' ? 'Aplicando códigos…':'Aplicar aos resultados'}
          </Button>
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {preview && <>
          <p role="status">{preview.checked} rota(s) consultada(s). {preview.routes.length} sem código. {applied.length} atualizada(s).</p>
          {preview.routes.length>0 && <ul className="max-h-96 space-y-1 overflow-auto rounded-md border p-3 text-sm">
            {preview.routes.map(route=><li key={route.id}>
              <span>{route.name}</span>
              {applied.find(row=>row.id===route.id) && <span className="ml-2 font-medium">{applied.find(row=>row.id===route.id)?.code}</span>}
            </li>)}
          </ul>}
        </>}
      </CardContent>
    </Card>
  </div>;
}

function LegacyMigrateCodes() {
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

      const [{db},{collection,getDocs,doc,updateDoc,query,orderBy},{generateRouteCode}]=await Promise.all([
        import('@/lib/firebase/client'),import('firebase/firestore'),import('@/lib/firebase/route-code'),
      ]);
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
