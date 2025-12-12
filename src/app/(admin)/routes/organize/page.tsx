
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { PlaceValue, RouteInfo, Driver, DriverLocationWithInfo } from '@/lib/types';
import { useRouter } from 'next/navigation';
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
import { generateRouteCode } from '@/lib/firebase/route-code';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, getDocs, Timestamp, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
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
  existingRouteData?: {
    distanceMeters: number;
    duration: string;
    encodedPolyline: string;
    color: string;
  };
  // Campos para rascunho
  isDraft?: boolean;
  draftRouteId?: string;
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

// Ordenar paradas por proximidade, priorizando pontos com preferência de horário
// Pontos com hasTimePreference=true são colocados no início da rota
const sortByProximityWithPriority = (stops: PlaceValue[], origin: PlaceValue): PlaceValue[] => {
  if (stops.length === 0) return [];

  // Separar paradas com e sem preferência de horário
  const stopsWithTimePreference = stops.filter(s => s.hasTimePreference === true);
  const stopsWithoutTimePreference = stops.filter(s => s.hasTimePreference !== true);

  console.log(`🕐 Priorizando: ${stopsWithTimePreference.length} pontos com horário, ${stopsWithoutTimePreference.length} sem horário`);

  // Função auxiliar para ordenar por nearest neighbor
  const sortNearest = (stopsToSort: PlaceValue[], startPoint: PlaceValue): PlaceValue[] => {
    if (stopsToSort.length === 0) return [];

    const sorted: PlaceValue[] = [];
    const remaining = [...stopsToSort];
    let current = startPoint;

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let minDistance = getDistance(current, remaining[0]);

      for (let i = 1; i < remaining.length; i++) {
        const distance = getDistance(current, remaining[i]);
        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
        }
      }

      const nearest = remaining.splice(nearestIndex, 1)[0];
      sorted.push(nearest);
      current = nearest;
    }

    return sorted;
  };

  // Primeiro: ordenar pontos com preferência de horário por proximidade da origem
  const sortedWithTimePreference = sortNearest(stopsWithTimePreference, origin);

  // Depois: ordenar os demais pontos, começando do último ponto com preferência de horário
  // (ou da origem se não houver pontos com preferência)
  const lastPoint = sortedWithTimePreference.length > 0
    ? sortedWithTimePreference[sortedWithTimePreference.length - 1]
    : origin;
  const sortedWithoutTimePreference = sortNearest(stopsWithoutTimePreference, lastPoint);

  // Combinar: primeiro os com preferência de horário, depois os demais
  return [...sortedWithTimePreference, ...sortedWithoutTimePreference];
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unassigned-${stop.id ?? stop.placeId ?? index}`,
    data: { routeKey: 'unassigned', index, stop },
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="text-left text-sm p-2 rounded-md hover:bg-muted border border-dashed border-gray-300 cursor-grab active:cursor-grabbing"
      onClick={(e) => {
        if (!isDragging) {
          onOpenInfo(String(stop.id));
        }
      }}
    >
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-black" />
        <span className="flex-1 truncate">{stop.customerName || stop.address}</span>
      </div>
    </div>
  );
};

const EditableRouteName: React.FC<{
  name: string;
  onChange: (newName: string) => void;
}> = ({ name, onChange }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [currentName, setCurrentName] = React.useState(name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    onChange(currentName);
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
        <Input
          ref={inputRef}
          value={currentName}
          onChange={(e) => setCurrentName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="h-8"
        />
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

export default function OrganizeRoutePage() {
  const router = useRouter();
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
  const [highlightedStops, setHighlightedStops] = React.useState<string[]>([]);
  const [driverLocation, setDriverLocation] = React.useState<{lat: number; lng: number; heading?: number} | null>(null);
  const [driverLocations, setDriverLocations] = React.useState<DriverLocationWithInfo[]>([]);

  // State for additional routes from same period
  const [additionalRoutes, setAdditionalRoutes] = React.useState<RouteInfo[]>([]);
  const [routeVisibility, setRouteVisibility] = React.useState<Record<string, boolean>>({});

  // State for dynamic routes (C, D, E, etc.)
  const [dynamicRoutes, setDynamicRoutes] = React.useState<Array<{
    key: string;
    name: string;
    data: RouteInfo;
    color: string;
  }>>([]);

  // State for pending edits (reordering within same route)
  const [pendingEdits, setPendingEdits] = React.useState<{
    A: PlaceValue[] | null;
    B: PlaceValue[] | null;
  }>({ A: null, B: null });


  // State for Add Service Dialog
  const [isAddServiceDialogOpen, setIsAddServiceDialogOpen] = React.useState(false);
  const [selectedRouteForNewService, setSelectedRouteForNewService] = React.useState<'A' | 'B' | 'unassigned'>('unassigned');
  const [manualService, setManualService] = React.useState({
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
  });

  // State for Stop Info Dialog
  const [isStopInfoDialogOpen, setIsStopInfoDialogOpen] = React.useState(false);
  const [selectedStopInfo, setSelectedStopInfo] = React.useState<PlaceValue | null>(null);

  // State for Edit Stop Dialog
  const [isEditStopDialogOpen, setIsEditStopDialogOpen] = React.useState(false);
  const [stopToEdit, setStopToEdit] = React.useState<{ stop: PlaceValue; routeKey: 'A' | 'B' | 'unassigned'; index: number } | null>(null);
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
        })
      });
      setAvailableDrivers(driversData);
    });

    return () => unsubscribe();
  }, []);

  // Buscar localizações dos motoristas em tempo real a partir das rotas ativas
  React.useEffect(() => {
    console.log('🚦 Listener de localizações:', {
      availableDriversCount: availableDrivers.length,
      willStart: availableDrivers.length > 0
    });

    if (availableDrivers.length === 0) {
      console.warn('⚠️ Listener de localizações NÃO iniciado - nenhum motorista disponível');
      return;
    }

    // Buscar rotas que estão em progresso ou despachadas
    const routesQuery = query(
      collection(db, 'routes'),
      where('status', 'in', ['in_progress', 'dispatched'])
    );

    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      const locationsMap = new Map<string, DriverLocationWithInfo>();
      const now = new Date();

      console.log('🔍 Total de rotas ativas encontradas:', snapshot.size);

      snapshot.forEach((routeDoc) => {
        const routeData = routeDoc.data();
        console.log(`📋 Rota ${routeDoc.id}:`, {
          hasCurrentLocation: !!routeData.currentLocation,
          hasDriverInfo: !!routeData.driverInfo,
          status: routeData.status,
          driverId: routeData.driverId,
          currentLocation: routeData.currentLocation,
          driverInfo: routeData.driverInfo
        });

        // Verificar se há localização atual, informações do motorista e driverId
        if (routeData.currentLocation && routeData.driverInfo && routeData.driverId) {
          const currentLoc = routeData.currentLocation;

          const timestamp = currentLoc.timestamp?.toDate?.() || new Date(0);
          const minutesAgo = Math.floor((Date.now() - timestamp.getTime()) / 1000 / 60);

          console.log(`⏰ Timestamp da localização (rota ${routeDoc.id}):`, {
            timestamp: timestamp.toLocaleString('pt-BR'),
            minutesAgo: `${minutesAgo} minutos atrás`,
            status: routeData.status
          });

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

          const location: DriverLocationWithInfo = {
            driverId: routeData.driverId, // Usar driverId real, não o ID da rota
            driverName: routeData.driverInfo.name,
            lat: currentLoc.lat,
            lng: currentLoc.lng,
            accuracy: currentLoc.accuracy || 0,
            heading: currentLoc.heading,
            speed: currentLoc.speed,
            timestamp: timestamp,
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
              console.log(`🔄 Atualizando localização mais recente de ${routeData.driverInfo.name}`);
            }
          }
        }
      });

      const locations = Array.from(locationsMap.values());
      console.log('🚚 Localizações únicas de motoristas (após filtro):', locations);
      setDriverLocations(locations);
    });

    return () => unsubscribe();
  }, [availableDrivers]);

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

        const q = query(
          collection(db, 'routes'),
          where('plannedDate', '>=', dayStart),
          where('plannedDate', '<=', dayEnd)
        );

        const querySnapshot = await getDocs(q);
        const routes: RouteInfo[] = [];
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
            console.log('🚫 Pulando rota atual:', doc.id);
            return;
          }

          const routeDoc = doc.data();

          // Skip completed or finished routes
          if (routeDoc.status === 'completed' || routeDoc.status === 'completed_auto' || routeDoc.status === 'finished') {
            console.log('🚫 Pulando rota finalizada:', doc.id, 'Status:', routeDoc.status);
            return;
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

          routes.push(routeInfo);
          visibility[doc.id] = false; // Hidden by default
        });

        console.log('📍 Rotas adicionais carregadas:', routes.length);
        setAdditionalRoutes(routes);
        setRouteVisibility(visibility);
      } catch (error) {
        console.error('Error loading additional routes:', error);
      }
    };

    loadAdditionalRoutes();
  }, [routeData?.routeDate]);

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

          console.log('📍 Localização do motorista atualizada:', {
            driverId: data.driverId,
            driverName: data.driverInfo.name,
            location
          });
        }
      }
    }, (error) => {
      console.error('Erro ao escutar localização:', error);
    });

    return () => unsubscribe();
  }, [routeData?.isExistingRoute, routeData?.currentRouteId]);

  React.useEffect(() => {
    const storedData = sessionStorage.getItem('newRouteData');

    if (storedData) {
      const parsedData: RouteData = JSON.parse(storedData);
      setRouteData(parsedData);

      // Se for uma rota existente, buscar dados atualizados do Firestore
      if (parsedData.isExistingRoute && parsedData.currentRouteId) {
        const loadRouteFromFirestore = async () => {
          setIsLoading(true);
          try {
            const routeRef = doc(db, 'routes', parsedData.currentRouteId!);
            const routeSnap = await getDoc(routeRef);

            if (routeSnap.exists()) {
              const routeData = routeSnap.data();
              console.log('📥 Dados carregados do Firestore:', {
                stops: routeData.stops.length,
                distanceMeters: routeData.distanceMeters,
                duration: routeData.duration
              });

              // Usar dados do Firestore ao invés do sessionStorage
              const allStops = routeData.stops.filter((s: PlaceValue) => s.id && s.lat && s.lng);
              setRouteA({
                stops: allStops,
                distanceMeters: routeData.distanceMeters,
                duration: routeData.duration,
                encodedPolyline: routeData.encodedPolyline,
                color: routeData.color || parsedData.existingRouteData?.color || '#e60000',
                visible: true,
              });
              setRouteB(null); // Não tem segunda rota
            } else {
              console.error('❌ Rota não encontrada no Firestore');
              // Fallback para dados do sessionStorage
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
      } else if (parsedData.isDraft && parsedData.draftRouteId) {
        // Rota rascunho - usar dados do sessionStorage (já salvos no Firestore)
        // Os dados já estão corretos no sessionStorage, apenas dividir geograficamente
        const allStops = parsedData.stops.filter((s) => s.id && s.lat && s.lng);
        const MAX_STOPS_PER_ROUTE = 25;

        console.log(`📍 Rascunho - Origem: lat=${parsedData.origin.lat}, lng=${parsedData.origin.lng}`);
        console.log(`📦 Total de paradas: ${allStops.length}`);

        // Dividir paradas em Norte e Sul usando a latitude da origem como linha divisória
        const stopsNorte = allStops.filter(stop => stop.lat >= parsedData.origin.lat);
        const stopsSul = allStops.filter(stop => stop.lat < parsedData.origin.lat);

        console.log(`🧭 Divisão geográfica: Norte (${stopsNorte.length}), Sul (${stopsSul.length})`);

        // Ordenar cada grupo por proximidade, priorizando pontos com preferência de horário
        const sortedNorte = sortByProximityWithPriority(stopsNorte, parsedData.origin);
        const sortedSul = sortByProximityWithPriority(stopsSul, parsedData.origin);

        // Determinar qual grupo vai para qual rota baseado no tamanho
        // Rota A fica com o grupo maior (ou Norte se igual)
        let routeAStops: PlaceValue[];
        let routeBStops: PlaceValue[];

        if (sortedNorte.length >= sortedSul.length) {
          routeAStops = sortedNorte.slice(0, MAX_STOPS_PER_ROUTE);
          routeBStops = sortedSul.slice(0, MAX_STOPS_PER_ROUTE);
        } else {
          routeAStops = sortedSul.slice(0, MAX_STOPS_PER_ROUTE);
          routeBStops = sortedNorte.slice(0, MAX_STOPS_PER_ROUTE);
        }

        // Calcular rotas
        const calculateRoutes = async () => {
          setIsLoading(true);
          try {
            if (routeAStops.length > 0) {
              const routeAInfo = await computeRoute(parsedData.origin, routeAStops);
              if (routeAInfo) {
                setRouteA({ ...routeAInfo, color: '#e60000', visible: true });
              }
            }

            if (routeBStops.length > 0) {
              const routeBInfo = await computeRoute(parsedData.origin, routeBStops);
              if (routeBInfo) {
                setRouteB({ ...routeBInfo, color: '#0066cc', visible: true });
              }
            } else {
              setRouteB(null);
            }

            // Paradas que não couberam em nenhuma rota
            const extraNorte = sortedNorte.slice(MAX_STOPS_PER_ROUTE);
            const extraSul = sortedSul.slice(MAX_STOPS_PER_ROUTE);
            if (extraNorte.length > 0 || extraSul.length > 0) {
              setUnassignedStops([...extraNorte, ...extraSul]);
            }
          } finally {
            setIsLoading(false);
          }
        };

        calculateRoutes();
      } else {
        // Rota nova - dividir geograficamente usando origem como referência
        const allStops = parsedData.stops.filter((s) => s.id && s.lat && s.lng);
        const MAX_STOPS_PER_ROUTE = 25;

        console.log(`📍 Origem: lat=${parsedData.origin.lat}, lng=${parsedData.origin.lng}`);
        console.log(`📦 Total de paradas: ${allStops.length}`);

        // Dividir paradas em Norte e Sul usando a latitude da origem como linha divisória
        const stopsNorte = allStops.filter(stop => stop.lat >= parsedData.origin.lat);
        const stopsSul = allStops.filter(stop => stop.lat < parsedData.origin.lat);

        console.log(`🧭 Divisão geográfica: Norte (${stopsNorte.length}), Sul (${stopsSul.length})`);

        // Ordenar cada região por proximidade, priorizando pontos com preferência de horário
        const stopsNorteOrdenadas = sortByProximityWithPriority(stopsNorte, parsedData.origin);
        const stopsSulOrdenadas = sortByProximityWithPriority(stopsSul, parsedData.origin);

        // Verificar se alguma região excede o limite
        let stopsA: PlaceValue[] = [];
        let stopsB: PlaceValue[] = [];

        if (stopsNorteOrdenadas.length <= MAX_STOPS_PER_ROUTE && stopsSulOrdenadas.length <= MAX_STOPS_PER_ROUTE) {
          // Divisão perfeita - Norte na Rota A, Sul na Rota B
          stopsA = stopsNorteOrdenadas;
          stopsB = stopsSulOrdenadas;
          console.log(`✅ Divisão perfeita: Rota A (Norte: ${stopsA.length}), Rota B (Sul: ${stopsB.length})`);
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

          console.log(`✅ Divisão ajustada: Rota A (${stopsA.length} paradas), Rota B (${stopsB.length} paradas)`);
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
          setIsLoading(false);
        };

        calculateRoutes();
      }
    } else {
      router.push('/routes/new');
    }
  }, [router]);

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
        toast({ title: 'Serviço Atualizado!', description: 'As informações do serviço foram atualizadas.' });
      } else {
        // Para stops em uma rota, precisa do routeData
        if (!routeData) {
          toast({ variant: 'destructive', title: 'Erro', description: 'Dados da rota não encontrados.' });
          return;
        }

        const targetRoute = stopToEdit.routeKey === 'A' ? routeA : routeB;
        const setter = stopToEdit.routeKey === 'A' ? setRouteA : setRouteB;

        if (!targetRoute) return;

        const updatedStops = [...targetRoute.stops];
        updatedStops[stopToEdit.index] = updatedStop;

        // Recalculate route
        const newRouteInfo = await computeRoute(routeData.origin, updatedStops);
        if (newRouteInfo) {
          setter(prev => prev ? {
            ...prev,
            ...newRouteInfo,
            stops: updatedStops,
            color: targetRoute.color,
            visible: targetRoute.visible
          } : null);
        }

        toast({ title: 'Serviço Atualizado!', description: 'A rota foi recalculada com as novas informações.' });
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
    const { rua, numero, bairro, cidade, cep } = manualService;
    if (!rua || !bairro || !cidade) {
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

    const geocoded = await geocodeAddress(addressString);

    if (geocoded) {
      const newStop: PlaceValue = {
        ...geocoded,
        id: `manual-${Date.now()}`,
        address: geocoded.address,
        customerName: manualService.customerName,
        phone: manualService.phone,
        notes: manualService.notes,
        isNewlyAdded: true, // Marcar como recém-adicionado
      };

      // Add to selected route or unassigned
      if (selectedRouteForNewService === 'unassigned') {
        setUnassignedStops(prev => [...prev, newStop]);
        toast({
          title: 'Serviço Adicionado!',
          description: 'O novo serviço está na lista de não alocados.',
        });

        // Remover a marcação de "recém-adicionado" após 10 segundos
        setTimeout(() => {
          setUnassignedStops(prev => prev.map(stop =>
            stop.id === newStop.id ? { ...stop, isNewlyAdded: false } : stop
          ));
        }, 10000);
      } else {
        // Add to route A or B and recalculate
        const targetRoute = selectedRouteForNewService === 'A' ? routeA : routeB;
        const setter = selectedRouteForNewService === 'A' ? setRouteA : setRouteB;

        if (!targetRoute || !routeData) {
          toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Rota não encontrada.',
          });
          return;
        }

        const newStops = [...targetRoute.stops, newStop];
        setter(prev => prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null);

        // Recalculate route
        const newRouteInfo = await computeRoute(routeData.origin, newStops);
        if (newRouteInfo) {
          setter(prev => prev ? { ...prev, ...newRouteInfo, stops: newStops, color: targetRoute.color, visible: targetRoute.visible } : null);

          // If this is an existing route, update Firestore so driver app receives the update
          if (routeData.isExistingRoute && routeData.currentRouteId) {
            try {
              const routeRef = doc(db, 'routes', routeData.currentRouteId);
              await updateDoc(routeRef, {
                stops: newStops,
                encodedPolyline: newRouteInfo.encodedPolyline,
                distanceMeters: newRouteInfo.distanceMeters,
                duration: newRouteInfo.duration,
              });
              console.log('✅ Rota atualizada no Firestore com novo ponto');
            } catch (error) {
              console.error('Erro ao atualizar rota no Firestore:', error);
              toast({
                variant: 'destructive',
                title: 'Aviso',
                description: 'O ponto foi adicionado localmente, mas pode não sincronizar com o app do motorista.',
              });
            }
          }
        }

        toast({
          title: 'Serviço Adicionado!',
          description: `O serviço foi adicionado à ${routeNames[selectedRouteForNewService]}.${routeData.isExistingRoute ? ' O motorista receberá a atualização.' : ''}`,
        });

        // Remover a marcação de "recém-adicionado" após 10 segundos
        setTimeout(() => {
          setter(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              stops: prev.stops.map(stop =>
                stop.id === newStop.id ? { ...stop, isNewlyAdded: false } : stop
              )
            };
          });
        }, 10000);
      }

      setManualService({
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
      });
      setSelectedRouteForNewService('unassigned');
      setIsAddServiceDialogOpen(false);
    } else {
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
    const routeKey = active.data.current?.routeKey as 'A' | 'B';
    const index = active.data.current?.index as number;

    setActiveRouteKey(routeKey);
    setActiveIndex(index);

    if (routeKey && index !== undefined) {
      const route = routeKey === 'A' ? routeA : routeB;
      if (route) {
        // Get from pendingEdits if exists, otherwise from route
        const stops = pendingEdits[routeKey] || route.stops;
        setActiveStop(stops[index]);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setActiveStop(null);
    setActiveRouteKey(null);
    setActiveIndex(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeRouteKey = active.data.current?.routeKey as string | 'unassigned';
    const overRouteKey = over.data.current?.routeKey as string;

    // Case: Moving from unassigned to a route
    if (activeRouteKey === 'unassigned' && overRouteKey && overRouteKey !== 'unassigned') {
      if (!routeData) return;

      const targetRoute = getRoute(overRouteKey);
      const stopToMove = active.data.current?.stop as PlaceValue;

      if (!stopToMove) return;

      // Remove from unassigned by matching the stop ID
      const stopId = String(stopToMove.id ?? stopToMove.placeId);
      setUnassignedStops(prev => prev.filter(s => String(s.id ?? s.placeId) !== stopId));

      // Mark as recently inserted and add to target route
      // The highlight will remain until the route is assigned to a driver
      const markedStop = { ...stopToMove, _recentlyInserted: true };
      const newTargetStops = targetRoute ? [...targetRoute.stops, markedStop] : [markedStop];

      setRoute(overRouteKey, prev => prev ? { ...prev, stops: newTargetStops, encodedPolyline: '' } : null);

      // Recalculate route
      const newRouteInfo = await computeRoute(routeData.origin, newTargetStops);
      if (newRouteInfo) {
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
      }

      const routeName = overRouteKey === 'A' ? routeNames.A : overRouteKey === 'B' ? routeNames.B : dynamicRoutes.find(r => r.key === overRouteKey)?.name || `Rota ${overRouteKey}`;
      toast({
        title: 'Serviço adicionado!',
        description: `O serviço foi adicionado à ${routeName}.`,
      });

      return;
    }

    if (!activeRouteKey || !overRouteKey || activeRouteKey === 'unassigned') {
        return;
    }

    // Case 1: Moving within the same route - save as pending edit
    if (activeRouteKey === overRouteKey) {
      const currentRoute = getRoute(activeRouteKey);
      if (!currentRoute || !routeData) return;

      const oldIndex = active.data.current?.index as number;
      const newIndex = over.data.current?.index as number;

      // Check if there's already a pending edit, if so use that, otherwise use current route
      const currentPending = pendingEdits[activeRouteKey];
      const stopsToReorder = currentPending || currentRoute.stops.map((stop, idx) => ({
        ...stop,
        _originalIndex: idx // Store original index
      }));

      const newStops = arrayMove(stopsToReorder, oldIndex, newIndex);

      // Mark the moved stop with _wasMoved flag
      const stopId = String(newStops[newIndex].id ?? newStops[newIndex].placeId);
      const updatedStops = newStops.map(stop => {
        const currentStopId = String(stop.id ?? stop.placeId);
        if (currentStopId === stopId) {
          return { ...stop, _wasMoved: true };
        }
        return stop;
      });

      // Save as pending edit (don't recalculate route yet)
      setPendingEdits(prev => ({
        ...prev,
        [activeRouteKey]: updatedStops
      }));
    }
    // Case 2: Moving between different routes - save as pending edit
    else {
      const sourceRoute = getRoute(activeRouteKey);
      const targetRoute = getRoute(overRouteKey);

      if (!sourceRoute || !targetRoute || !routeData) return;

      const activeIndex = active.data.current?.index as number;
      const overIndex = over.data.current?.index as number;

      // Check if there's already a pending edit for source route
      const currentSourcePending = pendingEdits[activeRouteKey];
      const sourceStopsToEdit = currentSourcePending || sourceRoute.stops.map((stop, idx) => ({
        ...stop,
        _originalIndex: (stop as any)._originalIndex ?? idx
      }));

      // Check if there's already a pending edit for target route
      const currentTargetPending = pendingEdits[overRouteKey];
      const targetStopsToEdit = currentTargetPending || targetRoute.stops.map((stop, idx) => ({
        ...stop,
        _originalIndex: (stop as any)._originalIndex ?? idx
      }));

      // Get stop to move from the correct source (pending edits or original route)
      const stopToMove = sourceStopsToEdit[activeIndex];

      // Get the original index if it exists, otherwise use current index
      const originalIndexOfMovedStop = (stopToMove as any)._originalIndex ?? activeIndex;

      // Remove from source
      const newSourceStops = sourceStopsToEdit.filter((_, i) => i !== activeIndex);

      // Add to target at the position of the over item with marker for cross-route movement
      const movedStopId = String(stopToMove.id ?? stopToMove.placeId);

      // Check if stop already exists in target (to prevent duplicates)
      const existsInTarget = targetStopsToEdit.some(s =>
        String(s.id ?? s.placeId) === movedStopId
      );

      let newTargetStops;
      if (existsInTarget) {
        // If already exists, just reorder within target
        const existingIndex = targetStopsToEdit.findIndex(s =>
          String(s.id ?? s.placeId) === movedStopId
        );
        newTargetStops = [...targetStopsToEdit];
        const [removed] = newTargetStops.splice(existingIndex, 1);
        newTargetStops.splice(overIndex, 0, removed);
      } else {
        // Normal case: add to target
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

      // Save as pending edits for both routes
      setPendingEdits(prev => ({
        ...prev,
        [activeRouteKey]: newSourceStops,
        [overRouteKey]: newTargetStops
      }));
    }
  };

  // Helper functions to manage routes dynamically
  const getRoute = (routeKey: string) => {
    if (routeKey === 'A') return routeA;
    if (routeKey === 'B') return routeB;
    const dynamicRoute = dynamicRoutes.find(r => r.key === routeKey);
    return dynamicRoute?.data || null;
  };

  const setRoute = (routeKey: string, updater: (prev: RouteInfo | null) => RouteInfo | null) => {
    if (routeKey === 'A') {
      setRouteA(updater);
    } else if (routeKey === 'B') {
      setRouteB(updater);
    } else {
      setDynamicRoutes(prev => prev.map(r =>
        r.key === routeKey
          ? { ...r, data: updater(r.data) || r.data }
          : r
      ));
    }
  };

  // Function to add a new dynamic route
  const handleAddNewRoute = () => {
    const routeColors = [
      '#e60000', // Vermelho - Icone address 1.svg
      '#1fd634', // Verde - Icone address 2.svg
      '#fa9200', // Laranja - Icone address 3.svg
      '#bf07e4', // Roxo - Icone address 4.svg
      '#000000', // Preto - Icone address 5.svg
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
            deliveryLocations: routeToOptimize.stops.map(s => ({
              id: s.id,
              lat: s.lat,
              lng: s.lng,
              hasTimePreference: s.hasTimePreference,
            })),
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

  const toggleRouteVisibility = (routeKey: 'A' | 'B') => {
    const setter = routeKey === 'A' ? setRouteA : setRouteB;
    setter(prev => prev ? { ...prev, visible: !prev.visible } : null);
  };
  
  const handleAssignDriver = (routeKey: string, driverId: string) => {
    setAssignedDrivers(prev => ({...prev, [routeKey]: driverId}));

    // Remove _recentlyInserted flag from all stops in the route when a driver is assigned
    if (routeKey === 'A' || routeKey === 'B') {
      setRoute(routeKey, prev => {
        if (!prev) return prev;
        return {
          ...prev,
          stops: prev.stops.map(stop => ({
            ...stop,
            _recentlyInserted: false
          }))
        };
      });
    } else {
      // Handle dynamic routes (C, D, E, etc.)
      setDynamicRoutes(prev => prev.map(route => {
        if (route.key === routeKey) {
          return {
            ...route,
            data: {
              ...route.data,
              stops: route.data.stops.map(stop => ({
                ...stop,
                _recentlyInserted: false
              }))
            }
          };
        }
        return route;
      }));
    }
  };
  
  const handleDispatchRoute = async (routeKey: 'A' | 'B') => {
    if (!routeData) return;

    const routeToSave = routeKey === 'A' ? routeA : routeB;
    const routeName = routeNames[routeKey];
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

        // Gerar código sequencial único para a rota
        const routeCode = await generateRouteCode();

        // Se for um rascunho, atualizar o documento existente
        if (routeData.isDraft && routeData.draftRouteId) {
            const draftRef = doc(db, 'routes', routeData.draftRouteId);
            await updateDoc(draftRef, {
                code: routeCode,
                name: routeName,
                status: 'dispatched',
                plannedDate: new Date(`${routeData.routeDate.split('T')[0]}T${routeData.routeTime}`),
                origin: routeData.origin,
                stops: routeToSave.stops,
                distanceMeters: routeToSave.distanceMeters,
                duration: routeToSave.duration,
                encodedPolyline: routeToSave.encodedPolyline,
                color: routeToSave.color,
                driverId: driverId,
                driverInfo: driver ? { name: driver.name, vehicle: driver.vehicle } : null,
            });

            toast({
                title: 'Rota Despachada!',
                description: `A ${routeName} foi enviada para ${driver?.name}.`,
            });
        } else {
            // Criar novo documento (comportamento original)
            const routeDoc = {
                code: routeCode,
                name: routeName,
                status: 'dispatched',
                createdAt: serverTimestamp(),
                plannedDate: new Date(`${routeData.routeDate.split('T')[0]}T${routeData.routeTime}`),
                origin: routeData.origin,
                stops: routeToSave.stops,
                distanceMeters: routeToSave.distanceMeters,
                duration: routeToSave.duration,
                encodedPolyline: routeToSave.encodedPolyline,
                color: routeToSave.color,
                driverId: driverId,
                driverInfo: driver ? { name: driver.name, vehicle: driver.vehicle } : null,
            };
            await addDoc(collection(db, "routes"), routeDoc);

            toast({
                title: 'Rota Despachada!',
                description: `A ${routeName} foi enviada para ${driver?.name}.`,
            });
        }

        // Remove the dispatched route from state
        if (routeKey === 'A') {
            setRouteA(null);
        } else {
            setRouteB(null);
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

        await updateDoc(routeRef, {
            stops: stopsWithFlags,
            distanceMeters: routeToUpdate.distanceMeters,
            duration: routeToUpdate.duration,
            encodedPolyline: routeToUpdate.encodedPolyline,
        });

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
          toast({
              title: 'Rota Atualizada!',
              description: `A ${routeName} foi atualizada com sucesso.`,
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

    console.log('🔍 handleRemoveStop chamado:', {
      stopId,
      isExistingRoute: routeData.isExistingRoute,
      currentRouteId: routeData.currentRouteId
    });

    // Find which route contains this stop
    let targetRoute: RouteInfo | null = null;
    let routeKey: 'A' | 'B' | null = null;
    let setter: React.Dispatch<React.SetStateAction<RouteInfo | null>> | null = null;

    if (routeA?.stops.some(s => String(s.id ?? s.placeId) === stopId)) {
      targetRoute = routeA;
      routeKey = 'A';
      setter = setRouteA;
    } else if (routeB?.stops.some(s => String(s.id ?? s.placeId) === stopId)) {
      targetRoute = routeB;
      routeKey = 'B';
      setter = setRouteB;
    } else if (unassignedStops.some(s => String(s.id ?? s.placeId) === stopId)) {
      // Remove from unassigned stops
      setUnassignedStops(prev => prev.filter(s => String(s.id ?? s.placeId) !== stopId));
      toast({ title: 'Parada removida!', description: 'A parada foi removida dos serviços não alocados.' });
      return;
    }

    if (!targetRoute || !setter || !routeKey) return;

    console.log('📍 Rota encontrada:', {
      routeKey,
      stopsCount: targetRoute.stops.length
    });

    // Remove the stop from the route
    const newStops = targetRoute.stops.filter(s => String(s.id ?? s.placeId) !== stopId);

    if (newStops.length === 0) {
      // If no stops left, clear the route
      setter({
        ...targetRoute,
        stops: [],
        encodedPolyline: '',
        distanceMeters: 0,
        duration: '0s'
      });

      // Update Firestore if existing route
      if (routeData.isExistingRoute && routeData.currentRouteId) {
        try {
          console.log('💾 Tentando atualizar Firestore:', {
            routeId: routeData.currentRouteId,
            newStopsCount: 0
          });
          const routeRef = doc(db, 'routes', routeData.currentRouteId);
          await updateDoc(routeRef, {
            stops: [],
            encodedPolyline: '',
            distanceMeters: 0,
            duration: '0s',
          });
          console.log('✅ Rota atualizada no Firestore (todos pontos removidos)');
        } catch (error) {
          console.error('❌ Erro ao atualizar Firestore:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao salvar',
            description: 'A parada foi removida localmente, mas não foi salva no servidor.',
          });
        }
      }

      toast({ title: 'Parada removida!', description: `A última parada da ${routeNames[routeKey]} foi removida.${routeData.isExistingRoute ? ' Motorista receberá atualização.' : ''}` });
    } else {
      // Recalculate route with remaining stops
      setter(prev => prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null);
      const newRouteInfo = await computeRoute(routeData.origin, newStops);
      if (newRouteInfo) {
        setter(prev => prev ? { ...prev, ...newRouteInfo, stops: newStops } : null);

        // Update Firestore if existing route
        if (routeData.isExistingRoute && routeData.currentRouteId) {
          try {
            console.log('💾 Tentando atualizar Firestore:', {
              routeId: routeData.currentRouteId,
              newStopsCount: newStops.length,
              distanceMeters: newRouteInfo.distanceMeters,
              duration: newRouteInfo.duration
            });
            const routeRef = doc(db, 'routes', routeData.currentRouteId);
            await updateDoc(routeRef, {
              stops: newStops,
              encodedPolyline: newRouteInfo.encodedPolyline,
              distanceMeters: newRouteInfo.distanceMeters,
              duration: newRouteInfo.duration,
            });
            console.log('✅ Rota atualizada no Firestore (ponto removido)');
          } catch (error) {
            console.error('❌ Erro ao atualizar Firestore:', error);
            toast({
              variant: 'destructive',
              title: 'Erro ao salvar',
              description: 'A parada foi removida localmente, mas não foi salva no servidor.',
            });
          }
        }
      }
      toast({ title: 'Parada removida!', description: `A parada foi removida da ${routeNames[routeKey]}.${routeData.isExistingRoute ? ' Motorista receberá atualização.' : ''}` });
    }
  };

  const handleEditStop = async (stopId: string) => {
    // Find which route contains this stop
    let targetStop: PlaceValue | null = null;
    let routeKey: 'A' | 'B' | 'unassigned' = 'unassigned';
    let index = -1;

    if (routeA) {
      const foundIndex = routeA.stops.findIndex(s => String(s.id ?? s.placeId) === stopId);
      if (foundIndex !== -1) {
        targetStop = routeA.stops[foundIndex];
        routeKey = 'A';
        index = foundIndex;
      }
    }

    if (!targetStop && routeB) {
      const foundIndex = routeB.stops.findIndex(s => String(s.id ?? s.placeId) === stopId);
      if (foundIndex !== -1) {
        targetStop = routeB.stops[foundIndex];
        routeKey = 'B';
        index = foundIndex;
      }
    }

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

  const handleRemoveFromRouteTimeline = async (stop: PlaceValue, index: number, routeKey: 'A' | 'B') => {
    if (!routeData) return;

    const targetRoute = routeKey === 'A' ? routeA : routeB;
    const setter = routeKey === 'A' ? setRouteA : setRouteB;

    if (!targetRoute) return;

    // Remove the stop from the route and add to unassigned
    const newStops = targetRoute.stops.filter((_, i) => i !== index);
    setUnassignedStops(prev => [...prev, stop]);

    if (newStops.length === 0) {
      // If no stops left, clear the route
      setter({
        ...targetRoute,
        stops: [],
        encodedPolyline: '',
        distanceMeters: 0,
        duration: '0s'
      });
      toast({ title: 'Parada removida!', description: `A parada foi movida para serviços não alocados.` });
    } else {
      // Recalculate route with remaining stops
      setter(prev => prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null);
      const newRouteInfo = await computeRoute(routeData.origin, newStops);
      if (newRouteInfo) {
        setter(prev => prev ? { ...prev, ...newRouteInfo, stops: newStops } : null);
      }
      toast({ title: 'Parada removida!', description: `A parada foi movida para serviços não alocados.` });
    }
  };

  const handleDeleteStopFromTimeline = async (stop: PlaceValue, index: number, routeKey: 'A' | 'B') => {
    if (!routeData) return;

    const targetRoute = routeKey === 'A' ? routeA : routeB;
    const setter = routeKey === 'A' ? setRouteA : setRouteB;

    if (!targetRoute) return;

    // Delete the stop completely from the route
    const newStops = targetRoute.stops.filter((_, i) => i !== index);

    if (newStops.length === 0) {
      // If no stops left, clear the route
      setter({
        ...targetRoute,
        stops: [],
        encodedPolyline: '',
        distanceMeters: 0,
        duration: '0s'
      });

      // Update Firestore if existing route
      if (routeData.isExistingRoute && routeData.currentRouteId) {
        try {
          const routeRef = doc(db, 'routes', routeData.currentRouteId);
          await updateDoc(routeRef, {
            stops: [],
            encodedPolyline: '',
            distanceMeters: 0,
            duration: '0s',
          });
          console.log('✅ Rota atualizada no Firestore (todos pontos removidos)');
        } catch (error) {
          console.error('Erro ao atualizar Firestore:', error);
        }
      }

      toast({ title: 'Ponto excluído!', description: `O ponto foi excluído permanentemente.${routeData.isExistingRoute ? ' Motorista receberá atualização.' : ''}` });
    } else {
      // Recalculate route with remaining stops
      setter(prev => prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null);
      const newRouteInfo = await computeRoute(routeData.origin, newStops);
      if (newRouteInfo) {
        setter(prev => prev ? { ...prev, ...newRouteInfo, stops: newStops } : null);

        // Update Firestore if existing route
        if (routeData.isExistingRoute && routeData.currentRouteId) {
          try {
            const routeRef = doc(db, 'routes', routeData.currentRouteId);
            await updateDoc(routeRef, {
              stops: newStops,
              encodedPolyline: newRouteInfo.encodedPolyline,
              distanceMeters: newRouteInfo.distanceMeters,
              duration: newRouteInfo.duration,
            });
            console.log('✅ Rota atualizada no Firestore (ponto removido)');
          } catch (error) {
            console.error('Erro ao atualizar Firestore:', error);
          }
        }
      }
      toast({ title: 'Ponto excluído!', description: `O ponto foi excluído permanentemente.${routeData.isExistingRoute ? ' Motorista receberá atualização.' : ''}` });
    }
  };

  const handleShowStopInfo = (stop: PlaceValue, index: number) => {
    setSelectedStopInfo(stop);
    setIsStopInfoDialogOpen(true);
  };

  const handleApplyPendingEdits = async (routeKey: 'A' | 'B') => {
    if (!routeData) return;

    const pendingStops = pendingEdits[routeKey];
    if (!pendingStops) return;

    const setter = routeKey === 'A' ? setRouteA : setRouteB;
    const currentRoute = routeKey === 'A' ? routeA : routeB;
    const otherRouteKey: 'A' | 'B' = routeKey === 'A' ? 'B' : 'A';
    const otherPendingStops = pendingEdits[otherRouteKey];

    if (!currentRoute) return;

    // Clean stops - remove metadata properties
    const cleanedStops = pendingStops.map(({ _originalIndex, _wasMoved, _movedFromRoute, _originalRouteColor, ...stop }: any) => stop);

    // Update state with pending stops
    setter((prev) => (prev ? { ...prev, stops: cleanedStops, encodedPolyline: '' } : null));

    // Recalculate route
    const newRouteInfo = await computeRoute(routeData.origin, cleanedStops);
    if (newRouteInfo) {
      setter((prev) => (prev ? {
        ...prev,
        ...newRouteInfo,
        stops: cleanedStops,
        color: currentRoute.color,
        visible: currentRoute.visible
      } : null));
    }

    // Check if there's a pending edit in the other route (cross-route movement)
    if (otherPendingStops) {
      const otherSetter = otherRouteKey === 'A' ? setRouteA : setRouteB;
      const otherRoute = otherRouteKey === 'A' ? routeA : routeB;

      if (otherRoute) {
        const cleanedOtherStops = otherPendingStops.map(({ _originalIndex, _wasMoved, _movedFromRoute, _originalRouteColor, ...stop }: any) => stop);

        otherSetter((prev) => (prev ? { ...prev, stops: cleanedOtherStops, encodedPolyline: '' } : null));

        const otherRouteInfo = cleanedOtherStops.length > 0
          ? await computeRoute(routeData.origin, cleanedOtherStops)
          : null;

        if (otherRouteInfo) {
          otherSetter((prev) => (prev ? {
            ...prev,
            ...otherRouteInfo,
            stops: cleanedOtherStops,
            color: otherRoute.color,
            visible: otherRoute.visible
          } : null));
        } else if (cleanedOtherStops.length === 0) {
          otherSetter((prev) => (prev ? {
            ...prev,
            stops: [],
            encodedPolyline: '',
            distanceMeters: 0,
            duration: '0s'
          } : null));
        }
      }
    }

    // If this is an existing route, save changes to Firestore
    if (routeData.isExistingRoute && routeData.currentRouteId && newRouteInfo) {
      try {
        const routeRef = doc(db, 'routes', routeData.currentRouteId);
        await updateDoc(routeRef, {
          stops: cleanedStops,
          encodedPolyline: newRouteInfo.encodedPolyline,
          distanceMeters: newRouteInfo.distanceMeters,
          duration: newRouteInfo.duration,
        });
        console.log('✅ Rota atualizada no Firestore com edições');
      } catch (error) {
        console.error('Erro ao salvar edições no Firestore:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar',
          description: 'As alterações foram aplicadas localmente, mas não foram salvas. Tente novamente.',
        });
        return;
      }
    }

    // Clear pending edits for both routes
    setPendingEdits(prev => ({
      ...prev,
      [routeKey]: null,
      ...(otherPendingStops ? { [otherRouteKey]: null } : {})
    }));

    toast({
      title: 'Edições aplicadas!',
      description: otherPendingStops
        ? `Ambas as rotas foram atualizadas com sucesso.${routeData.isExistingRoute ? ' Motorista receberá atualização.' : ''}`
        : `A ${routeNames[routeKey]} foi atualizada com sucesso.${routeData.isExistingRoute ? ' Motorista receberá atualização.' : ''}`,
    });
  };

  React.useEffect(() => {
    // If all routes have been dispatched, redirect
    if (!isLoading && !routeA && !routeB) {
        toast({
            title: 'Todas as rotas foram despachadas!',
            description: 'Redirecionando para a página de rotas.',
        });
        sessionStorage.removeItem('newRouteData');
        clearRouteInProgress(); // Limpar também do localStorage
        setTimeout(() => router.push('/routes'), 1500);
    }
  }, [isLoading, routeA, routeB, router, toast]);

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
  // Combine main routes with additional routes and dynamic routes based on visibility
  const combinedRoutes = [
    routeA,
    routeB,
    ...additionalRoutes
      .map((route, idx) => ({
        ...route,
        visible: routeVisibility[`additional-${idx}`] === true
      }))
      .filter(route => route.visible),
    ...dynamicRoutes.map(r => r.data)
  ].filter((r): r is RouteInfo => !!r);

  const toggleAdditionalRoute = (routeIdx: number) => {
    setRouteVisibility(prev => {
      const newVisibility = {
        ...prev,
        [`additional-${routeIdx}`]: !prev[`additional-${routeIdx}`]
      };
      console.log('🔄 Toggle rota', routeIdx, '- Nova visibilidade:', newVisibility);
      return newVisibility;
    });
  };

  console.log('🗺️ Combined routes:', combinedRoutes.length);
  console.log('🗺️ Additional routes:', additionalRoutes.length);
  console.log('🗺️ Route visibility:', routeVisibility);

  const routesForTable = [
      { key: 'A' as const, name: routeNames.A, data: routeA },
      { key: 'B' as const, name: routeNames.B, data: routeB },
  ].filter((r): r is { key: 'A' | 'B'; name: string; data: RouteInfo } => !!r.data && r.data.stops.length > 0)
   .concat(
     dynamicRoutes as any[]  // Show dynamic routes even if empty to allow dragging services to them
   );

  const handleRefreshDriverLocation = async (driverId: string) => {
    try {
      console.log(`🔄 Forçando atualização de localização para motorista: ${driverId}`);

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
            ref={mapApiRef}
            height={-1}
            routes={combinedRoutes}
            origin={origin}
            unassignedStops={unassignedStops}
            onRemoveStop={handleRemoveStop}
            onEditStop={handleEditStop}
            highlightedStopIds={highlightedStops}
            // Não mostrar motoristas na página de organização (foco exclusivo na organização)
            // driverLocation={driverLocation || undefined}
            // driverLocations={driverLocations}
            // onRefreshDriverLocation={handleRefreshDriverLocation}
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
                 {unassignedStops.length > 0 && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="relative h-9 w-9 rounded-full">
                                <PackagePlus className="h-5 w-5" />
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                    {unassignedStops.length}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80" onOpenAutoFocus={(e) => e.preventDefault()}>
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                <h4 className="font-medium leading-none">Serviços não alocados</h4>
                                <p className="text-sm text-muted-foreground">
                                    Arraste estes serviços para uma das rotas abaixo.
                                </p>
                                </div>
                                <div className="grid gap-2" style={{ pointerEvents: 'auto' }}>
                                {unassignedStops.map((stop, index) => (
                                    <UnassignedStopItem
                                        key={`unassigned-${stop.id ?? stop.placeId ?? index}-${index}`}
                                        stop={stop}
                                        index={index}
                                        onOpenInfo={(id) => mapApiRef.current?.openStopInfo(id)}
                                    />
                                ))}
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                 )}
              </div>
              <div className='flex items-center gap-2'>
                {Object.keys(pendingEdits).some(key => pendingEdits[key as 'A' | 'B']) && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPendingEdits({ A: null, B: null });
                        toast({ title: 'Todas as edições foram canceladas' });
                      }}
                      className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    >
                      Cancelar Todas
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={async () => {
                        const keysWithPending = Object.keys(pendingEdits).filter(key => pendingEdits[key as 'A' | 'B']) as ('A' | 'B')[];
                        for (const key of keysWithPending) {
                          await handleApplyPendingEdits(key);
                        }
                        toast({ title: 'Todas as edições foram aplicadas com sucesso!' });
                      }}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Aplicar Todas as Edições
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
                    <TabsTrigger value="review" className="data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-primary data-[state=active]:shadow-sm px-4 py-2 rounded-md text-sm font-medium">
                      <Check className="mr-2 h-4 w-4" />
                      Revisar
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
                            {routesForTable.map(routeItem => (
                                <TableRow key={routeItem.key} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <TableCell className="py-4 px-4 align-middle">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleRouteVisibility(routeItem.key)}>
                                            {routeItem.data.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </Button>
                                    </TableCell>
                                    <TableCell className="py-4 px-4 font-medium text-slate-900 dark:text-slate-100">
                                        <div className="flex items-center gap-2">
                                          <List className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                          <EditableRouteName
                                            name={routeItem.name}
                                            onChange={(newName) =>
                                                setRouteNames((prev) => ({ ...prev, [routeItem.key]: newName }))
                                            }
                                          />
                                        </div>
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
                                        onRemoveFromRoute={(stop, index) => handleRemoveFromRouteTimeline(stop, index, routeItem.key)}
                                        onDeleteStop={(stop, index) => handleDeleteStopFromTimeline(stop, index, routeItem.key)}
                                        onShowInfo={handleShowStopInfo}
                                        />
                                    </TableCell>
                                    <TableCell className="py-4 px-4 text-right">
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
                                    </TableCell>
                                </TableRow>
                            ))}

                            </TableBody>
                        </Table>
                     ) : (
                        <div className="flex h-48 items-center justify-center text-muted-foreground">
                            Nenhuma rota pendente para organizar.
                        </div>
                     )
                  )}
                </div>

                {/* Additional Routes Section */}
                {additionalRoutes.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm overflow-hidden mt-6">
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Outras Rotas do Período</h2>
                        <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold px-2 py-1">
                          {additionalRoutes.length}
                        </Badge>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-slate-200 dark:border-slate-800 hover:bg-transparent">
                          <TableHead className='w-12 py-3 px-4'></TableHead>
                          <TableHead className="py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Rota</TableHead>
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
                        {additionalRoutes.map((route, idx) => (
                          <TableRow key={`additional-${idx}`} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <TableCell className="py-4 px-4 align-middle">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => toggleAdditionalRoute(idx)}
                              >
                                {routeVisibility[`additional-${idx}`] ? (
                                  <Eye className="h-4 w-4" />
                                ) : (
                                  <EyeOff className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="py-4 px-4 font-medium text-slate-900 dark:text-slate-100">
                              <div className="flex items-center gap-2">
                                <List className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                <span>Rota {idx + 2}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-4 px-4 text-slate-700 dark:text-slate-300">{route.stops.length}</TableCell>
                            <TableCell className="py-4 px-4 text-slate-700 dark:text-slate-300">{formatDistance(route.distanceMeters)} km</TableCell>
                            <TableCell className="py-4 px-4 text-slate-700 dark:text-slate-300">{formatDuration(route.duration)}</TableCell>
                            <TableCell className="py-4 px-4 text-slate-700 dark:text-slate-300">{calculateFreightCost(route.distanceMeters)}</TableCell>
                            <TableCell className="py-4 px-4">
                              <RouteTimeline
                                routeKey={`additional-${idx}` as any}
                                stops={route.stops}
                                color={route.color}
                                dragDelay={DRAG_DELAY}
                                onStopClick={(stop) => {
                                  const id = String(stop.id ?? stop.placeId ?? "");
                                  if (id) mapApiRef.current?.openStopInfo(id);
                                }}
                              />
                            </TableCell>
                            <TableCell className="py-4 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled
                                className="border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                              >
                                <Wand2 className="mr-2 h-4 w-4" />
                                Otimizar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
            </TabsContent>

            <TabsContent value="assign" className="m-0">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {routesForTable.length > 0 ? routesForTable.map(routeItem => (
                  <Card key={routeItem.key}>
                    <CardHeader>
                      <CardTitle>{routeItem.name}</CardTitle>
                      <CardDescription>Atribua um motorista para esta rota.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select 
                        value={assignedDrivers[routeItem.key] || ''}
                        onValueChange={(driverId) => handleAssignDriver(routeItem.key, driverId)}
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
                       <p className="mt-2 text-xs text-muted-foreground">
                        Todos os motoristas cadastrados são mostrados.
                      </p>
                    </CardContent>
                  </Card>
                )) : (
                     <div className="lg:col-span-2 flex h-48 items-center justify-center text-muted-foreground">
                        Nenhuma rota pendente para atribuir.
                    </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="review" className="m-0">
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
                                    <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/50">
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Motorista</span>
                                        {driver ? (
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-6 w-6">
                                                    <AvatarImage src={driver.avatarUrl} alt={driver.name} />
                                                    <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{driver.name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm font-medium text-destructive">Não Atribuído</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-600 dark:text-slate-400">
                                        Data do Início: {routeData.routeDate ? format(new Date(routeData.routeDate), 'dd/MM/yyyy', { locale: ptBR }) : '--'} às {routeData.routeTime}
                                    </div>
                                </CardContent>
                                <CardFooter className="flex gap-2">
                                     {routeData?.isExistingRoute ? (
                                        <Button
                                            className="w-full"
                                            onClick={() => handleUpdateExistingRoute(routeItem.key)}
                                            disabled={isSavingRoute}
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
                            Nenhuma rota pendente para revisar.
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

    