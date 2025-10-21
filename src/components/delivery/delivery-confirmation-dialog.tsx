'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Camera,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '../ui/input';
import { Payment } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { db } from '@/lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';

interface DeliveryConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    photo?: string;
    notes?: string;
    status: 'completed' | 'failed';
    failureReason?: string;
    wentToLocation?: boolean;
    attemptPhoto?: string;
    payments?: Payment[];
  }) => Promise<void>;
  customerName?: string;
  address?: string;
  complement?: string;
  stopLocation?: { lat: number; lng: number };
  currentLocation?: { lat: number; lng: number } | null;
}

export function DeliveryConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  customerName,
  address,
  complement,
  stopLocation,
  currentLocation,
}: DeliveryConfirmationDialogProps) {
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState('');
  const [deliveryStatus, setDeliveryStatus] = React.useState<'completed' | 'failed'>('completed');
  const [failureReason, setFailureReason] = React.useState('');
  const [wentToLocation, setWentToLocation] = React.useState<boolean | null>(null);
  const [attemptPhoto, setAttemptPhoto] = React.useState<string | null>(null);

  // Alterado para suportar múltiplos pagamentos
  const [payments, setPayments] = React.useState<Payment[]>([{ id: `payment-${Date.now()}`, method: '', value: 0 }]);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [validationSettings, setValidationSettings] = React.useState<{
    enabled: boolean;
    maxDistance: number;
  } | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = React.useState(false);
  const streamRef = React.useRef<MediaStream | null>(null);

  // Função para calcular distância entre dois pontos (Haversine formula)
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distância em km
  };

  // Load validation settings
  React.useEffect(() => {
    const loadValidationSettings = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'general');
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setValidationSettings({
            enabled: data.deliveryDistanceValidation ?? false,
            maxDistance: data.maxDeliveryDistance ?? 0.5,
          });
        } else {
          setValidationSettings({
            enabled: false,
            maxDistance: 0.5,
          });
        }
      } catch (error) {
        console.error('Error loading validation settings:', error);
        setValidationSettings({
          enabled: false,
          maxDistance: 0.5,
        });
      }
    };

    if (isOpen) {
      loadValidationSettings();
    }
  }, [isOpen]);

  // Camera handling
  const startCamera = async () => {
    try {
      console.log('Solicitando acesso à câmera...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('API de câmera não suportada neste navegador');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false,
      });

      console.log('Stream obtida:', stream);
      console.log('Tracks da stream:', stream.getTracks());

      streamRef.current = stream;
      setIsCameraActive(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      if (!videoRef.current) {
        throw new Error('Elemento de vídeo não foi renderizado');
      }

      videoRef.current.srcObject = stream;

      try {
        await videoRef.current.play();
        console.log('Vídeo reproduzindo via play() direto');
      } catch (playError) {
        console.log('Erro no play() direto, tentando com evento:', playError);
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Referência do vídeo perdida'));
            return;
          }
          const video = videoRef.current;
          const onLoadedMetadata = () => { video.play().then(resolve).catch(reject); };
          video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
          setTimeout(() => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          }, 5000);
        });
      }

      console.log('Câmera ativada com sucesso');
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      let errorMessage = 'Não foi possível acessar a câmera.';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') errorMessage = 'Permissão de câmera negada. Verifique as configurações do navegador.';
        else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') errorMessage = 'Nenhuma câmera encontrada no dispositivo.';
        else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') errorMessage = 'Câmera está em uso por outro aplicativo.';
        else if (err.message.includes('não suportada')) errorMessage = err.message;
        else errorMessage = `Erro: ${err.message}`;
      }
      setError(errorMessage);
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const compressImage = (dataUrl: string, maxWidth: number = 800, quality: number = 0.6): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Redimensionar se necessário
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    const photoData = canvas.toDataURL('image/jpeg', 0.8);

    // Comprimir a imagem antes de salvar
    const compressedPhoto = await compressImage(photoData, 800, 0.6);
    setPhoto(compressedPhoto);
    stopCamera();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const photoData = e.target?.result as string;
      // Comprimir a imagem antes de salvar
      const compressedPhoto = await compressImage(photoData, 800, 0.6);
      setPhoto(compressedPhoto);
    };
    reader.readAsDataURL(file);
  };
  
  const resetForm = () => {
    setPhoto(null);
    setNotes('');
    setDeliveryStatus('completed');
    setFailureReason('');
    setWentToLocation(null);
    setAttemptPhoto(null);
    setPayments([{ id: `payment-${Date.now()}`, method: '', value: 0 }]);
  };


  const handlePaymentChange = (index: number, field: keyof Payment, value: string | number) => {
    const newPayments = [...payments];
    (newPayments[index] as any)[field] = value;

    // Reset installments if method is not credit card
    if (field === 'method' && value !== 'cartao_credito') {
      delete newPayments[index].installments;
    }

    // Reset pixType if method is not pix
    if (field === 'method' && value !== 'pix') {
      delete newPayments[index].pixType;
    }

    setPayments(newPayments);
  };

  const addPayment = () => {
    setPayments([...payments, { id: `payment-${Date.now()}`, method: '', value: 0 }]);
  };

  const removePayment = (index: number) => {
    const newPayments = payments.filter((_, i) => i !== index);
    setPayments(newPayments);
  };


  const handleSubmit = async () => {
    setError(null);

    // Validação de distância (somente para entregas bem-sucedidas)
    if (deliveryStatus === 'completed' && validationSettings?.enabled) {
      // Verifica se a localização está disponível
      if (!currentLocation) {
        setError(
          'Não foi possível obter sua localização. Certifique-se de que o GPS está ativo e que você iniciou a rota.'
        );
        return;
      }

      // Verifica se o endereço tem coordenadas
      if (!stopLocation) {
        setError(
          'Este endereço não possui coordenadas cadastradas. A validação de distância não pode ser realizada.'
        );
        return;
      }

      const distance = calculateDistance(
        currentLocation.lat,
        currentLocation.lng,
        stopLocation.lat,
        stopLocation.lng
      );

      if (distance > validationSettings.maxDistance) {
        setError(
          `Você está muito longe do endereço de entrega (${distance.toFixed(2)} km). É necessário estar a no máximo ${validationSettings.maxDistance} km para confirmar a entrega.`
        );
        return;
      }
    }

    if (deliveryStatus === 'completed' && !photo) {
      setError('Por favor, tire uma foto da entrega.');
      return;
    }

    if (deliveryStatus === 'completed') {
      for (const payment of payments) {
        if (!payment.method || payment.value <= 0) {
          setError('Preencha todas as formas de pagamento e valores (maior que zero).');
          return;
        }
      }
    }

    if (deliveryStatus === 'failed' && !failureReason) {
      setError('Por favor, selecione o motivo da falha.');
      return;
    }

    if (deliveryStatus === 'failed' && wentToLocation === null) {
      setError('Por favor, informe se você foi até o local.');
      return;
    }

    if (deliveryStatus === 'failed' && wentToLocation === true && !attemptPhoto) {
      setError('Por favor, tire uma foto do local para comprovar a tentativa de entrega.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      await onConfirm({
        photo: photo || undefined,
        notes: notes || undefined,
        status: deliveryStatus,
        failureReason: deliveryStatus === 'failed' ? failureReason : undefined,
        wentToLocation: deliveryStatus === 'failed' ? wentToLocation || undefined : undefined,
        attemptPhoto: deliveryStatus === 'failed' && wentToLocation ? attemptPhoto || undefined : undefined,
        payments: deliveryStatus === 'completed' ? payments : undefined,
      });

      resetForm();
      onClose();
    } catch (err) {
      console.error('Error confirming delivery:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(`Erro ao confirmar entrega: ${errorMessage}. Tente novamente.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    // Cleanup camera when dialog closes
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar Entrega</DialogTitle>
          <DialogDescription>
            {customerName && <span className="font-semibold">{customerName}</span>}
            {address && <span className="block text-xs mt-1">{address}</span>}
            {complement && <span className="block text-xs mt-0.5 text-muted-foreground">{complement}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status Selection */}
          <div className="space-y-2">
            <Label>Status da Entrega</Label>
            <RadioGroup value={deliveryStatus} onValueChange={(value) => setDeliveryStatus(value as 'completed' | 'failed')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="completed" id="completed" />
                <Label htmlFor="completed" className="flex items-center gap-2 cursor-pointer">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Entregue com sucesso
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="failed" id="failed" />
                <Label htmlFor="failed" className="flex items-center gap-2 cursor-pointer">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Falha na entrega
                </Label>
              </div>
            </RadioGroup>
          </div>

          {deliveryStatus === 'failed' && (
            <>
              <div className="space-y-2">
                <Label>Motivo da Falha</Label>
                <RadioGroup value={failureReason} onValueChange={setFailureReason}>
                  <div className="flex items-center space-x-2"> <RadioGroupItem value="ausente" id="ausente" /> <Label htmlFor="ausente" className="cursor-pointer">Cliente ausente</Label> </div>
                  <div className="flex items-center space-x-2"> <RadioGroupItem value="recusou" id="recusou" /> <Label htmlFor="recusou" className="cursor-pointer">Cliente recusou</Label> </div>
                  <div className="flex items-center space-x-2"> <RadioGroupItem value="endereco_incorreto" id="endereco_incorreto" /> <Label htmlFor="endereco_incorreto" className="cursor-pointer">Endereço incorreto</Label> </div>
                  <div className="flex items-center space-x-2"> <RadioGroupItem value="outro" id="outro" /> <Label htmlFor="outro" className="cursor-pointer">Outro motivo</Label> </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Foi até o local?</Label>
                <RadioGroup
                  value={wentToLocation === null ? '' : wentToLocation ? 'sim' : 'nao'}
                  onValueChange={(value) => {
                    setWentToLocation(value === 'sim');
                    if (value === 'nao') {
                      setAttemptPhoto(null);
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sim" id="went-sim" />
                    <Label htmlFor="went-sim" className="cursor-pointer">Sim</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="nao" id="went-nao" />
                    <Label htmlFor="went-nao" className="cursor-pointer">Não</Label>
                  </div>
                </RadioGroup>
              </div>

              {wentToLocation === true && (
                <div className="space-y-2">
                  <Label>Foto do Local (Comprovante de Tentativa)</Label>
                  <p className="text-xs text-muted-foreground">Tire uma foto da porta ou fachada para comprovar que esteve no local.</p>
                  <Tabs defaultValue="camera" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="camera"> <Camera className="mr-2 h-4 w-4" /> Câmera </TabsTrigger>
                      <TabsTrigger value="upload"> <Upload className="mr-2 h-4 w-4" /> Upload </TabsTrigger>
                    </TabsList>

                    <TabsContent value="camera" className="space-y-2">
                      {!attemptPhoto ? (
                        <>
                          {isCameraActive ? (
                            <div className="relative">
                              <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-black" style={{ maxHeight: '400px' }} />
                              <div className="flex gap-2 mt-2">
                                <Button onClick={async () => {
                                  if (!videoRef.current || !canvasRef.current) return;
                                  const video = videoRef.current;
                                  const canvas = canvasRef.current;
                                  const context = canvas.getContext('2d');
                                  if (!context) return;
                                  canvas.width = video.videoWidth;
                                  canvas.height = video.videoHeight;
                                  context.drawImage(video, 0, 0);
                                  const photoData = canvas.toDataURL('image/jpeg', 0.8);
                                  const compressedPhoto = await compressImage(photoData, 800, 0.6);
                                  setAttemptPhoto(compressedPhoto);
                                  stopCamera();
                                }} className="flex-1"> Capturar Foto </Button>
                                <Button onClick={stopCamera} variant="outline"> Cancelar </Button>
                              </div>
                            </div>
                          ) : (
                            <Button onClick={startCamera} variant="outline" className="w-full"> <Camera className="mr-2 h-4 w-4" /> Abrir Câmera </Button>
                          )}
                        </>
                      ) : (
                        <div className="relative">
                          <img src={attemptPhoto} alt="Foto da tentativa de entrega" className="w-full rounded-lg" />
                          <Button onClick={() => setAttemptPhoto(null)} variant="destructive" size="icon" className="absolute top-2 right-2"> <X className="h-4 w-4" /> </Button>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="upload" className="space-y-2">
                      {!attemptPhoto ? (
                        <div>
                          <Label htmlFor="attempt-photo-upload" className="cursor-pointer">
                            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                              <p className="mt-2 text-sm text-muted-foreground"> Clique para selecionar uma foto </p>
                            </div>
                          </Label>
                          <input id="attempt-photo-upload" type="file" accept="image/*" className="hidden" onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = async (e) => {
                              const photoData = e.target?.result as string;
                              const compressedPhoto = await compressImage(photoData, 800, 0.6);
                              setAttemptPhoto(compressedPhoto);
                            };
                            reader.readAsDataURL(file);
                          }} />
                        </div>
                      ) : (
                        <div className="relative">
                          <img src={attemptPhoto} alt="Foto da tentativa de entrega" className="w-full rounded-lg" />
                          <Button onClick={() => setAttemptPhoto(null)} variant="destructive" size="icon" className="absolute top-2 right-2"> <X className="h-4 w-4" /> </Button>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </>
          )}

          {deliveryStatus === 'completed' && (
            <>
              {/* Photo Capture */}
              <Tabs defaultValue="camera" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="camera"> <Camera className="mr-2 h-4 w-4" /> Câmera </TabsTrigger>
                  <TabsTrigger value="upload"> <Upload className="mr-2 h-4 w-4" /> Upload </TabsTrigger>
                </TabsList>

                <TabsContent value="camera" className="space-y-2">
                  {!photo ? (
                    <>
                      {isCameraActive ? (
                        <div className="relative">
                          <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-black" style={{ maxHeight: '400px' }} />
                          <div className="flex gap-2 mt-2">
                            <Button onClick={capturePhoto} className="flex-1"> Capturar Foto </Button>
                            <Button onClick={stopCamera} variant="outline"> Cancelar </Button>
                          </div>
                        </div>
                      ) : (
                        <Button onClick={startCamera} variant="outline" className="w-full"> <Camera className="mr-2 h-4 w-4" /> Abrir Câmera </Button>
                      )}
                    </>
                  ) : (
                    <div className="relative">
                      <img src={photo} alt="Foto da entrega" className="w-full rounded-lg" />
                      <Button onClick={() => setPhoto(null)} variant="destructive" size="icon" className="absolute top-2 right-2"> <X className="h-4 w-4" /> </Button>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </TabsContent>

                <TabsContent value="upload" className="space-y-2">
                  {!photo ? (
                    <div>
                      <Label htmlFor="photo-upload" className="cursor-pointer">
                        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                          <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                          <p className="mt-2 text-sm text-muted-foreground"> Clique para selecionar uma foto </p>
                        </div>
                      </Label>
                      <input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    </div>
                  ) : (
                    <div className="relative">
                      <img src={photo} alt="Foto da entrega" className="w-full rounded-lg" />
                      <Button onClick={() => setPhoto(null)} variant="destructive" size="icon" className="absolute top-2 right-2"> <X className="h-4 w-4" /> </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Payment Method */}
              <div className="space-y-4">
                <Label>Forma(s) de Pagamento *</Label>
                {payments.map((payment, index) => (
                  <div key={payment.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                       <Label htmlFor={`payment-method-${index}`} className="text-sm">Pagamento {index + 1}</Label>
                       {payments.length > 1 && (
                         <Button variant="ghost" size="icon" onClick={() => removePayment(index)} className="h-7 w-7">
                           <Trash2 className="h-4 w-4 text-destructive" />
                         </Button>
                       )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <Select value={payment.method} onValueChange={(value) => handlePaymentChange(index, 'method', value)}>
                            <SelectTrigger id={`payment-method-${index}`}>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dinheiro">Dinheiro</SelectItem>
                              <SelectItem value="pix">PIX</SelectItem>
                              <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                              <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                              <SelectItem value="boleto">Boleto</SelectItem>
                              <SelectItem value="outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                       </div>
                        <div className="space-y-1">
                           <Input
                             type="number"
                             placeholder="Valor R$"
                             value={payment.value || ''}
                             onChange={(e) => handlePaymentChange(index, 'value', parseFloat(e.target.value))}
                             min="0.01"
                             step="0.01"
                           />
                        </div>
                    </div>
                    {payment.method === 'cartao_credito' && (
                      <div className="pl-1 pt-2">
                        <Label htmlFor={`installments-${index}`}>Número de Parcelas</Label>
                        <Input
                          id={`installments-${index}`}
                          type="number"
                          placeholder="Ex: 1"
                          value={payment.installments || ''}
                          onChange={(e) => handlePaymentChange(index, 'installments', parseInt(e.target.value, 10))}
                          min="1"
                          className="mt-1"
                        />
                      </div>
                    )}
                    {payment.method === 'pix' && (
                      <div className="pl-1 pt-2">
                        <Label>Tipo de PIX</Label>
                        <RadioGroup
                          value={payment.pixType || ''}
                          onValueChange={(value) => handlePaymentChange(index, 'pixType', value as 'qrcode' | 'cnpj')}
                          className="mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="qrcode" id={`pix-qrcode-${index}`} />
                            <Label htmlFor={`pix-qrcode-${index}`} className="font-normal cursor-pointer">
                              QR Code
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="cnpj" id={`pix-cnpj-${index}`} />
                            <Label htmlFor={`pix-cnpj-${index}`} className="font-normal cursor-pointer">
                              CNPJ
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}
                  </div>
                ))}
                {payments.length < 2 && (
                   <Button variant="outline" size="sm" onClick={addPayment} className="w-full">
                     <Plus className="mr-2 h-4 w-4" />
                     Adicionar outra forma de pagamento
                   </Button>
                )}
              </div>
            </>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (Opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Adicione detalhes sobre a entrega..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline" disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {deliveryStatus === 'completed' ? 'Confirmar Entrega' : 'Registrar Falha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
