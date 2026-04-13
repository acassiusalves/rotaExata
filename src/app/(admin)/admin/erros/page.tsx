'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, Clock, Loader2, MonitorSmartphone } from 'lucide-react';

export default function ErrorReportsPage() {
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const isAdmin = userRole ? ['admin', 'socio', 'gestor'].includes(userRole) : false;

  useEffect(() => {
    if (!authLoading && user) {
      loadReports();
    }
  }, [authLoading, user]);

  const loadReports = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();

      const response = await fetch('/api/feedbacks/admin', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('API Falhou');

      const data = await response.json();
      const allReports = data.reports || [];

      // Não-admin vê apenas os próprios reportes
      const filtered = isAdmin
        ? allReports
        : allReports.filter((r: any) => r.user?.email === user.email);

      setReports(filtered);
    } catch (error) {
      console.error('Erro ao buscar reportes:', error);
      toast({
        title: 'Erro de conexão',
        description: 'Falha ao carregar os reportes. Tente recarregar a página.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    if (!user) return;
    setIsUpdating(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/feedbacks/admin', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reportId: id, status: newStatus })
      });

      if (!response.ok) throw new Error('Falha no update');

      setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
      if (selectedReport && selectedReport.id === id) {
        setSelectedReport({ ...selectedReport, status: newStatus });
      }

      toast({
        title: 'Status Atualizado',
        description: `O reporte foi marcado como "${newStatus === 'resolved' ? 'Resolvido' : 'Em Andamento'}".`,
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar o status.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full"><CheckCircle2 className="w-3 h-3 mr-1" /> Resolvido</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full"><Clock className="w-3 h-3 mr-1" /> Em Análise</span>;
      default:
        return <span className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full"><AlertCircle className="w-3 h-3 mr-1" /> Pendente</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
             <CardTitle className="text-2xl flex items-center gap-2">
               <AlertCircle className="h-6 w-6 text-red-500" />
               Reportes de Erro
             </CardTitle>
             <CardDescription>
               {isAdmin
                 ? 'Gerencie e resolva problemas relatados pelos usuários no sistema.'
                 : 'Acompanhe o status dos reportes que você enviou ao administrador.'}
             </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadReports} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
             <div className="py-12 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>
          ) : reports.length === 0 ? (
             <div className="text-center py-12 text-muted-foreground">Nenhum erro reportado ainda. Tudo certo!</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Resumo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {report.createdAt ? new Date(report.createdAt._seconds * 1000).toLocaleString('pt-BR') : 'Agora'}
                      </TableCell>
                      <TableCell>
                         <div className="font-medium">{report.user?.name || 'Anônimo'}</div>
                         <div className="text-xs text-muted-foreground">{report.user?.email}</div>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground">
                        {report.description}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(report.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedReport(report)}>
                          Ver Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        {selectedReport && (
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                 Detalhes do Reporte
                 {getStatusBadge(selectedReport.status)}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-4">
               {/* Informações do Usuário */}
               <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg border border-border">
                  <div>
                    <span className="text-muted-foreground font-semibold block mb-1">Reportado por</span>
                    <p>{selectedReport.user?.name} ({selectedReport.user?.email})</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-semibold block mb-1">Data ocorrência</span>
                    <p>{selectedReport.createdAt ? new Date(selectedReport.createdAt._seconds * 1000).toLocaleString('pt-BR') : 'Data Indisponível'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground font-semibold block mb-1">Página de Origem</span>
                    <a href={selectedReport.context?.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center">
                       {selectedReport.context?.url}
                    </a>
                  </div>
               </div>

               {/* Descrição do Problema */}
               <div>
                  <h3 className="font-semibold text-sm mb-2 text-primary">Descrição informada:</h3>
                  <div className="bg-destructive/5 text-foreground p-4 rounded-md border border-destructive/20 whitespace-pre-wrap">
                    {selectedReport.description}
                  </div>
               </div>

               {/* Dados do Sistema */}
               <div>
                  <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                     <MonitorSmartphone className="w-4 h-4" />
                     Ambiente
                  </h3>
                  <div className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto text-muted-foreground space-y-1">
                     <p><strong className="text-foreground">Resolução:</strong> {selectedReport.context?.resolution}</p>
                     <p><strong className="text-foreground">User Agent:</strong> {selectedReport.context?.userAgent}</p>
                  </div>
               </div>

               {/* Logs Capturados */}
               {selectedReport.logs && selectedReport.logs.length > 0 && (
                 <div>
                    <h3 className="font-semibold text-sm mb-2">Logs de Erro da Sessão:</h3>
                    <div className="text-xs font-mono bg-[#1E1E1E] text-red-400 p-4 rounded-md overflow-y-auto max-h-[200px] whitespace-pre-wrap">
                       {selectedReport.logs.map((log: any, i: number) => (
                           <div key={i} className="mb-2 pb-2 border-b border-zinc-800 last:border-0 last:mb-0 last:pb-0">
                               <span className="text-zinc-500 mr-2">[{log.timestamp}]</span>
                               <span>{Array.isArray(log.args) ? log.args.join(' ') : JSON.stringify(log.args)}</span>
                           </div>
                       ))}
                    </div>
                 </div>
               )}
            </div>

            <DialogFooter className="mt-6 flex gap-2 justify-between w-full sm:justify-between border-t border-border pt-4">
               <div>
                 {isAdmin && selectedReport.status === 'pending' && (
                   <Button variant="secondary" onClick={() => updateStatus(selectedReport.id, 'in_progress')} disabled={isUpdating}>
                     Marcar Em Análise
                   </Button>
                 )}
                 {isAdmin && selectedReport.status !== 'resolved' && (
                   <Button variant="default" className="bg-green-600 hover:bg-green-700 ml-2" onClick={() => updateStatus(selectedReport.id, 'resolved')} disabled={isUpdating}>
                     Concluir / Resolver
                   </Button>
                 )}
                 {isAdmin && selectedReport.status === 'resolved' && (
                   <Button variant="outline" onClick={() => updateStatus(selectedReport.id, 'in_progress')} disabled={isUpdating}>
                     Reabrir Reporte
                   </Button>
                 )}
               </div>
               <Button variant="ghost" onClick={() => setSelectedReport(null)}>
                 Fechar
               </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
