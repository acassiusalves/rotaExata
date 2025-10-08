
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
} from 'lucide-react';
import { RouteMap, RouteMapHandle } from '@/components/maps/RouteMap';
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
import type { PlaceValue, RouteInfo, Driver } from '@/lib/types';
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
import { db } from '@/lib/firebase/client';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot } from "firebase/firestore"; 
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


interface RouteData {
  origin: PlaceValue;
  stops: PlaceValue[];
  routeDate: string;
  routeTime: string;
  isExistingRoute?: boolean;
  existingRouteData?: {
    distanceMeters: number;
    duration: string;
    encodedPolyline: string;
    color: string;
  };
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
  const [isOptimizing, setIsOptimizing] = React.useState({ A: false, B: false });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState<{ [key: string]: boolean }>({});


  const [routeA, setRouteA] = React.useState<RouteInfo | null>(null);
  const [routeB, setRouteB] = React.useState<RouteInfo | null>(null);
  const [unassignedStops, setUnassignedStops] = React.useState<PlaceValue[]>([]);
  const [routeNames, setRouteNames] = React.useState({ A: 'Rota 1', B: 'Rota 2' });
  const [assignedDrivers, setAssignedDrivers] = React.useState<{ A: string | null, B: string | null }>({ A: null, B: null });
  const [availableDrivers, setAvailableDrivers] = React.useState<Driver[]>([]);

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

  // Map resize state
  const [mapHeight, setMapHeight] = React.useState(50); // percentage
  const [isResizing, setIsResizing] = React.useState(false);
  const startYRef = React.useRef<number>(0);
  const startHeightRef = React.useRef<number>(50);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = mapHeight;
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaY = e.clientY - startYRef.current;
      const windowHeight = window.innerHeight - 64; // subtract header height
      const deltaPercentage = (deltaY / windowHeight) * 100;
      const newHeight = startHeightRef.current + deltaPercentage;

      // Limit between 20% and 80%
      if (newHeight >= 20 && newHeight <= 80) {
        setMapHeight(newHeight);
      } else if (newHeight < 20) {
        setMapHeight(20);
      } else if (newHeight > 80) {
        setMapHeight(80);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, mapHeight]);

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

  React.useEffect(() => {
    const storedData = sessionStorage.getItem('newRouteData');
    if (storedData) {
      const parsedData: RouteData = JSON.parse(storedData);
      setRouteData(parsedData);

      const allStops = parsedData.stops.filter((s) => s.id && s.lat && s.lng);

      // Se for uma rota existente, não dividir - apenas mostrar como está
      if (parsedData.isExistingRoute && parsedData.existingRouteData) {
        setIsLoading(true);
        setRouteA({
          stops: allStops,
          distanceMeters: parsedData.existingRouteData.distanceMeters,
          duration: parsedData.existingRouteData.duration,
          encodedPolyline: parsedData.existingRouteData.encodedPolyline,
          color: parsedData.existingRouteData.color,
          visible: true,
        });
        setRouteB(null); // Não tem segunda rota
        setIsLoading(false);
      } else {
        // Rota nova - aplicar K-means para dividir
        const clusters = kMeansCluster(allStops, 2);
        const stopsA = clusters[0] || [];
        const stopsB = clusters[1] || [];

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
            setRouteA({ ...computedRouteA, color: '#F44336', visible: true });
          }
          if (computedRouteB) {
            setRouteB({ ...computedRouteB, color: '#FF9800', visible: true });
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

  const handleManualServiceChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setManualService(prev => ({...prev, [id]: value}));

    if (id === 'locationLink') {
      handleLocationLinkPaste(value);
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

  const handleAddService = async () => {
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
        isManuallyAdded: true,
      };

      // Add to selected route or unassigned
      if (selectedRouteForNewService === 'unassigned') {
        setUnassignedStops(prev => [...prev, newStop]);
        toast({
          title: 'Serviço Adicionado!',
          description: 'O novo serviço está na lista de não alocados.',
        });
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
        }

        toast({
          title: 'Serviço Adicionado!',
          description: `O serviço foi adicionado à ${routeNames[selectedRouteForNewService]}.`,
        });
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
        setActiveStop(route.stops[index]);
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

    const activeRouteKey = active.data.current?.routeKey as 'A' | 'B' | 'unassigned';
    const overRouteKey = over.data.current?.routeKey as 'A' | 'B';

    // Case: Moving from unassigned to a route
    if (activeRouteKey === 'unassigned' && (overRouteKey === 'A' || overRouteKey === 'B')) {
      if (!routeData) return;

      const targetRoute = overRouteKey === 'A' ? routeA : routeB;
      const setter = overRouteKey === 'A' ? setRouteA : setRouteB;
      const stopToMove = active.data.current?.stop as PlaceValue;

      if (!stopToMove) return;

      // Remove from unassigned by matching the stop ID
      const stopId = String(stopToMove.id ?? stopToMove.placeId);
      setUnassignedStops(prev => prev.filter(s => String(s.id ?? s.placeId) !== stopId));

      // Add to target route
      const newTargetStops = targetRoute ? [...targetRoute.stops, stopToMove] : [stopToMove];

      setter(prev => prev ? { ...prev, stops: newTargetStops, encodedPolyline: '' } : null);

      // Recalculate route
      const newRouteInfo = await computeRoute(routeData.origin, newTargetStops);
      if (newRouteInfo) {
        setter(prev => prev ? {
          ...prev,
          ...newRouteInfo,
          stops: newTargetStops,
          color: targetRoute?.color || (overRouteKey === 'A' ? '#F44336' : '#FF9800'),
          visible: targetRoute?.visible ?? true
        } : {
          ...newRouteInfo,
          stops: newTargetStops,
          color: overRouteKey === 'A' ? '#F44336' : '#FF9800',
          visible: true
        });
      }

      toast({
        title: 'Serviço adicionado!',
        description: `O serviço foi adicionado à ${routeNames[overRouteKey]}.`,
      });

      return;
    }

    if (!activeRouteKey || !overRouteKey || activeRouteKey === 'unassigned') {
        return;
    }

    // Case 1: Moving within the same route - save as pending edit
    if (activeRouteKey === overRouteKey) {
      const currentRoute = activeRouteKey === 'A' ? routeA : routeB;
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

      toast({
        title: 'Edição pendente',
        description: 'Clique em "Editar" para aplicar as alterações.',
      });
    }
    // Case 2: Moving between different routes
    else {
      const sourceRoute = activeRouteKey === 'A' ? routeA : routeB;
      const targetRoute = overRouteKey === 'A' ? routeA : routeB;
      const sourceSetter = activeRouteKey === 'A' ? setRouteA : setRouteB;
      const targetSetter = overRouteKey === 'A' ? setRouteA : setRouteB;

      if (!sourceRoute || !targetRoute || !routeData) return;

      const activeIndex = active.data.current?.index as number;
      const overIndex = over.data.current?.index as number;

      // Remove from source
      const stopToMove = sourceRoute.stops[activeIndex];
      const newSourceStops = sourceRoute.stops.filter((_, i) => i !== activeIndex);

      // Add to target at the position of the over item
      const newTargetStops = [...targetRoute.stops];
      newTargetStops.splice(overIndex, 0, stopToMove);

      // Update both routes optimistically
      sourceSetter((prev) => (prev ? { ...prev, stops: newSourceStops, encodedPolyline: '' } : null));
      targetSetter((prev) => (prev ? { ...prev, stops: newTargetStops, encodedPolyline: '' } : null));

      // Recalculate both routes
      const [newSourceRouteInfo, newTargetRouteInfo] = await Promise.all([
        newSourceStops.length > 0 ? computeRoute(routeData.origin, newSourceStops) : Promise.resolve(null),
        computeRoute(routeData.origin, newTargetStops),
      ]);

      if (newSourceRouteInfo) {
        sourceSetter((prev) => (prev ? {
          ...prev,
          ...newSourceRouteInfo,
          stops: newSourceStops,
          color: sourceRoute.color,
          visible: sourceRoute.visible
        } : null));
      } else if (newSourceStops.length === 0) {
        // Keep the route but with empty stops
        sourceSetter((prev) => (prev ? {
          ...prev,
          stops: [],
          encodedPolyline: '',
          distanceMeters: 0,
          duration: '0s'
        } : null));
      }

      if (newTargetRouteInfo) {
        targetSetter((prev) => (prev ? {
          ...prev,
          ...newTargetRouteInfo,
          stops: newTargetStops,
          color: targetRoute.color,
          visible: targetRoute.visible
        } : null));
      }

      toast({
        title: 'Serviço Movido!',
        description: `O serviço foi movido de ${routeNames[activeRouteKey]} para ${routeNames[overRouteKey]}.`,
      });
    }
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

  const toggleRouteVisibility = (routeKey: 'A' | 'B') => {
    const setter = routeKey === 'A' ? setRouteA : setRouteB;
    setter(prev => prev ? { ...prev, visible: !prev.visible } : null);
  };
  
  const handleAssignDriver = (routeKey: 'A' | 'B', driverId: string) => {
    setAssignedDrivers(prev => ({...prev, [routeKey]: driverId}));
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
        
        const routeDoc = {
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

  const handleRemoveStop = async (stopId: string) => {
    if (!routeData) return;

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
      toast({ title: 'Parada removida!', description: `A última parada da ${routeNames[routeKey]} foi removida.` });
    } else {
      // Recalculate route with remaining stops
      setter(prev => prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null);
      const newRouteInfo = await computeRoute(routeData.origin, newStops);
      if (newRouteInfo) {
        setter(prev => prev ? { ...prev, ...newRouteInfo, stops: newStops } : null);
      }
      toast({ title: 'Parada removida!', description: `A parada foi removida da ${routeNames[routeKey]}.` });
    }
  };

  const handleEditStop = (stopId: string) => {
    // For now, just show a toast. You can implement edit functionality later
    toast({
      title: 'Editar parada',
      description: `Funcionalidade de edição será implementada em breve. ID: ${stopId}`,
    });
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
      toast({ title: 'Ponto excluído!', description: `O ponto foi excluído permanentemente.` });
    } else {
      // Recalculate route with remaining stops
      setter(prev => prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null);
      const newRouteInfo = await computeRoute(routeData.origin, newStops);
      if (newRouteInfo) {
        setter(prev => prev ? { ...prev, ...newRouteInfo, stops: newStops } : null);
      }
      toast({ title: 'Ponto excluído!', description: `O ponto foi excluído permanentemente.` });
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

    if (!currentRoute) return;

    // Clean stops - remove _originalIndex property
    const cleanedStops = pendingStops.map(({ _originalIndex, ...stop }: any) => stop);

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

    // Clear pending edits
    setPendingEdits(prev => ({ ...prev, [routeKey]: null }));

    toast({
      title: 'Edições aplicadas!',
      description: `A ${routeNames[routeKey]} foi atualizada com sucesso.`,
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
  const combinedRoutes = [routeA, routeB].filter((r): r is RouteInfo => !!r && !!r.visible);

  const routesForTable = [
      { key: 'A' as const, name: routeNames.A, data: routeA },
      { key: 'B' as const, name: routeNames.B, data: routeB },
  ].filter((r): r is { key: 'A' | 'B'; name: string; data: RouteInfo } => !!r.data && r.data.stops.length > 0);


  return (
    <>
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden">
      <div className="shrink-0 bg-muted relative" style={{ height: `${mapHeight}vh` }}>
        <RouteMap
          ref={mapApiRef}
          height={-1}
          routes={combinedRoutes}
          origin={origin}
          unassignedStops={unassignedStops}
          onRemoveStop={handleRemoveStop}
          onEditStop={handleEditStop}
        />
      </div>

      {/* Resize Handle */}
      <div
        className="h-1 bg-border hover:bg-primary hover:h-1.5 transition-all cursor-ns-resize flex items-center justify-center group relative z-10"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-x-0 -top-2 -bottom-2" />
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <svg width="24" height="8" viewBox="0 0 24 8" fill="none" className="text-muted-foreground">
            <path d="M3 2h18M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-background">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Tabs defaultValue="organize" className="w-full">
          <CardHeader className="p-4 pb-0">
            <div className="flex items-start justify-between">
              <div className='flex items-center gap-4'>
                 <div>
                    <CardTitle>Organizar e Atribuir Rota</CardTitle>
                    <CardDescription>
                      Otimize a sequência, atribua um motorista e salve a rota.
                    </CardDescription>
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
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { requestAnimationFrame(() => setIsAddServiceDialogOpen(true)) }}>
                            <PackagePlus className="mr-2 h-4 w-4" />
                            Adicionar um serviço
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <TabsList>
                  <TabsTrigger value="organize">
                    <Wand2 className="mr-2 h-4 w-4" />
                    Organizar
                  </TabsTrigger>
                  <TabsTrigger value="assign">
                    <User className="mr-2 h-4 w-4" />
                    Atribuir
                  </TabsTrigger>
                  <TabsTrigger value="review">
                    <Check className="mr-2 h-4 w-4" />
                    Revisar
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            <TabsContent value="organize" className="m-0">
              <div className="col-span-3">
                   {isLoading ? (
                    <div className="flex h-48 items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    routesForTable.length > 0 ? (
                            <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className='w-12'></TableHead>
                                    <TableHead>Rota</TableHead>
                                    <TableHead>Paradas</TableHead>
                                    <TableHead>Distância</TableHead>
                                    <TableHead>Tempo</TableHead>
                                    <TableHead>Frete R$</TableHead>
                                    <TableHead className='w-[35%]'>Linha do Tempo</TableHead>
                                    <TableHead className='w-32 text-right'>Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {routesForTable.map(routeItem => (
                                <TableRow key={routeItem.key}>
                                    <TableCell className="align-middle">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleRouteVisibility(routeItem.key)}>
                                            {routeItem.data.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </Button>
                                    </TableCell>
                                    <TableCell>
                                        <EditableRouteName
                                        name={routeItem.name}
                                        onChange={(newName) =>
                                            setRouteNames((prev) => ({ ...prev, [routeItem.key]: newName }))
                                        }
                                        />
                                    </TableCell>
                                    <TableCell>{routeItem.data.stops.length}</TableCell>
                                    <TableCell>{formatDistance(routeItem.data.distanceMeters)} km</TableCell>
                                    <TableCell>{formatDuration(routeItem.data.duration)}</TableCell>
                                    <TableCell>{calculateFreightCost(routeItem.data.distanceMeters)}</TableCell>
                                    <TableCell>
                                        <RouteTimeline
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
                                    <TableCell className="text-right">
                                        {pendingEdits[routeItem.key] ? (
                                            <div className="flex gap-2 justify-end">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setPendingEdits(prev => ({ ...prev, [routeItem.key]: null }));
                                                        toast({ title: 'Edições canceladas' });
                                                    }}
                                                >
                                                    Cancelar
                                                </Button>
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    onClick={() => handleApplyPendingEdits(routeItem.key)}
                                                >
                                                    <Check className="mr-2 h-4 w-4" />
                                                    Editar ({pendingEdits[routeItem.key]!.filter(s => (s as any)._wasMoved).length})
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleOptimizeSingleRoute(routeItem.key)}
                                                disabled={isOptimizing[routeItem.key]}
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
                          : 'border-gray-300 bg-gray-100 text-gray-700'
                      }`}
                    >
                      {activeIndex + 1}
                    </div>
                  ) : null}
                </DragOverlay>
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
                                    <div className="flex items-center justify-between rounded-lg border p-3">
                                        <span className="text-sm font-medium text-muted-foreground">Motorista</span>
                                        {driver ? (
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-6 w-6">
                                                    <AvatarImage src={driver.avatarUrl} alt={driver.name} />
                                                    <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <span className="text-sm font-semibold">{driver.name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm font-medium text-destructive">Não Atribuído</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Data do Início: {routeData.routeDate ? format(new Date(routeData.routeDate), 'dd/MM/yyyy', { locale: ptBR }) : '--'} às {routeData.routeTime}
                                    </div>
                                </CardContent>
                                <CardFooter>
                                     <Button 
                                        className="w-full" 
                                        onClick={() => handleDispatchRoute(routeItem.key)} 
                                        disabled={isSavingRoute || !driver}
                                    >
                                        {isSavingRoute ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                                        {isSavingRoute ? 'Despachando...' : 'Despachar Rota'}
                                    </Button>
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
          </CardContent>
        </Tabs>
        </DndContext>
      </div>
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
            <Button onClick={handleAddService}>Salvar Serviço</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop Info Dialog */}
      <Dialog open={isStopInfoDialogOpen} onOpenChange={setIsStopInfoDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Informações do Serviço</DialogTitle>
            <DialogDescription>
              Detalhes completos da parada
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="font-medium text-muted-foreground">Cliente:</span>
              <span className="col-span-2">{selectedStopInfo?.customerName || '--'}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="font-medium text-muted-foreground">Pedido Nº:</span>
              <span className="col-span-2">{selectedStopInfo?.orderNumber || '--'}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="font-medium text-muted-foreground">Telefone:</span>
              <span className="col-span-2">{selectedStopInfo?.phone || '--'}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="font-medium text-muted-foreground">Janela:</span>
              <span className="col-span-2">
                {selectedStopInfo?.timeWindowStart && selectedStopInfo?.timeWindowEnd
                  ? `${selectedStopInfo.timeWindowStart} - ${selectedStopInfo.timeWindowEnd}`
                  : '--'}
              </span>
            </div>
            <Separator />
            <div className="grid grid-cols-3 items-start gap-4">
              <span className="font-medium text-muted-foreground">Endereço:</span>
              <p className="col-span-2 text-sm">{selectedStopInfo?.address || '--'}</p>
            </div>
            {selectedStopInfo?.complemento && (
              <div className="grid grid-cols-3 items-start gap-4">
                <span className="font-medium text-muted-foreground">Complemento:</span>
                <p className="col-span-2 text-sm">{selectedStopInfo.complemento}</p>
              </div>
            )}
            <Separator />
            <div className="grid grid-cols-3 items-start gap-4">
              <span className="font-medium text-muted-foreground">Observações:</span>
              <p className="col-span-2 text-sm italic">{selectedStopInfo?.notes || '--'}</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Fechar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
