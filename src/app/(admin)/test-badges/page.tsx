'use client';

import { StatusBadge, ExpandableBadge } from '@/components/ui/expandable-badge';
import {
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Moon,
  AlertTriangle,
  MapPin,
  Home,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestBadgesPage() {
  return (
    <div className="container mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Expandable Badges - Demonstração</h1>
        <p className="text-muted-foreground">
          Passe o mouse sobre os badges para ver a animação de expansão
        </p>
      </div>

      {/* Menu de Indicadores */}
      <Card>
        <CardHeader>
          <CardTitle>Menu de Indicadores (Como no exemplo)</CardTitle>
          <CardDescription>
            Exemplo de menu com múltiplos indicadores lado a lado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 p-2 bg-white rounded-2xl shadow-md w-fit">
            <StatusBadge
              variant="lunna"
              icon={<Moon className="w-7 h-7 fill-[#0095F6]" />}
              title="Lunna"
            />

            <StatusBadge
              variant="info"
              icon={<Truck className="w-7 h-7" />}
              title="Em Rota"
            />

            <StatusBadge
              variant="success"
              icon={<CheckCircle className="w-7 h-7" />}
              title="Entregue"
            />

            <StatusBadge
              variant="danger"
              icon={<XCircle className="w-7 h-7" />}
              title="Falhou"
            />

            <StatusBadge
              variant="warning"
              icon={<Clock className="w-7 h-7" />}
              title="Pendente"
            />
          </div>
        </CardContent>
      </Card>

      {/* Variantes de Status */}
      <Card>
        <CardHeader>
          <CardTitle>Variantes de Status</CardTitle>
          <CardDescription>Diferentes cores para diferentes status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Success</p>
              <StatusBadge
                variant="success"
                icon={<CheckCircle className="w-7 h-7" />}
                title="Entregue"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Warning</p>
              <StatusBadge
                variant="warning"
                icon={<AlertTriangle className="w-7 h-7" />}
                title="Pendente"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Danger</p>
              <StatusBadge
                variant="danger"
                icon={<XCircle className="w-7 h-7" />}
                title="Falhou"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Info</p>
              <StatusBadge
                variant="info"
                icon={<MapPin className="w-7 h-7" />}
                title="Localizado"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Lunna</p>
              <StatusBadge
                variant="lunna"
                icon={<Moon className="w-7 h-7 fill-[#0095F6]" />}
                title="Sistema"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Default</p>
              <StatusBadge
                variant="default"
                icon={<Package className="w-7 h-7" />}
                title="Padrão"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badge Customizado */}
      <Card>
        <CardHeader>
          <CardTitle>Badge Customizado</CardTitle>
          <CardDescription>Badge com cores e estilo personalizado</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <ExpandableBadge
              icon={<Home className="w-7 h-7 text-purple-600" />}
              title="Casa"
              className="bg-purple-100 text-purple-700"
              hoverColor="#f3e8ff"
            />

            <ExpandableBadge
              icon={<Truck className="w-7 h-7 text-orange-600" />}
              title="Transporte"
              className="bg-orange-100 text-orange-700"
              hoverColor="#ffedd5"
            />

            <ExpandableBadge
              icon={<Package className="w-7 h-7 text-pink-600" />}
              title="Pacote"
              className="bg-pink-100 text-pink-700"
              hoverColor="#fce7f3"
            />
          </div>
        </CardContent>
      </Card>

      {/* Uso em Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Uso em Tabela de Pedidos</CardTitle>
          <CardDescription>Exemplo de como usar na coluna de indicadores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-4 text-left font-medium">Pedido</th>
                  <th className="p-4 text-left font-medium">Cliente</th>
                  <th className="p-4 text-left font-medium">Indicadores</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-4">P0001</td>
                  <td className="p-4">Cliente A</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <StatusBadge
                        variant="lunna"
                        icon={<Moon className="w-7 h-7 fill-[#0095F6]" />}
                        title="Lunna"
                      />
                      <StatusBadge
                        variant="success"
                        icon={<CheckCircle className="w-7 h-7" />}
                        title="Entregue"
                      />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="p-4">P0002</td>
                  <td className="p-4">Cliente B</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <StatusBadge
                        variant="info"
                        icon={<Truck className="w-7 h-7" />}
                        title="Em Rota"
                      />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="p-4">P0003</td>
                  <td className="p-4">Cliente C</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <StatusBadge
                        variant="warning"
                        icon={<Clock className="w-7 h-7" />}
                        title="Pendente"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Informação */}
      <Card className="border-[#0095F6]/20 bg-[#0095F6]/5">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <Moon className="w-8 h-8 text-[#0095F6] fill-[#0095F6]" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-[#0095F6]">Como usar na página de Pedidos</p>
              <p className="text-sm text-muted-foreground">
                1. Importe o componente: <code className="bg-white/50 px-2 py-1 rounded">import {`{ StatusBadge }`} from '@/components/ui/expandable-badge'</code>
              </p>
              <p className="text-sm text-muted-foreground">
                2. Substitua os badges atuais pelos novos com animação
              </p>
              <p className="text-sm text-muted-foreground">
                3. Passe o mouse sobre os badges para ver a animação de expansão
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
