import {
  File,
  PlusCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
// import { orders as allOrders } from '@/lib/data';
import { OrderTable } from '@/components/orders/order-table';
import { Order } from '@/lib/types';

// Mock data, em um app real isso viria do Firestore
const allOrders: Order[] = [];

export default function OrdersPage() {
  return (
    <Tabs defaultValue="all">
      <div className="flex items-center">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="active">Ativos</TabsTrigger>
          <TabsTrigger value="delivered">Entregues</TabsTrigger>
          <TabsTrigger value="archived" className="hidden sm:flex">
            Arquivados
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1">
            <File className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Exportar
            </span>
          </Button>
          <Button size="sm" className="h-8 gap-1">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Criar Pedido
            </span>
          </Button>
        </div>
      </div>
      <TabsContent value="all">
        <Card>
          <CardHeader>
            <CardTitle>Pedidos</CardTitle>
            <CardDescription>
              Gerencie os pedidos e visualize o status de cada um.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrderTable orders={allOrders} />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="active">
        <Card>
          <CardHeader>
            <CardTitle>Pedidos Ativos</CardTitle>
            <CardDescription>
              Pedidos que estão em andamento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrderTable orders={allOrders.filter(o => ['assigned', 'picked_up', 'in_route'].includes(o.status))} />
          </CardContent>
        </Card>
      </TabsContent>
       <TabsContent value="delivered">
        <Card>
          <CardHeader>
            <CardTitle>Pedidos Entregues</CardTitle>
            <CardDescription>
              Pedidos que já foram concluídos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrderTable orders={allOrders.filter(o => o.status === 'delivered')} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
