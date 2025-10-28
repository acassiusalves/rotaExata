
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
  Pencil,
  AlertCircle,
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
import { saveRouteInProgress, hasRouteInProgress, clearRouteInProgress } from '@/lib/route-persistence';

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
  orderNumber: '',
  timeWindowStart: '',
  timeWindowEnd: '',
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

  // Carregar origens salvas do localStorage ou usar as iniciais
  const [savedOrigins, setSavedOrigins] = React.useState<typeof initialSavedOrigins>(() => {
    if (typeof window === 'undefined') return initialSavedOrigins;

    const stored = localStorage.getItem('savedOrigins');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Erro ao carregar origens salvas:', e);
        return initialSavedOrigins;
      }
    }
    return initialSavedOrigins;
  });

  const [origin, setOrigin] = React.useState<PlaceValue | null>(() => {
    if (savedOrigins.length > 0) {
      return savedOrigins[0].value;
    }
    return null;
  });
  const [stops, setStops] = React.useState<PlaceValue[]>([]);
  const [routeDate, setRouteDate] = React.useState<Date | undefined>(undefined);
  const [routeTime, setRouteTime] = React.useState('18:10');

  const [isImporting, setIsImporting] = React.useState(false);
  const [showRouteInProgressDialog, setShowRouteInProgressDialog] = React.useState(false);
  const [isOriginDialogOpen, setIsOriginDialogOpen] = React.useState(false);
  const [isNewOriginDialogOpen, setIsNewOriginDialogOpen] = React.useState(false);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = React.useState(false);
  const [isAddServiceDialogOpen, setIsAddServiceDialogOpen] = React.useState(false);
  
  const [stopToEdit, setStopToEdit] = React.useState<{ stop: PlaceValue; index: number } | null>(null);
  const [manualService, setManualService] = React.useState(initialManualServiceState);

  const [newOriginName, setNewOriginName] = React.useState('');
  const [newOriginLink, setNewOriginLink] = React.useState('');
  const [tempOrigin, setTempOrigin] = React.useState<PlaceValue | null>(null);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [originToDelete, setOriginToDelete] = React.useState<string | null>(null);
  
  // States for Import Assistant
  const [isAssistantOpen, setIsAssistantOpen] = React.useState(false);
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);
  const [fileToProcess, setFileToProcess] = React.useState<File | null>(null);
  const [csvContent, setCsvContent] = React.useState<string>('');

  // States for Address Validation Groups
  const [validatedStops, setValidatedStops] = React.useState<PlaceValue[]>([]);
  const [problematicStops, setProblematicStops] = React.useState<PlaceValue[]>([]);
  const [isValidationDialogOpen, setIsValidationDialogOpen] = React.useState(false);
  const [expandedGroup, setExpandedGroup] = React.useState<'valid' | 'problematic' | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  React.useEffect(() => {
    // This runs only on the client, after hydration, preventing hydration mismatch
    setRouteDate(new Date());
  }, []);

  // Verificar se há rota em progresso quando o componente carregar
  React.useEffect(() => {
    if (typeof window !== 'undefined' && hasRouteInProgress()) {
      setShowRouteInProgressDialog(true);
    }
  }, []);

  // Salvar origens no localStorage sempre que mudar
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('savedOrigins', JSON.stringify(savedOrigins));
    }
  }, [savedOrigins]);

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
    setNewOriginLink('');
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
          if (!window.google || !window.google.maps) {
            console.error("Google Maps API not loaded");
            return reject("Google Maps API not loaded");
          }
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ address, region: 'BR' }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              const place = results[0];
              const location = place.geometry?.location;
              if (!location) {
                console.warn(`Geocoding result for "${address}" missing geometry.`);
                return resolve(null);
              }
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
    (lat: number, lng: number): Promise<any | null> => {
      return new Promise((resolve, reject) => {
        if (!window.google || !window.google.maps) {
            console.error("Google Maps API not loaded");
            return reject("Google Maps API not loaded");
        }
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            resolve(results[0]);
          } else {
            console.warn(`Reverse geocoding failed: ${status}`);
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
      handleLocationLinkPaste(value, (addressDetails) => {
        if (addressDetails) {
            setManualService(prev => ({ ...prev, ...addressDetails }));
        }
      });
    }
  }

  const handleLocationLinkPaste = async (url: string, callback: (details: any) => void) => {
      const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (!match) return;

      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      
      toast({ title: "Analisando link...", description: "Buscando endereço a partir das coordenadas." });

      const place = await reverseGeocode(lat, lng);
      if (place) {
          const address: Partial<typeof initialManualServiceState> = {};
          const get = (type: string) => place.address_components.find((c: any) => c.types.includes(type))?.long_name;
          
          address.rua = get('route');
          address.numero = get('street_number');
          address.bairro = get('sublocality_level_1') || get('political');
          address.cidade = get('administrative_area_level_2');
          address.cep = get('postal_code');
          
          callback(address);
          
          toast({ title: "Endereço preenchido!", description: "Os campos foram preenchidos automaticamente." });
      } else {
         toast({ variant: 'destructive', title: "Falha na busca", description: "Não foi possível encontrar o endereço para este link." });
      }
  }

  const handleOriginLinkChange = async (url: string) => {
    setNewOriginLink(url);
    const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) return;

    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    toast({ title: "Analisando link...", description: "Buscando endereço a partir das coordenadas." });

    const place = await reverseGeocode(lat, lng);
    if (place) {
      setTempOrigin({
        id: `geocoded-${place.place_id}-${Date.now()}`,
        address: place.formatted_address,
        placeId: place.place_id,
        lat: lat,
        lng: lng,
      });
       toast({ title: "Endereço preenchido!", description: "O campo de endereço foi preenchido automaticamente." });
    } else {
       toast({ variant: 'destructive', title: "Falha na busca", description: "Não foi possível encontrar o endereço para este link." });
    }
  };


  const handleSaveManualService = async (isEditing = false) => {
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
            id: isEditing && stopToEdit ? stopToEdit.stop.id : `manual-${Date.now()}`,
            address: geocoded.address,
            customerName: manualService.customerName,
            phone: manualService.phone,
            notes: manualService.notes,
            orderNumber: manualService.orderNumber,
            timeWindowStart: manualService.timeWindowStart,
            timeWindowEnd: manualService.timeWindowEnd,
        };

        if (isEditing && stopToEdit) {
            const updatedStops = [...stops];
            updatedStops[stopToEdit.index] = newStop;
            setStops(updatedStops);
            toast({ title: 'Serviço Atualizado!', description: 'Os detalhes da parada foram atualizados.' });
        } else {
            setStops(prevStops => [...prevStops, newStop]);
            toast({ title: 'Serviço Adicionado!', description: 'O novo serviço foi adicionado à lista de paradas.' });
        }

        setManualService(initialManualServiceState);
        setIsAddServiceDialogOpen(false);
        setStopToEdit(null);
    } else {
        toast({
            variant: 'destructive',
            title: 'Falha na Geocodificação',
            description: 'Não foi possível encontrar o endereço. Verifique os dados e tente novamente.',
        });
    }
  };

  const openEditDialog = (stop: PlaceValue, index: number) => {
    setStopToEdit({ stop, index });
    setManualService({
      customerName: stop.customerName || '',
      phone: stop.phone || '',
      locationLink: '', // não temos como reverter, então fica em branco
      cep: '', // Será preenchido por reverse geocode
      rua: '', // Será preenchido por reverse geocode
      numero: '', // Será preenchido por reverse geocode
      complemento: stop.complemento || '',
      bairro: '', // Será preenchido por reverse geocode
      cidade: '', // Será preenchido por reverse geocode
      notes: stop.notes || '',
      orderNumber: stop.orderNumber || '',
      timeWindowStart: stop.timeWindowStart || '',
      timeWindowEnd: stop.timeWindowEnd || '',
    });
    // Apenas abrir o dialog. O preenchimento completo vem do reverse geocode
    setIsAddServiceDialogOpen(true);

    if (stop.lat && stop.lng) {
      reverseGeocode(stop.lat, stop.lng).then(place => {
        if(place) {
          const get = (type: string) => place.address_components.find((c: any) => c.types.includes(type))?.long_name;
          setManualService(prev => ({
            ...prev,
            rua: get('route') || prev.rua,
            numero: get('street_number') || prev.numero,
            bairro: get('sublocality_level_1') || get('political') || prev.bairro,
            cidade: get('administrative_area_level_2') || prev.cidade,
            cep: get('postal_code') || prev.cep,
          }))
        }
      })
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
      'Número':          ['numero','nº','n°','no','n','num','#','numero casa','numero endereco','nr','n º','nro'],
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

            // Helper para encontrar o valor no row, mesmo com variações de encoding
            const getRowValue = (targetHeader: string) => {
                // Primeiro tenta busca direta
                if (row[targetHeader] != null) return row[targetHeader];

                // Depois tenta busca normalizada
                const normalized = normalizeString(targetHeader);
                for (const key in row) {
                    if (normalizeString(key) === normalized) {
                        return row[key];
                    }
                }
                return null;
            };

            for (const header in mapping) {
                const systemField = mapping[header];
                if (systemField !== 'Ignorar') {
                    const value = getRowValue(header);

                    // Debug para campo Número
                    if (systemField === 'Número' && index < 5) {
                        console.log(`[DEBUG Linha ${index + 1}] Header: "${header}", Valor: "${value}", Tipo: ${typeof value}`);
                    }

                    if (value != null && String(value).trim() !== '') {
                        if (fieldOrder.includes(systemField)) {
                            // Apenas adiciona se o campo ainda não foi preenchido
                            // Isso evita que múltiplas colunas sobrescrevam o mesmo campo
                            if (!addressParts[systemField]) {
                                addressParts[systemField] = String(value).trim();
                            }
                        }
                    }
                }
            }

            // Debug: mostrar o que foi extraído
            if (index < 5) {
                console.log(`[DEBUG Linha ${index + 1}] addressParts:`, addressParts);
            }

            // Tentativa de extrair número do complemento se não houver número explícito
            if (!addressParts['Número'] || addressParts['Número'].trim() === '') {
                const complemento = getField(row, 'Complemento', ['Complemento']);
                if (complemento) {
                    // Tenta extrair número de padrões como "qd 37 lt 28", "Qd.5 Lt.20", "apt 2603", etc.
                    // Prioriza números que aparecem após palavras como "lt", "lote", "casa", "apt", "apto"
                    const loteMatch = complemento.match(/(?:lt|lote)\s*\.?\s*(\d+)/i);
                    const casaMatch = complemento.match(/(?:casa|cs)\s*\.?\s*(\d+)/i);
                    const aptoMatch = complemento.match(/(?:apt|apto|ap)\s*\.?\s*(\d+)/i);
                    const quadraMatch = complemento.match(/(?:qd|quadra)\s*\.?\s*(\d+)/i);

                    // Usa a primeira correspondência encontrada (prioriza lote > casa > apto > quadra)
                    const extractedNumber = loteMatch?.[1] || casaMatch?.[1] || aptoMatch?.[1] || quadraMatch?.[1];

                    if (extractedNumber && index < 5) {
                        console.log(`[DEBUG Linha ${index + 1}] Número extraído do complemento "${complemento}": ${extractedNumber}`);
                    }

                    if (extractedNumber) {
                        addressParts['Número'] = extractedNumber;
                    }
                }
            }

            // Monta o endereço tratando ruas com números no nome
            const ruaValue = addressParts['Rua'] || '';
            const numeroValue = addressParts['Número'] || '';

            // Verifica se a rua já termina com número separado por espaço E tem uma letra/palavra curta antes
            // Exemplos que devem casar: "Rua T 48", "Avenida C 123", "Rua T4 150"
            // Exemplos que NÃO devem casar: "Rua 137" (nome completo da rua sem letra antes)
            // Padrão: palavra + espaço + letra curta (1-3 chars) + opcional(número) + espaço + número final
            const ruaComNumeroNoNome = /\b[A-Za-z]{1,3}\s*\d*\s+\d+\s*$/.test(ruaValue) && !/^(Rua|Avenida|Av)\s+\d+\s*$/.test(ruaValue);

            // Se a rua tem número no nome, remove o campo "Número" para não duplicar
            const addressPartsAjustado = { ...addressParts };
            if (ruaComNumeroNoNome && numeroValue) {
                delete addressPartsAjustado['Número'];
            }

            const addressString = fieldOrder
                .map(field => addressPartsAjustado[field])
                .filter(val => val != null && val !== '')
                .join(', ') + ', Brasil';

            return {
                addressString,
                originalAddressParts: addressParts, // Guardar dados originais da planilha
                customerName: getField(row, 'Nome do Cliente', ['Nome do Cliente','Cliente']),
                phone:        getField(row, 'Telefone', ['Telefone']),
                notes:        getField(row, 'Observações', ['Observações']),
                orderNumber:  getField(row, 'Número Pedido', ['Número Pedido','Pedido']),
                timeWindowStart: getField(row, 'Início do intervalo permitido', ['Início do intervalo permitido']),
                timeWindowEnd:   getField(row, 'Fim do intervalo permitido', ['Fim do intervalo permitido']),
                complemento:  getField(row, 'Complemento', ['Complemento']),
            };
        });

        // Função para normalizar e comparar endereços
        const normalizeForComparison = (str: string) => {
          return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .toLowerCase()
            .trim();
        };

        const validateAddress = (geocoded: any, original: Record<string, string>) => {
          const issues: string[] = [];

          // Extrair componentes do endereço geocodificado
          const addressComponents = geocoded.address_components || [];

          // Função para extrair componente por tipo
          const getComponent = (types: string[]) => {
            for (const type of types) {
              const component = addressComponents.find((c: any) => c.types.includes(type));
              if (component) return component.long_name;
            }
            return null;
          };

          // Extrair bairro e cidade do geocoding
          const geocodedBairro = getComponent(['sublocality_level_1', 'sublocality', 'neighborhood', 'political']);
          const geocodedCidade = getComponent(['administrative_area_level_2', 'locality']);

          // Normalizar valores
          const originalBairro = normalizeForComparison(original['Bairro'] || '');
          const originalCidade = normalizeForComparison(original['Município'] || '');
          const normalizedGeoBairro = normalizeForComparison(geocodedBairro || '');
          const normalizedGeoCidade = normalizeForComparison(geocodedCidade || '');

          // Verificar bairro - usa comparação parcial (contains)
          if (originalBairro && normalizedGeoBairro &&
              !normalizedGeoBairro.includes(originalBairro) &&
              !originalBairro.includes(normalizedGeoBairro)) {
            issues.push(`Bairro divergente: esperado "${original['Bairro']}", mas não encontrado no endereço geocodificado`);
          }

          // Verificar cidade - usa comparação parcial (contains)
          if (originalCidade && normalizedGeoCidade &&
              !normalizedGeoCidade.includes(originalCidade) &&
              !originalCidade.includes(normalizedGeoCidade)) {
            issues.push(`Cidade divergente: esperado "${original['Município']}", mas não encontrado no endereço geocodificado`);
          }

          return issues;
        };

        const geocodedStopsPromises = stopsToProcess.map(async (item) => {
            const geocoded = await geocodeAddress(item.addressString);
            if (geocoded) {
                // Validar endereço
                const validationIssues = validateAddress(geocoded, item.originalAddressParts);

                const stopData: PlaceValue = {
                    ...geocoded,
                    // Usa o endereço original da planilha ao invés do formatado pelo Google
                    // para preservar nomes de rua com números (ex: "Rua T 48")
                    address: item.addressString.replace(', Brasil', ''),
                    customerName: item.customerName,
                    phone: item.phone,
                    notes: item.notes,
                    orderNumber: item.orderNumber,
                    timeWindowStart: item.timeWindowStart,
                    timeWindowEnd: item.timeWindowEnd,
                    complemento: item.complemento,
                    originalAddressParts: item.originalAddressParts,
                    validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
                    hasValidationIssues: validationIssues.length > 0,
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

        // Separar em grupos: válidos e problemáticos
        const valid = newStops.filter(stop => !stop.hasValidationIssues);
        const problematic = newStops.filter(stop => stop.hasValidationIssues);

        setValidatedStops(valid);
        setProblematicStops(problematic);

        // Adicionar apenas os endereços válidos às paradas
        setStops(prevStops => [...prevStops, ...valid]);

        // Mostrar diálogo de validação se houver endereços problemáticos
        if (problematic.length > 0) {
          setIsValidationDialogOpen(true);
          toast({
            title: 'Atenção: Endereços Requerem Verificação',
            description: `${problematic.length} endereço(s) com divergências. ${valid.length} endereço(s) validado(s).`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Importação Concluída!',
            description: `${newStops.length} de ${stopsToProcess.length} endereços foram adicionados à rota.`,
          });
        }

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
  
  const handleContinueExistingRoute = () => {
    setShowRouteInProgressDialog(false);
    router.push('/routes/organize');
  };

  const handleDiscardExistingRoute = () => {
    clearRouteInProgress();
    setShowRouteInProgressDialog(false);
    toast({
      title: 'Rota Descartada',
      description: 'A rota em progresso foi descartada. Você pode criar uma nova rota.',
    });
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
      routeDate: routeDate?.toISOString() || '',
      routeTime,
    };
    sessionStorage.setItem('newRouteData', JSON.stringify(routeData));

    // Salvar também no localStorage para persistência
    saveRouteInProgress(routeData);

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

      <div className="grid h-screen w-full grid-cols-1 overflow-hidden lg:grid-cols-[480px_1fr]">
        {/* Left Panel */}
        <div className="relative z-10 flex h-full flex-col overflow-hidden border-r border-border bg-background">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-border px-6 py-4">
            <h1 className="text-xl font-semibold text-foreground">Nova Rota</h1>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              <div className="p-6 space-y-6">

                <div className="space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MapPin className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-foreground">Origem da Rota</h3>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 transition-all duration-300"
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

                <Separator className="bg-border" />

                <div className="flex items-center gap-3 animate-fade-in">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Início da Rota</h3>
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
                            <PopoverContent className="w-80">
                                <div className="grid gap-4">
                                  <div className="space-y-2">
                                      <h4 className="font-medium leading-none">Detalhes da Parada</h4>
                                      <p className="text-sm text-muted-foreground">
                                        {stop.address}
                                      </p>
                                  </div>
                                  <div className="grid gap-2 text-sm">
                                      <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-muted-foreground">Cliente</span>
                                        <span>{stop.customerName || "-"}</span>
                                      </div>
                                      <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-muted-foreground">Pedido</span>
                                        <span>{stop.orderNumber || "-"}</span>
                                      </div>
                                      <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-muted-foreground">Telefone</span>
                                        <span>{stop.phone || "-"}</span>
                                      </div>
                                       <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-muted-foreground">Janela</span>
                                        <span>{stop.timeWindowStart && stop.timeWindowEnd ? `${stop.timeWindowStart} - ${stop.timeWindowEnd}` : '-'}</span>
                                      </div>
                                       <div className="grid grid-cols-[100px_1fr] items-start gap-2">
                                        <span className="text-muted-foreground">Observações</span>
                                        <span className="italic">{stop.notes || "-"}</span>
                                      </div>
                                  </div>
                                  <Button size="sm" onClick={() => openEditDialog(stop, index)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Editar
                                  </Button>
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
            <div className="flex-shrink-0 border-t border-border bg-card p-3 space-y-2">
                <div className="space-y-1.5">
                    <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-sm transition-all duration-300" onClick={() => {
                      setStopToEdit(null);
                      setManualService(initialManualServiceState);
                      setIsAddServiceDialogOpen(true);
                    }}>
                        <PlusCircle className="h-4 w-4" />
                        Adicionar novo serviço
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2 h-8 text-sm transition-all duration-300"
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
                <Button size="sm" className="w-full h-9 transition-all duration-300 hover:shadow-button-primary" onClick={handleNextStep}>
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
          setNewOriginLink('');
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
                <Label htmlFor="origin-link">Link da Localização (Google Maps)</Label>
                <Input
                    id="origin-link"
                    value={newOriginLink}
                    onChange={(e) => handleOriginLinkChange(e.target.value)}
                    placeholder="Cole o link do Google Maps aqui"
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

      {/* Address Validation Dialog */}
      <Dialog open={isValidationDialogOpen} onOpenChange={setIsValidationDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Validação de Endereços Importados</DialogTitle>
            <DialogDescription>
              Alguns endereços apresentaram divergências e requerem sua atenção
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
            {/* Grupo: Serviços Prontos para Roteirizar */}
            {validatedStops.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedGroup(expandedGroup === 'valid' ? null : 'valid')}
                  className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500 text-white font-bold">
                      {validatedStops.length}
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-green-900">Serviços prontos para roteirizar</h3>
                      <p className="text-sm text-green-700">Endereços validados com sucesso</p>
                    </div>
                  </div>
                  <div className={`transform transition-transform ${expandedGroup === 'valid' ? 'rotate-180' : ''}`}>
                    ▼
                  </div>
                </button>
                {expandedGroup === 'valid' && (
                  <div className="p-4 bg-white border-t space-y-2 max-h-64 overflow-y-auto">
                    {validatedStops.map((stop, index) => (
                      <div key={index} className="p-3 border rounded-md hover:bg-gray-50">
                        <div className="font-medium">{stop.customerName || `Parada ${index + 1}`}</div>
                        <div className="text-sm text-muted-foreground">{stop.address}</div>
                        {stop.orderNumber && <div className="text-xs text-muted-foreground">Pedido: {stop.orderNumber}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Grupo: Atenção! Confira esses serviços */}
            {problematicStops.length > 0 && (
              <div className="border rounded-lg overflow-hidden border-red-300">
                <button
                  onClick={() => setExpandedGroup(expandedGroup === 'problematic' ? null : 'problematic')}
                  className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500 text-white font-bold">
                      {problematicStops.length}
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-red-900">Atenção! Confira esses serviços</h3>
                      <p className="text-sm text-red-700">Endereços com possíveis divergências</p>
                    </div>
                  </div>
                  <div className={`transform transition-transform ${expandedGroup === 'problematic' ? 'rotate-180' : ''}`}>
                    ▼
                  </div>
                </button>
                {expandedGroup === 'problematic' && (
                  <div className="p-4 bg-white border-t space-y-3 max-h-64 overflow-y-auto">
                    {problematicStops.map((stop, index) => (
                      <div key={index} className="p-3 border border-red-200 rounded-md bg-red-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-red-900">{stop.customerName || `Parada ${index + 1}`}</div>
                            <div className="text-sm text-muted-foreground mt-1">{stop.address}</div>
                            {stop.orderNumber && <div className="text-xs text-muted-foreground mt-1">Pedido: {stop.orderNumber}</div>}
                            {stop.validationIssues && stop.validationIssues.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {stop.validationIssues.map((issue, idx) => (
                                  <div key={idx} className="text-xs text-red-700 flex items-start gap-1">
                                    <span className="text-red-500">⚠</span>
                                    <span>{issue}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Adicionar o endereço problemático às paradas para edição
                              setStops(prev => [...prev, stop]);
                              setProblematicStops(prev => prev.filter((_, i) => i !== index));
                              toast({
                                title: 'Endereço Adicionado',
                                description: 'O endereço foi adicionado à lista. Você pode editá-lo manualmente.',
                              });
                            }}
                          >
                            Adicionar Mesmo Assim
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                // Limpar endereços problemáticos
                setProblematicStops([]);
                setValidatedStops([]);
                setIsValidationDialogOpen(false);
              }}
            >
              Descartar Problemáticos
            </Button>
            <Button
              onClick={() => {
                // Adicionar todos os endereços problemáticos
                setStops(prev => [...prev, ...problematicStops]);
                setProblematicStops([]);
                setValidatedStops([]);
                setIsValidationDialogOpen(false);
                toast({
                  title: 'Todos Adicionados',
                  description: 'Todos os endereços foram adicionados. Revise manualmente os que têm divergências.',
                });
              }}
            >
              Adicionar Todos
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setValidatedStops([]);
                setProblematicStops([]);
                setIsValidationDialogOpen(false);
              }}
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Add/Edit Service Dialog */}
       <Dialog open={isAddServiceDialogOpen} onOpenChange={(open) => {
         if (!open) {
           setStopToEdit(null);
           setManualService(initialManualServiceState);
         }
         setIsAddServiceDialogOpen(open);
       }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{stopToEdit ? 'Editar Serviço' : 'Adicionar Novo Serviço Manualmente'}</DialogTitle>
            <DialogDescription>
              Preencha os detalhes do serviço. O endereço será validado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label htmlFor="customerName">Nome do Cliente</Label>
                  <Input id="customerName" value={manualService.customerName} onChange={handleManualServiceChange} placeholder="Nome do Cliente" />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="orderNumber">Nº Pedido</Label>
                  <Input id="orderNumber" value={manualService.orderNumber} onChange={handleManualServiceChange} placeholder="Ex: 12345" />
              </div>
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
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="timeWindowStart">Início da Janela</Label>
                    <Input id="timeWindowStart" type="time" value={manualService.timeWindowStart} onChange={handleManualServiceChange} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="timeWindowEnd">Fim da Janela</Label>
                    <Input id="timeWindowEnd" type="time" value={manualService.timeWindowEnd} onChange={handleManualServiceChange} />
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
            <Button onClick={() => handleSaveManualService(!!stopToEdit)}>{stopToEdit ? 'Salvar Alterações' : 'Salvar Serviço'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Rota em Progresso */}
      <AlertDialog open={showRouteInProgressDialog} onOpenChange={setShowRouteInProgressDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Rota em Progresso Detectada
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você possui uma rota que foi iniciada mas não foi finalizada. Deseja continuar de onde parou ou descartar e criar uma nova rota?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardExistingRoute}>
              Descartar Rota
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleContinueExistingRoute}>
              Continuar Rota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

    