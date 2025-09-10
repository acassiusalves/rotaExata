'use client';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Bot, Route, FileText } from 'lucide-react';
import { Order } from '@/lib/types';
import { drivers } from '@/lib/data';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { useToast } from '@/hooks/use-toast';
import { summarizeOrderNotes } from '@/ai/flows/summarize-order-notes';
import { optimizeDeliveryRoutes } from '@/ai/flows/optimize-delivery-routes';
import { Skeleton } from '../ui/skeleton';

export function OrderActions({ order }: { order: Order }) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [optimizedRoute, setOptimizedRoute] = useState<any>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { toast } = useToast();

  const driver = drivers.find((d) => d.id === order.assignedTo);

  const handleSummarize = async () => {
    if (!order.notes) {
      toast({
        title: 'Nenhuma nota para resumir',
        description: 'Este pedido não contém notas.',
      });
      return;
    }
    setIsSummarizing(true);
    try {
      const result = await summarizeOrderNotes({ notes: order.notes });
      setSummary(result.summary);
      toast({
        title: 'Resumo gerado com sucesso!',
        description: 'A IA analisou as notas do pedido.',
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Erro ao resumir',
        description: 'Não foi possível gerar o resumo das notas.',
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleOptimizeRoute = async () => {
    setIsOptimizing(true);
    try {
      const result = await optimizeDeliveryRoutes({
        currentLocationLat: -16.6869, // Mock Goiânia
        currentLocationLng: -49.2648,
        deliveryLocations: [{ lat: -16.70, lng: -49.25, orderId: order.id }],
      });
      setOptimizedRoute(result);
      toast({
        title: 'Rota otimizada!',
        description: 'A melhor rota foi calculada pela IA.',
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Erro ao otimizar rota',
        description: 'Não foi possível calcular a rota otimizada.',
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Abrir menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setIsSheetOpen(true)}>
            Ver detalhes
          </DropdownMenuItem>
          <DropdownMenuItem>Reatribuir</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            Cancelar pedido
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Pedido #{order.code}</SheetTitle>
            <SheetDescription>
              Detalhes completos do pedido e do cliente.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
                <h4 className="font-semibold">Cliente</h4>
                <p className="text-sm text-muted-foreground">{order.customer.name}</p>
                <p className="text-sm text-muted-foreground">{order.customer.address}</p>
            </div>
            <Separator />
            <div className="space-y-2">
                <h4 className="font-semibold">Coleta</h4>
                <p className="text-sm text-muted-foreground">{order.pickup.address}</p>
            </div>
             <Separator />
            <div className="space-y-2">
                <h4 className="font-semibold">Motorista</h4>
                <p className="text-sm text-muted-foreground">{driver?.name ?? 'Não atribuído'}</p>
                {driver && <Badge variant="secondary">{driver.status}</Badge>}
            </div>
            <Separator />
            <div className="space-y-2">
                <h4 className="font-semibold">Notas Originais</h4>
                <p className="text-sm text-muted-foreground italic">
                  {order.notes ?? 'Nenhuma nota.'}
                </p>
            </div>

            <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
                <h4 className="flex items-center font-semibold"><Bot className="mr-2 h-5 w-5 text-primary" /> Ações com IA</h4>
                <div className="space-y-2">
                    <Button onClick={handleSummarize} disabled={isSummarizing || !order.notes} className="w-full">
                        <FileText className="mr-2 h-4 w-4" />
                        {isSummarizing ? 'Resumindo...' : 'Resumir Notas'}
                    </Button>
                    {isSummarizing && <Skeleton className="h-12 w-full" />}
                    {summary && !isSummarizing && (
                        <div className="text-sm text-foreground p-2 bg-background rounded-md border">{summary}</div>
                    )}
                </div>
                 <div className="space-y-2">
                    <Button onClick={handleOptimizeRoute} disabled={isOptimizing} className="w-full">
                        <Route className="mr-2 h-4 w-4" />
                        {isOptimizing ? 'Otimizando...' : 'Otimizar Rota'}
                    </Button>
                     {isOptimizing && <Skeleton className="h-20 w-full" />}
                     {optimizedRoute && !isOptimizing && (
                        <div className="text-sm text-foreground p-2 bg-background rounded-md border">
                            <p><strong>Distância Total:</strong> {optimizedRoute.estimatedTotalDistanceKm} km</p>
                            <p><strong>Tempo Estimado:</strong> {optimizedRoute.estimatedTotalTravelTimeMinutes} min</p>
                            <p><strong>Ordem:</strong> {optimizedRoute.optimizedRoutes.map((r: any) => r.orderId).join(' -> ')}</p>
                        </div>
                    )}
                </div>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={() => setIsSheetOpen(false)}>Fechar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
