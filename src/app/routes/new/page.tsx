import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { placeholderImages } from '@/lib/placeholder-images';
import {
  Home,
  Calendar,
  Settings,
  Share2,
  Truck,
  MapPin,
  Pencil,
  MoreVertical,
  Plus,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';

function RouteConfigItem({
  icon: Icon,
  title,
  value,
  action,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-center gap-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
        <div>
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{value}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export default function NewRoutePage() {
  const mapImage = placeholderImages.find((p) => p.id === 'map1');

  return (
    <div className="flex-1 overflow-hidden">
      <div className="grid h-full grid-cols-1 md:grid-cols-3">
        {/* Left Panel: Route Configuration */}
        <div className="flex h-full flex-col bg-card p-6">
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
            Criar Nova Rota
          </h2>

          <div className="flex-1 space-y-2">
            <RouteConfigItem
              icon={Home}
              title="ORIGEM"
              value="Sol de Maria"
              action={<Button variant="ghost">EDITAR</Button>}
            />
            <Separator />
            <RouteConfigItem
              icon={Calendar}
              title="Início da Rota"
              value="10/09/2025 - 12:30"
              action={<Button variant="ghost">EDITAR</Button>}
            />
            <Separator />
            <RouteConfigItem
              icon={Settings}
              title="OPÇÕES"
              value="7 Configurações ligadas"
              action={<Button variant="ghost">EDITAR</Button>}
            />
            <Separator />
            <RouteConfigItem
              icon={Share2}
              title="REGIÃO"
              value="Regiões listadas"
              action={<Button variant="ghost">EDITAR</Button>}
            />
            <Separator />
            <RouteConfigItem
              icon={Truck}
              title="Regiões restritas"
              value="Nenhuma região selecionada"
              action={<Button variant="ghost">EDITAR</Button>}
            />
            <Separator />

            {/* Services Section */}
            <div className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <MapPin className="h-6 w-6 text-muted-foreground" />
                  <p className="font-medium">SERVIÇOS (0)</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm">IMPORTAR EXCEL</Button>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="py-8 text-center text-muted-foreground">
                <p>Nenhum serviço adicionado ainda.</p>
              </div>

               <Button variant="outline" className="w-full justify-start gap-2 border-dashed">
                 <Plus className="h-4 w-4" />
                ADICIONAR NOVO SERVIÇO
               </Button>
            </div>
          </div>
          <div className="mt-8 flex gap-4">
            <Button className="flex-1">Salvar Rascunho</Button>
            <Button className="flex-1">Otimizar e Enviar Rota</Button>
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="relative col-span-2 hidden h-full md:block">
          {mapImage && (
            <Image
              src={mapImage.imageUrl}
              alt="Mapa mostrando a origem e a área de serviço"
              fill
              className="object-cover"
              data-ai-hint="city map"
            />
          )}
        </div>
      </div>
    </div>
  );
}
