
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  List,
  Wand2,
  User,
  Check,
  Truck,
  Calendar,
  Clock,
  Milestone,
  Loader2,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  PackagePlus,
  MoreHorizontal,
  Search,
  Download,
  Bug,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { RouteMap, RouteMapHandle } from '@/components/maps/RouteMap';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { ResizableDivider } from '@/components/ui/resizable-divider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PlaceValue, RouteInfo, Driver, DriverLocationWithInfo } from '@/lib/types';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDraggable,
} from '@dnd-kit/core';
import type { DropAnimation } from '@dnd-kit/core';
import {
  arrayMove,
} from '@dnd-kit/sortable';
import { RouteTimeline } from '@/components/routes/route-timeline';
import { optimizeDeliveryRoutes } from '@/ai/flows/optimize-delivery-routes';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AutocompleteInput } from '@/components/maps/AutocompleteInput';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { db, functions } from '@/lib/firebase/client';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, getDocs, Timestamp, doc, updateDoc, getDoc, setDoc, writeBatch, deleteDoc, arrayUnion, increment } from "firebase/firestore";
import { httpsCallable } from 'firebase/functions';
import { startOfDay, endOfDay } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { detectRouteChanges, markModifiedStops, createNotification } from '@/lib/route-change-tracker';


interface RouteData {
  origin: PlaceValue;
  stops: PlaceValue[];
  routeDate: string;
  routeTime: string;
  isExistingRoute?: boolean;
  currentRouteId?: string; // ID da rota atual para filtrar
  period?: 'Matutino' | 'Vespertino' | 'Noturno'; // Período para filtrar rotas
  routeName?: string; // Nome da rota para exibir
  existingRouteData?: {
    distanceMeters: number;
    duration: string;
    encodedPolyline: string;
    color: string;
  };
  // Campos para Serviços Luna
  isService?: boolean; // Flag para indicar que é um serviço Luna
  serviceId?: string; // ID do serviço
  serviceCode?: string; // Código do serviço (LN-XXXX)
  // Rotas já existentes (despachadas) do serviço
  existingServiceRoutes?: Array<{
    id: string;
    code: string;
    name: string;
    stops: PlaceValue[];
    distanceMeters: number;
    duration: string;
    encodedPolyline: string;
    color: string;
    status: string;
    driverId?: string;
    driverInfo?: { name: string; vehicle: { type: string; plate: string } };
  }>;
}

const computeRoute = async (
  origin: PlaceValue,
  stops: PlaceValue[]
): Promise<RouteInfo | null> => {
  if (stops.length === 0) return null;
  try {
    const res = await fetch('/api/compute-optimized-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, stops }),
    });
    if (!res.ok) {
       const errorText = await res.text();
       console.error('API Error:', errorText);
       throw new Error(errorText);
    }
    const data = await res.json();
    return { ...data, stops, visible: true }; // Ensure original stops are returned
  } catch (error) {
    console.error('Failed to compute route:', error);
    return null;
  }
};

const formatDistance = (meters: number) => {
  if (meters === 0) return '0.00';
  return (meters / 1000).toFixed(2);
};

const formatDuration = (durationString: string) => {
  if (!durationString || durationString === '0s') return '0m';
  const seconds = parseInt(durationString.replace('s', ''), 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const calculateFreightCost = (distanceMeters: number): string => {
  const BASE_PRICE = 5.00; // R$ 5,00
  const PRICE_PER_KM = 1.20; // R$ 1,20
  
  const distanceKm = distanceMeters / 1000;
  const cost = BASE_PRICE + (distanceKm * PRICE_PER_KM);

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cost);
};

// Simple Euclidean distance for clustering (good enough for this purpose)
const getDistance = (p1: {lat: number, lng: number}, p2: {lat: number, lng: number}) => {
    return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2));
};

const kMeansCluster = (stops: PlaceValue[], k: number, maxIterations = 20) => {
  if (stops.length <= k) {
    return stops.map(stop => [stop]);
  }

  // 1. Initialize centroids by picking k stops that are far from each other
  let centroids: {lat: number, lng: number}[] = [];
  centroids.push(stops[0]);
  while (centroids.length < k) {
    let maxDist = 0;
    let farthestStop: PlaceValue | null = null;
    stops.forEach(stop => {
      let minDistToCentroid = Infinity;
      centroids.forEach(centroid => {
        const dist = getDistance(stop, centroid);
        if (dist < minDistToCentroid) {
          minDistToCentroid = dist;
        }
      });
      if (minDistToCentroid > maxDist) {
        maxDist = minDistToCentroid;
        farthestStop = stop;
      }
    });
    if (farthestStop) {
      centroids.push(farthestStop);
    }
  }


  let clusters: PlaceValue[][] = [];
  let iterations = 0;

  while (iterations < maxIterations) {
    // 2. Assign stops to the closest centroid
    clusters = Array.from({ length: k }, () => []);
    stops.forEach(stop => {
      let minDistance = Infinity;
      let closestCentroidIndex = -1;
      centroids.forEach((centroid, index) => {
        const distance = getDistance(stop, centroid);
        if (distance < minDistance) {
          minDistance = distance;
          closestCentroidIndex = index;
        }
      });
      if (closestCentroidIndex !== -1) {
        clusters[closestCentroidIndex].push(stop);
      }
    });

    // 3. Recalculate centroids
    const newCentroids = clusters.map(cluster => {
      if (cluster.length === 0) {
        // Find a random stop to be the new centroid if a cluster is empty
        return stops[Math.floor(Math.random() * stops.length)];
      }
      const sum = cluster.reduce((acc, stop) => ({ lat: acc.lat + stop.lat, lng: acc.lng + stop.lng }), { lat: 0, lng: 0 });
      return { lat: sum.lat / cluster.length, lng: sum.lng / cluster.length };
    });

    // 4. Check for convergence
    const hasConverged = newCentroids.every((centroid, index) => {
      return centroid.lat === centroids[index].lat && centroid.lng === centroids[index].lng;
    });

    if (hasConverged) {
      break;
    }

    centroids = newCentroids;
    iterations++;
  }

  return clusters.filter(c => c.length > 0);
};

const UnassignedStopItem: React.FC<{
  stop: PlaceValue;
  index: number;
  onOpenInfo: (stopId: string) => void;
}> = ({ stop, index, onOpenInfo }) => {
  const hasValidCoords = stop.lat && stop.lng && stop.lat !== 0 && stop.lng !== 0;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unassigned-${stop.id ?? stop.placeId ?? index}`,
    data: { routeKey: 'unassigned', index, stop },
    disabled: !hasValidCoords,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(hasValidCoords ? listeners : {})}
      {...(hasValidCoords ? attributes : {})}
      className={`text-left text-sm p-2 rounded-md border border-dashed ${
        hasValidCoords
          ? 'hover:bg-muted border-gray-300 cursor-grab active:cursor-grabbing'
          : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 cursor-not-allowed opacity-70'
      }`}
      title={hasValidCoords ? 'Arraste para uma rota' : 'Edite o endereço primeiro (clique em Editar na tabela abaixo)'}
      onClick={(e) => {
        if (!isDragging && hasValidCoords) {
          onOpenInfo(String(stop.id));
        }
      }}
    >
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${hasValidCoords ? 'bg-black' : 'bg-amber-500'}`} />
        <span className="flex-1 truncate">{stop.customerName || stop.address}</span>
        {!hasValidCoords && <span className="text-xs text-amber-600 flex-shrink-0">sem coordenadas</span>}
      </div>
    </div>
  );
};

const UnassignedStopCircle: React.FC<{
  stop: PlaceValue;
  index: number;
  onOpenInfo: (stopId: string) => void;
}> = ({ stop, index, onOpenInfo }) => {
  const hasValidCoords = stop.lat && stop.lng && stop.lat !== 0 && stop.lng !== 0;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unassigned-${stop.id ?? stop.placeId ?? index}`,
    data: { routeKey: 'unassigned', index, stop },
    disabled: !hasValidCoords,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(hasValidCoords ? listeners : {})}
      {...(hasValidCoords ? attributes : {})}
      className={`flex items-center justify-center ${
        hasValidCoords ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-70'
      }`}
      title={hasValidCoords ? `${stop.customerName || stop.address?.split(',')[0] || 'Ponto'} - Arraste para uma rota` : 'Sem coordenadas válidas'}
      onClick={(e) => {
        if (!isDragging && hasValidCoords) {
          onOpenInfo(String(stop.id));
        }
      }}
    >
      {/* Círculo numerado - tamanho igual aos da timeline */}
      <div className={`
        relative flex h-6 w-6 items-center justify-center rounded-full
        ${hasValidCoords
          ? 'bg-black dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-200'
          : 'bg-amber-500'
        }
      `}>
        <span className={`text-xs font-semibold ${hasValidCoords ? 'text-white dark:text-black' : 'text-white'}`}>
          {index + 1}
        </span>

        {/* Indicador de alerta se não tiver coordenadas */}
        {!hasValidCoords && (
          <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 border border-white" />
        )}
      </div>
    </div>
  );
};

const UnassignedStopsTimeline: React.FC<{
  stops: PlaceValue[];
  onOpenInfo: (stopId: string) => void;
}> = ({ stops, onOpenInfo }) => {
  if (stops.length === 0) return null;

  return (
    <div className="w-full border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <PackagePlus className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-muted-foreground">
          Serviços não alocados ({stops.length})
        </h4>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
        {stops.map((stop, index) => (
          <UnassignedStopCircle
            key={`unassigned-${stop.id ?? stop.placeId ?? index}`}
            stop={stop}
            index={index}
            onOpenInfo={onOpenInfo}
          />
        ))}
      </div>
    </div>
  );
};

const EditableRouteName: React.FC<{
  name: string;
  onChange: (newName: string) => void;
  onSave?: (newName: string) => Promise<void>; // Nova prop para persistir no Firestore
}> = ({ name, onChange, onSave }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [currentName, setCurrentName] = React.useState(name);
  const [isSaving, setIsSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (currentName.trim() === name || !currentName.trim()) {
      setCurrentName(name);
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      // Atualizar estado local primeiro
      onChange(currentName);

      // Se tiver função de salvar (para rotas existentes), chamar
      if (onSave) {
        await onSave(currentName);
      }

      setIsEditing(false);
    } catch (error) {
      console.error('Erro ao salvar nome da rota:', error);
      // Reverter para o nome anterior em caso de erro
      setCurrentName(name);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    }
    if (e.key === 'Escape') {
      setCurrentName(name);
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 font-medium">
      {isEditing ? (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={currentName}
            onChange={(e) => setCurrentName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="h-8"
            disabled={isSaving}
          />
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      ) : (
        <>
          <span>{name}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
};

export default function ServiceAcompanharPage() {
  const router = useRouter();
  const params = useParams();
  const serviceId = params.serviceId as string;
  const { toast } = useToast();
  const [routeData, setRouteData] = React.useState<RouteData | null>(null);

  // Check if Google Maps is loaded (RouteMap component loads it)
  const [isMapLoaded, setIsMapLoaded] = React.useState(false);

  React.useEffect(() => {
    // Poll for Google Maps availability
    const checkGoogleMaps = () => {
      if (window.google && window.google.maps) {
        setIsMapLoaded(true);
        return true;
      }
      return false;
    };

    if (!checkGoogleMaps()) {
      const interval = setInterval(() => {
        if (checkGoogleMaps()) {
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, []);
  const [isOptimizing, setIsOptimizing] = React.useState({ A: false, B: false });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState<{ [key: string]: boolean }>({});

  const [searchQuery, setSearchQuery] = React.useState('');

  const [routeA, setRouteA] = React.useState<RouteInfo | null>(null);
  const [routeB, setRouteB] = React.useState<RouteInfo | null>(null);
  const [unassignedStops, setUnassignedStops] = React.useState<PlaceValue[]>([]);
  const [routeNames, setRouteNames] = React.useState({ A: 'Rota 1', B: 'Rota 2' });
  const [assignedDrivers, setAssignedDrivers] = React.useState<{ A: string | null, B: string | null }>({ A: null, B: null });
  const [availableDrivers, setAvailableDrivers] = React.useState<Driver[]>([]);
  // Firestore IDs para rotas A e B (quando salvas como draft no contexto de serviço)
  const [serviceRouteIds, setServiceRouteIds] = React.useState<{ A: string | null, B: string | null }>({ A: null, B: null });
  const [highlightedStops, setHighlightedStops] = React.useState<string[]>([]);
  const [showTimePreferenceMarkers, setShowTimePreferenceMarkers] = React.useState(false); // Toggle para mostrar pedidos com horário
  const [driverLocation, setDriverLocation] = React.useState<{lat: number; lng: number; heading?: number} | null>(null);
  const [driverLocations, setDriverLocations] = React.useState<DriverLocationWithInfo[]>([]);

  // Debug logs system
  const [debugLogs, setDebugLogs] = React.useState<Array<{ timestamp: string; type: string; message: string; data?: any }>>([]);
  const consoleCaptureRef = React.useRef<Array<{ timestamp: string; type: string; args: any[] }>>([]);

  // Intercept console logs - using ref to avoid re-renders
  React.useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = function(...args) {
      try {
        consoleCaptureRef.current = [...consoleCaptureRef.current.slice(-199), {
          timestamp: new Date().toISOString(),
          type: 'log',
          args: args.map(arg => {
            try {
              return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            } catch (e) {
              return '[Circular or Non-Serializable]';
            }
          })
        }];
      } catch (e) {
        // Ignore errors in logging
      }
      originalLog.apply(console, args);
    };

    console.error = function(...args) {
      try {
        consoleCaptureRef.current = [...consoleCaptureRef.current.slice(-199), {
          timestamp: new Date().toISOString(),
          type: 'error',
          args: args.map(arg => {
            try {
              return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            } catch (e) {
              return '[Circular or Non-Serializable]';
            }
          })
        }];
      } catch (e) {
        // Ignore errors in logging
      }
      originalError.apply(console, args);
    };

    console.warn = function(...args) {
      try {
        consoleCaptureRef.current = [...consoleCaptureRef.current.slice(-199), {
          timestamp: new Date().toISOString(),
          type: 'warn',
          args: args.map(arg => {
            try {
              return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            } catch (e) {
              return '[Circular or Non-Serializable]';
            }
          })
        }];
      } catch (e) {
        // Ignore errors in logging
      }
      originalWarn.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const addDebugLog = React.useCallback((type: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message, data };
    setDebugLogs(prev => [...prev.slice(-199), logEntry]); // Keep last 200 logs
  }, []);

  // Log when page loads
  React.useEffect(() => {
    addDebugLog('PAGE_LOAD', 'Page loaded - routes organize acompanhar', {
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: new Date().toISOString()
    });
  }, [addDebugLog]);

  const exportDebugLogs = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `rotaexata-debug-${timestamp}.json`;

    const exportData = {
      timestamp: new Date().toISOString(),
      dragDropLogs: debugLogs,
      consoleLogs: consoleCaptureRef.current,
      state: {
        routeAStopsCount: routeA?.stops.length || 0,
        routeBStopsCount: routeB?.stops.length || 0,
        dynamicRoutesCount: dynamicRoutes.length,
        additionalRoutesCount: additionalRoutes.length,
        unassignedStopsCount: unassignedStops.length,
        pendingEditsKeys: Object.keys(pendingEdits),
        pendingEditsCounts: Object.entries(pendingEdits).map(([key, stops]) => ({
          route: key,
          stopsCount: stops?.length || 0
        })),
        routeAStops: routeA?.stops.map(s => ({
          id: s.id || s.placeId,
          customerName: s.customerName,
          address: s.address
        })) || [],
        routeBStops: routeB?.stops.map(s => ({
          id: s.id || s.placeId,
          customerName: s.customerName,
          address: s.address
        })) || [],
        additionalRoutesDetails: additionalRoutes.map(r => ({
          id: r.id,
          name: r.name,
          stopsCount: r.data.stops.length,
          stops: r.data.stops.map(s => ({
            id: s.id || s.placeId,
            customerName: s.customerName,
            address: s.address
          }))
        }))
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Logs Exportados',
      description: `Arquivo ${filename} baixado com sucesso.`,
    });

    addDebugLog('EXPORT', 'Debug logs exported', { filename, logsCount: debugLogs.length });
  };

  // State for additional routes from same period
  const [additionalRoutes, setAdditionalRoutes] = React.useState<Array<{ id: string; name: string; data: RouteInfo; driverId?: string; driverInfo?: any; plannedDate?: Date }>>([]);
  const [routeVisibility, setRouteVisibility] = React.useState<Record<string, boolean>>({});

  // State for dynamic routes (C, D, E, etc.)
  // firestoreId is set after the route is saved to Firestore
  const [dynamicRoutes, setDynamicRoutes] = React.useState<Array<{
    key: string;
    name: string;
    data: RouteInfo;
    color: string;
    firestoreId?: string;
  }>>([]);

  // State for pending edits (reordering within same route AND cross-route movements)
  // Now supports dynamic route IDs (A, B, and additional route IDs like "8sS7RrygaWfJYL1cegCN")
  const [pendingEdits, setPendingEdits] = React.useState<Record<string, PlaceValue[] | null>>({ A: null, B: null });
  const [isApplyingEdits, setIsApplyingEdits] = React.useState(false);

  // State for transfer dialog
  const [transferDialogOpen, setTransferDialogOpen] = React.useState(false);
  const [transferData, setTransferData] = React.useState<{
    stop: PlaceValue;
    stopIndex: number;
    sourceRouteId: string;
  } | null>(null);


  // State for Add Service Dialog
  const [isAddServiceDialogOpen, setIsAddServiceDialogOpen] = React.useState(false);
  const [selectedRouteForNewService, setSelectedRouteForNewService] = React.useState<'A' | 'B' | 'unassigned'>('unassigned');
  const [manualService, setManualService] = React.useState({
    customerName: '',
    phone: '',
    orderNumber: '',
    timeWindowStart: '',
    timeWindowEnd: '',
    locationLink: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    notes: '',
  });

  // State for Stop Info Dialog
  const [isStopInfoDialogOpen, setIsStopInfoDialogOpen] = React.useState(false);
  const [selectedStopInfo, setSelectedStopInfo] = React.useState<PlaceValue | null>(null);

  // State for Edit Stop Dialog
  const [isEditStopDialogOpen, setIsEditStopDialogOpen] = React.useState(false);
  const [stopToEdit, setStopToEdit] = React.useState<{ stop: PlaceValue; routeKey: string; index: number } | null>(null);
  const [editService, setEditService] = React.useState({
    customerName: '',
    phone: '',
    orderNumber: '',
    timeWindowStart: '',
    timeWindowEnd: '',
    locationLink: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    notes: '',
    lat: null as number | null,
    lng: null as number | null,
  });
  const [showEditMap, setShowEditMap] = React.useState(false);
  const [editMapType, setEditMapType] = React.useState<'hybrid' | 'roadmap'>('hybrid');

  // Estados para dialog de escolha de atualização de coordenadas
  const [pendingCoordinates, setPendingCoordinates] = React.useState<{lat: number; lng: number} | null>(null);
  const [showCoordinateUpdateDialog, setShowCoordinateUpdateDialog] = React.useState(false);


  const mapApiRef = React.useRef<RouteMapHandle>(null);
  const DRAG_DELAY = 200;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: DRAG_DELAY, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeStop, setActiveStop] = React.useState<PlaceValue | null>(null);
  const [activeRouteKey, setActiveRouteKey] = React.useState<'A' | 'B' | null>(null);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  // Timeline column resize state
  const [timelineWidth, setTimelineWidth] = React.useState(35); // percentage
  const [isResizingTimeline, setIsResizingTimeline] = React.useState(false);
  const startXTimelineRef = React.useRef<number>(0);
  const startWidthTimelineRef = React.useRef<number>(35);

  const handleTimelineResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingTimeline(true);
    startXTimelineRef.current = e.clientX;
    startWidthTimelineRef.current = timelineWidth;
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingTimeline) return;

      const deltaX = e.clientX - startXTimelineRef.current;
      // Assuming a rough table width for calculation
      // Inverted: dragging right should increase width
      const deltaPercentage = (deltaX / window.innerWidth) * 100;
      const newWidth = startWidthTimelineRef.current - deltaPercentage;

      // Limit between 20% and 60%
      if (newWidth >= 20 && newWidth <= 60) {
        setTimelineWidth(newWidth);
      } else if (newWidth < 20) {
        setTimelineWidth(20);
      } else if (newWidth > 60) {
        setTimelineWidth(60);
      }
    };

    const handleMouseUp = () => {
      setIsResizingTimeline(false);
    };

    if (isResizingTimeline) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingTimeline, timelineWidth]);

  React.useEffect(() => {
    // Fetch available drivers from Firestore
    const q = query(collection(db, 'users'), where('role', '==', 'driver'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const driversData: Driver[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        driversData.push({
          id: doc.id,
          name: data.displayName || data.name || 'Motorista sem nome',
          email: data.email,
          phone: data.phone || 'N/A',
          status: data.status || 'offline',
          vehicle: data.vehicle || { type: 'N/A', plate: 'N/A' },
          lastSeenAt: data.lastSeenAt?.toDate() || new Date(0),
          totalDeliveries: data.totalDeliveries || 0,
          rating: data.rating || 0,
          avatarUrl: data.photoURL,
          deviceInfo: data.deviceInfo || undefined,
        })
      });
      setAvailableDrivers(driversData);
    });

    return () => unsubscribe();
  }, []);

  // Buscar localizações dos motoristas em tempo real a partir das rotas ativas
  React.useEffect(() => {
    console.log('🚗 [useEffect:driverLocations] Iniciando... availableDrivers:', availableDrivers.length);

    if (availableDrivers.length === 0) {
      console.warn('⚠️ [useEffect:driverLocations] Listener NÃO iniciado - aguardando motoristas disponíveis');
      return;
    }

    console.log('🚗 [useEffect:driverLocations] Motoristas disponíveis:', availableDrivers.map(d => ({ id: d.id, name: d.name })));

    // Buscar rotas que estão em progresso ou despachadas
    const routesQuery = query(
      collection(db, 'routes'),
      where('status', 'in', ['in_progress', 'dispatched'])
    );

    console.log('🚗 [useEffect:driverLocations] Configurando listener para rotas in_progress/dispatched');

    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      console.log('🚗 [onSnapshot:routes] Rotas encontradas:', snapshot.size);
      const locationsMap = new Map<string, DriverLocationWithInfo>();
      const now = new Date();

      snapshot.forEach((routeDoc) => {
        const routeData = routeDoc.data();
        const hasLocation = !!routeData.currentLocation;
        const driverName = routeData.driverInfo?.name || 'Desconhecido';

        if (!hasLocation) {
          console.warn(`⚠️ [onSnapshot:routes] Rota SEM localização: ${driverName} (routeId: ${routeDoc.id}) - status: ${routeData.status}`);
        } else {
          console.log('🚗 [onSnapshot:routes] Processando rota COM localização:', {
            id: routeDoc.id,
            status: routeData.status,
            driverId: routeData.driverId,
            driverName: driverName,
            lat: routeData.currentLocation.lat,
            lng: routeData.currentLocation.lng,
            timestamp: routeData.currentLocation.timestamp?.toDate?.()?.toISOString(),
          });
        }

        // Verificar se há localização atual, informações do motorista e driverId
        if (routeData.currentLocation && routeData.driverInfo && routeData.driverId) {
          const currentLoc = routeData.currentLocation;

          const timestamp = currentLoc.timestamp?.toDate?.() || new Date(0);
          const minutesAgo = Math.floor((Date.now() - timestamp.getTime()) / 1000 / 60);

          // Filtrar localizações muito antigas (mais de 4 horas para rotas em progresso, 30 min para despachadas)
          const maxMinutes = routeData.status === 'in_progress' ? 240 : 30; // 4 horas ou 30 min
          if (minutesAgo > maxMinutes) {
            console.warn(`⚠️ Localização muito antiga ignorada: ${routeData.driverInfo.name} (${minutesAgo} minutos atrás, limite: ${maxMinutes}min)`);
            return;
          }

          // Log de alerta se a localização estiver desatualizada (> 30 min), mas ainda dentro do limite
          if (minutesAgo > 30) {
            console.warn(`⚠️ Localização desatualizada: ${routeData.driverInfo.name} (${minutesAgo} minutos atrás)`);
          }

          // Buscar deviceInfo do motorista em availableDrivers
          const driverData = availableDrivers.find(d => d.id === routeData.driverId);

          const location: DriverLocationWithInfo = {
            driverId: routeData.driverId, // Usar driverId real, não o ID da rota
            driverName: routeData.driverInfo.name,
            lat: currentLoc.lat,
            lng: currentLoc.lng,
            accuracy: currentLoc.accuracy || 0,
            heading: currentLoc.heading,
            speed: currentLoc.speed,
            timestamp: timestamp,
            deviceInfo: driverData?.deviceInfo,
          };

          // Manter apenas a localização mais recente de cada motorista
          const existing = locationsMap.get(routeData.driverId);
          if (!existing) {
            locationsMap.set(routeData.driverId, location);
          } else {
            const existingTime = existing.timestamp instanceof Date
              ? existing.timestamp
              : existing.timestamp.toDate();
            if (timestamp > existingTime) {
              locationsMap.set(routeData.driverId, location);
            }
          }
        }
      });

      const locations = Array.from(locationsMap.values());
      console.log('🚗 [onSnapshot:routes] Localizações válidas encontradas:', locations.length);
      if (locations.length > 0) {
        console.log('🚗 [onSnapshot:routes] Detalhes das localizações:', locations.map(l => ({
          driverId: l.driverId,
          driverName: l.driverName,
          lat: l.lat,
          lng: l.lng,
        })));
      } else {
        console.warn('⚠️ [onSnapshot:routes] Nenhuma localização válida encontrada nas rotas');
      }
      setDriverLocations(locations);
    });

    return () => unsubscribe();
  }, [availableDrivers]);

  // Helper function to get route period from date
  const getRoutePeriodFromDate = (date: Date): 'Matutino' | 'Vespertino' | 'Noturno' => {
    const hour = date.getHours();
    if (hour >= 8 && hour < 12) return 'Matutino';
    if (hour >= 12 && hour < 19) return 'Vespertino';
    return 'Noturno';
  };

  // Load additional routes from same period (only for existing routes, not new ones)
  React.useEffect(() => {
    if (!routeData?.routeDate) return;
    // Only load additional routes if this is an existing route being edited/monitored
    if (!routeData?.isExistingRoute) return;

    const loadAdditionalRoutes = async () => {
      try {
        const routeDate = new Date(routeData.routeDate);
        const dayStart = Timestamp.fromDate(startOfDay(routeDate));
        const dayEnd = Timestamp.fromDate(endOfDay(routeDate));

        // Período selecionado para filtrar (passado da página de rotas)
        const selectedPeriod = routeData.period;

        const q = query(
          collection(db, 'routes'),
          where('plannedDate', '>=', dayStart),
          where('plannedDate', '<=', dayEnd)
        );

        const querySnapshot = await getDocs(q);
        const routes: Array<{ id: string; name: string; data: RouteInfo; driverId?: string; driverInfo?: any; plannedDate?: Date }> = [];
        const visibility: Record<string, boolean> = {};

        // Array of distinct colors for routes (sistema sequencial de cores)
        const routeColors = [
          '#e60000', // Vermelho - Icone address 1.svg
          '#1fd634', // Verde - Icone address 2.svg
          '#fa9200', // Laranja - Icone address 3.svg
          '#bf07e4', // Roxo - Icone address 4.svg
          '#000000', // Preto - Icone address 5.svg
        ];

        // Get colors already used by main routes (A and B)
        const usedColors = new Set<string>();
        if (routeA?.color) usedColors.add(routeA.color.toLowerCase());
        if (routeB?.color) usedColors.add(routeB.color.toLowerCase());

        let colorIndex = 0;
        querySnapshot.forEach((doc) => {
          // Skip the current route (the one being viewed)
          if (routeData.currentRouteId && doc.id === routeData.currentRouteId) {
            return;
          }

          const routeDoc = doc.data();

          // Skip completed or finished routes
          if (routeDoc.status === 'completed' || routeDoc.status === 'completed_auto' || routeDoc.status === 'finished') {
            return;
          }

          // Filter by period if specified
          if (selectedPeriod && routeDoc.plannedDate) {
            const routePlannedDate = routeDoc.plannedDate.toDate();
            const routePeriod = getRoutePeriodFromDate(routePlannedDate);
            if (routePeriod !== selectedPeriod) {
              return;
            }
          }

          // Find a color that's not already used by main routes
          let assignedColor = routeDoc.color;
          if (!assignedColor || usedColors.has(assignedColor.toLowerCase())) {
            // Find next available color that's not used
            while (usedColors.has(routeColors[colorIndex % routeColors.length].toLowerCase())) {
              colorIndex++;
            }
            assignedColor = routeColors[colorIndex % routeColors.length];
            usedColors.add(assignedColor.toLowerCase());
            colorIndex++;
          }

          const routeInfo: RouteInfo = {
            stops: routeDoc.stops || [],
            encodedPolyline: routeDoc.encodedPolyline || '',
            distanceMeters: routeDoc.distanceMeters || 0,
            duration: routeDoc.duration || '0s',
            color: assignedColor,
            visible: false, // All hidden by default
          };

          routes.push({
            id: doc.id,
            name: routeDoc.name || `Rota ${doc.id.substring(0, 6)}`, // Use real route name from Firestore
            data: routeInfo,
            driverId: routeDoc.driverId,
            driverInfo: routeDoc.driverInfo,
            plannedDate: routeDoc.plannedDate?.toDate(),
          });
          visibility[doc.id] = false; // Hidden by default
        });

        setAdditionalRoutes(routes);
        setRouteVisibility(visibility);
      } catch (error) {
        console.error('Error loading additional routes:', error);
      }
    };

    loadAdditionalRoutes();
  }, [routeData?.routeDate, routeData?.period]);

  // Subscribe to real-time location updates for existing route
  React.useEffect(() => {
    if (!routeData?.isExistingRoute || !routeData?.currentRouteId) {
      setDriverLocation(null);
      // Also remove from driverLocations array
      setDriverLocations(prev => prev.filter(loc => loc.driverId !== 'current-route'));
      return;
    }

    const routeRef = doc(db, 'routes', routeData.currentRouteId);
    const unsubscribe = onSnapshot(routeRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.currentLocation && data.driverInfo && data.driverId) {
          const location = data.currentLocation;
          const timestamp = location.timestamp?.toDate?.() || new Date();

          // Update singular driverLocation (for backward compatibility)
          setDriverLocation({
            lat: location.lat,
            lng: location.lng,
            heading: location.heading,
          });

          // Also add to driverLocations array so it has InfoWindow with refresh button
          const driverLocationWithInfo: DriverLocationWithInfo = {
            driverId: data.driverId,
            driverName: data.driverInfo.name,
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy || 0,
            heading: location.heading,
            speed: location.speed,
            timestamp,
          };

          // Update or add current route's driver to array
          setDriverLocations(prev => {
            const filtered = prev.filter(loc => loc.driverId !== data.driverId);
            return [...filtered, driverLocationWithInfo];
          });
        }
      }
    }, (error) => {
      console.error('Erro ao escutar localização:', error);
    });

    return () => unsubscribe();
  }, [routeData?.isExistingRoute, routeData?.currentRouteId]);

  React.useEffect(() => {
    // ===== NOVA IMPLEMENTAÇÃO: Carregar dados usando serviceId da URL =====
    if (!serviceId) {
      console.error('❌ [useEffect:loadServiceData] serviceId não encontrado na URL');
      router.push('/routes');
      return;
    }

    console.log('📦 [useEffect:loadServiceData] Carregando serviço da URL:', serviceId);

    const loadServiceData = async () => {
      console.log('🚨 DENTRO DE loadServiceData - INÍCIO');
      setIsLoading(true);
      try {
        console.log('🚨 ANTES DE getDoc');
        // Buscar dados do serviço (SEM CACHE - força leitura do servidor)
        const serviceDoc = await getDoc(doc(db, 'services', serviceId), { source: 'server' });
        console.log('🚨 DEPOIS DE getDoc - exists:', serviceDoc.exists());

        if (!serviceDoc.exists()) {
          console.error('❌ [useEffect:loadServiceData] Serviço não encontrado:', serviceId);
          toast({
            title: 'Serviço não encontrado',
            description: 'O serviço solicitado não existe.',
            variant: 'destructive',
          });
          router.push('/routes');
          return;
        }

        const serviceData = serviceDoc.data();
        console.log('✅ [useEffect:loadServiceData] Serviço carregado:', {
          id: serviceId,
          code: serviceData.code,
          allStops: serviceData.allStops?.length || 0,
          originFromFirestore: serviceData.origin ? {
            address: serviceData.origin.address,
            lat: serviceData.origin.lat,
            lng: serviceData.origin.lng,
          } : 'SEM ORIGEM',
        });

        // Definir origem padrão Sol de Maria
        const defaultOrigin: PlaceValue = {
          id: 'default-origin-sol-de-maria',
          address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
          placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
          lat: -16.6786,
          lng: -49.2552,
        };

        // Usar origem do serviço ou origem padrão
        const serviceOrigin = serviceData.origin &&
                              typeof serviceData.origin.lat === 'number' &&
                              typeof serviceData.origin.lng === 'number' &&
                              serviceData.origin.lat !== 0 &&
                              serviceData.origin.lng !== 0
          ? serviceData.origin
          : defaultOrigin;

        console.log('🏢 [loadServiceData] Origem selecionada:', {
          usandoOrigemDoServico: serviceOrigin !== defaultOrigin,
          address: serviceOrigin.address,
          lat: serviceOrigin.lat,
          lng: serviceOrigin.lng,
        });

        // Criar parsedData no formato esperado pelo código existente
        const parsedData: RouteData = {
          origin: serviceOrigin,
          stops: serviceData.allStops || [],
          routeDate: new Date().toISOString(),
          routeTime: 'morning',
          isService: true,
          serviceId: serviceId,
          serviceCode: serviceData.code,
        };
      console.log('📦 [useEffect:loadRouteData] Dados parseados:', {
        isExistingRoute: parsedData.isExistingRoute,
        currentRouteId: parsedData.currentRouteId,
        draftRouteId: parsedData.draftRouteId,
        stopsCount: parsedData.stops?.length || 0,
        hasOrigin: !!parsedData.origin,
        originAddress: parsedData.origin?.address,
        originLat: parsedData.origin?.lat,
        originLng: parsedData.origin?.lng,
        routeDate: parsedData.routeDate,
        period: parsedData.period,
        isService: parsedData.isService,
        serviceId: parsedData.serviceId,
        serviceCode: parsedData.serviceCode,
      });
      console.log('📦 [useEffect:loadRouteData] Origin completo do parsedData:', parsedData.origin);
      setRouteData(parsedData);

      // Se for uma rota existente, buscar dados atualizados do Firestore
      if (parsedData.isExistingRoute && parsedData.currentRouteId) {
        console.log('🔄 [useEffect:loadRouteData] É rota existente! Carregando do Firestore...');
        const loadRouteFromFirestore = async () => {
          setIsLoading(true);
          try {
            const routeRef = doc(db, 'routes', parsedData.currentRouteId!);
            console.log('🔄 [useEffect:loadRouteData] Buscando rota:', parsedData.currentRouteId);
            const routeSnap = await getDoc(routeRef);

            if (routeSnap.exists()) {
              const routeData = routeSnap.data();
              console.log('✅ [useEffect:loadRouteData] Rota carregada do Firestore:', {
                id: routeSnap.id,
                name: routeData.name,
                status: routeData.status,
                stopsCount: routeData.stops?.length || 0,
                hasPolyline: !!routeData.encodedPolyline,
                driverId: routeData.driverId,
                driverName: routeData.driverInfo?.name,
              });

              // Definir nome da rota (prioridade: Firestore > sessionStorage > fallback)
              const routeName = routeData.name || parsedData.routeName || 'Rota 1';
              setRouteNames(prev => ({ ...prev, A: routeName }));

              // Usar dados do Firestore ao invés do sessionStorage
              let allStops = routeData.stops.filter((s: PlaceValue) => s.id && s.lat && s.lng);

              // Auto-cleanup: verificar pedidos desvinculados no Luna e removê-los
              const routeOrderNumbers = allStops
                .map((s: PlaceValue) => s.orderNumber)
                .filter(Boolean) as string[];
              const unassignedOrderNumbers = (routeData.unassignedStops || [])
                .map((s: PlaceValue) => s.orderNumber)
                .filter(Boolean) as string[];
              const allRouteOrderNumbers = [...new Set([...routeOrderNumbers, ...unassignedOrderNumbers])];

              if (allRouteOrderNumbers.length > 0 && routeData.serviceId) {
                try {
                  const unlinkedOrders = new Set<string>();
                  for (let i = 0; i < allRouteOrderNumbers.length; i += 30) {
                    const batch = allRouteOrderNumbers.slice(i, i + 30);
                    const ordersSnap = await getDocs(
                      query(collection(db, 'orders'), where('number', 'in', batch))
                    );
                    for (const orderDoc of ordersSnap.docs) {
                      const orderData = orderDoc.data();
                      if (!orderData.rotaExataServiceId && !orderData.rotaExataRouteId) {
                        if (orderData.number) unlinkedOrders.add(orderData.number);
                      }
                    }
                  }

                  if (unlinkedOrders.size > 0) {
                    console.log(`🧹 [loadRouteData] Pedidos desvinculados detectados:`, Array.from(unlinkedOrders));
                    const origLen = allStops.length;
                    allStops = allStops.filter((s: PlaceValue) => !s.orderNumber || !unlinkedOrders.has(s.orderNumber));
                    const cleanedUnassigned = (routeData.unassignedStops || []).filter(
                      (s: PlaceValue) => !s.orderNumber || !unlinkedOrders.has(s.orderNumber)
                    );

                    if (allStops.length < origLen || cleanedUnassigned.length < (routeData.unassignedStops || []).length) {
                      await updateDoc(doc(db, 'routes', parsedData.currentRouteId!), {
                        stops: allStops,
                        unassignedStops: cleanedUnassigned,
                        updatedAt: serverTimestamp(),
                      });
                      routeData.unassignedStops = cleanedUnassigned;
                      console.log(`✅ [loadRouteData] Removidos ${origLen - allStops.length} stop(s) desvinculado(s) da rota`);
                    }
                  }
                } catch (err) {
                  console.error('❌ [loadRouteData] Erro ao verificar pedidos desvinculados:', err);
                }
              }

              // Atualizar routeData com origem do Firestore (ou usar origem padrão do sistema)
              // Definir origem padrão Sol de Maria
              const defaultOrigin: PlaceValue = {
                id: 'default-origin-sol-de-maria',
                address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
                placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
                lat: -16.6786,
                lng: -49.2552,
              };

              // Log para debug - ver quais origens estão disponíveis
              console.log('🔍 [useEffect:loadRouteData] Verificando origens:', {
                firestoreOrigin: routeData.origin ? { lat: routeData.origin.lat, lng: routeData.origin.lng, address: routeData.origin.address } : null,
                sessionStorageOrigin: parsedData.origin ? { lat: parsedData.origin.lat, lng: parsedData.origin.lng, address: parsedData.origin.address } : null,
                defaultOrigin: { lat: defaultOrigin.lat, lng: defaultOrigin.lng },
              });

              // Verificar se a origem do Firestore é válida (tem coordenadas válidas)
              const isValidOrigin = (o: PlaceValue | undefined | null): boolean => {
                return !!(o && typeof o.lat === 'number' && typeof o.lng === 'number' && o.lat !== 0 && o.lng !== 0);
              };

              let origin: PlaceValue;
              // Para serviços do Lunna, priorizar origem do parsedData (que já tem o default Sol de Maria)
              // Para rotas normais, usar origem do Firestore
              if (parsedData.isService) {
                origin = parsedData.origin; // Já foi validada e tem default Sol de Maria
                console.log('✅ [useEffect:loadRouteData] Serviço: usando origem do parsedData (Sol de Maria se não tiver origem):', origin.address);
              } else if (isValidOrigin(routeData.origin)) {
                origin = routeData.origin;
                console.log('✅ [useEffect:loadRouteData] Rota normal: usando origem do Firestore:', origin.address);
              } else if (isValidOrigin(parsedData.origin)) {
                origin = parsedData.origin;
                console.log('⚠️ [useEffect:loadRouteData] Usando origem do sessionStorage:', origin.address);
              } else {
                origin = defaultOrigin;
                console.log('⚠️ [useEffect:loadRouteData] Origem não encontrada, usando origem padrão Sol de Maria');
              }

              setRouteData(prev => prev ? { ...prev, origin } : prev);
              console.log('🔧 [useEffect:loadRouteData] Origem definida em setRouteData:', {
                address: origin.address,
                lat: origin.lat,
                lng: origin.lng,
              });
              console.log('✅ [useEffect:loadRouteData] Stops válidos após filtro:', allStops.length);

              // Para serviços, se a origem do Firestore for diferente da origem correta (Sol de Maria), atualizar TODAS as rotas
              if (parsedData.isService && routeData.origin &&
                  (routeData.origin.lat !== origin.lat || routeData.origin.lng !== origin.lng)) {
                console.log('🔧 [useEffect:loadRouteData] Corrigindo origem de todas as rotas do serviço para:', origin.address);
                try {
                  // Buscar todas as rotas do serviço
                  const allServiceRoutesQuery = query(
                    collection(db, 'routes'),
                    where('serviceId', '==', parsedData.serviceId)
                  );
                  const allServiceRoutesSnapshot = await getDocs(allServiceRoutesQuery);

                  // Atualizar a origem de todas as rotas
                  const updatePromises = allServiceRoutesSnapshot.docs.map(routeDoc => {
                    return updateDoc(doc(db, 'routes', routeDoc.id), {
                      origin: origin,
                      updatedAt: serverTimestamp(),
                    });
                  });

                  await Promise.all(updatePromises);
                  console.log(`✅ [useEffect:loadRouteData] Origem atualizada em ${allServiceRoutesSnapshot.size} rota(s) do serviço`);
                } catch (updateError) {
                  console.error('❌ Erro ao atualizar origem no Firestore:', updateError);
                }
              }

              // Verificar se precisa recalcular a rota (origem não existia ou polyline vazia)
              const needsRecalculation = !routeData.origin || !routeData.encodedPolyline;

              if (needsRecalculation && origin && allStops.length > 0) {
                console.log('🔄 [useEffect:loadRouteData] Recalculando rota com nova origem...');
                // Recalcular a rota incluindo a origem
                const recalculatedRoute = await computeRoute(origin, allStops);
                if (recalculatedRoute) {
                  console.log('✅ [useEffect:loadRouteData] Rota recalculada com sucesso');
                  setRouteA({
                    stops: allStops,
                    distanceMeters: recalculatedRoute.distanceMeters,
                    duration: recalculatedRoute.duration,
                    encodedPolyline: recalculatedRoute.encodedPolyline,
                    color: routeData.color || parsedData.existingRouteData?.color || '#e60000',
                    visible: true,
                  });
                } else {
                  console.warn('⚠️ [useEffect:loadRouteData] Falha ao recalcular, usando dados existentes');
                  setRouteA({
                    stops: allStops,
                    distanceMeters: routeData.distanceMeters,
                    duration: routeData.duration,
                    encodedPolyline: routeData.encodedPolyline,
                    color: routeData.color || parsedData.existingRouteData?.color || '#e60000',
                    visible: true,
                  });
                }
              } else {
                setRouteA({
                  stops: allStops,
                  distanceMeters: routeData.distanceMeters,
                  duration: routeData.duration,
                  encodedPolyline: routeData.encodedPolyline,
                  color: routeData.color || parsedData.existingRouteData?.color || '#e60000',
                  visible: true,
                });
              }
              setRouteB(null); // Não tem segunda rota

              // Carregar unassignedStops do Firestore (pontos adicionados via Lunna)
              console.log('🔍 [useEffect:loadRouteData] Verificando unassignedStops do Firestore');
              console.log('🔍 [useEffect:loadRouteData] routeData.unassignedStops:', routeData.unassignedStops);
              if (routeData.unassignedStops && routeData.unassignedStops.length > 0) {
                console.log('📦 [useEffect:loadRouteData] Encontrados', routeData.unassignedStops.length, 'unassignedStops no Firestore');
                const validUnassigned = routeData.unassignedStops.filter((s: PlaceValue) => s.id && s.lat && s.lng);
                console.log('✅ [useEffect:loadRouteData] Válidos (com id, lat, lng):', validUnassigned.length);
                // Deduplicar contra stops já atribuídos à rota (por ID e orderNumber)
                const assignedIds = new Set(allStops.map((s: PlaceValue) => String(s.id ?? s.placeId)));
                const assignedOrders = new Set(allStops.map((s: PlaceValue) => s.orderNumber).filter(Boolean));
                const seenOrders = new Set<string>();
                const dedupedUnassigned = validUnassigned.filter((s: PlaceValue) => {
                  const sid = String(s.id ?? s.placeId);
                  if (assignedIds.has(sid)) return false;
                  if (s.orderNumber && assignedOrders.has(s.orderNumber)) return false;
                  // Auto-dedup entre os próprios unassigned
                  if (s.orderNumber && seenOrders.has(s.orderNumber)) return false;
                  if (s.orderNumber) seenOrders.add(s.orderNumber);
                  return true;
                });
                console.log('🎯 [useEffect:loadRouteData] Após deduplicação:', dedupedUnassigned.length);
                console.log('📋 [useEffect:loadRouteData] IDs dos unassigned:', dedupedUnassigned.map(s => s.id));
                setUnassignedStops(dedupedUnassigned);
                console.log('📥 [useEffect:loadRouteData] Carregados unassignedStops do Firestore:', dedupedUnassigned.length, '(de', validUnassigned.length, 'totais)');
              } else {
                console.log('⚠️ [useEffect:loadRouteData] Nenhum unassignedStop no Firestore');
              }
            } else {
              console.error('❌ [useEffect:loadRouteData] Rota não encontrada no Firestore - ID:', parsedData.currentRouteId);
              // Fallback para dados do sessionStorage
              if (parsedData.routeName) {
                setRouteNames(prev => ({ ...prev, A: parsedData.routeName! }));
              }
              const allStops = parsedData.stops.filter((s) => s.id && s.lat && s.lng);
              setRouteA({
                stops: allStops,
                distanceMeters: parsedData.existingRouteData!.distanceMeters,
                duration: parsedData.existingRouteData!.duration,
                encodedPolyline: parsedData.existingRouteData!.encodedPolyline,
                color: parsedData.existingRouteData!.color,
                visible: true,
              });
              setRouteB(null);
            }
          } catch (error) {
            console.error('❌ Erro ao carregar rota do Firestore:', error);
            // Fallback para dados do sessionStorage
            if (parsedData.routeName) {
              setRouteNames(prev => ({ ...prev, A: parsedData.routeName! }));
            }
            const allStops = parsedData.stops.filter((s) => s.id && s.lat && s.lng);
            setRouteA({
              stops: allStops,
              distanceMeters: parsedData.existingRouteData!.distanceMeters,
              duration: parsedData.existingRouteData!.duration,
              encodedPolyline: parsedData.existingRouteData!.encodedPolyline,
              color: parsedData.existingRouteData!.color,
              visible: true,
            });
            setRouteB(null);
          } finally {
            setIsLoading(false);
          }
        };

        loadRouteFromFirestore();
      } else {
        const processNewRoute = async () => {
        console.log('ℹ️ [useEffect:loadRouteData] NÃO é rota existente - processando como rota nova', {
          isService: parsedData.isService,
          serviceId: parsedData.serviceId,
          serviceCode: parsedData.serviceCode,
          totalStops: parsedData.stops?.length || 0,
          originLat: parsedData.origin?.lat,
          originLng: parsedData.origin?.lng,
          existingServiceRoutes: parsedData.existingServiceRoutes?.length || 0,
        });

        // Se é um serviço, SEMPRE buscar rotas atualizadas do Firestore
        // (sessionStorage pode ter dados desatualizados após edições)
        let serviceExistingRoutes = parsedData.existingServiceRoutes;
        if (parsedData.isService && parsedData.serviceId) {
          try {
            const snap = await getDocs(
              query(collection(db, 'routes'), where('serviceId', '==', parsedData.serviceId))
            );
            if (snap.size > 0) {
              console.log('🔍 [useEffect:loadRouteData] Encontradas rotas no Firestore:', snap.size);
              serviceExistingRoutes = snap.docs.map(d => {
                const data = d.data();
                return {
                  id: d.id,
                  code: data.code || '',
                  name: data.name || '',
                  stops: (data.stops || []) as PlaceValue[],
                  distanceMeters: data.distanceMeters || 0,
                  duration: data.duration || '0s',
                  encodedPolyline: data.encodedPolyline || '',
                  color: data.color || '#6366f1',
                  status: data.status || 'draft',
                  driverId: data.driverId,
                  driverInfo: data.driverInfo,
                };
              });

              // Recalcular stops não atribuídos (por ID e orderNumber)
              const assignedStopIds = new Set<string>();
              const assignedOrderNumbers = new Set<string>();
              serviceExistingRoutes.forEach(r => r.stops.forEach(s => {
                const sid = String(s.id ?? s.placeId);
                if (sid) assignedStopIds.add(sid);
                if (s.orderNumber) assignedOrderNumbers.add(s.orderNumber);
              }));

              // Auto-cleanup: verificar pedidos desvinculados no Luna
              if (assignedOrderNumbers.size > 0) {
                try {
                  const orderNums = Array.from(assignedOrderNumbers);
                  const unlinkedOrders = new Set<string>();
                  for (let i = 0; i < orderNums.length; i += 30) {
                    const batchNums = orderNums.slice(i, i + 30);
                    const ordersSnap = await getDocs(
                      query(collection(db, 'orders'), where('number', 'in', batchNums))
                    );
                    for (const oDoc of ordersSnap.docs) {
                      const oData = oDoc.data();
                      if (!oData.rotaExataServiceId && !oData.rotaExataRouteId) {
                        if (oData.number) unlinkedOrders.add(oData.number);
                      }
                    }
                  }

                  if (unlinkedOrders.size > 0) {
                    console.log(`🧹 [loadRouteData:service] Pedidos desvinculados:`, Array.from(unlinkedOrders));
                    for (const sr of serviceExistingRoutes!) {
                      const origLen = sr.stops.length;
                      sr.stops = sr.stops.filter(s => !s.orderNumber || !unlinkedOrders.has(s.orderNumber));
                      if (sr.stops.length < origLen) {
                        await updateDoc(doc(db, 'routes', sr.id), {
                          stops: sr.stops,
                          updatedAt: serverTimestamp(),
                        });
                        console.log(`✅ [loadRouteData:service] Removidos ${origLen - sr.stops.length} stop(s) da rota ${sr.code}`);
                      }
                    }
                    // Atualizar sets
                    unlinkedOrders.forEach(on => assignedOrderNumbers.delete(on));
                  }
                } catch (err) {
                  console.error('❌ [loadRouteData:service] Erro ao verificar desvinculados:', err);
                }
              }

              const serviceDoc = await getDoc(doc(db, 'services', parsedData.serviceId!), { source: 'server' });
              if (serviceDoc.exists()) {
                const svcData = serviceDoc.data();
                let allStops = (svcData.allStops || []) as PlaceValue[];

                // Também remover pedidos desvinculados do allStops do serviço
                const orderNums = allStops.map(s => s.orderNumber).filter(Boolean) as string[];
                if (orderNums.length > 0) {
                  try {
                    const unlinkedSvc = new Set<string>();
                    for (let i = 0; i < orderNums.length; i += 30) {
                      const batchNums = orderNums.slice(i, i + 30);
                      const ordersSnap = await getDocs(
                        query(collection(db, 'orders'), where('number', 'in', batchNums))
                      );
                      for (const oDoc of ordersSnap.docs) {
                        const oData = oDoc.data();
                        if (!oData.rotaExataServiceId && !oData.rotaExataRouteId) {
                          if (oData.number) unlinkedSvc.add(oData.number);
                        }
                      }
                    }
                    if (unlinkedSvc.size > 0) {
                      const origLen = allStops.length;
                      allStops = allStops.filter(s => !s.orderNumber || !unlinkedSvc.has(s.orderNumber));
                      if (allStops.length < origLen) {
                        await updateDoc(doc(db, 'services', parsedData.serviceId!), {
                          allStops,
                          'stats.totalDeliveries': allStops.length,
                          updatedAt: serverTimestamp(),
                        });
                        console.log(`✅ [loadRouteData:service] Removidos ${origLen - allStops.length} stop(s) do serviço`);
                      }
                    }
                  } catch (err) {
                    console.error('❌ [loadRouteData:service] Erro ao limpar allStops:', err);
                  }
                }

                // Filtrar por ID e orderNumber, e auto-deduplicar
                const seenOrders = new Set<string>();
                parsedData.stops = allStops.filter(s => {
                  const sid = String(s.id ?? s.placeId);
                  if (assignedStopIds.has(sid)) return false;
                  if (s.orderNumber && assignedOrderNumbers.has(s.orderNumber)) return false;
                  // Auto-dedup entre os próprios stops
                  if (s.orderNumber && seenOrders.has(s.orderNumber)) return false;
                  if (s.orderNumber) seenOrders.add(s.orderNumber);
                  return true;
                });
                console.log('🔍 [useEffect:loadRouteData] Stops não atribuídos:', parsedData.stops.length);
              }
            }
          } catch (err) {
            console.error('❌ Erro ao buscar rotas existentes do Firestore:', err);
          }
        }

        if (serviceExistingRoutes && serviceExistingRoutes.length > 0) {
          console.log('📦 [useEffect:loadRouteData] Carregando rotas existentes do serviço:', serviceExistingRoutes.length);
          console.log('🏢 [useEffect:loadRouteData] Origem do parsedData:', {
            address: parsedData.origin?.address,
            lat: parsedData.origin?.lat,
            lng: parsedData.origin?.lng,
          });

          const existingRoutes = serviceExistingRoutes;
          const routeColors = ['#e60000', '#1fd634', '#fa9200', '#bf07e4', '#000000'];

          // Primeira rota existente → Route A
          if (existingRoutes[0]) {
            const r = existingRoutes[0];
            setRouteNames(prev => ({ ...prev, A: r.name || r.code || 'Rota A' }));
            setRouteA({
              stops: r.stops,
              distanceMeters: r.distanceMeters,
              duration: r.duration,
              encodedPolyline: r.encodedPolyline,
              color: r.color || routeColors[0],
              visible: true,
              status: r.status as any,
            });
            setServiceRouteIds(prev => ({ ...prev, A: r.id }));
          }

          // Segunda rota existente → Route B
          if (existingRoutes[1]) {
            const r = existingRoutes[1];
            setRouteNames(prev => ({ ...prev, B: r.name || r.code || 'Rota B' }));
            setRouteB({
              stops: r.stops,
              distanceMeters: r.distanceMeters,
              duration: r.duration,
              encodedPolyline: r.encodedPolyline,
              color: r.color || routeColors[1],
              visible: true,
              status: r.status as any,
            });
            setServiceRouteIds(prev => ({ ...prev, B: r.id }));
          } else {
            setRouteB(null);
          }

          // Rotas adicionais (3ª em diante) → Dynamic Routes (C, D, E...)
          if (existingRoutes.length > 2) {
            const extraRoutes = existingRoutes.slice(2).map((r, idx) => {
              const key = String.fromCharCode(67 + idx); // C, D, E...
              return {
                key,
                name: r.name || r.code || `Rota ${key}`,
                data: {
                  stops: r.stops,
                  distanceMeters: r.distanceMeters,
                  duration: r.duration,
                  encodedPolyline: r.encodedPolyline,
                  color: r.color || routeColors[(idx + 2) % routeColors.length],
                  visible: true,
                  status: r.status as any,
                } as RouteInfo,
                color: r.color || routeColors[(idx + 2) % routeColors.length],
                firestoreId: r.id,
              };
            });
            setDynamicRoutes(extraRoutes);
          }

          // Stops não atribuídos → unassignedStops
          // APENAS buscar do Firestore os stops explicitamente marcados como não alocados
          // NÃO incluir stops do allStops do serviço que não estão em rotas (eles ficam "soltos" propositalmente)

          const stopsWithoutCoords = parsedData.stops.filter((s) => s.id && (!s.lat || !s.lng || s.lat === 0 || s.lng === 0));

          // Buscar unassignedStops salvos no Firestore (de qualquer rota do serviço)
          let firestoreUnassigned: PlaceValue[] = [];
          if (serviceExistingRoutes && serviceExistingRoutes.length > 0) {
            try {
              console.log('🔍 [useEffect:loadRouteData] Buscando unassignedStops da primeira rota do serviço');
              const firstRouteDoc = await getDoc(doc(db, 'routes', serviceExistingRoutes[0].id));
              if (firstRouteDoc.exists()) {
                const firstRouteData = firstRouteDoc.data();
                if (firstRouteData.unassignedStops && firstRouteData.unassignedStops.length > 0) {
                  firestoreUnassigned = firstRouteData.unassignedStops.filter((s: PlaceValue) => s.id && s.lat && s.lng);
                  console.log('📦 [useEffect:loadRouteData] unassignedStops do Firestore:', firestoreUnassigned.length);
                }
              }
            } catch (error) {
              console.error('❌ [useEffect:loadRouteData] Erro ao buscar unassignedStops do Firestore:', error);
            }
          }

          // Combinar APENAS stops sem coordenadas + unassigned do Firestore
          // NÃO incluir stops com coordenadas que não estão em rotas (parsedData.stops)
          // Deduplicar por ID
          const allUnassigned = [...stopsWithoutCoords, ...firestoreUnassigned];
          const seenIds = new Set<string>();
          const dedupedUnassigned = allUnassigned.filter(s => {
            const sid = String(s.id ?? s.placeId);
            if (seenIds.has(sid)) return false;
            seenIds.add(sid);
            return true;
          });

          if (dedupedUnassigned.length > 0) {
            setUnassignedStops(dedupedUnassigned);
            console.log('📦 [useEffect:loadRouteData] Stops não atribuídos (total após dedup):', dedupedUnassigned.length);
          }

          // Definir routeData com origem correta (já validada no parsedData)
          setRouteData({
            origin: parsedData.origin,
            stops: [],
            routeDate: parsedData.routeDate,
            routeTime: parsedData.routeTime || 'morning',
            isService: true,
            serviceId: parsedData.serviceId,
            serviceCode: parsedData.serviceCode,
          });
          console.log('✅ [useEffect:loadRouteData] routeData definido com origem:', {
            address: parsedData.origin?.address,
            lat: parsedData.origin?.lat,
            lng: parsedData.origin?.lng,
          });

          setIsLoading(false);
          return;
        }

        // Debug: mostrar primeiros 3 stops antes do filtro
        if (parsedData.stops && parsedData.stops.length > 0) {
          console.log('🔍 [useEffect:loadRouteData] Primeiros 3 stops ANTES do filtro:',
            parsedData.stops.slice(0, 3).map(s => ({
              id: s.id,
              lat: s.lat,
              lng: s.lng,
              address: s.address,
              customerName: s.customerName,
              hasValidationIssues: s.hasValidationIssues,
            }))
          );
        }

        // Rota nova - dividir geograficamente usando origem como referência
        // Para serviços Luna, incluir TODOS os stops (mesmo os sem coordenadas válidas)
        // pois eles podem ser editados manualmente depois
        // Stops sem coordenadas (lat=0, lng=0) serão colocados em unassignedStops
        const stopsWithCoords = parsedData.stops.filter((s) => s.id && s.lat && s.lng && s.lat !== 0 && s.lng !== 0);
        const stopsWithoutCoords = parsedData.stops.filter((s) => s.id && (!s.lat || !s.lng || s.lat === 0 || s.lng === 0));

        console.log('ℹ️ [useEffect:loadRouteData] Stops com coordenadas válidas:', stopsWithCoords.length);
        console.log('ℹ️ [useEffect:loadRouteData] Stops SEM coordenadas (irão para edição):', stopsWithoutCoords.length);

        // Se houver stops sem coordenadas, adicionar aos unassignedStops para edição manual
        if (stopsWithoutCoords.length > 0) {
          console.warn('⚠️ [useEffect:loadRouteData] Stops precisam de geocodificação manual:',
            stopsWithoutCoords.map(s => ({
              id: s.id,
              address: s.address || s.addressString,
              customerName: s.customerName,
            }))
          );
          // Adicionar ao estado unassignedStops para edição manual
          setUnassignedStops(stopsWithoutCoords);
        }

        // Usar apenas stops com coordenadas válidas para dividir em rotas
        const allStops = stopsWithCoords;
        const MAX_STOPS_PER_ROUTE = 25;

        // Se não há stops com coordenadas, mas há stops sem coordenadas
        if (allStops.length === 0 && stopsWithoutCoords.length > 0) {
          console.warn('⚠️ [useEffect:loadRouteData] Nenhum stop tem coordenadas válidas. Todos precisam de edição manual.');
          // Criar uma rota A vazia para que o usuário possa arrastar stops após editar
          setRouteA({
            stops: [],
            distanceMeters: 0,
            duration: '0s',
            encodedPolyline: '',
            color: '#e60000',
            visible: true,
          });
          setIsLoading(false);
          toast({
            title: 'Endereços precisam de correção',
            description: `${stopsWithoutCoords.length} endereço(s) não foram geocodificados. Edite os endereços e arraste-os para a Rota A.`,
            variant: 'destructive',
          });
          return;
        }

        // Dividir paradas em Norte e Sul usando a latitude da origem como linha divisória
        const stopsNorte = allStops.filter(stop => stop.lat >= parsedData.origin.lat);
        const stopsSul = allStops.filter(stop => stop.lat < parsedData.origin.lat);

        // Função para ordenar paradas por proximidade (nearest neighbor)
        const sortByProximity = (stops: PlaceValue[], origin: PlaceValue): PlaceValue[] => {
          if (stops.length === 0) return [];

          const sorted: PlaceValue[] = [];
          const remaining = [...stops];
          let current = origin;

          while (remaining.length > 0) {
            // Encontrar a parada mais próxima da posição atual
            let nearestIndex = 0;
            let minDistance = getDistance(current, remaining[0]);

            for (let i = 1; i < remaining.length; i++) {
              const distance = getDistance(current, remaining[i]);
              if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = i;
              }
            }

            // Adicionar a parada mais próxima ao resultado
            const nearest = remaining.splice(nearestIndex, 1)[0];
            sorted.push(nearest);
            current = nearest;
          }

          return sorted;
        };

        // Ordenar cada região por proximidade
        const stopsNorteOrdenadas = sortByProximity(stopsNorte, parsedData.origin);
        const stopsSulOrdenadas = sortByProximity(stopsSul, parsedData.origin);

        // Verificar se alguma região excede o limite
        let stopsA: PlaceValue[] = [];
        let stopsB: PlaceValue[] = [];

        if (stopsNorteOrdenadas.length <= MAX_STOPS_PER_ROUTE && stopsSulOrdenadas.length <= MAX_STOPS_PER_ROUTE) {
          // Divisão perfeita - Norte na Rota A, Sul na Rota B
          stopsA = stopsNorteOrdenadas;
          stopsB = stopsSulOrdenadas;
        } else {
          // Alguma região excede o limite - precisamos redistribuir
          console.warn(`⚠️ Região excede limite: Norte=${stopsNorteOrdenadas.length}, Sul=${stopsSulOrdenadas.length}`);

          if (stopsNorteOrdenadas.length > MAX_STOPS_PER_ROUTE) {
            // Norte tem muitas paradas - dividir
            const excess = stopsNorteOrdenadas.length - MAX_STOPS_PER_ROUTE;
            stopsA = stopsNorteOrdenadas.slice(0, MAX_STOPS_PER_ROUTE);

            // Mover excesso para Rota B se houver espaço
            const excessStops = stopsNorteOrdenadas.slice(MAX_STOPS_PER_ROUTE);
            const availableInB = MAX_STOPS_PER_ROUTE - stopsSulOrdenadas.length;

            if (availableInB > 0) {
              stopsB = [...stopsSulOrdenadas, ...excessStops.slice(0, availableInB)];
              const remaining = excessStops.slice(availableInB);
              if (remaining.length > 0) {
                console.error(`❌ ${remaining.length} paradas do Norte não puderam ser atribuídas`);
              }
            } else {
              stopsB = stopsSulOrdenadas;
              console.error(`❌ ${excess} paradas do Norte não puderam ser atribuídas`);
            }
          } else if (stopsSulOrdenadas.length > MAX_STOPS_PER_ROUTE) {
            // Sul tem muitas paradas - dividir
            const excess = stopsSulOrdenadas.length - MAX_STOPS_PER_ROUTE;
            stopsB = stopsSulOrdenadas.slice(0, MAX_STOPS_PER_ROUTE);

            // Mover excesso para Rota A se houver espaço
            const excessStops = stopsSulOrdenadas.slice(MAX_STOPS_PER_ROUTE);
            const availableInA = MAX_STOPS_PER_ROUTE - stopsNorteOrdenadas.length;

            if (availableInA > 0) {
              stopsA = [...stopsNorteOrdenadas, ...excessStops.slice(0, availableInA)];
              const remaining = excessStops.slice(availableInA);
              if (remaining.length > 0) {
                console.error(`❌ ${remaining.length} paradas do Sul não puderam ser atribuídas`);
              }
            } else {
              stopsA = stopsNorteOrdenadas;
              console.error(`❌ ${excess} paradas do Sul não puderam ser atribuídas`);
            }
          }
        }

        // Avisar se alguma parada não foi atribuída
        const totalAssigned = stopsA.length + stopsB.length;
        if (totalAssigned < allStops.length) {
          const unassigned = allStops.length - totalAssigned;
          toast({
            title: "Limite excedido",
            description: `${unassigned} paradas não puderam ser atribuídas. Máximo: ${MAX_STOPS_PER_ROUTE * 2} paradas totais.`,
            variant: "destructive",
          });
        }

        const calculateRoutes = async () => {
          setIsLoading(true);
          const [computedRouteA, computedRouteB] = await Promise.all([
            stopsA.length > 0
              ? computeRoute(parsedData.origin, stopsA)
              : Promise.resolve(null),
            stopsB.length > 0
              ? computeRoute(parsedData.origin, stopsB)
              : Promise.resolve(null),
          ]);
          if (computedRouteA) {
            setRouteA({ ...computedRouteA, color: '#e60000', visible: true });
          }
          if (computedRouteB) {
            setRouteB({ ...computedRouteB, color: '#1fd634', visible: true });
          }

          // Para serviços: salvar rotas como draft no Firestore imediatamente
          // Verificar primeiro se já existem rotas para evitar duplicatas (React StrictMode)
          if (parsedData.isService && parsedData.serviceId) {
            try {
              // Checar se já existem rotas para este serviço
              const existingCheck = await getDocs(
                query(collection(db, 'routes'), where('serviceId', '==', parsedData.serviceId))
              );

              if (existingCheck.size > 0) {
                console.log('⚠️ [calculateRoutes] Rotas já existem para este serviço, não criar duplicatas:', existingCheck.size);
                // Usar IDs existentes
                const existingDocs = existingCheck.docs;
                const savedIds: { A: string | null; B: string | null } = { A: null, B: null };
                if (existingDocs[0]) savedIds.A = existingDocs[0].id;
                if (existingDocs[1]) savedIds.B = existingDocs[1].id;
                setServiceRouteIds(savedIds);
              } else {
                const routeDate = new Date(parsedData.routeDate);
                const savedIds: { A: string | null; B: string | null } = { A: null, B: null };

                if (computedRouteA && stopsA.length > 0) {
                  const routeADoc = await addDoc(collection(db, 'routes'), {
                    name: 'Rota 1',
                    origin: parsedData.origin,
                    stops: stopsA,
                    encodedPolyline: computedRouteA.encodedPolyline || '',
                    distanceMeters: computedRouteA.distanceMeters || 0,
                    duration: computedRouteA.duration || '0s',
                    color: '#e60000',
                    status: 'draft',
                    serviceId: parsedData.serviceId,
                    serviceCode: parsedData.serviceCode,
                    source: 'lunna',
                    plannedDate: Timestamp.fromDate(routeDate),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  savedIds.A = routeADoc.id;
                  console.log('💾 [calculateRoutes] Rota A salva no Firestore:', routeADoc.id);
                }

                if (computedRouteB && stopsB.length > 0) {
                  const routeBDoc = await addDoc(collection(db, 'routes'), {
                    name: 'Rota 2',
                    origin: parsedData.origin,
                    stops: stopsB,
                    encodedPolyline: computedRouteB.encodedPolyline || '',
                    distanceMeters: computedRouteB.distanceMeters || 0,
                    duration: computedRouteB.duration || '0s',
                    color: '#1fd634',
                    status: 'draft',
                    serviceId: parsedData.serviceId,
                    serviceCode: parsedData.serviceCode,
                    source: 'lunna',
                    plannedDate: Timestamp.fromDate(routeDate),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  savedIds.B = routeBDoc.id;
                  console.log('💾 [calculateRoutes] Rota B salva no Firestore:', routeBDoc.id);
                }

                setServiceRouteIds(savedIds);

                // Atualizar o serviço com os IDs das rotas
                const routeIdsToAdd = [savedIds.A, savedIds.B].filter(Boolean) as string[];
                if (routeIdsToAdd.length > 0) {
                  const serviceRef = doc(db, 'services', parsedData.serviceId);
                  await updateDoc(serviceRef, {
                    routeIds: arrayUnion(...routeIdsToAdd),
                    'stats.totalRoutes': routeIdsToAdd.length,
                    updatedAt: serverTimestamp(),
                  });
                  console.log('💾 [calculateRoutes] Serviço atualizado com rotas:', routeIdsToAdd);
                }
              }
            } catch (err) {
              console.error('❌ Erro ao salvar rotas do serviço:', err);
            }
          }

          setIsLoading(false);
        };

        calculateRoutes();
        }; // end processNewRoute

        processNewRoute();
      }
      console.log('🚨 FINAL DE loadServiceData - SUCESSO');
    } catch (error) {
      console.log('🚨 ERRO CAPTURADO:', error);
      console.error('❌ [useEffect:loadServiceData] Erro ao carregar serviço:', error);
      setIsLoading(false);
      toast({
        title: 'Erro ao carregar serviço',
        description: 'Ocorreu um erro ao carregar os dados do serviço.',
        variant: 'destructive',
      });
    }
    };

    loadServiceData();
  }, [serviceId, router, toast]);

  // Real-time listener: sincronizar nomes das rotas A e B
  React.useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    // Listener para Rota A
    if (serviceRouteIds.A) {
      console.log('👂 [useEffect:routeNameSync] Iniciando listener para nome da Rota A:', serviceRouteIds.A);
      const unsubA = onSnapshot(doc(db, 'routes', serviceRouteIds.A), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const newName = data.name || data.code || 'Rota A';

          setRouteNames(prev => {
            if (prev.A !== newName) {
              console.log('🔄 [routeNameSync] Nome da Rota A atualizado:', { old: prev.A, new: newName });
              return { ...prev, A: newName };
            }
            return prev;
          });
        }
      });
      unsubscribes.push(unsubA);
    }

    // Listener para Rota B
    if (serviceRouteIds.B) {
      console.log('👂 [useEffect:routeNameSync] Iniciando listener para nome da Rota B:', serviceRouteIds.B);
      const unsubB = onSnapshot(doc(db, 'routes', serviceRouteIds.B), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const newName = data.name || data.code || 'Rota B';

          setRouteNames(prev => {
            if (prev.B !== newName) {
              console.log('🔄 [routeNameSync] Nome da Rota B atualizado:', { old: prev.B, new: newName });
              return { ...prev, B: newName };
            }
            return prev;
          });
        }
      });
      unsubscribes.push(unsubB);
    }

    return () => {
      console.log('👋 [useEffect:routeNameSync] Parando listeners para nomes das rotas');
      unsubscribes.forEach(unsub => unsub());
    };
  }, [serviceRouteIds.A, serviceRouteIds.B]);

  // Real-time listener: detectar mudanças nas rotas do serviço (Luna adicionando/removendo stops)
  React.useEffect(() => {
    if (!routeData?.isService || !routeData?.serviceId) return;

    const serviceId = routeData.serviceId;
    console.log('👂 [useEffect:serviceListener] Iniciando listener para serviço:', serviceId);

    const routesQuery = query(
      collection(db, 'routes'),
      where('serviceId', '==', serviceId)
    );

    // Guardar referência para saber os IDs que já conhecemos
    let isFirstSnapshot = true;

    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      // Ignorar o snapshot inicial (já temos os dados carregados)
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        return;
      }

      console.log('👂 [serviceListener] Mudança detectada nas rotas do serviço');

      // Coletar todos os orderNumbers já atribuídos a rotas (de TODAS as rotas no snapshot)
      const allAssignedOrderNumbers = new Set<string>();
      snapshot.docs.forEach((routeDoc) => {
        const routeStops = (routeDoc.data().stops || []) as PlaceValue[];
        routeStops.forEach(s => {
          if (s.orderNumber) allAssignedOrderNumbers.add(s.orderNumber);
        });
      });

      // Verificar cada rota modificada
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const routeDoc = change.doc;
          const data = routeDoc.data();
          const routeCode = data.code || routeDoc.id;
          const firestoreStops = (data.stops || []) as PlaceValue[];

          // Detectar novos stops adicionados diretamente ao array stops (Luna com existingRouteId)
          // Mapear Firestore ID → routeKey para atualizar o state correto
          let routeKey: string | null = null;
          if (serviceRouteIds.A === routeDoc.id) routeKey = 'A';
          else if (serviceRouteIds.B === routeDoc.id) routeKey = 'B';
          else {
            const dynRoute = dynamicRoutes.find(r => r.firestoreId === routeDoc.id);
            if (dynRoute) routeKey = dynRoute.key;
          }

          if (routeKey) {
            const currentRoute = getRoute(routeKey);
            const currentStopsCount = currentRoute?.stops?.length || 0;

            if (firestoreStops.length > currentStopsCount) {
              const newCount = firestoreStops.length - currentStopsCount;
              console.log('👂 [serviceListener] Novos stops detectados na rota', routeCode, ':', newCount, 'novo(s)');

              // Atualizar o state local da rota com os stops do Firestore
              setRoute(routeKey, prev => prev ? {
                ...prev,
                stops: firestoreStops,
                encodedPolyline: data.encodedPolyline || prev.encodedPolyline,
                distanceMeters: data.distanceMeters || prev.distanceMeters,
                duration: data.duration || prev.duration,
              } : null);

              setTimeout(() => {
                toast({
                  title: 'Novos pedidos na rota!',
                  description: `${newCount} novo(s) pedido(s) adicionado(s) à ${routeCode} via Luna.`,
                });
              }, 0);
            }
          }

          // Verificar se unassignedStops mudou (Luna adicionou novos stops)
          const newUnassigned = (data.unassignedStops || []) as PlaceValue[];
          if (newUnassigned.length > 0) {
            console.log('👂 [serviceListener] Novos stops não atribuídos detectados na rota', routeCode, ':', newUnassigned.length);

            // Adicionar ao estado sem duplicar - verificar contra stops já atribuídos E unassigned existentes
            setUnassignedStops(prev => {
              const existingIds = new Set(prev.map(s => String(s.id ?? s.placeId)));
              const existingOrders = new Set(prev.map(s => s.orderNumber).filter(Boolean));
              const trulyNew = newUnassigned.filter(s => {
                const sid = String(s.id ?? s.placeId);
                if (existingIds.has(sid)) return false;
                if (s.orderNumber && existingOrders.has(s.orderNumber)) return false;
                // Também verificar se o orderNumber já está atribuído a uma rota
                if (s.orderNumber && allAssignedOrderNumbers.has(s.orderNumber)) return false;
                return true;
              });

              if (trulyNew.length > 0) {
                // Toast fora do setState para evitar "Cannot update component while rendering"
                setTimeout(() => {
                  toast({
                    title: 'Novos pedidos recebidos!',
                    description: `${trulyNew.length} novo(s) pedido(s) adicionado(s) via Luna. Arraste-os para uma rota.`,
                  });
                }, 0);
                return [...prev, ...trulyNew];
              }
              return prev;
            });
          }
        }
      });
    }, (error) => {
      console.error('❌ [serviceListener] Erro no listener:', error);
    });

    return () => {
      console.log('👂 [serviceListener] Limpando listener do serviço');
      unsubscribe();
    };
  }, [routeData?.isService, routeData?.serviceId]);

  // Real-time listener: detectar mudanças no serviço (novos stops adicionados ao allStops)
  React.useEffect(() => {
    if (!routeData?.isService || !routeData?.serviceId) return;

    const serviceId = routeData.serviceId;
    const serviceRef = doc(db, 'services', serviceId);

    let previousAllStopsCount: number | null = null;

    const unsubscribe = onSnapshot(serviceRef, async (docSnap) => {
      if (!docSnap.exists()) return;

      const data = docSnap.data();
      const currentAllStops = (data.allStops || []) as PlaceValue[];

      // Na primeira vez, apenas registrar a contagem
      if (previousAllStopsCount === null) {
        previousAllStopsCount = currentAllStops.length;
        return;
      }

      // Detectar se novos stops foram adicionados ao serviço
      if (currentAllStops.length > previousAllStopsCount) {
        const newCount = currentAllStops.length - previousAllStopsCount;
        console.log('👂 [serviceDocListener] Novos stops detectados no serviço:', newCount);

        // Buscar stops atribuídos a rotas existentes do Firestore (IDs e orderNumbers)
        const routeStopIds = new Set<string>();
        const routeStopOrders = new Set<string>();
        try {
          const routesSnap = await getDocs(query(collection(db, 'routes'), where('serviceId', '==', serviceId)));
          routesSnap.forEach(rd => {
            const stops = (rd.data().stops || []) as PlaceValue[];
            stops.forEach(s => {
              routeStopIds.add(String(s.id ?? s.placeId));
              if (s.orderNumber) routeStopOrders.add(s.orderNumber);
            });
          });
        } catch (err) {
          console.error('❌ [serviceDocListener] Erro ao buscar rotas:', err);
        }

        setUnassignedStops(prev => {
          const existingIds = new Set([
            ...prev.map(s => String(s.id ?? s.placeId)),
            ...Array.from(routeStopIds),
          ]);
          const existingOrders = new Set([
            ...prev.map(s => s.orderNumber).filter(Boolean),
            ...Array.from(routeStopOrders),
          ]);

          const trulyNew = currentAllStops.filter(s => {
            const sid = String(s.id ?? s.placeId);
            if (existingIds.has(sid)) return false;
            if (s.orderNumber && existingOrders.has(s.orderNumber)) return false;
            return true;
          });

          if (trulyNew.length > 0) {
            setTimeout(() => {
              toast({
                title: 'Novos pedidos no serviço!',
                description: `${trulyNew.length} novo(s) pedido(s) adicionado(s) ao serviço via Luna. Arraste-os para uma rota.`,
              });
            }, 0);
            return [...prev, ...trulyNew];
          }
          return prev;
        });
      }

      previousAllStopsCount = currentAllStops.length;
    }, (error) => {
      console.error('❌ [serviceDocListener] Erro no listener:', error);
    });

    return () => unsubscribe();
  }, [routeData?.isService, routeData?.serviceId]);

  const geocodeAddress = React.useCallback(
    (address: string): Promise<PlaceValue | null> => {
      return new Promise((resolve) => {
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
          resolve(null);
        }
      });
    },
    []
  );

  const reverseGeocode = React.useCallback(
    (lat: number, lng: number): Promise<Partial<typeof manualService> | null> => {
      return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const place = results[0];
            const address: Partial<typeof manualService> = {};

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

  // Search functionality - highlight matching stops
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setHighlightedStops([]);
      return;
    }

    const normalizedQuery = searchQuery.toLowerCase().trim();
    const matchingStopIds: string[] = [];

    const checkStop = (stop: PlaceValue) => {
      const fields = [
        stop.customerName,
        stop.address,
        stop.phone,
        stop.orderNumber,
        stop.notes,
        stop.complemento,
      ];

      return fields.some(field => field && field.toLowerCase().includes(normalizedQuery));
    };

    // Check Route A
    if (routeA?.stops) {
      routeA.stops.forEach(stop => {
        if (checkStop(stop)) {
          matchingStopIds.push(stop.id);
        }
      });
    }

    // Check Route B
    if (routeB?.stops) {
      routeB.stops.forEach(stop => {
        if (checkStop(stop)) {
          matchingStopIds.push(stop.id);
        }
      });
    }

    // Check unassigned stops
    unassignedStops.forEach(stop => {
      if (checkStop(stop)) {
        matchingStopIds.push(stop.id);
      }
    });

    setHighlightedStops(matchingStopIds);
  }, [searchQuery, routeA, routeB, unassignedStops]);

  const handleManualServiceChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setManualService(prev => ({...prev, [id]: value}));

    if (id === 'locationLink') {
      handleLocationLinkPaste(value);
    }
  };

  const handleEditServiceChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setEditService(prev => ({...prev, [id]: value}));

    if (id === 'locationLink') {
      handleEditLocationLinkPaste(value);
    }
  };

  const handleEditLocationLinkPaste = async (url: string) => {
    const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) return;

    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);

    // Armazenar coordenadas e mostrar diálogo de escolha
    setPendingCoordinates({ lat, lng });
    setShowCoordinateUpdateDialog(true);
  };

  const handleUpdateCoordinatesOnly = () => {
    if (!pendingCoordinates) return;

    setEditService(prev => ({
      ...prev,
      lat: pendingCoordinates.lat,
      lng: pendingCoordinates.lng,
    }));
    setShowEditMap(true);
    setShowCoordinateUpdateDialog(false);
    setPendingCoordinates(null);
    toast({
      title: "Coordenadas atualizadas!",
      description: "Apenas a posição do alfinete foi atualizada. O endereço permanece o mesmo."
    });
  };

  const handleUpdateFullAddress = async () => {
    if (!pendingCoordinates) return;

    const { lat, lng } = pendingCoordinates;

    toast({ title: "Analisando link...", description: "Buscando endereço a partir das coordenadas." });

    const addressDetails = await reverseGeocode(lat, lng);
    if (addressDetails) {
      setEditService(prev => ({
        ...prev,
        ...addressDetails,
        lat,
        lng,
      }));
      setShowEditMap(true);
      setShowCoordinateUpdateDialog(false);
      setPendingCoordinates(null);
      toast({
        title: "Endereço atualizado!",
        description: "Os campos foram preenchidos automaticamente. Você pode ajustar a posição do alfinete no mapa."
      });
    } else {
      toast({
        variant: 'destructive',
        title: "Falha na busca",
        description: "Não foi possível encontrar o endereço para este link."
      });
      setShowCoordinateUpdateDialog(false);
      setPendingCoordinates(null);
    }
  };

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
  };

  const handleSearchCepForEdit = async () => {
    const cep = editService.cep.replace(/\D/g, '');
    if (cep.length !== 8) {
      toast({ variant: 'destructive', title: "CEP inválido", description: "Digite um CEP válido com 8 dígitos." });
      return;
    }

    toast({ title: "Buscando CEP...", description: "Procurando informações do endereço." });

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast({ variant: 'destructive', title: "CEP não encontrado", description: "Não foi possível encontrar o endereço para este CEP." });
        return;
      }

      // Atualiza os campos com os dados do CEP
      const newRua = data.logradouro || editService.rua;
      const newBairro = data.bairro || editService.bairro;
      const newCidade = data.localidade || editService.cidade;
      const newCep = data.cep || editService.cep;

      setEditService(prev => ({
        ...prev,
        rua: newRua,
        bairro: newBairro,
        cidade: newCidade,
        cep: newCep,
      }));

      toast({ title: "Endereço encontrado!", description: "Os campos foram preenchidos. Clique em 'Salvar Alterações' para atualizar o mapa." });
    } catch (error) {
      console.error('Error fetching CEP:', error);
      toast({ variant: 'destructive', title: "Erro na busca", description: "Ocorreu um erro ao buscar o CEP." });
    }
  };

  const handleSearchCepForManual = async () => {
    const cep = manualService.cep.replace(/\D/g, '');
    if (cep.length !== 8) {
      toast({ variant: 'destructive', title: "CEP inválido", description: "Digite um CEP válido com 8 dígitos." });
      return;
    }

    toast({ title: "Buscando CEP...", description: "Procurando informações do endereço." });

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast({ variant: 'destructive', title: "CEP não encontrado", description: "Não foi possível encontrar o endereço para este CEP." });
        return;
      }

      setManualService(prev => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        cep: data.cep || prev.cep,
      }));

      toast({ title: "Endereço encontrado!", description: "Os campos foram preenchidos automaticamente." });
    } catch (error) {
      console.error('Error fetching CEP:', error);
      toast({ variant: 'destructive', title: "Erro na busca", description: "Ocorreu um erro ao buscar o CEP." });
    }
  };

  const handleSaveEditedService = async () => {
    if (!stopToEdit) return;

    const { rua, numero, bairro, cidade, cep, lat, lng } = editService;
    if (!rua || !bairro || !cidade) {
      toast({
        variant: 'destructive',
        title: 'Campos Obrigatórios',
        description: 'Rua, bairro e cidade são obrigatórios para geocodificar o endereço.',
      });
      return;
    }

    let geocoded;

    // Se temos lat/lng do mapa ajustado, usar essas coordenadas
    if (lat && lng) {
      const addressString = numero
        ? `${rua}, ${numero}, ${bairro}, ${cidade}, ${cep}, Brasil`
        : `${rua}, ${bairro}, ${cidade}, ${cep}, Brasil`;
      geocoded = {
        lat,
        lng,
        address: addressString,
        placeId: stopToEdit.stop.placeId || `manual-${Date.now()}`,
      };
    } else {
      // Caso contrário, geocodificar o endereço
      const addressString = numero
        ? `${rua}, ${numero}, ${bairro}, ${cidade}, ${cep}, Brasil`
        : `${rua}, ${bairro}, ${cidade}, ${cep}, Brasil`;
      geocoded = await geocodeAddress(addressString);
    }

    if (geocoded) {
      const updatedStop: PlaceValue = {
        ...geocoded,
        id: stopToEdit.stop.id,
        address: geocoded.address,
        customerName: editService.customerName,
        phone: editService.phone,
        orderNumber: editService.orderNumber,
        timeWindowStart: editService.timeWindowStart,
        timeWindowEnd: editService.timeWindowEnd,
        complemento: editService.complemento,
        notes: editService.notes,
      };

      // Update the stop in the appropriate route or unassigned list
      if (stopToEdit.routeKey === 'unassigned') {
        const updatedStops = [...unassignedStops];
        updatedStops[stopToEdit.index] = updatedStop;
        setUnassignedStops(updatedStops);

        // Persistir no sessionStorage para que sobreviva a recarregamentos
        if (routeData?.isService) {
          try {
            const storedData = sessionStorage.getItem('newRouteData');
            if (storedData) {
              const parsed = JSON.parse(storedData);
              // Atualizar o stop nos dados do sessionStorage
              const stopIndex = parsed.stops.findIndex((s: PlaceValue) =>
                String(s.id ?? s.placeId) === String(updatedStop.id ?? updatedStop.placeId)
              );
              if (stopIndex !== -1) {
                parsed.stops[stopIndex] = updatedStop;
                sessionStorage.setItem('newRouteData', JSON.stringify(parsed));
                console.log('💾 [handleSaveEditedService] sessionStorage atualizado com stop geocodificado');
              }
            }
          } catch (e) {
            console.error('Erro ao atualizar sessionStorage:', e);
          }
        }

        toast({ title: 'Serviço Atualizado!', description: 'As informações do serviço foram atualizadas.' });
      } else {
        // Para stops em uma rota, precisa do routeData
        if (!routeData) {
          toast({ variant: 'destructive', title: 'Erro', description: 'Dados da rota não encontrados.' });
          return;
        }

        const targetRoute = getRoute(stopToEdit.routeKey);
        if (!targetRoute) return;

        const updatedStops = [...targetRoute.stops];
        updatedStops[stopToEdit.index] = updatedStop;

        // Recalculate route
        const newRouteInfo = await computeRoute(routeData.origin, updatedStops);
        if (newRouteInfo) {
          setRoute(stopToEdit.routeKey, prev => prev ? {
            ...prev,
            ...newRouteInfo,
            stops: updatedStops,
            color: targetRoute.color,
            visible: targetRoute.visible
          } : null);

          // If this is an existing route, update Firestore so driver app receives the update
          if (routeData.isExistingRoute && routeData.currentRouteId) {
            try {
              const routeRef = doc(db, 'routes', routeData.currentRouteId);
              await updateDoc(routeRef, {
                stops: updatedStops,
                encodedPolyline: newRouteInfo.encodedPolyline,
                distanceMeters: newRouteInfo.distanceMeters,
                duration: newRouteInfo.duration,
              });
            } catch (error) {
              console.error('Erro ao atualizar rota no Firestore:', error);
              toast({
                variant: 'destructive',
                title: 'Aviso',
                description: 'O ponto foi atualizado localmente, mas pode não sincronizar com o app do motorista.',
              });
            }
          }
        }

        toast({ title: 'Serviço Atualizado!', description: `A rota foi recalculada com as novas informações.${routeData.isExistingRoute ? ' O motorista receberá a atualização.' : ''}` });
      }

      setIsEditStopDialogOpen(false);
      setStopToEdit(null);
      setShowEditMap(false);
      setEditService({
        customerName: '',
        phone: '',
        orderNumber: '',
        timeWindowStart: '',
        timeWindowEnd: '',
        locationLink: '',
        cep: '',
        rua: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        notes: '',
        lat: null,
        lng: null,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Falha na Geocodificação',
        description: 'Não foi possível encontrar o endereço. Verifique os dados e tente novamente.',
      });
    }
  };

  const handleAddService = async () => {
    console.log('🚀 [handleAddService] INICIANDO adição de serviço');
    console.log('📋 [handleAddService] Dados do formulário:', JSON.stringify(manualService, null, 2));
    console.log('🎯 [handleAddService] Rota selecionada:', selectedRouteForNewService);
    console.log('📊 [handleAddService] routeData:', {
      isExistingRoute: routeData?.isExistingRoute,
      currentRouteId: routeData?.currentRouteId,
      draftRouteId: routeData?.draftRouteId,
      hasOrigin: !!routeData?.origin,
    });

    const { rua, numero, bairro, cidade, cep } = manualService;
    if (!rua || !bairro || !cidade) {
      console.warn('⚠️ [handleAddService] Campos obrigatórios faltando:', { rua, bairro, cidade });
      toast({
        variant: 'destructive',
        title: 'Campos Obrigatórios',
        description: 'Rua, bairro e cidade são obrigatórios para geocodificar o endereço.',
      });
      return;
    }

    const addressString = numero
      ? `${rua}, ${numero}, ${bairro}, ${cidade}, ${cep}, Brasil`
      : `${rua}, ${bairro}, ${cidade}, ${cep}, Brasil`;

    console.log('📍 [handleAddService] Geocodificando endereço:', addressString);
    const geocoded = await geocodeAddress(addressString);
    console.log('📍 [handleAddService] Resultado geocodificação:', geocoded);

    if (geocoded) {
      const newStop: PlaceValue = {
        ...geocoded,
        id: `manual-${Date.now()}`,
        address: geocoded.address,
        customerName: manualService.customerName,
        phone: manualService.phone,
        orderNumber: manualService.orderNumber,
        timeWindowStart: manualService.timeWindowStart,
        timeWindowEnd: manualService.timeWindowEnd,
        complemento: manualService.complemento,
        notes: manualService.notes,
      };
      console.log('✅ [handleAddService] Novo stop criado:', JSON.stringify(newStop, null, 2));

      // Add to selected route or unassigned
      if (selectedRouteForNewService === 'unassigned') {
        console.log('📦 [handleAddService] Adicionando aos não alocados');
        console.log('📊 [handleAddService] routeData completo:', {
          isExistingRoute: routeData?.isExistingRoute,
          currentRouteId: routeData?.currentRouteId,
          isService: routeData?.isService,
          serviceId: routeData?.serviceId,
          existingServiceRoutes: routeData?.existingServiceRoutes?.length,
        });
        setUnassignedStops(prev => [...prev, newStop]);

        // Salvar no Firestore
        // Para serviços: salvar em TODAS as rotas do serviço
        // Para rotas individuais: salvar na rota específica
        if (routeData?.isService && routeData?.serviceId) {
          console.log('💾 [handleAddService] É um SERVIÇO - salvando em todas as rotas do serviço');

          // Coletar todos os IDs de rotas do serviço (A, B, e dinâmicas)
          const allRouteIds: string[] = [];
          if (serviceRouteIds.A) allRouteIds.push(serviceRouteIds.A);
          if (serviceRouteIds.B) allRouteIds.push(serviceRouteIds.B);
          dynamicRoutes.forEach(dr => {
            if (dr.firestoreId) allRouteIds.push(dr.firestoreId);
          });

          console.log('📋 [handleAddService] IDs das rotas encontradas:', allRouteIds);

          if (allRouteIds.length === 0) {
            console.warn('⚠️ [handleAddService] Nenhuma rota encontrada para o serviço - buscando do Firestore');
            // Fallback: buscar rotas diretamente do Firestore
            try {
              const routesQuery = query(collection(db, 'routes'), where('serviceId', '==', routeData.serviceId));
              const routesSnapshot = await getDocs(routesQuery);
              routesSnapshot.docs.forEach(doc => {
                allRouteIds.push(doc.id);
              });
              console.log('📋 [handleAddService] IDs das rotas do Firestore:', allRouteIds);
            } catch (error) {
              console.error('❌ [handleAddService] Erro ao buscar rotas do Firestore:', error);
            }
          }

          if (allRouteIds.length > 0) {
            try {
              // Salvar em TODAS as rotas do serviço
              const updatePromises = allRouteIds.map(async (routeId) => {
                const routeRef = doc(db, 'routes', routeId);
                console.log(`💾 [handleAddService] Atualizando rota ${routeId}`);
                await updateDoc(routeRef, {
                  unassignedStops: arrayUnion(newStop),
                  updatedAt: serverTimestamp(),
                });
              });

              await Promise.all(updatePromises);
              console.log('✅ [handleAddService] UnassignedStops SALVO em TODAS as rotas do serviço!');
              toast({
                title: 'Serviço Adicionado!',
                description: 'O novo serviço foi salvo na lista de não alocados.',
              });
            } catch (error) {
              console.error('❌ [handleAddService] Erro ao salvar unassignedStops no Firestore:', error);
              toast({
                variant: 'destructive',
                title: 'Aviso',
                description: 'O ponto foi adicionado localmente, mas pode não persistir após recarregar a página.',
              });
            }
          } else {
            console.error('❌ [handleAddService] Nenhuma rota encontrada para salvar!');
            toast({
              variant: 'destructive',
              title: 'Erro',
              description: 'Nenhuma rota encontrada para salvar o ponto não alocado.',
            });
          }
        } else if (routeData?.isExistingRoute && routeData?.currentRouteId) {
          console.log('💾 [handleAddService] É uma ROTA INDIVIDUAL - salvando na rota específica');
          console.log('💾 [handleAddService] Route ID:', routeData.currentRouteId);
          try {
            const routeRef = doc(db, 'routes', routeData.currentRouteId);
            await updateDoc(routeRef, {
              unassignedStops: arrayUnion(newStop),
              updatedAt: serverTimestamp(),
            });
            console.log('✅ [handleAddService] UnassignedStops SALVO no Firestore com sucesso!');
            toast({
              title: 'Serviço Adicionado!',
              description: 'O novo serviço foi salvo na lista de não alocados.',
            });
          } catch (error) {
            console.error('❌ [handleAddService] Erro ao salvar unassignedStops no Firestore:', error);
            toast({
              variant: 'destructive',
              title: 'Aviso',
              description: 'O ponto foi adicionado localmente, mas pode não persistir após recarregar a página.',
            });
          }
        } else {
          console.warn('⚠️ [handleAddService] NÃO salvando no Firestore - não é serviço nem rota existente');
          toast({
            title: 'Serviço Adicionado!',
            description: 'O novo serviço está na lista de não alocados (apenas local).',
          });
        }
      } else {
        // Add to route A or B and recalculate
        const targetRoute = selectedRouteForNewService === 'A' ? routeA : routeB;
        const setter = selectedRouteForNewService === 'A' ? setRouteA : setRouteB;

        console.log('🛤️ [handleAddService] Rota alvo:', {
          routeKey: selectedRouteForNewService,
          targetRouteExists: !!targetRoute,
          targetRouteStops: targetRoute?.stops?.length || 0,
          routeDataExists: !!routeData,
        });

        if (!targetRoute || !routeData) {
          console.error('❌ [handleAddService] Rota não encontrada!', { targetRoute: !!targetRoute, routeData: !!routeData });
          toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Rota não encontrada.',
          });
          return;
        }

        const newStops = [...targetRoute.stops, newStop];
        console.log('📝 [handleAddService] Nova lista de stops:', newStops.length, 'paradas');
        setter(prev => prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null);

        // Recalculate route
        console.log('🔄 [handleAddService] Recalculando rota com', newStops.length, 'paradas');
        const newRouteInfo = await computeRoute(routeData.origin, newStops);
        console.log('🔄 [handleAddService] Resultado do computeRoute:', {
          success: !!newRouteInfo,
          distance: newRouteInfo?.distanceMeters,
          duration: newRouteInfo?.duration,
          hasPolyline: !!newRouteInfo?.encodedPolyline,
        });

        if (newRouteInfo) {
          setter(prev => prev ? { ...prev, ...newRouteInfo, stops: newStops, color: targetRoute.color, visible: targetRoute.visible } : null);

          // If this is an existing route, update Firestore so driver app receives the update
          console.log('💾 [handleAddService] Verificando se deve atualizar Firestore:', {
            isExistingRoute: routeData.isExistingRoute,
            currentRouteId: routeData.currentRouteId,
          });

          if (routeData.isExistingRoute && routeData.currentRouteId) {
            console.log('💾 [handleAddService] ATUALIZANDO FIRESTORE - Route ID:', routeData.currentRouteId);
            try {
              const routeRef = doc(db, 'routes', routeData.currentRouteId);
              const updateData = {
                stops: newStops,
                encodedPolyline: newRouteInfo.encodedPolyline,
                distanceMeters: newRouteInfo.distanceMeters,
                duration: newRouteInfo.duration,
              };
              console.log('💾 [handleAddService] Dados para update:', {
                stopsCount: updateData.stops.length,
                hasPolyline: !!updateData.encodedPolyline,
                distance: updateData.distanceMeters,
                duration: updateData.duration,
              });
              await updateDoc(routeRef, updateData);
              console.log('✅ [handleAddService] Firestore ATUALIZADO com sucesso!');
            } catch (error) {
              console.error('❌ [handleAddService] Erro ao atualizar rota no Firestore:', error);
              toast({
                variant: 'destructive',
                title: 'Aviso',
                description: 'O ponto foi adicionado localmente, mas pode não sincronizar com o app do motorista.',
              });
            }
          } else {
            console.log('ℹ️ [handleAddService] NÃO é rota existente, não atualizando Firestore');
          }
        } else {
          console.error('❌ [handleAddService] computeRoute retornou null/undefined');
        }

        toast({
          title: 'Serviço Adicionado!',
          description: `O serviço foi adicionado à ${routeNames[selectedRouteForNewService]}.${routeData.isExistingRoute ? ' O motorista receberá a atualização.' : ''}`,
        });
      }

      setManualService({
        customerName: '',
        phone: '',
        orderNumber: '',
        timeWindowStart: '',
        timeWindowEnd: '',
        locationLink: '',
        cep: '',
        rua: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        notes: '',
      });
      setSelectedRouteForNewService('unassigned');
      setIsAddServiceDialogOpen(false);
      console.log('✅ [handleAddService] FINALIZADO com sucesso');
    } else {
      console.error('❌ [handleAddService] Geocodificação falhou para:', addressString);
      toast({
        variant: 'destructive',
        title: 'Falha na Geocodificação',
        description: 'Não foi possível encontrar o endereço. Verifique os dados e tente novamente.',
      });
    }
  };


  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    // Find the stop being dragged
    const routeKey = active.data.current?.routeKey as string;
    const index = active.data.current?.index as number;

    setActiveRouteKey(routeKey);
    setActiveIndex(index);

    if (routeKey && index !== undefined) {
      const route = getRoute(routeKey);
      if (route) {
        // Get from pendingEdits if exists, otherwise from route
        const stops = pendingEdits[routeKey] || route.stops;
        setActiveStop(stops[index]);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    addDebugLog('DRAG_END', 'Drag operation ended', {
      activeId: active.id,
      overId: over?.id,
      activeRouteKey: active.data.current?.routeKey,
      overRouteKey: over?.data.current?.routeKey,
      activeIndex: active.data.current?.index,
      overIndex: over?.data.current?.index,
    });

    setActiveId(null);
    setActiveStop(null);
    setActiveRouteKey(null);
    setActiveIndex(null);

    if (!over || active.id === over.id) {
      addDebugLog('DRAG_END', 'Drag cancelled - no valid drop target or same position', { over: !!over, sameId: active.id === over?.id });
      return;
    }

    const activeRouteKey = active.data.current?.routeKey as string | 'unassigned';
    const overRouteKey = over.data.current?.routeKey as string;

    addDebugLog('DRAG_END', 'Processing drag operation', {
      activeRouteKey,
      overRouteKey,
      isUnassignedSource: activeRouteKey === 'unassigned',
      isSameRoute: activeRouteKey === overRouteKey,
    });

    // Case: Moving from unassigned to a route
    if (activeRouteKey === 'unassigned' && overRouteKey && overRouteKey !== 'unassigned') {
      console.log('🔄 [handleDragEnd] Movendo de não alocados para rota:', overRouteKey);
      if (!routeData) {
        console.error('❌ [handleDragEnd] routeData não encontrado!');
        return;
      }

      const targetRoute = getRoute(overRouteKey);
      const stopToMove = active.data.current?.stop as PlaceValue;

      if (!stopToMove) {
        console.error('❌ [handleDragEnd] stopToMove não encontrado!');
        return;
      }

      console.log('📍 [handleDragEnd] Stop a mover:', {
        id: stopToMove.id,
        customerName: stopToMove.customerName,
        address: stopToMove.address,
        lat: stopToMove.lat,
        lng: stopToMove.lng,
      });

      // Validar se o stop tem coordenadas válidas antes de mover para a rota
      if (!stopToMove.lat || !stopToMove.lng || stopToMove.lat === 0 || stopToMove.lng === 0) {
        console.warn('⚠️ [handleDragEnd] Stop sem coordenadas válidas! Precisa editar antes.');
        toast({
          variant: 'destructive',
          title: 'Endereço sem coordenadas',
          description: `"${stopToMove.customerName || 'Parada'}" precisa ser editada antes de ser adicionada à rota. Clique em "Editar" para corrigir o endereço.`,
        });
        return;
      }

      // Remove from unassigned by matching the stop ID
      const stopId = String(stopToMove.id ?? stopToMove.placeId);
      setUnassignedStops(prev => prev.filter(s => String(s.id ?? s.placeId) !== stopId));

      // Add to target route
      const newTargetStops = targetRoute ? [...targetRoute.stops, stopToMove] : [stopToMove];
      console.log('📝 [handleDragEnd] Nova lista de stops:', newTargetStops.length, 'paradas');

      // Atualizar rota temporariamente (será substituída após recalcular)
      const tempRouteData: RouteInfo = {
        stops: newTargetStops,
        distanceMeters: targetRoute?.distanceMeters || 0,
        duration: targetRoute?.duration || '0s',
        encodedPolyline: '',
        color: targetRoute?.color || (overRouteKey === 'A' ? '#e60000' : overRouteKey === 'B' ? '#1fd634' : '#fa9200'),
        visible: targetRoute?.visible ?? true,
      };
      setRoute(overRouteKey, () => tempRouteData);

      // Recalculate route
      console.log('🔄 [handleDragEnd] Recalculando rota...');
      const newRouteInfo = await computeRoute(routeData.origin, newTargetStops);
      if (newRouteInfo) {
        console.log('✅ [handleDragEnd] Rota recalculada:', {
          distance: newRouteInfo.distanceMeters,
          duration: newRouteInfo.duration,
          hasPolyline: !!newRouteInfo.encodedPolyline,
        });

        setRoute(overRouteKey, prev => prev ? {
          ...prev,
          ...newRouteInfo,
          stops: newTargetStops,
          color: targetRoute?.color || (overRouteKey === 'A' ? '#e60000' : overRouteKey === 'B' ? '#1fd634' : dynamicRoutes.find(r => r.key === overRouteKey)?.color || '#fa9200'),
          visible: targetRoute?.visible ?? true
        } : {
          ...newRouteInfo,
          stops: newTargetStops,
          color: overRouteKey === 'A' ? '#e60000' : overRouteKey === 'B' ? '#1fd634' : dynamicRoutes.find(r => r.key === overRouteKey)?.color || '#fa9200',
          visible: true
        });

        // Determinar o Firestore ID da rota alvo
        let firestoreRouteId: string | null = null;
        if (routeData.isExistingRoute && routeData.currentRouteId && overRouteKey === 'A') {
          firestoreRouteId = routeData.currentRouteId;
        } else if (routeData.isService) {
          // Rotas de serviço: A/B têm serviceRouteIds, dinâmicas têm firestoreId
          if (overRouteKey === 'A' || overRouteKey === 'B') {
            firestoreRouteId = serviceRouteIds[overRouteKey as 'A' | 'B'];
          } else {
            const dynRoute = dynamicRoutes.find(r => r.key === overRouteKey);
            firestoreRouteId = dynRoute?.firestoreId || null;
          }
        }

        if (firestoreRouteId) {
          console.log('💾 [handleDragEnd] SALVANDO NO FIRESTORE - Route ID:', firestoreRouteId);
          try {
            const routeRef = doc(db, 'routes', firestoreRouteId);
            // Calcular unassignedStops atualizado (removendo o ponto que foi movido)
            const movedStopId = String(stopToMove.id ?? stopToMove.placeId);
            const updatedUnassignedStops = unassignedStops.filter(s => String(s.id ?? s.placeId) !== movedStopId);

            await updateDoc(routeRef, {
              stops: newTargetStops,
              encodedPolyline: newRouteInfo.encodedPolyline,
              distanceMeters: newRouteInfo.distanceMeters,
              duration: newRouteInfo.duration,
              unassignedStops: updatedUnassignedStops,
              updatedAt: serverTimestamp(),
            });
            console.log('✅ [handleDragEnd] Firestore ATUALIZADO com sucesso! UnassignedStops restantes:', updatedUnassignedStops.length);
          } catch (error) {
            console.error('❌ [handleDragEnd] Erro ao atualizar Firestore:', error);
            toast({
              variant: 'destructive',
              title: 'Aviso',
              description: 'O ponto foi adicionado localmente, mas pode não sincronizar com o app do motorista.',
            });
          }
        } else {
          console.log('ℹ️ [handleDragEnd] Sem Firestore ID para salvar imediatamente:', {
            isExistingRoute: routeData.isExistingRoute,
            isService: routeData.isService,
            currentRouteId: routeData.currentRouteId,
            overRouteKey,
          });
        }
      } else {
        console.error('❌ [handleDragEnd] computeRoute retornou null - salvando sem polyline');
        // Mesmo sem polyline, salvar no Firestore para manter consistência
        // Reutilizar firestoreRouteId já determinado acima
        let fallbackRouteId: string | null = null;
        if (routeData.isExistingRoute && routeData.currentRouteId && overRouteKey === 'A') {
          fallbackRouteId = routeData.currentRouteId;
        } else if (routeData.isService) {
          if (overRouteKey === 'A' || overRouteKey === 'B') {
            fallbackRouteId = serviceRouteIds[overRouteKey as 'A' | 'B'];
          } else {
            const dynRoute = dynamicRoutes.find(r => r.key === overRouteKey);
            fallbackRouteId = dynRoute?.firestoreId || null;
          }
        }

        if (fallbackRouteId) {
          try {
            const routeRef = doc(db, 'routes', fallbackRouteId);
            const movedStopId = String(stopToMove.id ?? stopToMove.placeId);
            const updatedUnassignedStops = unassignedStops.filter(s => String(s.id ?? s.placeId) !== movedStopId);

            await updateDoc(routeRef, {
              stops: newTargetStops,
              unassignedStops: updatedUnassignedStops,
              updatedAt: serverTimestamp(),
            });
            console.log('✅ [handleDragEnd] Firestore ATUALIZADO (sem polyline)');
          } catch (error) {
            console.error('❌ [handleDragEnd] Erro ao atualizar Firestore:', error);
          }
        }
      }

      const routeName = overRouteKey === 'A' ? routeNames.A : overRouteKey === 'B' ? routeNames.B : dynamicRoutes.find(r => r.key === overRouteKey)?.name || `Rota ${overRouteKey}`;
      const hasFirestoreId = !!(routeData.isExistingRoute && overRouteKey === 'A') || !!(routeData.isService && (serviceRouteIds[overRouteKey as 'A' | 'B'] || dynamicRoutes.find(r => r.key === overRouteKey)?.firestoreId));
      toast({
        title: 'Serviço adicionado!',
        description: `O serviço foi adicionado à ${routeName}.${hasFirestoreId ? ' Salvo automaticamente.' : ''}`,
      });

      return;
    }

    if (!activeRouteKey || !overRouteKey || activeRouteKey === 'unassigned') {
        return;
    }

    // Case 1: Moving within the same route - save as pending edit
    if (activeRouteKey === overRouteKey) {
      addDebugLog('DRAG_SAME_ROUTE', 'Moving within same route', { routeKey: activeRouteKey });

      const currentRoute = getRoute(activeRouteKey);
      if (!currentRoute || !routeData) {
        addDebugLog('DRAG_SAME_ROUTE', 'ERROR: Route not found or no route data', { currentRoute: !!currentRoute, routeData: !!routeData });
        return;
      }

      const oldIndex = active.data.current?.index as number;
      const newIndex = over.data.current?.index as number;

      addDebugLog('DRAG_SAME_ROUTE', 'Reordering stops', { oldIndex, newIndex, totalStops: currentRoute.stops.length });

      // Check if there's already a pending edit, if so use that, otherwise use current route
      const currentPending = pendingEdits[activeRouteKey];
      const stopsToReorder = currentPending || currentRoute.stops.map((stop, idx) => ({
        ...stop,
        _originalIndex: idx // Store original index
      }));

      // Validate indices before arrayMove
      if (oldIndex === undefined || newIndex === undefined || oldIndex < 0 || newIndex < 0 || oldIndex >= stopsToReorder.length) {
        addDebugLog('DRAG_SAME_ROUTE', 'ERROR: Invalid indices', { oldIndex, newIndex, stopsLength: stopsToReorder.length });
        return;
      }

      const newStops = arrayMove(stopsToReorder, oldIndex, newIndex);

      // Validate the moved stop exists
      if (!newStops[newIndex]) {
        addDebugLog('DRAG_SAME_ROUTE', 'ERROR: Moved stop not found at new index', { newIndex, newStopsLength: newStops.length });
        return;
      }

      // Mark the moved stop with _wasMoved flag
      const stopId = String(newStops[newIndex].id ?? newStops[newIndex].placeId);
      const updatedStops = newStops.map(stop => {
        const currentStopId = String(stop.id ?? stop.placeId);
        if (currentStopId === stopId) {
          return { ...stop, _wasMoved: true };
        }
        return stop;
      });

      addDebugLog('DRAG_SAME_ROUTE', 'Saved as pending edit', {
        routeKey: activeRouteKey,
        movedStopId: stopId,
        newStopsCount: updatedStops.length
      });

      // Save as pending edit (don't recalculate route yet)
      setPendingEdits(prev => ({
        ...prev,
        [activeRouteKey]: updatedStops
      }));
    }
    // Case 2: Moving between different routes - save as pending edit
    else {
      addDebugLog('DRAG_BETWEEN_ROUTES', 'Moving between different routes', {
        sourceRouteKey: activeRouteKey,
        targetRouteKey: overRouteKey
      });

      const sourceRoute = getRoute(activeRouteKey);
      const targetRoute = getRoute(overRouteKey);

      addDebugLog('DRAG_BETWEEN_ROUTES', 'Retrieved routes', {
        hasSourceRoute: !!sourceRoute,
        hasTargetRoute: !!targetRoute,
        sourceStopsCount: sourceRoute?.stops?.length || 0,
        targetStopsCount: targetRoute?.stops?.length || 0
      });

      if (!sourceRoute || !routeData) {
        addDebugLog('DRAG_BETWEEN_ROUTES', 'ERROR: Source route not found or no route data', {
          sourceRoute: !!sourceRoute,
          routeData: !!routeData
        });
        return;
      }

      const activeIndex = active.data.current?.index as number;
      const overIndex = over.data.current?.index as number;

      addDebugLog('DRAG_BETWEEN_ROUTES', 'Indices', { activeIndex, overIndex });

      // CRITICAL: Always use pending edits if they exist, otherwise create from CURRENT route state
      // This prevents issues where Firestore listener updates the state while we're editing
      const currentSourcePending = pendingEdits[activeRouteKey];
      const sourceStopsToEdit = currentSourcePending
        ? [...currentSourcePending] // Create a copy to avoid mutation
        : sourceRoute.stops.map((stop, idx) => ({
            ...stop,
            _originalIndex: (stop as any)._originalIndex ?? idx
          }));

      // Check if there's already a pending edit for target route
      // Target route might be null/empty, so handle that case
      const currentTargetPending = pendingEdits[overRouteKey];
      const targetStopsToEdit = currentTargetPending
        ? [...currentTargetPending] // Create a copy to avoid mutation
        : (targetRoute?.stops || []).map((stop, idx) => ({
            ...stop,
            _originalIndex: (stop as any)._originalIndex ?? idx
          }));

      addDebugLog('DRAG_BETWEEN_ROUTES', 'Pending edits status', {
        hasSourcePending: !!currentSourcePending,
        hasTargetPending: !!currentTargetPending,
        sourceStopsToEditCount: sourceStopsToEdit.length,
        targetStopsToEditCount: targetStopsToEdit.length
      });

      // Get stop to move from the correct source (pending edits or original route)
      const stopToMove = sourceStopsToEdit[activeIndex];

      if (!stopToMove) {
        addDebugLog('DRAG_BETWEEN_ROUTES', 'ERROR: Stop to move not found', { activeIndex, sourceStopsToEditCount: sourceStopsToEdit.length });
        return;
      }

      // Get the original index if it exists, otherwise use current index
      const originalIndexOfMovedStop = (stopToMove as any)._originalIndex ?? activeIndex;

      // Remove from source
      const newSourceStops = sourceStopsToEdit.filter((_, i) => i !== activeIndex);

      // Add to target at the position of the over item with marker for cross-route movement
      const movedStopId = String(stopToMove.id ?? stopToMove.placeId);

      addDebugLog('DRAG_BETWEEN_ROUTES', 'Stop to move details', {
        stopId: movedStopId,
        stopName: stopToMove.customerName,
        originalIndex: originalIndexOfMovedStop,
        newSourceStopsCount: newSourceStops.length
      });

      // Check if stop already exists in target (to prevent duplicates)
      const existsInTarget = targetStopsToEdit.some(s =>
        String(s.id ?? s.placeId) === movedStopId
      );

      addDebugLog('DRAG_BETWEEN_ROUTES', 'Duplicate check', {
        existsInTarget,
        movedStopId,
        targetStopsIds: targetStopsToEdit.map(s => String(s.id ?? s.placeId)),
        targetStopsNames: targetStopsToEdit.map(s => s.customerName)
      });

      let newTargetStops: PlaceValue[];
      if (existsInTarget) {
        // Stop already exists in target - reorder it in target AND remove from source
        const existingIndex = targetStopsToEdit.findIndex(s =>
          String(s.id ?? s.placeId) === movedStopId
        );
        addDebugLog('DRAG_BETWEEN_ROUTES', 'Stop already exists in target - reordering in target and removing from source', {
          existingIndex,
          overIndex,
          stopId: movedStopId,
          stopName: stopToMove.customerName,
          sourceRouteKey: activeRouteKey,
          targetRouteKey: overRouteKey,
        });

        newTargetStops = [...targetStopsToEdit];
        const [removed] = newTargetStops.splice(existingIndex, 1);
        newTargetStops.splice(overIndex, 0, removed);

        // ALSO remove from source to fix duplication
        console.log('🔧 [CROSS-DRAG] Stop duplicado detectado - removendo da origem e reordenando no destino');
        setPendingEdits(prev => ({
          ...prev,
          [activeRouteKey]: newSourceStops,  // Remove from source!
          [overRouteKey]: newTargetStops
        }));

        addDebugLog('DRAG_BETWEEN_ROUTES', 'Saved reordering - source route ALSO updated to remove duplicate');
        return;
      } else {
        // Normal case: add to target
        addDebugLog('DRAG_BETWEEN_ROUTES', 'Adding stop to target', { overIndex });

        newTargetStops = [...targetStopsToEdit];
        const movedStop = {
          ...stopToMove,
          _originalIndex: originalIndexOfMovedStop, // Preserve the original index from source route
          _wasMoved: true,
          _movedFromRoute: activeRouteKey, // Track which route it came from
          _originalRouteColor: sourceRoute.color, // Preserve original route color
        };
        newTargetStops.splice(overIndex, 0, movedStop);
      }

      addDebugLog('DRAG_BETWEEN_ROUTES', 'Saving pending edits', {
        sourceRouteKey: activeRouteKey,
        targetRouteKey: overRouteKey,
        newSourceStopsCount: newSourceStops.length,
        newTargetStopsCount: newTargetStops.length
      });

      // Save as pending edits for both routes
      console.log('🔄 [CROSS-DRAG] Salvando pendingEdits para AMBAS as rotas:', {
        source: activeRouteKey,
        sourceStops: newSourceStops.length,
        sourceOrders: newSourceStops.map((s: any) => s.orderNumber).filter(Boolean),
        target: overRouteKey,
        targetStops: newTargetStops.length,
        targetOrders: newTargetStops.map((s: any) => s.orderNumber).filter(Boolean),
      });
      setPendingEdits(prev => ({
        ...prev,
        [activeRouteKey]: newSourceStops,
        [overRouteKey]: newTargetStops
      }));

      addDebugLog('DRAG_BETWEEN_ROUTES', 'Successfully saved pending edits');
    }
  };

  // Helper functions to manage routes dynamically
  const getRoute = (routeKey: string) => {
    if (routeKey === 'A') return routeA;
    if (routeKey === 'B') return routeB;
    const dynamicRoute = dynamicRoutes.find(r => r.key === routeKey);
    if (dynamicRoute) return dynamicRoute.data;
    // Check in additional routes (Outras Rotas do Período)
    const additionalRoute = additionalRoutes.find(r => r.id === routeKey);
    return additionalRoute?.data || null;
  };

  const setRoute = (routeKey: string, updater: (prev: RouteInfo | null) => RouteInfo | null) => {
    if (routeKey === 'A') {
      setRouteA(updater);
    } else if (routeKey === 'B') {
      setRouteB(updater);
    } else {
      // Try to update in dynamicRoutes first
      const isDynamicRoute = dynamicRoutes.some(r => r.key === routeKey);
      if (isDynamicRoute) {
        setDynamicRoutes(prev => prev.map(r =>
          r.key === routeKey
            ? { ...r, data: updater(r.data) || r.data }
            : r
        ));
      } else {
        // Update in additionalRoutes (Outras Rotas do Período)
        setAdditionalRoutes(prev => prev.map(r =>
          r.id === routeKey
            ? { ...r, data: updater(r.data) || r.data }
            : r
        ));
      }
    }
  };

  // Function to add a new dynamic route
  const handleAddNewRoute = () => {
    // Cores diferentes das rotas A (vermelho) e B (verde) para evitar confusão
    const routeColors = [
      '#fa9200', // Laranja - Rota C
      '#bf07e4', // Roxo - Rota D
      '#00bcd4', // Ciano - Rota E
      '#795548', // Marrom - Rota F
      '#e91e63', // Rosa - Rota G
      '#009688', // Teal - Rota H
      '#ff5722', // Laranja escuro - Rota I
      '#673ab7', // Roxo escuro - Rota J
    ];
    const nextRouteIndex = dynamicRoutes.length;
    const nextRouteLetter = String.fromCharCode(67 + nextRouteIndex); // C, D, E, F, etc.
    const color = routeColors[nextRouteIndex % routeColors.length];

    const newRoute = {
      key: nextRouteLetter,
      name: `Rota ${nextRouteIndex + 3}`, // Rota 3, Rota 4, etc. (A=1, B=2)
      data: {
        stops: [],
        distanceMeters: 0,
        duration: '0s',
        encodedPolyline: '',
        color: color,
        visible: true,
      },
      color: color,
    };

    setDynamicRoutes(prev => [...prev, newRoute]);
    toast({
      title: 'Nova rota criada!',
      description: `${newRoute.name} foi adicionada. Arraste serviços para ela.`
    });
  };

  // Function to delete a dynamic route
  const handleDeleteDynamicRoute = async (routeKey: string) => {
    const dynamicRoute = dynamicRoutes.find(r => r.key === routeKey);
    if (!dynamicRoute) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Rota não encontrada.',
      });
      return;
    }

    // Check if route has stops - if so, move them back to unassigned
    const routeStops = pendingEdits[routeKey] || dynamicRoute.data.stops;

    if (routeStops.length > 0) {
      // Move stops back to unassigned
      setUnassignedStops(prev => [...prev, ...routeStops.map(({ _originalIndex, _wasMoved, _movedFromRoute, _originalRouteColor, ...stop }: any) => stop)]);
    }

    // If route was saved to Firestore, delete it there too
    if (dynamicRoute.firestoreId) {
      try {
        await deleteDoc(doc(db, 'routes', dynamicRoute.firestoreId));
        addDebugLog('DELETE_ROUTE', `Deleted route ${routeKey} from Firestore`, {
          firestoreId: dynamicRoute.firestoreId
        });
      } catch (error) {
        console.error('Erro ao deletar rota do Firestore:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao deletar',
          description: 'A rota foi removida localmente, mas não foi deletada do servidor.',
        });
      }
    }

    // Remove from dynamicRoutes
    setDynamicRoutes(prev => prev.filter(r => r.key !== routeKey));

    // Clear any pending edits for this route
    setPendingEdits(prev => {
      const newEdits = { ...prev };
      delete newEdits[routeKey];
      return newEdits;
    });

    toast({
      title: 'Rota removida',
      description: routeStops.length > 0
        ? `${dynamicRoute.name} foi removida. ${routeStops.length} parada(s) movida(s) para não atribuídos.`
        : `${dynamicRoute.name} foi removida.`,
    });
  };

  const handleOptimizeSingleRoute = async (routeKey: 'A' | 'B') => {
    const routeToOptimize = routeKey === 'A' ? routeA : routeB;
    const setter = routeKey === 'A' ? setRouteA : setRouteB;

    if (!routeToOptimize || !routeData) {
        toast({ variant: 'destructive', title: "Erro", description: "Dados da rota não encontrados." });
        return;
    }

    setIsOptimizing(prev => ({...prev, [routeKey]: true}));
    
    try {
        const result = await optimizeDeliveryRoutes({
            origin: routeData.origin,
            deliveryLocations: routeToOptimize.stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng })),
        });
        
        const reorderedStops = [...routeToOptimize.stops].sort((a, b) => {
            const indexA = result.optimizedStops.findIndex(s => s.id === a.id);
            const indexB = result.optimizedStops.findIndex(s => s.id === b.id);
            return indexA - indexB;
        });

        setter((prev) => (prev ? { ...prev, stops: reorderedStops, encodedPolyline: '' } : null));
        
        const newRouteInfo = await computeRoute(routeData.origin, reorderedStops);
        if (newRouteInfo) {
            setter((prev) => (prev ? { ...prev, ...newRouteInfo, stops: reorderedStops } : null));
        }

        toast({ title: "Rota Otimizada!", description: `A Rota ${routeKey === 'A' ? '1' : '2'} foi otimizada com sucesso.` });

    } catch (error) {
        console.error("Error optimizing route:", error);
        toast({ variant: 'destructive', title: "Falha na Otimização", description: "Não foi possível otimizar a rota." });
    } finally {
        setIsOptimizing(prev => ({...prev, [routeKey]: false}));
    }
  };

  const toggleRouteVisibility = (routeKey: string) => {
    if (routeKey === 'A') {
      setRouteA(prev => prev ? { ...prev, visible: !prev.visible } : null);
    } else if (routeKey === 'B') {
      setRouteB(prev => prev ? { ...prev, visible: !prev.visible } : null);
    } else {
      // Toggle visibility for dynamic routes (C, D, E, etc.)
      setDynamicRoutes(prev => prev.map(r =>
        r.key === routeKey
          ? { ...r, data: { ...r.data, visible: !r.data.visible } }
          : r
      ));
    }
  };
  
  const handleAssignDriver = (routeKey: 'A' | 'B', driverId: string) => {
    setAssignedDrivers(prev => ({...prev, [routeKey]: driverId}));
  };
  
  const handleDispatchRoute = async (routeKey: string) => {
    if (!routeData) return;

    // Encontrar a rota: pode ser A, B ou rota dinâmica (C, D, E...)
    let routeToSave: RouteInfo | null = null;
    if (routeKey === 'A') routeToSave = routeA;
    else if (routeKey === 'B') routeToSave = routeB;
    else {
      const dynRoute = dynamicRoutes.find(r => r.key === routeKey);
      if (dynRoute) routeToSave = dynRoute.data;
    }

    const routeName = routeNames[routeKey] || `Rota ${routeKey}`;
    const driverId = assignedDrivers[routeKey];

    if (!routeToSave) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Rota não encontrada para despacho.' });
        return;
    }
    if (!driverId) {
        toast({ variant: 'destructive', title: 'Motorista não atribuído', description: `Por favor, atribua um motorista para a ${routeName}.` });
        return;
    }

    setIsSaving(prev => ({ ...prev, [routeKey]: true }));

    try {
        const driver = availableDrivers.find(d => d.id === driverId);

        // Obter IDs dos pedidos Luna desta rota (se aplicável)
        const lunnaOrderIds = routeToSave.stops
          .map(s => s.orderNumber)
          .filter((n): n is string => !!n);

        // Verificar se já existe um draft salvo para esta rota (evitar duplicatas)
        let existingDraftId: string | null = null;
        if (routeKey === 'A' || routeKey === 'B') {
          existingDraftId = serviceRouteIds[routeKey as 'A' | 'B'];
        } else {
          const dynRoute = dynamicRoutes.find(r => r.key === routeKey);
          if (dynRoute?.firestoreId) existingDraftId = dynRoute.firestoreId;
        }

        // Converter routeTime (morning/afternoon/evening) para hora HH:mm
        const timeMap: Record<string, string> = {
            'morning': '08:00',
            'afternoon': '14:00',
            'evening': '18:00',
        };
        const timeStr = timeMap[routeData.routeTime] || routeData.routeTime;

        const routeDocData: Record<string, any> = {
            name: routeName,
            status: 'dispatched',
            plannedDate: new Date(`${routeData.routeDate.split('T')[0]}T${timeStr}`),
            origin: routeData.origin,
            stops: routeToSave.stops,
            distanceMeters: routeToSave.distanceMeters,
            duration: routeToSave.duration,
            encodedPolyline: routeToSave.encodedPolyline,
            color: routeToSave.color,
            driverId: driverId,
            driverInfo: driver ? { name: driver.name, vehicle: driver.vehicle } : null,
            updatedAt: serverTimestamp(),
        };

        // Adicionar campos de serviço Luna se aplicável
        if (routeData.isService && routeData.serviceId) {
            routeDocData.source = 'lunna';
            routeDocData.serviceId = routeData.serviceId;
            routeDocData.serviceCode = routeData.serviceCode;
            routeDocData.lunnaOrderIds = lunnaOrderIds;
            // Gerar código da rota baseado na letra da rota (A, B)
            routeDocData.code = `${routeData.serviceCode}-${routeKey}`;
        }

        let routeRefId: string;

        if (existingDraftId && routeData.isService) {
            // ATUALIZAR o draft existente em vez de criar novo documento
            console.log(`📝 [handleDispatchRoute] Atualizando draft existente ${existingDraftId} para dispatched`);
            const routeRef = doc(db, 'routes', existingDraftId);
            await updateDoc(routeRef, routeDocData);
            routeRefId = existingDraftId;
        } else {
            // Criar novo documento (fluxo não-serviço ou sem draft existente)
            routeDocData.createdAt = serverTimestamp();
            const routeRef = await addDoc(collection(db, "routes"), routeDocData);
            routeRefId = routeRef.id;
        }

        // Se é um serviço, atualizar o serviço com o ID da rota
        if (routeData.isService && routeData.serviceId) {
            const serviceRef = doc(db, 'services', routeData.serviceId);
            await updateDoc(serviceRef, {
                routeIds: arrayUnion(routeRefId),
                'stats.totalRoutes': increment(existingDraftId ? 0 : 1),
                status: 'dispatched',
                updatedAt: serverTimestamp(),
            });

            // Atualizar pedidos Luna com referência à rota
            for (const orderNumber of lunnaOrderIds) {
                const ordersQuery = query(
                    collection(db, 'orders'),
                    where('number', '==', orderNumber)
                );
                const ordersSnap = await getDocs(ordersQuery);
                if (!ordersSnap.empty) {
                    await updateDoc(ordersSnap.docs[0].ref, {
                        logisticsStatus: 'em_rota',
                        rotaExataRouteId: routeRefId,
                        rotaExataRouteCode: routeDocData.code,
                        updatedAt: serverTimestamp(),
                    });
                }
            }
        }

        toast({
            title: 'Rota Despachada!',
            description: `A ${routeName} foi enviada para ${driver?.name}.`,
        });

        // Remove the dispatched route from state
        if (routeKey === 'A') {
            setRouteA(null);
        } else if (routeKey === 'B') {
            setRouteB(null);
        } else {
            // Dynamic route - remove from dynamicRoutes
            setDynamicRoutes(prev => prev.filter(r => r.key !== routeKey));
        }

    } catch (error) {
        console.error("Error saving route:", error);
        toast({
            variant: 'destructive',
            title: 'Falha ao Salvar Rota',
            description: 'Ocorreu um erro ao tentar despachar a rota.',
        });
    } finally {
        setIsSaving(prev => ({ ...prev, [routeKey]: false }));
    }
  };

  // Função para atualizar apenas o nome da rota no Firestore
  const handleUpdateRouteName = async (routeKey: 'A' | 'B', newName: string) => {
    const routeId = serviceRouteIds[routeKey];

    if (!routeId) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Rota ainda não foi salva no sistema.',
      });
      throw new Error('Route not saved');
    }

    try {
      const updateRouteNameFn = httpsCallable(functions, 'updateRouteName');
      await updateRouteNameFn({ routeId, name: newName });

      toast({
        title: 'Nome Atualizado!',
        description: `O nome da rota foi alterado para "${newName}".`,
      });
    } catch (error: any) {
      console.error('Error updating route name:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Atualizar Nome',
        description: error.message || 'Não foi possível alterar o nome da rota.',
      });
      throw error;
    }
  };

  const handleUpdateExistingRoute = async (routeKey: 'A' | 'B') => {
    if (!routeData) return;

    const routeToUpdate = routeKey === 'A' ? routeA : routeB;
    const routeName = routeNames[routeKey];

    if (!routeToUpdate) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Rota não encontrada para atualização.' });
        return;
    }

    // Verificar se é uma rota existente
    if (!routeData.isExistingRoute || !routeData.existingRouteData) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Esta rota ainda não foi despachada.' });
        return;
    }

    // Obter o ID da rota do Firebase
    const currentRouteId = routeData.currentRouteId;
    if (!currentRouteId) {
        toast({ variant: 'destructive', title: 'Erro', description: 'ID da rota não encontrado.' });
        return;
    }

    setIsSaving(prev => ({ ...prev, [routeKey]: true }));

    try {
        const routeRef = doc(db, 'routes', currentRouteId);

        // Buscar a rota atual do Firestore para comparar
        const currentRouteDoc = await getDoc(routeRef);
        if (!currentRouteDoc.exists()) {
          throw new Error('Rota não encontrada no Firebase');
        }

        const currentRouteData = currentRouteDoc.data();
        const oldStops = currentRouteData.stops || [];
        const newStops = routeToUpdate.stops;

        // Detectar mudanças
        const changes = detectRouteChanges(oldStops, newStops);

        // Marcar paradas modificadas
        const stopsWithFlags = markModifiedStops(newStops, changes);

        // Verificar se foi atribuído um motorista na aba Atribuir
        const driverId = assignedDrivers[routeKey];
        const driver = driverId ? availableDrivers.find(d => d.id === driverId) : null;

        // Preparar dados para atualização
        const updateData: Record<string, any> = {
            stops: stopsWithFlags,
            distanceMeters: routeToUpdate.distanceMeters,
            duration: routeToUpdate.duration,
            encodedPolyline: routeToUpdate.encodedPolyline,
        };

        // Incluir motorista se foi selecionado um novo
        if (driverId && driver) {
            updateData.driverId = driverId;
            updateData.driverInfo = { name: driver.name, vehicle: driver.vehicle };
        }

        await updateDoc(routeRef, updateData);

        // Se houver mudanças e a rota estiver em progresso, notificar o motorista
        if (changes.length > 0 && currentRouteData.status === 'in_progress' && currentRouteData.driverId) {
          try {
            const notifyFn = httpsCallable(functions, 'notifyRouteChanges');
            await notifyFn({
              routeId: currentRouteId,
              driverId: currentRouteData.driverId,
              changes,
            });

            toast({
                title: 'Rota Atualizada!',
                description: `A ${routeName} foi atualizada. O motorista será notificado das ${changes.length} alterações.`,
            });
          } catch (notifyError) {
            console.error('Error notifying driver:', notifyError);
            toast({
                title: 'Rota Atualizada!',
                description: `A ${routeName} foi atualizada, mas houve erro ao notificar o motorista.`,
            });
          }
        } else {
          // Mensagem diferenciada se motorista foi atribuído
          const driverMessage = driverId && driver
            ? ` Motorista ${driver.name} atribuído.`
            : '';
          toast({
              title: 'Rota Atualizada!',
              description: `A ${routeName} foi atualizada com sucesso.${driverMessage}`,
          });
        }

    } catch (error) {
        console.error("Error updating route:", error);
        toast({
            variant: 'destructive',
            title: 'Falha ao Atualizar Rota',
            description: 'Ocorreu um erro ao tentar atualizar a rota.',
        });
    } finally {
        setIsSaving(prev => ({ ...prev, [routeKey]: false }));
    }
  };

  const handleRemoveStop = async (stopId: string) => {
    if (!routeData) return;

    // Find which route contains this stop
    let targetRoute: RouteInfo | null = null;
    let routeKey: string | null = null;

    // Check route A
    if (routeA?.stops.some(s => String(s.id ?? s.placeId) === stopId)) {
      targetRoute = routeA;
      routeKey = 'A';
    }
    // Check route B
    else if (routeB?.stops.some(s => String(s.id ?? s.placeId) === stopId)) {
      targetRoute = routeB;
      routeKey = 'B';
    }
    // Check dynamic routes
    else {
      for (const dynamicRoute of dynamicRoutes) {
        if (dynamicRoute.data.stops.some(s => String(s.id ?? s.placeId) === stopId)) {
          targetRoute = dynamicRoute.data;
          routeKey = dynamicRoute.key;
          break;
        }
      }
    }

    // Check unassigned stops
    if (!routeKey && unassignedStops.some(s => String(s.id ?? s.placeId) === stopId)) {
      // Remove from unassigned stops
      const updatedUnassigned = unassignedStops.filter(s => String(s.id ?? s.placeId) !== stopId);
      setUnassignedStops(updatedUnassigned);

      // Salvar no Firestore
      if (routeData.isService && routeData.serviceId) {
        try {
          const allRouteIds: string[] = [];
          if (serviceRouteIds.A) allRouteIds.push(serviceRouteIds.A);
          if (serviceRouteIds.B) allRouteIds.push(serviceRouteIds.B);
          dynamicRoutes.forEach(dr => {
            if (dr.firestoreId) allRouteIds.push(dr.firestoreId);
          });

          if (allRouteIds.length > 0) {
            const updatePromises = allRouteIds.map(async (routeId) => {
              const routeRef = doc(db, 'routes', routeId);
              await updateDoc(routeRef, {
                unassignedStops: updatedUnassigned,
                updatedAt: serverTimestamp(),
              });
            });
            await Promise.all(updatePromises);
          }
        } catch (error) {
          console.error('❌ Erro ao salvar unassignedStops:', error);
        }
      } else if (routeData.isExistingRoute && routeData.currentRouteId) {
        try {
          const routeRef = doc(db, 'routes', routeData.currentRouteId);
          await updateDoc(routeRef, {
            unassignedStops: updatedUnassigned,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          console.error('❌ Erro ao salvar unassignedStops:', error);
        }
      }

      toast({ title: 'Parada removida!', description: 'A parada foi removida dos serviços não alocados.' });
      return;
    }

    if (!targetRoute || !routeKey) return;

    // Find the stop to move to unassigned
    const stopToMove = targetRoute.stops.find(s => String(s.id ?? s.placeId) === stopId);
    if (!stopToMove) return;

    // Add to unassigned stops
    setUnassignedStops(prev => [...prev, stopToMove]);

    // Remove the stop from the route
    const newStops = targetRoute.stops.filter(s => String(s.id ?? s.placeId) !== stopId);

    if (newStops.length === 0) {
      // If no stops left, clear the route
      setRoute(routeKey, () => ({
        ...targetRoute,
        stops: [],
        encodedPolyline: '',
        distanceMeters: 0,
        duration: '0s'
      }));

      // Update Firestore if existing route
      if (routeData.isExistingRoute && routeData.currentRouteId) {
        try {
          const routeRef = doc(db, 'routes', routeData.currentRouteId);
          const updatedUnassigned = [...unassignedStops, stopToMove];
          await updateDoc(routeRef, {
            stops: [],
            encodedPolyline: '',
            distanceMeters: 0,
            duration: '0s',
            unassignedStops: updatedUnassigned,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          console.error('❌ Erro ao atualizar Firestore:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao salvar',
            description: 'A parada foi removida localmente, mas não foi salva no servidor.',
          });
        }
      }
      // Para serviços: salvar unassignedStops em TODAS as rotas
      else if (routeData.isService && routeData.serviceId) {
        try {
          const allRouteIds: string[] = [];
          if (serviceRouteIds.A) allRouteIds.push(serviceRouteIds.A);
          if (serviceRouteIds.B) allRouteIds.push(serviceRouteIds.B);
          dynamicRoutes.forEach(dr => {
            if (dr.firestoreId) allRouteIds.push(dr.firestoreId);
          });

          if (allRouteIds.length > 0) {
            const updatedUnassigned = [...unassignedStops, stopToMove];
            const updatePromises = allRouteIds.map(async (routeId) => {
              const routeRef = doc(db, 'routes', routeId);
              await updateDoc(routeRef, {
                unassignedStops: updatedUnassigned,
                updatedAt: serverTimestamp(),
              });
            });
            await Promise.all(updatePromises);
          }
        } catch (error) {
          console.error('❌ Erro ao salvar unassignedStops:', error);
        }
      }

      const routeName = routeKey === 'A' || routeKey === 'B' ? routeNames[routeKey] : `Rota ${routeKey}`;
      toast({ title: 'Parada movida!', description: `A parada foi movida da ${routeName} para serviços não alocados.${routeData.isExistingRoute ? ' Motorista receberá atualização.' : ''}` });
    } else {
      // Recalculate route with remaining stops
      setRoute(routeKey, prev => prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null);
      const newRouteInfo = await computeRoute(routeData.origin, newStops);
      if (newRouteInfo) {
        setRoute(routeKey, prev => prev ? { ...prev, ...newRouteInfo, stops: newStops } : null);

        // Update Firestore if existing route
        if (routeData.isExistingRoute && routeData.currentRouteId) {
          try {
            const routeRef = doc(db, 'routes', routeData.currentRouteId);
            const updatedUnassigned = [...unassignedStops, stopToMove];
            await updateDoc(routeRef, {
              stops: newStops,
              encodedPolyline: newRouteInfo.encodedPolyline,
              distanceMeters: newRouteInfo.distanceMeters,
              duration: newRouteInfo.duration,
              unassignedStops: updatedUnassigned,
              updatedAt: serverTimestamp(),
            });
          } catch (error) {
            console.error('❌ Erro ao atualizar Firestore:', error);
            toast({
              variant: 'destructive',
              title: 'Erro ao salvar',
              description: 'A parada foi removida localmente, mas não foi salva no servidor.',
            });
          }
        }
        // Para serviços: salvar unassignedStops em TODAS as rotas
        else if (routeData.isService && routeData.serviceId) {
          try {
            const allRouteIds: string[] = [];
            if (serviceRouteIds.A) allRouteIds.push(serviceRouteIds.A);
            if (serviceRouteIds.B) allRouteIds.push(serviceRouteIds.B);
            dynamicRoutes.forEach(dr => {
              if (dr.firestoreId) allRouteIds.push(dr.firestoreId);
            });

            if (allRouteIds.length > 0) {
              const updatedUnassigned = [...unassignedStops, stopToMove];
              const updatePromises = allRouteIds.map(async (routeId) => {
                const routeRef = doc(db, 'routes', routeId);
                await updateDoc(routeRef, {
                  unassignedStops: updatedUnassigned,
                  updatedAt: serverTimestamp(),
                });
              });
              await Promise.all(updatePromises);
            }
          } catch (error) {
            console.error('❌ Erro ao salvar unassignedStops:', error);
          }
        }
      }
      const routeName = routeKey === 'A' || routeKey === 'B' ? routeNames[routeKey] : `Rota ${routeKey}`;
      toast({ title: 'Parada movida!', description: `A parada foi movida da ${routeName} para serviços não alocados.${routeData.isExistingRoute ? ' Motorista receberá atualização.' : ''}` });
    }
  };

  const handleEditStop = async (stopId: string) => {
    // Find which route contains this stop
    let targetStop: PlaceValue | null = null;
    let routeKey: string = 'unassigned';
    let index = -1;

    // Check route A
    if (routeA) {
      const foundIndex = routeA.stops.findIndex(s => String(s.id ?? s.placeId) === stopId);
      if (foundIndex !== -1) {
        targetStop = routeA.stops[foundIndex];
        routeKey = 'A';
        index = foundIndex;
      }
    }

    // Check route B
    if (!targetStop && routeB) {
      const foundIndex = routeB.stops.findIndex(s => String(s.id ?? s.placeId) === stopId);
      if (foundIndex !== -1) {
        targetStop = routeB.stops[foundIndex];
        routeKey = 'B';
        index = foundIndex;
      }
    }

    // Check dynamic routes
    if (!targetStop) {
      for (const dynamicRoute of dynamicRoutes) {
        const foundIndex = dynamicRoute.data.stops.findIndex(s => String(s.id ?? s.placeId) === stopId);
        if (foundIndex !== -1) {
          targetStop = dynamicRoute.data.stops[foundIndex];
          routeKey = dynamicRoute.key;
          index = foundIndex;
          break;
        }
      }
    }

    // Check unassigned stops
    if (!targetStop) {
      const foundIndex = unassignedStops.findIndex(s => String(s.id ?? s.placeId) === stopId);
      if (foundIndex !== -1) {
        targetStop = unassignedStops[foundIndex];
        routeKey = 'unassigned';
        index = foundIndex;
      }
    }

    if (!targetStop) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Parada não encontrada.',
      });
      return;
    }

    // Populate edit form with current stop data
    setStopToEdit({ stop: targetStop, routeKey, index });
    setEditService({
      customerName: targetStop.customerName || '',
      phone: targetStop.phone || '',
      orderNumber: targetStop.orderNumber || '',
      timeWindowStart: targetStop.timeWindowStart || '',
      timeWindowEnd: targetStop.timeWindowEnd || '',
      locationLink: '',
      cep: '',
      rua: '',
      numero: '',
      complemento: targetStop.complemento || '',
      bairro: '',
      cidade: '',
      notes: targetStop.notes || '',
    });

    // Open edit dialog
    setIsEditStopDialogOpen(true);

    // Reverse geocode to get address components
    if (targetStop.lat && targetStop.lng) {
      const addressDetails = await reverseGeocode(targetStop.lat, targetStop.lng);
      if (addressDetails) {
        setEditService(prev => ({
          ...prev,
          rua: addressDetails.rua || prev.rua,
          numero: addressDetails.numero || prev.numero,
          bairro: addressDetails.bairro || prev.bairro,
          cidade: addressDetails.cidade || prev.cidade,
          cep: addressDetails.cep || prev.cep,
        }));
      }
    }
  };

  // Helper: resolver Firestore ID de uma rota pelo routeKey
  const getFirestoreRouteId = (routeKey: string): string | null => {
    if (routeData?.isExistingRoute && routeData?.currentRouteId && routeKey === 'A') {
      return routeData.currentRouteId;
    }
    if (routeData?.isService) {
      if (routeKey === 'A' || routeKey === 'B') {
        return serviceRouteIds[routeKey as 'A' | 'B'];
      }
      const dynRoute = dynamicRoutes.find(r => r.key === routeKey);
      if (dynRoute?.firestoreId) return dynRoute.firestoreId;
    }
    // Rotas adicionais usam o próprio ID como key
    const additionalRoute = additionalRoutes.find(r => r.id === routeKey);
    if (additionalRoute) return additionalRoute.id;
    return null;
  };

  const handleRemoveFromRouteTimeline = async (stop: PlaceValue, index: number, routeKey: string) => {
    if (!routeData) return;

    const targetRoute = getRoute(routeKey);
    if (!targetRoute) return;

    // Usar pendingEdits se existirem (o index vem da timeline que mostra pendingEdits)
    const currentStops = pendingEdits[routeKey] || targetRoute.stops;
    const newStops = currentStops.filter((_, i) => i !== index);
    // Limpar metadata de pendingEdits antes de salvar
    const cleanedNewStops = newStops.map(({ _originalIndex, _wasMoved, _movedFromRoute, _originalRouteColor, ...s }: any) => s as PlaceValue);

    setUnassignedStops(prev => [...prev, stop]);
    // Limpar pendingEdits desta rota (já vamos salvar direto)
    setPendingEdits(prev => ({ ...prev, [routeKey]: null }));

    const firestoreRouteId = getFirestoreRouteId(routeKey);
    console.log('🔄 [handleRemoveFromRoute] Removendo stop da rota', routeKey, '→ Firestore ID:', firestoreRouteId, '| Stop:', stop.orderNumber || stop.customerName);

    // Atualizar state local
    let routeInfo: RouteInfo | null = null;
    if (cleanedNewStops.length === 0) {
      setRoute(routeKey, () => ({
        ...targetRoute,
        stops: [],
        encodedPolyline: '',
        distanceMeters: 0,
        duration: '0s'
      }));
    } else {
      setRoute(routeKey, prev => prev ? { ...prev, stops: cleanedNewStops, encodedPolyline: '' } : null);
      routeInfo = await computeRoute(routeData.origin, cleanedNewStops);
      if (routeInfo) {
        setRoute(routeKey, prev => prev ? { ...prev, ...routeInfo!, stops: cleanedNewStops } : null);
      }
    }

    // Persistir no Firestore
    if (firestoreRouteId) {
      try {
        const routeRef = doc(db, 'routes', firestoreRouteId);

        // Detectar mudanças para notificar motorista
        let stopsToSave = cleanedNewStops;
        let routeStatus = '';
        let driverId = '';
        let changes: any[] = [];
        try {
          const currentDoc = await getDoc(routeRef);
          if (currentDoc.exists()) {
            const currentData = currentDoc.data();
            routeStatus = currentData.status || '';
            driverId = currentData.driverId || '';
            const oldStops = currentData.stops || [];
            changes = detectRouteChanges(oldStops, cleanedNewStops);
            if (changes.length > 0) {
              stopsToSave = markModifiedStops(cleanedNewStops, changes);
              console.log('📋 [handleRemoveFromRoute] Mudanças detectadas:', changes.length);
            }
          }
        } catch (changeErr) {
          console.error('⚠️ [handleRemoveFromRoute] Erro ao detectar mudanças:', changeErr);
        }

        if (stopsToSave.length === 0) {
          await updateDoc(routeRef, {
            stops: [],
            encodedPolyline: '',
            distanceMeters: 0,
            duration: '0s',
            updatedAt: serverTimestamp(),
          });
        } else if (routeInfo) {
          await updateDoc(routeRef, {
            stops: stopsToSave,
            encodedPolyline: routeInfo.encodedPolyline,
            distanceMeters: routeInfo.distanceMeters,
            duration: routeInfo.duration,
            updatedAt: serverTimestamp(),
          });
        } else {
          // computeRoute failed - save stops only
          await updateDoc(routeRef, {
            stops: stopsToSave,
            updatedAt: serverTimestamp(),
          });
        }
        console.log('✅ [handleRemoveFromRoute] Firestore atualizado com', stopsToSave.length, 'stops');

        // Notificar motorista se rota despachada/em progresso
        if (changes.length > 0 && driverId && (routeStatus === 'dispatched' || routeStatus === 'in_progress')) {
          try {
            const notifyFn = httpsCallable(functions, 'notifyRouteChanges');
            await notifyFn({ routeId: firestoreRouteId, driverId, changes });
            console.log('📢 [handleRemoveFromRoute] Motorista notificado:', changes.length, 'mudanças');
          } catch (notifyErr) {
            console.error('⚠️ [handleRemoveFromRoute] Erro ao notificar motorista:', notifyErr);
          }
        }
      } catch (error) {
        console.error('❌ [handleRemoveFromRoute] Erro ao atualizar Firestore:', error);
      }
    } else {
      console.warn('⚠️ [handleRemoveFromRoute] Sem Firestore ID para rota', routeKey, '- alteração NÃO persistida!');
    }

    toast({ title: 'Parada removida!', description: `A parada foi movida para serviços não alocados.${firestoreRouteId ? ' Salvo automaticamente.' : ''}` });
  };

  const handleDeleteStopFromTimeline = async (stop: PlaceValue, index: number, routeKey: string) => {
    if (!routeData) return;

    const targetRoute = getRoute(routeKey);
    if (!targetRoute) return;

    // Usar pendingEdits se existirem (o index vem da timeline que mostra pendingEdits)
    const currentStops = pendingEdits[routeKey] || targetRoute.stops;
    const newStops = currentStops.filter((_, i) => i !== index);
    const cleanedNewStops = newStops.map(({ _originalIndex, _wasMoved, _movedFromRoute, _originalRouteColor, ...s }: any) => s as PlaceValue);

    // Limpar pendingEdits desta rota
    setPendingEdits(prev => ({ ...prev, [routeKey]: null }));

    const firestoreRouteId = getFirestoreRouteId(routeKey);
    console.log('🗑️ [handleDeleteStop] Excluindo stop da rota', routeKey, '→ Firestore ID:', firestoreRouteId, '| Stop:', stop.orderNumber || stop.customerName);

    // Atualizar state local
    let routeInfo: RouteInfo | null = null;
    if (cleanedNewStops.length === 0) {
      setRoute(routeKey, () => ({
        ...targetRoute,
        stops: [],
        encodedPolyline: '',
        distanceMeters: 0,
        duration: '0s'
      }));
    } else {
      setRoute(routeKey, prev => prev ? { ...prev, stops: cleanedNewStops, encodedPolyline: '' } : null);
      routeInfo = await computeRoute(routeData.origin, cleanedNewStops);
      if (routeInfo) {
        setRoute(routeKey, prev => prev ? { ...prev, ...routeInfo!, stops: cleanedNewStops } : null);
      }
    }

    // Persistir no Firestore
    if (firestoreRouteId) {
      try {
        const routeRef = doc(db, 'routes', firestoreRouteId);

        // Detectar mudanças para notificar motorista
        let stopsToSave = cleanedNewStops;
        let routeStatus = '';
        let driverId = '';
        let changes: any[] = [];
        try {
          const currentDoc = await getDoc(routeRef);
          if (currentDoc.exists()) {
            const currentData = currentDoc.data();
            routeStatus = currentData.status || '';
            driverId = currentData.driverId || '';
            const oldStops = currentData.stops || [];
            changes = detectRouteChanges(oldStops, cleanedNewStops);
            if (changes.length > 0) {
              stopsToSave = markModifiedStops(cleanedNewStops, changes);
              console.log('📋 [handleDeleteStop] Mudanças detectadas:', changes.length);
            }
          }
        } catch (changeErr) {
          console.error('⚠️ [handleDeleteStop] Erro ao detectar mudanças:', changeErr);
        }

        if (stopsToSave.length === 0) {
          await updateDoc(routeRef, {
            stops: [],
            encodedPolyline: '',
            distanceMeters: 0,
            duration: '0s',
            updatedAt: serverTimestamp(),
          });
        } else if (routeInfo) {
          await updateDoc(routeRef, {
            stops: stopsToSave,
            encodedPolyline: routeInfo.encodedPolyline,
            distanceMeters: routeInfo.distanceMeters,
            duration: routeInfo.duration,
            updatedAt: serverTimestamp(),
          });
        } else {
          // computeRoute failed - save stops only
          await updateDoc(routeRef, {
            stops: stopsToSave,
            updatedAt: serverTimestamp(),
          });
        }
        console.log('✅ [handleDeleteStop] Firestore rota atualizado com', stopsToSave.length, 'stops');

        // Notificar motorista se rota despachada/em progresso
        if (changes.length > 0 && driverId && (routeStatus === 'dispatched' || routeStatus === 'in_progress')) {
          try {
            const notifyFn = httpsCallable(functions, 'notifyRouteChanges');
            await notifyFn({ routeId: firestoreRouteId, driverId, changes });
            console.log('📢 [handleDeleteStop] Motorista notificado:', changes.length, 'mudanças');
          } catch (notifyErr) {
            console.error('⚠️ [handleDeleteStop] Erro ao notificar motorista:', notifyErr);
          }
        }
      } catch (error) {
        console.error('❌ [handleDeleteStop] Erro ao atualizar Firestore:', error);
      }
    }

    // Também remover do allStops do serviço (exclusão permanente)
    if (routeData.isService && routeData.serviceId && stop.orderNumber) {
      try {
        const serviceRef = doc(db, 'services', routeData.serviceId);
        const serviceSnap = await getDoc(serviceRef);
        if (serviceSnap.exists()) {
          const svcData = serviceSnap.data();
          const allStops = (svcData.allStops || []) as PlaceValue[];
          const cleanedAllStops = allStops.filter(s => s.orderNumber !== stop.orderNumber);
          if (cleanedAllStops.length < allStops.length) {
            await updateDoc(serviceRef, {
              allStops: cleanedAllStops,
              'stats.totalDeliveries': cleanedAllStops.length,
              updatedAt: serverTimestamp(),
            });
            console.log('✅ [handleDeleteStop] Stop removido do allStops do serviço');
          }
        }
      } catch (error) {
        console.error('❌ [handleDeleteStop] Erro ao limpar allStops do serviço:', error);
      }
    }

    // Desvincular pedido no Firestore (orders) para que o Luna saiba que foi removido
    if (stop.orderNumber) {
      try {
        const ordersSnap = await getDocs(
          query(collection(db, 'orders'), where('number', '==', stop.orderNumber))
        );
        for (const orderDoc of ordersSnap.docs) {
          await updateDoc(doc(db, 'orders', orderDoc.id), {
            logisticsStatus: null,
            rotaExataServiceId: null,
            rotaExataServiceCode: null,
            rotaExataRouteId: null,
            updatedAt: serverTimestamp(),
          });
          console.log('✅ [handleDeleteStop] Pedido', stop.orderNumber, 'desvinculado do Rota Exata (orders doc:', orderDoc.id, ')');
        }
      } catch (error) {
        console.error('❌ [handleDeleteStop] Erro ao desvincular pedido:', error);
      }
    }

    const hasFirestore = !!firestoreRouteId;
    toast({ title: 'Ponto excluído!', description: `O ponto foi excluído permanentemente.${hasFirestore ? ' Salvo automaticamente.' : ''}` });
  };

  // Handler to transfer stops between routes with dialog selection
  const handleTransferStopToAnotherRoute = (stop: PlaceValue, stopIndex: number, sourceRouteId: string) => {
    setTransferData({ stop, stopIndex, sourceRouteId });
    setTransferDialogOpen(true);
  };

  const executeTransferStop = async (targetRouteId: string) => {
    if (!transferData || !routeData) return;

    const { stop, stopIndex, sourceRouteId } = transferData;

    try {
      // Find source route
      const sourceRoute = additionalRoutes.find(r => r.id === sourceRouteId);
      if (!sourceRoute) {
        toast({
          variant: 'destructive',
          title: 'Erro!',
          description: 'Rota de origem não encontrada.'
        });
        return;
      }

      // Find target route
      const targetRoute = additionalRoutes.find(r => r.id === targetRouteId);
      if (!targetRoute) {
        toast({
          variant: 'destructive',
          title: 'Erro!',
          description: 'Rota de destino não encontrada.'
        });
        return;
      }

      // Remove from source
      const newSourceStops = sourceRoute.data.stops.filter((_, i) => i !== stopIndex);

      // Add to target
      const newTargetStops = [...targetRoute.data.stops, stop];

      // Recalculate both routes
      const [newSourceRouteInfo, newTargetRouteInfo] = await Promise.all([
        newSourceStops.length > 0 ? computeRoute(routeData.origin, newSourceStops) : Promise.resolve(null),
        computeRoute(routeData.origin, newTargetStops)
      ]);

      if (!newTargetRouteInfo) {
        toast({
          variant: 'destructive',
          title: 'Erro!',
          description: 'Não foi possível calcular a rota de destino.'
        });
        return;
      }

      // Update Firestore for both routes
      const batch = [];

      // Update source route
      const sourceRouteRef = doc(db, 'routes', sourceRouteId);
      if (newSourceStops.length === 0) {
        batch.push(updateDoc(sourceRouteRef, {
          stops: [],
          encodedPolyline: '',
          distanceMeters: 0,
          duration: '0s',
        }));
      } else if (newSourceRouteInfo) {
        batch.push(updateDoc(sourceRouteRef, {
          stops: newSourceStops,
          encodedPolyline: newSourceRouteInfo.encodedPolyline,
          distanceMeters: newSourceRouteInfo.distanceMeters,
          duration: newSourceRouteInfo.duration,
        }));
      }

      // Update target route
      const targetRouteRef = doc(db, 'routes', targetRouteId);
      batch.push(updateDoc(targetRouteRef, {
        stops: newTargetStops,
        encodedPolyline: newTargetRouteInfo.encodedPolyline,
        distanceMeters: newTargetRouteInfo.distanceMeters,
        duration: newTargetRouteInfo.duration,
      }));

      await Promise.all(batch);

      // Send notifications to both drivers
      const notificationPromises = [];

      if (sourceRoute.driverId && sourceRoute.driverInfo) {
        const sourceNotifRef = collection(db, 'notifications');
        notificationPromises.push(
          addDoc(sourceNotifRef, {
            userId: sourceRoute.driverId,
            title: 'Parada removida da sua rota',
            message: `A parada "${stop.customerName || stop.address}" foi transferida para outra rota.`,
            type: 'route_update',
            routeId: sourceRouteId,
            createdAt: serverTimestamp(),
            read: false,
          })
        );
      }

      if (targetRoute.driverId && targetRoute.driverInfo) {
        const targetNotifRef = collection(db, 'notifications');
        notificationPromises.push(
          addDoc(targetNotifRef, {
            userId: targetRoute.driverId,
            title: 'Nova parada adicionada à sua rota',
            message: `A parada "${stop.customerName || stop.address}" foi adicionada à sua rota.`,
            type: 'route_update',
            routeId: targetRouteId,
            createdAt: serverTimestamp(),
            read: false,
          })
        );
      }

      await Promise.all(notificationPromises);

      // Update local state
      setAdditionalRoutes(prev => prev.map(route => {
        if (route.id === sourceRouteId) {
          return {
            ...route,
            data: newSourceRouteInfo ? {
              ...newSourceRouteInfo,
              stops: newSourceStops,
              color: route.data.color,
              visible: route.data.visible
            } : {
              ...route.data,
              stops: [],
              encodedPolyline: '',
              distanceMeters: 0,
              duration: '0s'
            }
          };
        } else if (route.id === targetRouteId) {
          return {
            ...route,
            data: {
              ...newTargetRouteInfo,
              stops: newTargetStops,
              color: route.data.color,
              visible: route.data.visible
            }
          };
        }
        return route;
      }));

      toast({
        title: 'Parada transferida!',
        description: `A parada foi movida com sucesso. Motoristas foram notificados.`
      });

      setTransferDialogOpen(false);
      setTransferData(null);

    } catch (error) {
      console.error('Erro ao transferir parada:', error);
      toast({
        variant: 'destructive',
        title: 'Erro!',
        description: 'Não foi possível transferir a parada. Tente novamente.'
      });
    }
  };

  const handleShowStopInfo = (stop: PlaceValue, index: number) => {
    setSelectedStopInfo(stop);
    setIsStopInfoDialogOpen(true);
  };

  const handleApplyPendingEdits = async (routeKey: string) => {
    if (!routeData) return;

    // Get ALL routes with pending edits (including the requested one)
    const allRoutesWithPending = Object.keys(pendingEdits).filter(k => pendingEdits[k] !== null && pendingEdits[k] !== undefined);

    console.log('🔧 [APPLY] Iniciando aplicação. Rotas com pendingEdits:', allRoutesWithPending, 'Detalhes:', allRoutesWithPending.map(k => ({
      key: k,
      stopsCount: pendingEdits[k]?.length,
      stopOrders: pendingEdits[k]?.map((s: any) => s.orderNumber).filter(Boolean),
    })));

    addDebugLog('APPLY_PENDING_EDITS', 'Starting ATOMIC apply of ALL pending edits', {
      requestedRoute: routeKey,
      allPendingRoutes: allRoutesWithPending,
      pendingRoutesCount: allRoutesWithPending.length
    });

    if (allRoutesWithPending.length === 0) {
      addDebugLog('APPLY_PENDING_EDITS', 'No pending edits found');
      return;
    }

    // Prepare ALL route updates BEFORE touching Firestore
    const routeUpdates: Array<{
      routeKey: string;
      routeId: string;
      cleanedStops: any[];
      routeInfo: RouteInfo | null;
      isNew: boolean;
    }> = [];

    // Track new routes that need to be created
    const newRoutesToCreate: Array<{
      routeKey: string;
      cleanedStops: any[];
      routeInfo: RouteInfo | null;
      dynamicRoute: { key: string; name: string; data: RouteInfo; color: string };
    }> = [];

    // Preparar dados de cada rota em paralelo (computeRoute é a parte lenta)
    const routePreparations = allRoutesWithPending.map(async (key) => {
      const pendingStops = pendingEdits[key];
      if (!pendingStops) return null;

      const route = getRoute(key);
      if (!route) {
        addDebugLog('APPLY_PENDING_EDITS', `Route ${key} not found, skipping`);
        return null;
      }

      const cleanedStops = pendingStops.map(({ _originalIndex, _wasMoved, _movedFromRoute, _originalRouteColor, ...stop }: any) => stop);

      addDebugLog('APPLY_PENDING_EDITS', `Preparing route ${key}`, { stopsCount: cleanedStops.length });

      const routeInfo = cleanedStops.length > 0
        ? await computeRoute(routeData.origin, cleanedStops)
        : null;

      return { key, route, cleanedStops, routeInfo };
    });

    const preparations = (await Promise.all(routePreparations)).filter(Boolean) as Array<{
      key: string; route: RouteInfo; cleanedStops: any[]; routeInfo: RouteInfo | null;
    }>;

    for (const { key, route, cleanedStops, routeInfo } of preparations) {

      // Determine route ID in Firestore
      let routeId: string | null = null;

      // Map local keys (A, B) to their Firestore IDs
      if (key === 'A' && routeData.isExistingRoute && routeData.currentRouteId) {
        // Route A is the current route being viewed (non-service flow)
        routeId = routeData.currentRouteId;
        addDebugLog('APPLY_PENDING_EDITS', `Mapped route A to Firestore ID (existing route)`, {
          routeKey: key,
          firestoreId: routeId
        });
      } else if ((key === 'A' || key === 'B') && routeData.isService && routeData.serviceId) {
        // Service context: routes A/B may already be saved as draft
        const existingId = serviceRouteIds[key as 'A' | 'B'];
        console.log(`🔧 [APPLY] Service route ${key}: serviceRouteIds =`, JSON.stringify(serviceRouteIds), 'existingId =', existingId);
        if (existingId) {
          routeId = existingId;
          addDebugLog('APPLY_PENDING_EDITS', `Mapped service route ${key} to existing Firestore ID`, {
            routeKey: key,
            firestoreId: routeId
          });
        } else if (cleanedStops.length > 0) {
          // Need to create this route in Firestore for the service
          const routeColor = key === 'A' ? '#e60000' : '#1fd634';
          const routeName = routeNames[key] || (key === 'A' ? 'Rota 1' : 'Rota 2');
          newRoutesToCreate.push({
            routeKey: key,
            cleanedStops,
            routeInfo,
            dynamicRoute: { key, name: routeName, data: route, color: routeColor }
          });
          addDebugLog('APPLY_PENDING_EDITS', `Service route ${key} will be CREATED in Firestore`, {
            routeKey: key,
            stopsCount: cleanedStops.length
          });
          continue;
        } else {
          addDebugLog('APPLY_PENDING_EDITS', `Service route ${key} has no stops, skipping`, { routeKey: key });
          continue;
        }
      } else if (key === 'B') {
        // Route B in non-service context - skip
        routeId = null;
        addDebugLog('APPLY_PENDING_EDITS', `Route B skipped (new route, non-service)`, {
          routeKey: key
        });
      } else {
        // Check if it's a dynamic route (C, D, E, etc.)
        const dynamicRoute = dynamicRoutes.find(r => r.key === key);
        if (dynamicRoute) {
          // Check if dynamic route was already saved to Firestore
          if (dynamicRoute.firestoreId) {
            // Already saved - update it
            routeId = dynamicRoute.firestoreId;
            addDebugLog('APPLY_PENDING_EDITS', `Dynamic route ${key} already has Firestore ID, will UPDATE`, {
              routeKey: key,
              firestoreId: routeId,
              stopsCount: cleanedStops.length
            });
            // Don't continue - let it be added to routeUpdates below
          } else if (cleanedStops.length > 0) {
            // Dynamic route not yet saved - needs to be created in Firestore
            newRoutesToCreate.push({
              routeKey: key,
              cleanedStops,
              routeInfo,
              dynamicRoute
            });
            addDebugLog('APPLY_PENDING_EDITS', `Dynamic route ${key} will be CREATED in Firestore`, {
              routeKey: key,
              stopsCount: cleanedStops.length
            });
            continue; // Don't add to routeUpdates, will be handled separately
          } else {
            addDebugLog('APPLY_PENDING_EDITS', `Dynamic route ${key} has no stops, skipping creation`, {
              routeKey: key
            });
            continue;
          }
        }

        // For additional routes (existing routes from same period), use the route ID directly
        const additionalRoute = additionalRoutes.find(r => r.id === key);
        if (additionalRoute) {
          routeId = additionalRoute.id;
          addDebugLog('APPLY_PENDING_EDITS', `Found additional route ID`, {
            routeKey: key,
            firestoreId: routeId
          });
        } else {
          addDebugLog('APPLY_PENDING_EDITS', `WARNING: Route ${key} not found in dynamicRoutes or additionalRoutes`, {
            routeKey: key,
            dynamicRoutesKeys: dynamicRoutes.map(r => r.key),
            additionalRoutesIds: additionalRoutes.map(r => r.id)
          });
        }
      }

      if (routeId) {
        routeUpdates.push({
          routeKey: key,
          routeId,
          cleanedStops,
          routeInfo,
          isNew: false
        });

        // Update local state
        setRoute(key, (prev) => prev ? {
          ...prev,
          stops: cleanedStops,
          encodedPolyline: routeInfo?.encodedPolyline || '',
          distanceMeters: routeInfo?.distanceMeters || 0,
          duration: routeInfo?.duration || '0s',
          color: route.color,
          visible: route.visible
        } : null);
      }
    }

    addDebugLog('APPLY_PENDING_EDITS', 'All routes prepared, starting Firestore operations', {
      routesToUpdate: routeUpdates.length,
      routesToCreate: newRoutesToCreate.length
    });

    // Track routes that need driver notifications
    const routesWithChanges: Array<{ routeId: string; driverId: string; changes: any[] }> = [];

    try {
      // First, create new routes (dynamic routes C, D, E, etc.)
      const createdRouteIds: Record<string, string> = {};

      for (const newRoute of newRoutesToCreate) {
        const routeDate = new Date(routeData.routeDate);
        const routeDocData: Record<string, any> = {
          name: newRoute.dynamicRoute.name,
          origin: routeData.origin,
          stops: newRoute.cleanedStops,
          encodedPolyline: newRoute.routeInfo?.encodedPolyline || '',
          distanceMeters: newRoute.routeInfo?.distanceMeters || 0,
          duration: newRoute.routeInfo?.duration || '0s',
          color: newRoute.dynamicRoute.color,
          status: 'draft',
          plannedDate: Timestamp.fromDate(routeDate),
          period: routeData.period || 'Matutino',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // Se for um serviço, adicionar serviceId e serviceCode
        if (routeData.isService && routeData.serviceId) {
          routeDocData.serviceId = routeData.serviceId;
          routeDocData.serviceCode = routeData.serviceCode;
          routeDocData.source = 'lunna';
        }

        const newRouteDoc = await addDoc(collection(db, 'routes'), routeDocData);

        createdRouteIds[newRoute.routeKey] = newRouteDoc.id;

        addDebugLog('FIRESTORE_CREATE', `✅ Created new route ${newRoute.routeKey} in Firestore`, {
          routeKey: newRoute.routeKey,
          firestoreId: newRouteDoc.id,
          stopsCount: newRoute.cleanedStops.length,
          isService: routeData.isService,
          serviceId: routeData.serviceId,
        });

        // Se for rota A ou B de um serviço, atualizar serviceRouteIds
        if ((newRoute.routeKey === 'A' || newRoute.routeKey === 'B') && routeData.isService) {
          setServiceRouteIds(prev => ({ ...prev, [newRoute.routeKey]: newRouteDoc.id }));
        }

        // Atualizar o serviço com o ID da rota
        if (routeData.isService && routeData.serviceId) {
          const serviceRef = doc(db, 'services', routeData.serviceId);
          await updateDoc(serviceRef, {
            routeIds: arrayUnion(newRouteDoc.id),
            updatedAt: serverTimestamp(),
          });
        }

        // Update local state for the dynamic route - keep in dynamicRoutes but mark with firestoreId
        setDynamicRoutes(prev => prev.map(r =>
          r.key === newRoute.routeKey
            ? {
                ...r,
                firestoreId: newRouteDoc.id,
                data: {
                  ...r.data,
                  stops: newRoute.cleanedStops,
                  encodedPolyline: newRoute.routeInfo?.encodedPolyline || '',
                  distanceMeters: newRoute.routeInfo?.distanceMeters || 0,
                  duration: newRoute.routeInfo?.duration || '0s',
                }
              }
            : r
        ));
      }

      // Then, batch update existing routes
      if (routeUpdates.length > 0) {
        const batch = writeBatch(db);

        for (const update of routeUpdates) {
          const routeRef = doc(db, 'routes', update.routeId);

          // Buscar stops atuais do Firestore para detectar mudanças e notificar motorista
          let stopsToSave = update.cleanedStops;
          try {
            const currentDoc = await getDoc(routeRef);
            if (currentDoc.exists()) {
              const currentData = currentDoc.data();
              const oldStops = currentData.stops || [];
              const changes = detectRouteChanges(oldStops, update.cleanedStops);

              if (changes.length > 0) {
                // Marcar stops modificados com flags visuais para o motorista
                stopsToSave = markModifiedStops(update.cleanedStops, changes);
                addDebugLog('CHANGE_TRACKING', `Route ${update.routeKey}: ${changes.length} changes detected`, { changes });

                // Se rota já despachada/em progresso e tem motorista, preparar notificação
                const routeStatus = currentData.status;
                const driverId = currentData.driverId;
                if (driverId && (routeStatus === 'dispatched' || routeStatus === 'in_progress')) {
                  routesWithChanges.push({ routeId: update.routeId, driverId, changes });
                }
              }
            }
          } catch (changeErr) {
            console.error('⚠️ [APPLY] Erro ao detectar mudanças para rota', update.routeKey, changeErr);
            // Continuar sem flags - melhor salvar sem flag do que não salvar
          }

          if (update.routeInfo) {
            batch.update(routeRef, {
              stops: stopsToSave,
              encodedPolyline: update.routeInfo.encodedPolyline,
              distanceMeters: update.routeInfo.distanceMeters,
              duration: update.routeInfo.duration,
              updatedAt: serverTimestamp(),
            });
            addDebugLog('FIRESTORE_BATCH', `Added route ${update.routeKey} to batch with ${stopsToSave.length} stops`);
          } else if (update.cleanedStops.length === 0) {
            // Truly empty route (all stops removed)
            batch.update(routeRef, {
              stops: [],
              encodedPolyline: '',
              distanceMeters: 0,
              duration: '0s',
              updatedAt: serverTimestamp(),
            });
            addDebugLog('FIRESTORE_BATCH', `Added route ${update.routeKey} to batch as empty`);
          } else {
            // computeRoute failed but route has stops - save stops without polyline
            batch.update(routeRef, {
              stops: stopsToSave,
              updatedAt: serverTimestamp(),
            });
            addDebugLog('FIRESTORE_BATCH', `Added route ${update.routeKey} to batch with ${stopsToSave.length} stops (no polyline - computeRoute failed)`);
          }
        }

        // Log detalhado antes do commit
        console.log('💾 [APPLY] Batch commit com', routeUpdates.length, 'rotas:', routeUpdates.map(u => ({
          key: u.routeKey,
          routeId: u.routeId,
          stopsCount: u.cleanedStops.length,
          stopOrders: u.cleanedStops.map((s: any) => s.orderNumber).filter(Boolean),
          hasRouteInfo: !!u.routeInfo,
        })));

        // Commit all changes atomically
        await batch.commit();

        console.log('✅ [APPLY] Batch commit SUCESSO!');
        addDebugLog('FIRESTORE_BATCH', '✅ ATOMIC batch commit successful', {
          routesUpdated: routeUpdates.length
        });
      }

      // Notificar motoristas das rotas que tiveram mudanças (após commit bem-sucedido)
      for (const { routeId, driverId, changes } of routesWithChanges) {
        try {
          const notifyFn = httpsCallable(functions, 'notifyRouteChanges');
          await notifyFn({ routeId, driverId, changes });
          console.log('📢 [APPLY] Motorista notificado para rota', routeId, ':', changes.length, 'mudanças');
        } catch (notifyErr) {
          console.error('⚠️ [APPLY] Erro ao notificar motorista para rota', routeId, notifyErr);
        }
      }

    } catch (error) {
      console.error('❌ Erro ao salvar edições no Firestore:', error);
      addDebugLog('FIRESTORE_ERROR', 'Firestore operation FAILED', { error });
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'As alterações foram aplicadas localmente, mas não foram salvas. Tente novamente.',
      });
      return;
    }

    // Clear ALL pending edits
    setPendingEdits(prev => {
      const newEdits = { ...prev };
      allRoutesWithPending.forEach(key => { newEdits[key] = null; });
      return newEdits;
    });

    const totalRoutesAffected = routeUpdates.length + newRoutesToCreate.length;

    addDebugLog('APPLY_PENDING_EDITS', '✅ Completed apply', {
      clearedRoutes: allRoutesWithPending,
      updatedRoutes: routeUpdates.length,
      createdRoutes: newRoutesToCreate.length
    });

    const driversNotified = routesWithChanges.length;
    toast({
      title: 'Edições aplicadas!',
      description: totalRoutesAffected > 1
        ? `${totalRoutesAffected} rotas foram atualizadas/criadas.${newRoutesToCreate.length > 0 ? ` ${newRoutesToCreate.length} nova(s) rota(s) criada(s).` : ''}${driversNotified > 0 ? ` ${driversNotified} motorista(s) notificado(s).` : ''}`
        : `Rota atualizada com sucesso.${driversNotified > 0 ? ' Motorista notificado das alterações.' : ''}`,
    });
  };

  React.useEffect(() => {
    // If all routes have been dispatched, redirect
    // Mas NÃO redirecionar se ainda não temos routeData (dados estão sendo carregados)
    // ou se é um serviço que ainda está sendo processado
    if (!isLoading && !routeA && !routeB && routeData && !routeData.isService) {
        toast({
            title: 'Todas as rotas foram despachadas!',
            description: 'Redirecionando para a página de rotas.',
        });
        sessionStorage.removeItem('newRouteData');
        setTimeout(() => router.push('/routes'), 1500);
    }
  }, [isLoading, routeA, routeB, router, toast, routeData]);

  if (isLoading && !routeData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-4">Carregando dados da rota...</span>
      </div>
    );
  }

  if (!routeData) {
    // Should be redirected by useEffect, but as a fallback:
    return (
      <div className="flex h-screen items-center justify-center">
        <p>
          Nenhum dado de rota encontrado. Por favor,{' '}
          <a href="/routes/new" className="underline">
            crie uma nova rota
          </a>
          .
        </p>
      </div>
    );
  }

  const { origin } = routeData;

  // Log para debug - ver qual origem está sendo passada para o RouteMap
  console.log('🗺️ [Render] Origem que será passada para o RouteMap:', {
    address: origin?.address,
    lat: origin?.lat,
    lng: origin?.lng,
  });

  // Mapa usa APENAS dados reais das rotas (sem pendingEdits)
  // Alterações na timeline só refletem no mapa após o usuário clicar "Aplicar"
  const combinedRoutes = [
    routeA,
    routeB,
    ...additionalRoutes
      .map((route) => ({
        ...route.data,
        visible: routeVisibility[route.id] === true
      }))
      .filter(route => route.visible),
    ...dynamicRoutes
      .filter(r => r.data.visible)
      .map(r => r.data)
  ].filter((r): r is RouteInfo => !!r && r.visible !== false);

  const toggleAdditionalRoute = (routeId: string) => {
    setRouteVisibility(prev => {
      const newVisibility = {
        ...prev,
        [routeId]: !prev[routeId]
      };
      return newVisibility;
    });
  };

  // Rotas principais (A/B) + rotas dinâmicas
  const mainRoutes = [
      { key: 'A' as const, name: routeNames.A, data: routeA, isMainRoute: true },
      { key: 'B' as const, name: routeNames.B, data: routeB, isMainRoute: true },
  ].filter((r): r is { key: 'A' | 'B'; name: string; data: RouteInfo; isMainRoute: boolean } => !!r.data)
   .concat(
     dynamicRoutes.map(r => ({ ...r, isMainRoute: true })) as any[]
   );

  // Get Firestore IDs of dynamic routes that have been saved to avoid duplicates
  const dynamicRouteFirestoreIds = new Set(
    dynamicRoutes
      .filter(r => r.firestoreId)
      .map(r => r.firestoreId)
  );

  // Rotas adicionais do período convertidas para o mesmo formato
  // Filter out any routes that are already shown as dynamic routes (to avoid duplicates)
  const additionalRoutesForTable = additionalRoutes
    .filter(route => !dynamicRouteFirestoreIds.has(route.id)) // Avoid duplicates with saved dynamic routes
    .map(route => ({
      key: route.id,
      name: route.name,
      data: route.data,
      isMainRoute: false,
      additionalRouteData: route, // Mantém referência aos dados originais
    }));

  // Tabela unificada: rotas principais primeiro, depois as adicionais
  const routesForTable = [...mainRoutes, ...additionalRoutesForTable] as any[];

  const handleRefreshDriverLocation = async (driverId: string) => {
    try {
      // Criar documento de solicitação de atualização
      const requestRef = doc(db, 'locationUpdateRequests', driverId);
      await setDoc(requestRef, {
        driverId,
        requestedAt: serverTimestamp(),
        status: 'pending',
      });

      toast({
        title: 'Atualização solicitada',
        description: 'A localização do motorista será atualizada em breve.',
      });
    } catch (error) {
      console.error('Erro ao solicitar atualização de localização:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar',
        description: 'Não foi possível solicitar a atualização da localização.',
      });
    }
  };

  return (
    <>
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden">
      <ResizableDivider
        defaultTopHeight={50}
        minTopHeight={20}
        minBottomHeight={20}
      >
        <div className="h-full bg-muted relative">
          <RouteMap
            key={`map-${origin?.lat}-${origin?.lng}`}
            ref={mapApiRef}
            height={-1}
            routes={combinedRoutes}
            origin={origin}
            unassignedStops={unassignedStops}
            onRemoveStop={handleRemoveStop}
            onEditStop={handleEditStop}
            onRefreshDriverLocation={handleRefreshDriverLocation}
            highlightedStopIds={highlightedStops}
            driverLocation={driverLocation || undefined}
            driverLocations={driverLocations}
            showTimePreferenceMarkers={showTimePreferenceMarkers}
          />
        </div>

        <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Tabs defaultValue="organize" className="w-full">
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className='flex items-center gap-4'>
                 {/* Search Bar */}
                 <div className="relative w-64">
                   <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                   <Input
                     type="search"
                     placeholder="Buscar endereços..."
                     className="h-8 pl-8 text-sm"
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                   />
                 </div>
                 {/* Toggle para visualização de pedidos com horário */}
                 <Button
                   variant={showTimePreferenceMarkers ? "default" : "outline"}
                   size="icon"
                   className="h-9 w-9 rounded-full"
                   onClick={() => setShowTimePreferenceMarkers(!showTimePreferenceMarkers)}
                   title={showTimePreferenceMarkers ? "Ocultar diferenciação de pedidos com horário" : "Mostrar diferenciação de pedidos com horário"}
                 >
                   <Clock className="h-4 w-4" />
                 </Button>

                 {/* Debug Logs Export Button */}
                 <Button
                   variant="outline"
                   size="icon"
                   className="h-9 w-9 rounded-full"
                   onClick={exportDebugLogs}
                   title="Exportar logs de debug"
                 >
                   <Bug className="h-4 w-4" />
                 </Button>

                 {/* Timeline horizontal de pontos não alocados */}
                 {unassignedStops.length > 0 && (
                   <div className="flex items-center gap-2 pl-4 border-l border-slate-300 dark:border-slate-600">
                     <span className="text-xs font-medium text-muted-foreground">Não Alocados</span>
                     <div className="flex items-center gap-2">
                       {unassignedStops.map((stop, index) => (
                         <UnassignedStopCircle
                           key={`unassigned-${stop.id ?? stop.placeId ?? index}`}
                           stop={stop}
                           index={index}
                           onOpenInfo={(id) => mapApiRef.current?.openStopInfo(id)}
                         />
                       ))}
                     </div>
                   </div>
                 )}
              </div>
              <div className='flex items-center gap-2'>
                {Object.values(pendingEdits).some(v => v !== null) && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isApplyingEdits}
                      onClick={() => {
                        // Resetar TODAS as chaves (A, B e rotas dinâmicas C, D, E...)
                        const reset: Record<string, PlaceValue[] | null> = {};
                        Object.keys(pendingEdits).forEach(k => { reset[k] = null; });
                        setPendingEdits(reset);
                        toast({ title: 'Todas as edições foram canceladas' });
                      }}
                      className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    >
                      Cancelar Todas
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isApplyingEdits}
                      onClick={async () => {
                        setIsApplyingEdits(true);
                        try {
                          // handleApplyPendingEdits já processa TODAS as rotas com pendingEdits
                          await handleApplyPendingEdits('A');
                          toast({ title: 'Todas as edições foram aplicadas com sucesso!' });
                        } catch (err) {
                          console.error('Erro ao aplicar edições:', err);
                          toast({ variant: 'destructive', title: 'Erro ao aplicar edições' });
                        } finally {
                          setIsApplyingEdits(false);
                        }
                      }}
                      className="bg-primary hover:bg-primary/90"
                    >
                      {isApplyingEdits ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      {isApplyingEdits ? 'Aplicando...' : 'Aplicar Todas as Edições'}
                    </Button>
                  </div>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="border-slate-300 dark:border-slate-600">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { requestAnimationFrame(() => setIsAddServiceDialogOpen(true)) }}>
                            <PackagePlus className="mr-2 h-4 w-4" />
                            Adicionar um serviço
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { handleAddNewRoute() }}>
                            <Truck className="mr-2 h-4 w-4" />
                            Adicionar uma rota
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  <TabsList className="bg-transparent h-auto p-0 gap-1">
                    <TabsTrigger value="organize" className="data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-primary data-[state=active]:shadow-sm px-4 py-2 rounded-md text-sm font-medium">
                      <Wand2 className="mr-2 h-4 w-4" />
                      Organizar
                    </TabsTrigger>
                    <TabsTrigger value="assign" className="data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-primary data-[state=active]:shadow-sm px-4 py-2 rounded-md text-sm font-medium">
                      <User className="mr-2 h-4 w-4" />
                      Atribuir
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <TabsContent value="organize" className="m-0">
              <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm overflow-hidden">
                   {isLoading ? (
                    <div className="flex h-48 items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    routesForTable.length > 0 ? (
                            <Table>
                            <TableHeader>
                                <TableRow className="border-b border-slate-200 dark:border-slate-800 hover:bg-transparent">
                                    <TableHead className='w-12 py-3 px-4'></TableHead>
                                    <TableHead className="py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Rota</TableHead>
                                    <TableHead className="py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Período</TableHead>
                                    <TableHead className="py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Paradas</TableHead>
                                    <TableHead className="py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Distância</TableHead>
                                    <TableHead className="py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Tempo</TableHead>
                                    <TableHead className="py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Frete R$</TableHead>
                                    <TableHead style={{ width: `${timelineWidth}%` }} className='py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400 relative'>
                                      <div className="flex items-center justify-between">
                                        <div
                                          className="absolute left-0 top-0 bottom-0 w-1 bg-border hover:bg-primary hover:w-1.5 transition-all cursor-ew-resize flex items-center justify-center group z-10"
                                          onMouseDown={handleTimelineResizeStart}
                                        >
                                          <div className="absolute inset-y-0 -left-2 -right-2" />
                                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <svg width="8" height="24" viewBox="0 0 8 24" fill="none" className="text-muted-foreground">
                                              <path d="M2 3v18M6 3v18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
                                          </div>
                                        </div>
                                        <span>Linha do Tempo</span>
                                      </div>
                                    </TableHead>
                                    <TableHead className='w-32 py-3 px-4 text-right text-sm font-semibold text-slate-600 dark:text-slate-400'>Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {routesForTable.map(routeItem => {
                                const isAdditionalRoute = !routeItem.isMainRoute;
                                const handleVisibilityToggle = isAdditionalRoute
                                  ? () => toggleAdditionalRoute(routeItem.key)
                                  : () => toggleRouteVisibility(routeItem.key);
                                const isVisible = isAdditionalRoute
                                  ? routeVisibility[routeItem.key] === true
                                  : routeItem.data.visible;
                                const handleRemove = isAdditionalRoute
                                  ? (stop: PlaceValue, index: number) => handleTransferStopToAnotherRoute(stop, index, routeItem.key)
                                  : (stop: PlaceValue, index: number) => handleRemoveFromRouteTimeline(stop, index, routeItem.key);

                                // Período para rotas adicionais
                                const additionalRoutePeriod = routeItem.additionalRouteData?.plannedDate ? (() => {
                                  const hour = routeItem.additionalRouteData.plannedDate.getHours();
                                  if (hour >= 8 && hour < 12) return 'Matutino';
                                  if (hour >= 12 && hour < 19) return 'Vespertino';
                                  return 'Noturno';
                                })() : null;
                                const period = isAdditionalRoute ? additionalRoutePeriod : routeData?.period;

                                return (
                                <TableRow key={routeItem.key} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <TableCell className="py-4 px-4 align-middle">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleVisibilityToggle}>
                                            {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </Button>
                                    </TableCell>
                                    <TableCell className="py-4 px-4 font-medium text-slate-900 dark:text-slate-100">
                                        <div className="flex items-center gap-2">
                                          <List className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                          {isAdditionalRoute ? (
                                            <span>{routeItem.name}</span>
                                          ) : (
                                            <EditableRouteName
                                              name={routeItem.name}
                                              onChange={(newName) =>
                                                  setRouteNames((prev) => ({ ...prev, [routeItem.key]: newName }))
                                              }
                                              onSave={async (newName) => {
                                                // Salvar no Firestore se for uma rota do serviço já salva
                                                if (serviceRouteIds[routeItem.key as 'A' | 'B']) {
                                                  await handleUpdateRouteName(routeItem.key as 'A' | 'B', newName);
                                                }
                                              }}
                                            />
                                          )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-4 px-4">
                                      {period && (
                                        <Badge className={`${
                                          period === 'Matutino' ? 'bg-blue-500 hover:bg-blue-600' :
                                          period === 'Vespertino' ? 'bg-orange-500 hover:bg-orange-600' :
                                          'bg-purple-500 hover:bg-purple-600'
                                        } text-white text-xs`}>
                                          {period}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="py-4 px-4 text-slate-700 dark:text-slate-300">{(pendingEdits[routeItem.key] || routeItem.data.stops).length}</TableCell>
                                    <TableCell className="py-4 px-4 text-slate-700 dark:text-slate-300">{formatDistance(routeItem.data.distanceMeters)} km</TableCell>
                                    <TableCell className="py-4 px-4 text-slate-700 dark:text-slate-300">{formatDuration(routeItem.data.duration)}</TableCell>
                                    <TableCell className="py-4 px-4 text-slate-700 dark:text-slate-300">{calculateFreightCost(routeItem.data.distanceMeters)}</TableCell>
                                    <TableCell className="py-4 px-4">
                                        <RouteTimeline
                                        key={`timeline-${routeItem.key}-${(pendingEdits[routeItem.key] || routeItem.data.stops).map(s => s.id ?? s.placeId).join('-')}`}
                                        routeKey={routeItem.key}
                                        stops={pendingEdits[routeItem.key] || routeItem.data.stops}
                                        originalStops={pendingEdits[routeItem.key] ? routeItem.data.stops : undefined}
                                        color={routeItem.data.color}
                                        dragDelay={DRAG_DELAY}
                                        onStopClick={(stop) => {
                                            const id = String(stop.id ?? stop.placeId ?? "");
                                            if (id) mapApiRef.current?.openStopInfo(id);
                                        }}
                                        onRemoveFromRoute={handleRemove}
                                        onDeleteStop={(stop, index) => handleDeleteStopFromTimeline(stop, index, routeItem.key)}
                                        onShowInfo={handleShowStopInfo}
                                        />
                                    </TableCell>
                                    <TableCell className="py-4 px-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {pendingEdits[routeItem.key] ? (
                                                <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                                                    {pendingEdits[routeItem.key]!.filter(s => (s as any)._wasMoved).length} alteraç{pendingEdits[routeItem.key]!.filter(s => (s as any)._wasMoved).length === 1 ? 'ão' : 'ões'} pendente{pendingEdits[routeItem.key]!.filter(s => (s as any)._wasMoved).length === 1 ? '' : 's'}
                                                </Badge>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleOptimizeSingleRoute(routeItem.key)}
                                                    disabled={true}
                                                    className="bg-primary/10 text-primary hover:bg-primary/20 font-medium opacity-50 cursor-not-allowed"
                                                >
                                                    {isOptimizing[routeItem.key] ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Wand2 className="mr-2 h-4 w-4" />
                                                    )}
                                                    Otimizar
                                                </Button>
                                            )}
                                            {/* Show delete button only for dynamic routes (C, D, E, etc.) */}
                                            {dynamicRoutes.some(r => r.key === routeItem.key) && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDeleteDynamicRoute(routeItem.key)}
                                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    title="Remover rota"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                                );
                            })}

                            </TableBody>
                        </Table>
                     ) : (
                        <div className="flex h-48 items-center justify-center text-muted-foreground">
                            Nenhuma rota pendente para organizar.
                        </div>
                     )
                  )}
                  {/* Seção de stops não alocados */}
                  {!isLoading && unassignedStops.length > 0 && (() => {
                    const stopsWithIssues = unassignedStops.filter(s => !s.lat || !s.lng || s.lat === 0 || s.lng === 0);
                    const stopsValid = unassignedStops.filter(s => s.lat && s.lng && s.lat !== 0 && s.lng !== 0);
                    return (
                    <div className="space-y-4 p-4 mt-4 border-t">
                        {stopsWithIssues.length > 0 && (
                        <div className="flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-amber-800 dark:text-amber-200">
                                    {stopsWithIssues.length} endereço(s) precisam de correção
                                </p>
                                <p className="text-sm text-amber-600 dark:text-amber-400">
                                    Edite os endereços abaixo para geocodificá-los. Após corrigir, arraste-os do popover para uma rota.
                                </p>
                            </div>
                        </div>
                        )}
                        {stopsValid.length > 0 && stopsWithIssues.length === 0 && (
                        <div className="flex items-center gap-2 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                            <PackagePlus className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-blue-800 dark:text-blue-200">
                                    {stopsValid.length} pedido(s) não alocado(s)
                                </p>
                                <p className="text-sm text-blue-600 dark:text-blue-400">
                                    Arraste-os do popover para uma rota.
                                </p>
                            </div>
                        </div>
                        )}
                        {stopsValid.length > 0 && stopsWithIssues.length > 0 && (
                        <div className="flex items-center gap-2 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                            <PackagePlus className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-blue-800 dark:text-blue-200">
                                    + {stopsValid.length} pedido(s) prontos para alocar
                                </p>
                                <p className="text-sm text-blue-600 dark:text-blue-400">
                                    Arraste-os do popover para uma rota.
                                </p>
                            </div>
                        </div>
                        )}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Endereço</TableHead>
                                    <TableHead>Pedido</TableHead>
                                    <TableHead className="w-[100px]">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {unassignedStops.map((stop, index) => (
                                    <TableRow key={stop.id || index}>
                                        <TableCell className="font-medium">{index + 1}</TableCell>
                                        <TableCell>{stop.customerName || 'N/A'}</TableCell>
                                        <TableCell className="max-w-[300px] truncate" title={stop.address || stop.addressString}>
                                            {stop.address || stop.addressString || 'Endereço não informado'}
                                        </TableCell>
                                        <TableCell>{stop.orderNumber || 'N/A'}</TableCell>
                                        <TableCell>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEditStop(String(stop.id ?? stop.placeId))}
                                            >
                                                <Pencil className="h-3 w-3 mr-1" />
                                                Editar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    );
                  })()}
                </div>
            </TabsContent>

            <TabsContent value="assign" className="m-0">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {routesForTable.length > 0 ? routesForTable.map(routeItem => {
                  const driver = availableDrivers.find(d => d.id === assignedDrivers[routeItem.key]);
                  const isSavingRoute = isSaving[routeItem.key];

                  return (
                    <Card key={routeItem.key}>
                      <CardHeader>
                        <CardTitle>{routeItem.name}</CardTitle>
                        <CardDescription>
                          {routeItem.data.stops.length} paradas • {formatDistance(routeItem.data.distanceMeters)} km • {formatDuration(routeItem.data.duration)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Motorista</label>
                          <Select
                            value={assignedDrivers[routeItem.key] || ''}
                            onValueChange={(driverId) => handleAssignDriver(routeItem.key, driverId)}
                            disabled={isSavingRoute}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Escolha um motorista disponível..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableDrivers.map((driver) => (
                                <SelectItem key={driver.id} value={driver.id}>
                                  <div className="flex items-center gap-3">
                                    <Avatar className='h-6 w-6'>
                                      <AvatarImage src={driver.avatarUrl} alt={driver.name} />
                                      <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span>{driver.name}</span>
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      {driver.vehicle.type}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {driver && (
                          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/50">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Motorista Selecionado</span>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={driver.avatarUrl} alt={driver.name} />
                                <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{driver.name}</span>
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Data do Início: {routeData.routeDate ? format(new Date(routeData.routeDate), 'dd/MM/yyyy', { locale: ptBR }) : '--'} às {routeData.routeTime}
                        </div>
                      </CardContent>
                      <CardFooter className="flex gap-2">
                        {routeData?.isExistingRoute ? (
                          <Button
                            className="w-full"
                            onClick={() => handleUpdateExistingRoute(routeItem.key)}
                            disabled={isSavingRoute || !driver}
                          >
                            {isSavingRoute ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                            {isSavingRoute ? 'Salvando...' : 'Salvar Alterações'}
                          </Button>
                        ) : (
                          <Button
                            className="w-full"
                            onClick={() => handleDispatchRoute(routeItem.key)}
                            disabled={isSavingRoute || !driver}
                          >
                            {isSavingRoute ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                            {isSavingRoute ? 'Despachando...' : 'Despachar Rota'}
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  )
                }) : (
                  <div className="lg:col-span-2 flex h-48 items-center justify-center text-muted-foreground">
                    Nenhuma rota pendente para atribuir.
                  </div>
                )}
              </div>
            </TabsContent>

          </div>
          <DragOverlay
            dropAnimation={{
              sideEffects: defaultDropAnimationSideEffects({
                styles: {
                  active: {
                    opacity: '0.5',
                  },
                },
              }),
            }}
          >
            {activeId && activeStop && activeIndex !== null ? (
              <div
                className={`flex h-6 w-6 cursor-grabbing items-center justify-center rounded-md border text-xs font-semibold shadow-lg ${
                  activeStop.isManuallyAdded
                    ? 'border-green-300 bg-green-100 text-green-700'
                    : (activeStop as any)._wasMoved
                    ? 'border-amber-400 bg-amber-100 text-amber-900'
                    : 'border-gray-300 bg-gray-100 text-gray-700'
                }`}
              >
                {((activeStop as any)._originalIndex ?? activeIndex) + 1}
              </div>
            ) : null}
          </DragOverlay>
        </Tabs>
        </DndContext>
        </div>
      </ResizableDivider>
    </div>
    <Dialog open={isAddServiceDialogOpen} onOpenChange={setIsAddServiceDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Serviço</DialogTitle>
            <DialogDescription>
              Preencha os detalhes do serviço. O endereço será validado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-6">
            <div className="space-y-2">
                <Label htmlFor="route-selection">Adicionar à Rota</Label>
                <Select value={selectedRouteForNewService} onValueChange={(value: 'A' | 'B' | 'unassigned') => setSelectedRouteForNewService(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma rota..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Não alocado (adicionar depois)</SelectItem>
                    {routeA && <SelectItem value="A">{routeNames.A}</SelectItem>}
                    {routeB && <SelectItem value="B">{routeNames.B}</SelectItem>}
                  </SelectContent>
                </Select>
            </div>
            <Separator />
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
                    <div className="flex gap-2">
                      <Input id="cep" value={manualService.cep} onChange={handleManualServiceChange} placeholder="00000-000" />
                      <Button type="button" variant="outline" size="icon" onClick={handleSearchCepForManual} disabled={!manualService.cep || manualService.cep.replace(/\D/g, '').length !== 8}>
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
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
            <Button onClick={handleAddService}>Salvar Serviço</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop Info Dialog */}
      <Dialog open={isStopInfoDialogOpen} onOpenChange={setIsStopInfoDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Parada</DialogTitle>
            <DialogDescription>
              Informações completas do serviço
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Cliente</span>
              <span className="text-sm">{selectedStopInfo?.customerName || '-'}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Pedido</span>
              <span className="text-sm">{selectedStopInfo?.orderNumber || '-'}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Telefone</span>
              <span className="text-sm">{selectedStopInfo?.phone || '-'}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Janela</span>
              <span className="text-sm">
                {selectedStopInfo?.timeWindowStart && selectedStopInfo?.timeWindowEnd
                  ? `${selectedStopInfo.timeWindowStart} - ${selectedStopInfo.timeWindowEnd}`
                  : '-'}
              </span>
            </div>
            <Separator />
            <div className="grid grid-cols-[100px_1fr] items-start gap-4">
              <span className="text-sm font-medium text-muted-foreground">Endereço</span>
              <p className="text-sm">{selectedStopInfo?.address || '-'}</p>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-start gap-4">
              <span className="text-sm font-medium text-muted-foreground">Complemento</span>
              <p className="text-sm">{selectedStopInfo?.complemento || '-'}</p>
            </div>
            <Separator />
            <div className="grid grid-cols-[100px_1fr] items-start gap-4">
              <span className="text-sm font-medium text-muted-foreground">Observações</span>
              <p className="text-sm italic">{selectedStopInfo?.notes || '-'}</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Fechar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Stop Dialog */}
      <Dialog open={isEditStopDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setStopToEdit(null);
          setEditService({
            customerName: '',
            phone: '',
            orderNumber: '',
            timeWindowStart: '',
            timeWindowEnd: '',
            locationLink: '',
            cep: '',
            rua: '',
            numero: '',
            complemento: '',
            bairro: '',
            cidade: '',
            notes: '',
          });
        }
        setIsEditStopDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Serviço</DialogTitle>
            <DialogDescription>
              Atualize os detalhes do serviço. O endereço será validado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label htmlFor="customerName">Nome do Cliente</Label>
                  <Input id="customerName" value={editService.customerName} onChange={handleEditServiceChange} placeholder="Nome do Cliente" />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="orderNumber">Nº Pedido</Label>
                  <Input id="orderNumber" value={editService.orderNumber} onChange={handleEditServiceChange} placeholder="Ex: 12345" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" value={editService.phone} onChange={handleEditServiceChange} placeholder="(00) 90000-0000" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cep">CEP</Label>
                    <div className="flex gap-2">
                      <Input id="cep" value={editService.cep} onChange={handleEditServiceChange} placeholder="00000-000" />
                      <Button type="button" variant="outline" size="icon" onClick={handleSearchCepForEdit} disabled={!editService.cep || editService.cep.replace(/\D/g, '').length !== 8}>
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="locationLink">Link Localização (Google Maps)</Label>
                <Input id="locationLink" value={editService.locationLink} onChange={handleEditServiceChange} placeholder="Cole o link do Google Maps aqui" />
            </div>

            {/* Mapa para ajuste fino da localização */}
            {showEditMap && editService.lat && editService.lng && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Ajustar Localização no Mapa</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant={editMapType === 'roadmap' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditMapType('roadmap')}
                      className="h-7 px-2 text-xs"
                    >
                      Mapa
                    </Button>
                    <Button
                      type="button"
                      variant={editMapType === 'hybrid' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditMapType('hybrid')}
                      className="h-7 px-2 text-xs"
                    >
                      Satélite
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Arraste o marcador para ajustar a posição exata</p>
                <div className="w-full h-[300px] rounded-md overflow-hidden border">
                  {!isMapLoaded ? (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={{ lat: editService.lat, lng: editService.lng }}
                      zoom={18}
                      options={{
                        mapTypeId: editMapType,
                        streetViewControl: false,
                        fullscreenControl: false,
                        mapTypeControl: false,
                      }}
                    >
                      <Marker
                        position={{ lat: editService.lat, lng: editService.lng }}
                        draggable={true}
                        onDragEnd={(e) => {
                          if (e.latLng) {
                            setEditService(prev => ({
                              ...prev,
                              lat: e.latLng!.lat(),
                              lng: e.latLng!.lng(),
                            }));
                            toast({
                              title: "Posição atualizada",
                              description: "O marcador foi movido para a nova posição.",
                            });
                          }
                        }}
                      />
                    </GoogleMap>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEditMap(false)}
                  >
                    Ocultar Mapa
                  </Button>
                  <div className="text-xs text-muted-foreground flex items-center">
                    Lat: {editService.lat.toFixed(6)}, Lng: {editService.lng.toFixed(6)}
                  </div>
                </div>
              </div>
            )}

            <Separator className="my-4" />
            <div className="space-y-2">
                <Label htmlFor="rua">Rua</Label>
                <Input id="rua" value={editService.rua} onChange={handleEditServiceChange} placeholder="Avenida, Rua, etc." />
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 space-y-2">
                    <Label htmlFor="numero">Número</Label>
                    <Input id="numero" value={editService.numero} onChange={handleEditServiceChange} placeholder="123" />
                </div>
                <div className="col-span-2 space-y-2">
                    <Label htmlFor="complemento">Complemento</Label>
                    <Input id="complemento" value={editService.complemento} onChange={handleEditServiceChange} placeholder="Apto, Bloco, etc." />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="bairro">Bairro</Label>
                    <Input id="bairro" value={editService.bairro} onChange={handleEditServiceChange} placeholder="Setor, Bairro" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade</Label>
                    <Input id="cidade" value={editService.cidade} onChange={handleEditServiceChange} placeholder="Goiânia" />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="timeWindowStart">Início da Janela</Label>
                    <Input id="timeWindowStart" type="time" value={editService.timeWindowStart} onChange={handleEditServiceChange} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="timeWindowEnd">Fim da Janela</Label>
                    <Input id="timeWindowEnd" type="time" value={editService.timeWindowEnd} onChange={handleEditServiceChange} />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" value={editService.notes} onChange={handleEditServiceChange} placeholder="Detalhes sobre a entrega, ponto de referência..." />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSaveEditedService}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Stop Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Transferir Parada para Outra Rota</DialogTitle>
            <DialogDescription>
              Escolha para qual rota você deseja transferir a parada "{transferData?.stop.customerName || transferData?.stop.address}".
              Os motoristas de ambas as rotas serão notificados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rotas Disponíveis</Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {additionalRoutes
                  .filter(route => route.id !== transferData?.sourceRouteId)
                  .map((route, idx) => (
                    <Button
                      key={route.id}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3"
                      onClick={() => executeTransferStop(route.id)}
                    >
                      <div className="flex flex-col gap-1 w-full">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Rota {additionalRoutes.findIndex(r => r.id === route.id) + 2}</span>
                          <Badge variant="secondary">{route.data.stops.length} paradas</Badge>
                        </div>
                        {route.driverInfo && (
                          <span className="text-sm text-muted-foreground">
                            Motorista: {route.driverInfo.name}
                          </span>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {formatDistance(route.data.distanceMeters)} km • {formatDuration(route.data.duration)}
                        </span>
                      </div>
                    </Button>
                  ))}
                {additionalRoutes.filter(route => route.id !== transferData?.sourceRouteId).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma outra rota disponível no período
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para escolher tipo de atualização de coordenadas */}
      <Dialog open={showCoordinateUpdateDialog} onOpenChange={setShowCoordinateUpdateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atualizar Localização</DialogTitle>
            <DialogDescription>
              Como você deseja atualizar a localização deste ponto?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Button
              onClick={handleUpdateCoordinatesOnly}
              variant="outline"
              className="w-full justify-start text-left h-auto py-2"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">Atualizar apenas o alfinete</div>
                  <div className="text-xs text-muted-foreground">Manter o endereço atual</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={handleUpdateFullAddress}
              variant="outline"
              className="w-full justify-start text-left h-auto py-2"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                    <path d="M12 2v8"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">Atualizar endereço completo</div>
                  <div className="text-xs text-muted-foreground">Buscar novo endereço</div>
                </div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => {
              setShowCoordinateUpdateDialog(false);
              setPendingCoordinates(null);
            }}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

    