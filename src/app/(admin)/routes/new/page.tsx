
"use client";

import * as React from 'react';
import {
  MapPin,
  Calendar as CalendarIcon,
  PlusCircle,
  Upload,
  Trash2,
  Loader2,
  Wand2,
  Home,
  Plus,
  ArrowRight,
  Info,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Calendar } from '@/components/ui/calendar';
import { AutocompleteInput } from '@/components/maps/AutocompleteInput';
import type { PlaceValue } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { ImportAssistantDialog } from '@/components/routes/import-assistant-dialog';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';

const initialSavedOrigins = [
  {
    id: 'origin-1',
    name: 'Sol de Maria',
    value: {
      id: 'saved-origin-1',
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
      id: 'saved-origin-2',
      address: 'Rua da Alfandega, 200, Bras, Sao paulo, SP, Brasil',
      placeId: 'ChIJR9QCMf5ZzpQR4iS2PS52rCk',
      lat: -23.5410,
      lng: -46.6262,
    },
  },
];

const initialManualServiceState = {
  customerName: '',
  phone: '',
  locationLink: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  notes: '',
};


let stopIdCounter = 0;

async function readTextSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // BOMs mais comuns
  const hasUTF8BOM = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const hasUTF16LE = bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE;
  const hasUTF16BE = bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF;

  if (hasUTF8BOM) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (hasUTF16LE)  return new TextDecoder('utf-16le').decode(bytes);
  if (hasUTF16BE)  return new TextDecoder('utf-16be').decode(bytes);

  // Tenta UTF-8 primeiro
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  // Heurística: se aparecer  (U+FFFD) ou padrões tipo "Ã§", redecodifica como Windows-1252
  const hasReplacement = /\uFFFD/.test(text) || /Ã[\x80-\xBF]/.test(text);
  if (hasReplacement) {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^\uFEFF/, ''); // remove BOM residual
}


export default function NewRoutePage() {
  const router = useRouter();
  const [savedOrigins, setSavedOrigins] = React.useState(initialSavedOrigins);
  const [origin, setOrigin] = React.useState<PlaceValue | null>(() => {
    if (initialSavedOrigins.length > 0) {
      return initialSavedOrigins[0].value;
    }
    return null;
  });
  const [stops, setStops] = React.useState<PlaceValue[]>([]);
  const [routeDate, setRouteDate] = React.useState<Date | undefined>(undefined);
  const [routeTime, setRouteTime] = React.useState('18:10');

  const [isImporting, setIsImporting] = React.useState(false);
  const [isOriginDialogOpen, setIsOriginDialogOpen] = React.useState(false);
  const [isNewOriginDialogOpen, setIsNewOriginDialogOpen] = React.useState(false);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = React.useState(false);
  const [isAddServiceDialogOpen, setIsAddServiceDialogOpen] = React.useState(false);
  const [manualService, setManualService] = React.useState(initialManualServiceState);
  const [newOriginName, setNewOriginName] = React.useState('');
  const [tempOrigin, setTempOrigin] = React.useState<PlaceValue | null>(null);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [originToDelete, setOriginToDelete] = React.useState<string | null>(null);
  
  // States for Import Assistant
  const [isAssistantOpen, setIsAssistantOpen] = React.useState(false);
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);
  const [fileToProcess, setFileToProcess] = React.useState<File | null>(null);
  const [csvContent, setCsvContent] = React.useState<string>('');

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  React.useEffect(() => {
    // This runs only on the client, after hydration, preventing hydration mismatch
    setRouteDate(new Date());
  }, []);

  const handleSelectOrigin = (placeValue: PlaceValue) => {
    setOrigin(placeValue);
    setIsOriginDialogOpen(false);
  };

  const handleSaveNewOrigin = () => {
    if (!tempOrigin) {
      toast({
        variant: 'destructive',
        title: 'Endereço não selecionado',
        description: 'Por favor, selecione um endereço antes de salvar.',
      });
      return;
    }
    if (!newOriginName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome não informado',
        description: 'Por favor, informe um nome para a origem.',
      });
      return;
    }

    const newOrigin = {
      id: `origin-${Date.now()}`,
      name: newOriginName,
      value: tempOrigin,
    };

    setSavedOrigins(prev => [newOrigin, ...prev]);
    setOrigin(tempOrigin);

    setIsNewOriginDialogOpen(false);
    setNewOriginName('');
    setTempOrigin(null);

    toast({
      title: 'Origem salva!',
      description: `A origem "${newOriginName}" foi definida com sucesso.`,
    });
  };

  const handleDeleteOrigin = (originId: string) => {
    const updatedOrigins = savedOrigins.filter(o => o.id !== originId);
    setSavedOrigins(updatedOrigins);

    // If the deleted origin was the selected one, reset to the first available or null
    if (origin?.id === savedOrigins.find(o => o.id === originId)?.value.id) {
        const newOrigin = updatedOrigins.length > 0 ? updatedOrigins[0].value : null;
        setOrigin(newOrigin);
    }
    
    toast({
      title: 'Origem Removida',
      description: 'O endereço de origem foi removido da sua lista.',
    });
  };

  const openDeleteConfirmation = (originId: string) => {
    setOriginToDelete(originId);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (originToDelete) {
      handleDeleteOrigin(originToDelete);
      setOriginToDelete(null);
    }
    setIsDeleteConfirmOpen(false);
  };


  const handleRemoveStop = (index: number) => {
    const newStops = stops.filter((_, i) => i !== index);
    setStops(newStops);
  };

  const handleStopChange = (index: number, place: PlaceValue | null) => {
    const newStops = [...stops];
    if (place) {
      const safeId = place.id || place.placeId || `${place.placeId || 'p'}-${Date.now()}`;
      newStops[index] = { ...newStops[index], ...place, id: String(safeId) };
      setStops(newStops);
    }
  };

  const geocodeAddress = React.useCallback(
    (address: string): Promise<PlaceValue | null> => {
      return new Promise((resolve, reject) => {
        try {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ address, region: 'BR' }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              const place = results[0];
              const location = place.geometry.location;
              resolve({
                id: `geocoded-${place.place_id}-${Date.now()}`,
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
    },
    []
  );

  const reverseGeocode = React.useCallback(
    (lat: number, lng: number): Promise<Partial<typeof initialManualServiceState> | null> => {
      return new Promise((resolve, reject) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const place = results[0];
            const address: Partial<typeof initialManualServiceState> = {};
            
            const get = (type: string) => place.address_components.find(c => c.types.includes(type))?.long_name;
            
            address.rua = get('route');
            address.numero = get('street_number');
            address.bairro = get('sublocality_level_1') || get('political');
            address.cidade = get('administrative_area_level_2');
            address.cep = get('postal_code');

            resolve(address);
          } else {
            resolve(null);
          }
        });
      });
    },
    []
  );


  const handleManualServiceChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setManualService(prev => ({...prev, [id]: value}));

    if (id === 'locationLink') {
      handleLocationLinkPaste(value);
    }
  }

  const handleLocationLinkPaste = async (url: string) => {
      const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (!match) return;

      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      
      toast({ title: "Analisando link...", description: "Buscando endereço a partir das coordenadas." });

      const addressDetails = await reverseGeocode(lat, lng);
      if (addressDetails) {
        setManualService(prev => ({
          ...prev,
          ...addressDetails,
        }));
        toast({ title: "Endereço preenchido!", description: "Os campos foram preenchidos automaticamente." });
      } else {
         toast({ variant: 'destructive', title: "Falha na busca", description: "Não foi possível encontrar o endereço para este link." });
      }
  }

  const handleSaveManualService = async () => {
    const { rua, numero, bairro, cidade, cep } = manualService;
    if (!rua || !numero || !bairro || !cidade) {
        toast({
            variant: 'destructive',
            title: 'Campos Obrigatórios',
            description: 'Rua, número, bairro e cidade são obrigatórios para geocodificar o endereço.',
        });
        return;
    }

    const addressString = `${rua}, ${numero}, ${bairro}, ${cidade}, ${cep}, Brasil`;
    
    const geocoded = await geocodeAddress(addressString);

    if (geocoded) {
        const newStop: PlaceValue = {
            ...geocoded,
            id: `manual-${Date.now()}`,
            address: geocoded.address,
            customerName: manualService.customerName,
            phone: manualService.phone,
            notes: manualService.notes,
        };
        setStops(prevStops => [...prevStops, newStop]);
        setManualService(initialManualServiceState);
        setIsAddServiceDialogOpen(false);
        toast({
            title: 'Serviço Adicionado!',
            description: 'O novo serviço foi adicionado à lista de paradas.',
        });
    } else {
        toast({
            variant: 'destructive',
            title: 'Falha na Geocodificação',
            description: 'Não foi possível encontrar o endereço. Verifique os dados e tente novamente.',
        });
    }
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileToProcess(file);
    setIsImporting(true);

    try {
      const text = await readTextSmart(file);
      setCsvContent(text); // Guardar o conteúdo decodificado

      const previewConfig: Papa.ParseConfig<Record<string, string>> = {
        header: true,
        skipEmptyLines: true,
        preview: 1, // Apenas a primeira linha de dados para os cabeçalhos
        complete: (results) => {
          if (results.meta.fields) {
            setCsvHeaders(results.meta.fields);
            setIsAssistantOpen(true);
          } else {
             toast({
              variant: 'destructive',
              title: 'Falha na Importação',
              description: 'Não foi possível ler os cabeçalhos do arquivo CSV.',
            });
            setIsImporting(false);
          }
        }
      };

      try {
        Papa.parse<Record<string, string>>(text, previewConfig);
      } catch (error) {
        console.error('CSV parsing error:', error);
        const message = error instanceof Error ? error.message : String(error);
        toast({
          variant: 'destructive',
          title: 'Erro ao Ler Arquivo',
          description: `Verifique se o arquivo é um CSV válido. Detalhe: ${message}`,
        });
        setIsImporting(false);
      }

    } catch (e) {
       console.error('File reading error:', e);
        toast({
            variant: 'destructive',
            title: 'Erro ao Ler Arquivo',
            description: 'Não foi possível ler o arquivo. Verifique o formato e a codificação.',
        });
        setIsImporting(false);
    } finally {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }
  };

  const handleImportConfirm = (mapping: Record<string, string>) => {
    setIsAssistantOpen(false);
    if (!csvContent) return;

    toast({
      title: 'Processando endereços...',
      description: 'A geocodificação pode levar alguns instantes.',
    });

    const normalizeString = (s = '') =>
      s.replace(/^\uFEFF/, '')
       .replace(/\uFFFD/g, '')
       .normalize('NFKC')
       .normalize('NFD').replace(/\p{Diacritic}/gu, '')
       .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

    const fieldSynonyms: Record<string, string[]> = {
      'Nome do Cliente': ['nome do cliente','nome cliente','cliente','destinatario','contato'],
      'Número Pedido':   ['numero pedido','n pedido','pedido numero','pedido n','nº pedido','n° pedido','order id','id pedido','pedido'],
      'Número':          ['numero','nº','n°','no','n','num','#','numero casa','numero endereco'],
      // ... adicione outros sinônimos se necessário
    };
    
    function invertMapping(mapping: Record<string,string>) {
      const candidates: Record<string, string[]> = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (!field || field === 'Ignorar') continue;
        (candidates[field] ??= []).push(header);
      }

      const pickBest = (field: string, headers: string[]) => {
        const keys = [field, ...(fieldSynonyms[field] ?? [])].map(normalizeString);

        const score = (h: string) => {
          const H = normalizeString(h);
          if (!H) return -1;
          if (keys.includes(H)) return 1000;
          const numericOnly = /^[0-9#nºn°]+$/.test(H);
          const tokens = H.split(' ');
          const overlap = tokens.filter(t => keys.some(k => k.includes(t) || t.includes(k))).length;
          const len = Math.max(...keys.map(k => k.length));
          return (overlap * 10) + (len / 10) - (numericOnly ? 50 : 0);
        };

        return headers.sort((a, b) => score(b) - score(a))[0];
      };

      const result: Record<string, string> = {};
      for (const [field, headers] of Object.entries(candidates)) {
        result[field] = pickBest(field, headers);
      }
      return result;
    }

    const systemToCsvHeader = invertMapping(mapping);

    const getField = (row: Record<string, any>, field: string, fallbacks: string[] = []) => {
        const header = systemToCsvHeader[field];
        const val = header ? row[header] : undefined;
        if (val != null && String(val).trim() !== '') return String(val).trim();
        for (const fb of fallbacks) {
            if (row[fb] != null && String(row[fb]).trim() !== '') return String(row[fb]).trim();
        }
        return undefined;
    };


    const fullParseConfig: Papa.ParseConfig<Record<string, string>> = {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as Record<string, string>[];

        const fieldOrder = ['Rua', 'Número', 'Bairro', 'Município', 'Estado', 'CEP'];
        
        const stopsToProcess = data.map((row, index) => {
            const addressParts: Record<string, string> = {};

            for (const header in mapping) {
                const systemField = mapping[header];
                if (systemField !== 'Ignorar' && row[header]) {
                    if (fieldOrder.includes(systemField)) {
                        addressParts[systemField] = row[header];
                    }
                }
            }

            const addressString = fieldOrder
                .map(field => addressParts[field])
                .filter(Boolean)
                .join(', ') + ', Brasil';

            return {
                addressString,
                customerName: getField(row, 'Nome do Cliente', ['Nome do Cliente','Cliente']),
                phone:        getField(row, 'Telefone', ['Telefone']),
                notes:        getField(row, 'Observações', ['Observações']),
                orderNumber:  getField(row, 'Número Pedido', ['Número Pedido','Pedido']),
                timeWindowStart: getField(row, 'Início do intervalo permitido', ['Início do intervalo permitido']),
                timeWindowEnd:   getField(row, 'Fim do intervalo permitido', ['Fim do intervalo permitido']),
                complemento:  getField(row, 'Complemento', ['Complemento']),
            };
        });

        const geocodedStopsPromises = stopsToProcess.map(async (item) => {
            const geocoded = await geocodeAddress(item.addressString);
            if (geocoded) {
                const stopData: PlaceValue = {
                    ...geocoded,
                    customerName: item.customerName,
                    phone: item.phone,
                    notes: item.notes,
                    orderNumber: item.orderNumber,
                    timeWindowStart: item.timeWindowStart,
                    timeWindowEnd: item.timeWindowEnd,
                    complemento: item.complemento,
                };
                // se "nome" vier só com dígitos (tipo 10), descarta
                if (stopData.customerName && /^\d+$/.test(stopData.customerName)) {
                    stopData.customerName = undefined;
                }
                return stopData;
            }
            return null;
        });

        const newStops = (await Promise.all(geocodedStopsPromises)).filter((s): s is PlaceValue => s !== null);

        setStops(prevStops => [...prevStops, ...newStops]);

        toast({
          title: 'Importação Concluída!',
          description: `${newStops.length} de ${stopsToProcess.length} endereços foram adicionados à rota.`,
        });
        setIsImporting(false);
        setFileToProcess(null);
        setCsvContent('');
      }
    };

    try {
      Papa.parse<Record<string, string>>(csvContent, fullParseConfig);
    } catch (error) {
      console.error('Full CSV parsing error:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Processar Arquivo',
        description: 'Houve um problema ao ler os dados do arquivo.',
      });
      setIsImporting(false);
      setFileToProcess(null);
      setCsvContent('');
    }
  };
  
  const handleNextStep = () => {
    if (!origin) {
      toast({
        variant: 'destructive',
        title: 'Origem não definida',
        description: 'Por favor, defina um ponto de origem para a rota.',
      });
      return;
    }
    if (stops.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhuma parada adicionada',
        description: 'Por favor, adicione pelo menos um endereço de parada.',
      });
      return;
    }
    // Save data to session storage to pass to the next page
    const routeData = {
      origin,
      stops: stops.filter(s => s.placeId), // Ensure we only pass to valid stops
      routeDate: routeDate?.toISOString(),
      routeTime,
    };
    sessionStorage.setItem('newRouteData', JSON.stringify(routeData));
    router.push('/routes/organize');
  };

  const mapStops = React.useMemo(() => stops.filter((s) => s.lat && s.lng), [
    stops,
  ]);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelected}
        accept=".csv, text/csv"
      />
      <ImportAssistantDialog
        isOpen={isAssistantOpen}
        onClose={() => {
          setIsAssistantOpen(false);
          setIsImporting(false);
        }}
        headers={csvHeaders}
        onConfirm={handleImportConfirm}
      />

      <div className="grid h-[calc(100vh-140px)] w-full grid-cols-1 overflow-hidden lg:grid-cols-[480px_1fr]">
        {/* Left Panel */}
        <div className="relative z-10 flex h-full flex-col overflow-hidden border-r bg-background">
          {/* Header */}
          <div className="flex-shrink-0 border-b px-6 py-4">
            <h1 className="text-xl font-semibold">Nova Rota</h1>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              <div className="p-6 space-y-6">

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                        <h3 className="font-semibold">Origem da Rota</h3>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setIsOriginDialogOpen(true)}
                    >
                        <Wand2 className="mr-1 h-3 w-3" />
                        Alterar
                    </Button>
                    </div>
                    <p className="pl-8 text-sm text-muted-foreground">
                    {origin?.address ?? 'Não definida'}
                    </p>
                </div>

                <Separator />

                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Início da Rota</h3>
                  <div className="flex items-center text-sm text-muted-foreground">
                      <Popover
                      open={isDatePopoverOpen}
                      onOpenChange={setIsDatePopoverOpen}
                      >
                      <PopoverTrigger asChild>
                          <Button
                          variant={'link'}
                          className={cn(
                              'p-0 font-medium text-foreground hover:no-underline h-auto',
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
                          className="p-0 font-medium text-foreground hover:no-underline h-auto"
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
                  </div>
                </div>

                <Separator />
                <div className="space-y-4 pb-4">
                    {stops.map((stop, index) => (
                    <div key={stop.id ?? stop.placeId ?? index} className="space-y-2">
                        <Label htmlFor={`stop-${index}`}>
                        Parada {index + 1}
                        {stop.customerName && (
                            <span className="ml-2 font-normal text-muted-foreground">
                            - {stop.customerName}
                            {stop.orderNumber && ` (#${stop.orderNumber})`}
                            </span>
                        )}
                        </Label>
                        <div className="flex items-center gap-2">
                        <AutocompleteInput
                            id={`stop-${index}`}
                            placeholder="Endereço da parada..."
                            value={stop}
                            onChange={(place) => handleStopChange(index, place)}
                        />
                        <Popover>
                            <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                                    <Info className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className='w-80'>
                                <div className="grid gap-4">
                                    <h4 className="font-medium leading-none">Detalhes da Parada</h4>
                                    <div className="grid gap-2 text-sm">
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <span className='text-muted-foreground'>Cliente</span>
                                            <span>{stop.customerName || '--'}</span>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <span className='text-muted-foreground'>Pedido Nº</span>
                                            <span>{stop.orderNumber || '--'}</span>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <span className='text-muted-foreground'>Telefone</span>
                                            <span>{stop.phone || '--'}</span>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <span className='text-muted-foreground'>Janela</span>
                                            <span>{stop.timeWindowStart && stop.timeWindowEnd ? `${stop.timeWindowStart} - ${stop.timeWindowEnd}` : '--'}</span>
                                        </div>
                                        <div className="grid grid-cols-1 items-center gap-2">
                                            <span className='text-muted-foreground'>Observações</span>
                                            <p className='leading-snug'>{stop.notes || '--'}</p>
                                        </div>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleRemoveStop(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        </div>
                    </div>
                    ))}
                </div>
              </div>
            </div>


            {/* Footer */}
            <div className="flex-shrink-0 border-t bg-background p-3 space-y-2">
                <div className="space-y-1.5">
                    <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-sm" onClick={() => setIsAddServiceDialogOpen(true)}>
                        <PlusCircle className="h-4 w-4" />
                        Adicionar novo serviço
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2 h-8 text-sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                    >
                        {isImporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                        <Upload className="h-4 w-4" />
                        )}
                        {isImporting ? 'Importando...' : 'Importar planilha CSV'}
                    </Button>
                </div>
                <Button size="sm" className="w-full h-9" onClick={handleNextStep}>
                    Avançar para Organização
                    <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
            </div>
        </div>

        {/* Right Panel - Map */}
        <div className="h-full w-full overflow-hidden">
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
                  <div key={saved.id} className="group flex w-full items-center gap-4 rounded-md p-3 text-left transition-colors hover:bg-muted">
                    <button
                        className="flex-1 flex items-center gap-4"
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
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => openDeleteConfirmation(saved.id)}
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Origin Confirmation Dialog */}
       <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente o endereço de origem salvo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Origin Dialog */}
      <Dialog open={isNewOriginDialogOpen} onOpenChange={(open) => {
        setIsNewOriginDialogOpen(open);
        if (!open) {
          setNewOriginName('');
          setTempOrigin(null);
        }
      }}>
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
                value={newOriginName}
                onChange={(e) => setNewOriginName(e.target.value)}
                placeholder="Ex: Matriz, Depósito Central"
              />
            </div>
            <div className="grid gap-2">
              <AutocompleteInput
                id="origin-address"
                label="Endereço Completo"
                placeholder="Pesquise o endereço..."
                value={tempOrigin}
                onChange={(place) => {
                  if (place) {
                     const safeId = place.id || place.placeId || `origin-${Date.now()}`;
                     setTempOrigin({...place, id: String(safeId)});
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSaveNewOrigin}>
              Salvar Origem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Add Service Dialog */}
       <Dialog open={isAddServiceDialogOpen} onOpenChange={setIsAddServiceDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Serviço Manualmente</DialogTitle>
            <DialogDescription>
              Preencha os detalhes do serviço. O endereço será validado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-6">
            <div className="space-y-2">
                <Label htmlFor="customerName">Nome do Cliente</Label>
                <Input id="customerName" value={manualService.customerName} onChange={handleManualServiceChange} placeholder="Nome do Cliente" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" value={manualService.phone} onChange={handleManualServiceChange} placeholder="(00) 90000-0000" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cep">CEP</Label>
                    <Input id="cep" value={manualService.cep} onChange={handleManualServiceChange} placeholder="00000-000" />
                </div>
            </div>
             <div className="space-y-2">
                <Label htmlFor="locationLink">Link Localização (Google Maps)</Label>
                <Input id="locationLink" value={manualService.locationLink} onChange={handleManualServiceChange} placeholder="Cole o link do Google Maps aqui" />
            </div>
            <Separator className="my-4" />
            <div className="space-y-2">
                <Label htmlFor="rua">Rua</Label>
                <Input id="rua" value={manualService.rua} onChange={handleManualServiceChange} placeholder="Avenida, Rua, etc." />
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 space-y-2">
                    <Label htmlFor="numero">Número</Label>
                    <Input id="numero" value={manualService.numero} onChange={handleManualServiceChange} placeholder="123" />
                </div>
                <div className="col-span-2 space-y-2">
                    <Label htmlFor="complemento">Complemento</Label>
                    <Input id="complemento" value={manualService.complemento} onChange={handleManualServiceChange} placeholder="Apto, Bloco, etc." />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="bairro">Bairro</Label>
                    <Input id="bairro" value={manualService.bairro} onChange={handleManualServiceChange} placeholder="Setor, Bairro" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade</Label>
                    <Input id="cidade" value={manualService.cidade} onChange={handleManualServiceChange} placeholder="Goiânia" />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" value={manualService.notes} onChange={handleManualServiceChange} placeholder="Detalhes sobre a entrega, ponto de referência..." />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSaveManualService}>Salvar Serviço</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

    

    
