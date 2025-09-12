"use client";

import * as React from 'react';
import {
  MapPin,
  Calendar as CalendarIcon,
  PlusCircle,
  Upload,
  Edit,
  Home,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RouteMap } from '@/components/maps/RouteMap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AutocompleteInput } from '@/components/maps/AutocompleteInput';
import type { PlaceValue } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { extractAddressesFromText } from '@/ai/flows/extract-addresses-from-text';
import { ScrollArea } from '@/components/ui/scroll-area';

const savedOrigins = [
  {
    id: 'origin-1',
    name: 'Sol de Maria',
    value: {
      address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
      placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
      lat: -16.6786,
      lng: -49.2552,
    },
  },
  {
    id: 'origin-2',
    name: 'InvesteAqui',
    value: {
      address: 'Rua da Alfandega, 200, Bras, Sao paulo, SP, Brasil',
      placeId: 'ChIJR9QCMf5ZzpQR4iS2PS52rCk',
      lat: -23.5410,
      lng: -46.6262,
    },
  },
];

export default function NewRoutePage() {
  const [origin, setOrigin] = React.useState<PlaceValue | null>(
    savedOrigins[0].value
  );
  const [stops, setStops] = React.useState<PlaceValue[]>([]);
  const [routeDate, setRouteDate] = React.useState<Date | undefined>(new Date());
  const [routeTime, setRouteTime] = React.useState('18:10');
  
  const [isImporting, setIsImporting] = React.useState(false);

  const [isOriginDialogOpen, setIsOriginDialogOpen] = React.useState(false);
  const [isNewOriginDialogOpen, setIsNewOriginDialogOpen] = React.useState(false);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSelectOrigin = (placeValue: PlaceValue) => {
    setOrigin(placeValue);
    setIsOriginDialogOpen(false);
  };
  
  const handleAddStop = () => {
    setStops([...stops, {} as PlaceValue]);
  };

  const handleRemoveStop = (index: number) => {
    const newStops = stops.filter((_, i) => i !== index);
    setStops(newStops);
  };
  
  const handleStopChange = (index: number, place: PlaceValue | null) => {
    const newStops = [...stops];
    if (place) {
      newStops[index] = place;
      setStops(newStops);
    }
  };

  const geocodeAddress = React.useCallback((address: string): Promise<PlaceValue | null> => {
    return new Promise((resolve, reject) => {
      try {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address, region: 'BR' }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const place = results[0];
            const location = place.geometry.location;
            resolve({
              address: place.formatted_address,
              placeId: place.place_id,
              lat: location.lat(),
              lng: location.lng(),
            });
          } else {
             console.warn(`Geocoding failed for "${address}": ${status}`);
            resolve(null);
          }
        });
      } catch (e) {
        console.error('Geocoding error:', e);
        reject(e);
      }
    });
  }, []);
  
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    toast({
      title: 'Importando endereços...',
      description: 'A IA está lendo e processando o arquivo.',
    });

    try {
      const text = await file.text();
      const result = await extractAddressesFromText({ text });
      
      const geocodedStopsPromises = result.addresses.map(addr => geocodeAddress(addr));
      const newStops = (await Promise.all(geocodedStopsPromises)).filter((s): s is PlaceValue => s !== null);

      setStops(prevStops => [...prevStops, ...newStops]);
      
      toast({
        title: 'Importação Concluída!',
        description: `${newStops.length} de ${result.addresses.length} endereços foram adicionados à rota.`,
      });

    } catch (error) {
      console.error('Import failed', error);
      toast({
        variant: 'destructive',
        title: 'Falha na Importação',
        description: 'Não foi possível processar o arquivo. Verifique o formato e tente novamente.',
      });
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const mapStops = React.useMemo(() => stops.filter(s => s.lat && s.lng), [stops]);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileImport}
        accept=".txt,.csv"
      />
      <div className="grid h-full w-full grid-cols-[minmax(350px,30%)_1fr]">
        {/* Left Sidebar */}
        <div className="flex flex-col border-r bg-background">
          <div className="flex h-16 shrink-0 items-center border-b px-6">
            <h1 className="text-xl font-semibold">Nova Rota</h1>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className='p-6 space-y-6'>
              {/* Route Origin */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">Origem da Rota</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setIsOriginDialogOpen(true)}
                  >
                    <Edit className="mr-1 h-3 w-3" />
                    Editar
                  </Button>
                </div>
                <p className="pl-8 text-sm text-muted-foreground">
                  {origin?.address ?? 'Não definida'}
                </p>
              </div>

              <Separator />

              {/* Route Start */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Início da Rota</h3>
                </div>
                <div className="pl-8">
                  <p className="text-sm text-muted-foreground">
                    <Popover
                      open={isDatePopoverOpen}
                      onOpenChange={setIsDatePopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant={'link'}
                          className={cn(
                            'p-0 font-medium text-foreground hover:no-underline',
                            !routeDate && 'text-muted-foreground'
                          )}
                        >
                          {routeDate ? (
                            format(routeDate, 'PPP', { locale: ptBR })
                          ) : (
                            <span>Selecione uma data</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={routeDate}
                          onSelect={(date) => {
                            setRouteDate(date);
                            setIsDatePopoverOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>

                    <span className="mx-2 text-muted-foreground">às</span>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={'link'}
                          className="p-0 font-medium text-foreground hover:no-underline"
                        >
                          {routeTime}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Input
                          type="time"
                          value={routeTime}
                          onChange={(e) => setRouteTime(e.target.value)}
                          className="border-none"
                        />
                      </PopoverContent>
                    </Popover>
                  </p>
                </div>
              </div>

              <Separator />
            </div>

            <ScrollArea className="flex-1 px-6">
              {/* Services/Stops */}
              <div className="space-y-4">
                {stops.map((stop, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor={`stop-${index}`}>Parada ${index + 1}</Label>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveStop(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                    <AutocompleteInput
                      id={`stop-${index}`}
                      placeholder="Endereço da parada..."
                      value={stop}
                      onChange={(place) => handleStopChange(index, place)}
                    />
                  </div>
                ))}
              </div>

              {/* Add Service */}
              <div className="mt-4">
                <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleAddStop}>
                  <PlusCircle className="h-5 w-5" />
                  Adicionar novo serviço
                </Button>
              </div>
            </ScrollArea>
          </div>

          {/* Footer Actions */}
          <div className="shrink-0 border-t p-6">
            <Button
              variant="outline"
              className="w-full justify-center gap-3"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              {isImporting ? (
                 <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              {isImporting ? 'Importando...' : 'Importar Serviços'}
            </Button>
          </div>
        </div>

        {/* Right Content - Map */}
        <div className="h-full w-full">
          <RouteMap height={-1} origin={origin} stops={mapStops} />
        </div>
      </div>

      {/* Origin Selection Dialog */}
      <Dialog open={isOriginDialogOpen} onOpenChange={setIsOriginDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Definir Endereço de Origem</DialogTitle>
            <DialogDescription>
              Selecione um endereço salvo ou adicione um novo ponto de partida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-4">
            <button
              className="flex w-full items-center gap-4 rounded-md p-3 text-left transition-colors hover:bg-muted"
              onClick={() => {
                setIsOriginDialogOpen(false);
                setIsNewOriginDialogOpen(true);
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Adicionar nova origem</p>
                <p className="text-sm text-muted-foreground">
                  Cadastrar um novo endereço para utilizar em futuras rotas.
                </p>
              </div>
            </button>
            <Separator />
            <div className="max-h-[300px] overflow-y-auto">
              {savedOrigins.map((saved) => {
                const isSelected = origin?.placeId === saved.value.placeId;
                return (
                  <button
                    key={saved.id}
                    className="flex w-full items-center gap-4 rounded-md p-3 text-left transition-colors hover:bg-muted"
                    onClick={() => handleSelectOrigin(saved.value)}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background'
                      )}
                    >
                      <Home className="h-5 w-5" />
                    </div>
                    <div>
                      <p
                        className={cn(
                          'font-medium',
                          isSelected && 'text-primary'
                        )}
                      >
                        {saved.value.address}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {saved.name}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Origin Dialog */}
      <Dialog open={isNewOriginDialogOpen} onOpenChange={setIsNewOriginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Nova Origem</DialogTitle>
            <DialogDescription>
              Preencha os detalhes do novo endereço de origem.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="origin-name">Nome do Local</Label>
              <Input
                id="origin-name"
                placeholder="Ex: Matriz, Depósito Central"
              />
            </div>
            <div className="grid gap-2">
              <AutocompleteInput
                id="origin-address"
                label="Endereço Completo"
                placeholder="Pesquise o endereço..."
                onChange={() => {}}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={() => setIsNewOriginDialogOpen(false)}>
              Salvar Origem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
