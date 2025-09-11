'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const origins = [
  {
    id: 'sol-de-maria',
    name: 'Sol de Maria',
    address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia...',
  },
  {
    id: 'investe-aqui',
    name: 'InvesteAqui',
    address: 'Rua da Alfandega, 200, Bras, Sao paulo, SP, Brasil',
  },
];

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
  const [selectedOrigin, setSelectedOrigin] = useState(origins[0]);

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
              value={selectedOrigin.name}
              action={
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost">EDITAR</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96" align="end">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className="flex w-full items-start gap-4 rounded-md p-2 text-left transition-colors hover:bg-muted">
                              <Plus className="mt-1 h-6 w-6" />
                              <div>
                                <p className="font-semibold">
                                  Adicionar nova origem
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Escolha essa opção caso queira cadastrar uma
                                  nova origem para utilizar em novas
                                  roteirizações
                                </p>
                              </div>
                            </button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[625px]">
                            <DialogHeader>
                              <DialogTitle>Cadastrar Nova Origem</DialogTitle>
                              <DialogDescription>
                                Preencha os dados do endereço de origem.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="cep" className="text-right">
                                  CEP
                                </Label>
                                <Input id="cep" className="col-span-3" />
                              </div>
                              <div className="flex justify-end">
                                <Button variant="link">BUSCAR POR CEP</Button>
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label
                                  htmlFor="logradouro"
                                  className="text-right"
                                >
                                  Logradouro
                                </Label>
                                <Input
                                  id="logradouro"
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="grid grid-cols-2 items-center gap-4">
                                  <Label htmlFor="numero" className="text-right">
                                    Número
                                  </Label>
                                  <Input id="numero" />
                                </div>
                                <div className="grid grid-cols-2 items-center gap-4">
                                  <Label
                                    htmlFor="complemento"
                                    className="text-right"
                                  >
                                    Complemento
                                  </Label>
                                  <Input id="complemento" />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="grid grid-cols-2 items-center gap-4">
                                  <Label
                                    htmlFor="municipio"
                                    className="text-right"
                                  >
                                    Município
                                  </Label>
                                  <Input id="municipio" />
                                </div>
                                <div className="grid grid-cols-2 items-center gap-4">
                                  <Label htmlFor="bairro" className="text-right">
                                    Bairro
                                  </Label>
                                  <Input id="bairro" />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="grid grid-cols-2 items-center gap-4">
                                  <Label htmlFor="estado" className="text-right">
                                    Estado
                                  </Label>
                                  <Input id="estado" />
                                </div>
                                <div className="grid grid-cols-2 items-center gap-4">
                                  <Label htmlFor="pais" className="text-right">
                                    País
                                  </Label>
                                  <Input id="pais" />
                                </div>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button type="submit">Salvar Endereço</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <Separator />
                      <div className="grid gap-2">
                        {origins.map((origin) => (
                          <button
                            key={origin.id}
                            onClick={() => setSelectedOrigin(origin)}
                            className={`flex w-full items-start gap-4 rounded-md p-2 text-left transition-colors hover:bg-muted ${selectedOrigin.id === origin.id ? 'bg-muted' : ''}`}
                          >
                            <Home
                              className={`mt-1 h-6 w-6 ${selectedOrigin.id === origin.id ? 'text-primary' : 'text-muted-foreground'}`}
                            />
                            <div>
                              <p
                                className={`font-medium ${selectedOrigin.id === origin.id ? 'text-foreground' : ''}`}
                              >
                                {origin.address}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {origin.name}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              }
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

            {/* Services Section */}
            <div className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <MapPin className="h-6 w-6 text-muted-foreground" />
                  <p className="font-medium">SERVIÇOS (0)</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm">
                    IMPORTAR EXCEL
                  </Button>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="py-8 text-center text-muted-foreground">
                <p>Nenhum serviço adicionado ainda.</p>
              </div>

              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-dashed"
              >
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
