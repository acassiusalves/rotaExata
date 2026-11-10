'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { emptyReportDraft, ReportForm } from '@/components/erros/ReportForm';
import { REPORT_CREATED_EVENT, readSubmission } from '@/lib/reporting/report-contract';
import { MessageSquareWarning, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function FloatingFeedbackButton() {
  const { user } = useAuth();
  return <FeedbackButton key={user?.uid ?? 'anonymous'} />;
}

function FeedbackButton() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyReportDraft);
  const requestId = useRef<string | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturedLogs, setCapturedLogs] = useState<any[]>([]);
  const { toast } = useToast();

  const originalConsoleError = useRef<any>(null);

  // Hook into console.error to capture latest errors
  useEffect(() => {
    if (typeof window === 'undefined') return;

    originalConsoleError.current = console.error;

    console.error = (...args: any[]) => {
      // Store the error (limit to last 10)
      setCapturedLogs(prev => {
        const newLogs = [...prev, { timestamp: new Date().toISOString(), args: args.map(arg => String(arg)) }];
        return newLogs.slice(-10);
      });
      // Call original
      if (originalConsoleError.current) {
        originalConsoleError.current.apply(console, args);
      }
    };

    return () => {
      if (originalConsoleError.current) {
        console.error = originalConsoleError.current;
      }
    };
  }, []);

  // Only render if user is loaded
  if (loading || !user) {
    return null;
  }

  const submission = readSubmission(draft);
  const handleSubmit = async () => {
    if (!user || !submission || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    requestId.current ??= crypto.randomUUID();
    setIsSubmitting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/feedbacks', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...submission,
          submissionId: requestId.current,
          url: window.location.href,
          userAgent: navigator.userAgent,
          resolution: `${window.innerWidth}x${window.innerHeight}`,
          logs: capturedLogs,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Falha ao enviar chamado.');

      if (controller.signal.aborted) return;
      window.dispatchEvent(new Event(REPORT_CREATED_EVENT));
      toast({ title: 'Chamado enviado', description: 'Acompanhe o andamento na tela Chamados.' });

      setOpen(false);
      setDraft(emptyReportDraft);
      requestId.current = undefined;
      setCapturedLogs([]);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(error);
      toast({
        title: 'Erro de conexão',
        description: error instanceof Error ? error.message : 'Não foi possível enviar seu chamado agora. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button aria-label="Abrir chamado" className="floating-feedback-btn fixed bottom-6 right-6 z-[100]">
          <div className="floating-feedback-sign">
            <MessageSquareWarning />
          </div>
          <div className="floating-feedback-text">Abrir chamado</div>
        </button>
      </DialogTrigger>

      <style>{`
        .floating-feedback-btn {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          width: 45px;
          height: 45px;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          position: fixed !important;
          bottom: 24px;
          right: 24px;
          z-index: 100;
          overflow: hidden;
          transition-duration: .3s;
          box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.199);
          background-color: rgb(255, 65, 65);
        }

        .floating-feedback-sign {
          width: 100%;
          transition-duration: .3s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .floating-feedback-sign svg {
          width: 17px;
        }

        .floating-feedback-sign svg path,
        .floating-feedback-sign svg line,
        .floating-feedback-sign svg polyline,
        .floating-feedback-sign svg polygon,
        .floating-feedback-sign svg rect,
        .floating-feedback-sign svg circle {
          stroke: white;
        }

        .floating-feedback-text {
          position: absolute;
          left: 0%;
          width: 0%;
          opacity: 0;
          color: white;
          font-size: 0.85em;
          font-weight: 600;
          transition-duration: .3s;
          text-align: right;
        }

        .floating-feedback-btn:hover {
          width: 135px;
          border-radius: 40px;
          transition-duration: .3s;
        }

        .floating-feedback-btn:hover .floating-feedback-sign {
          width: 0%;
          opacity: 0;
          transition-duration: .3s;
          padding-right: 0;
        }

        .floating-feedback-btn:hover .floating-feedback-text {
          opacity: 1;
          width: 100%;
          transition-duration: .3s;
          text-align: center;
          padding: 0 10px;
        }

        .floating-feedback-btn:active {
          transform: translate(2px, 2px);
        }
      `}</style>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Abrir chamado</DialogTitle>
          <DialogDescription>Relate um erro ou sugira uma melhoria.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <ReportForm draft={draft} disabled={isSubmitting} onChange={(next) => {
            requestId.current = undefined;
            setDraft(next);
          }} />
          <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded-md border border-border">
            <p>Ao enviar, incluiremos também:</p>
            <ul className="list-disc pl-4 mt-1">
              <li>Endereço da página atual</li>
              <li>Seus dados de usuário</li>
              <li>Logs técnicos recentes (erros do navegador)</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !submission}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enviar chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
