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
  PenTool,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface DeliveryConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    photo?: string;
    signature?: string;
    notes?: string;
    status: 'completed' | 'failed';
    failureReason?: string;
    paymentMethod?: string;
  }) => Promise<void>;
  customerName?: string;
  address?: string;
}

export function DeliveryConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  customerName,
  address,
}: DeliveryConfirmationDialogProps) {
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [signature, setSignature] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState('');
  const [deliveryStatus, setDeliveryStatus] = React.useState<'completed' | 'failed'>('completed');
  const [failureReason, setFailureReason] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const signatureCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = React.useState(false);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const streamRef = React.useRef<MediaStream | null>(null);

  // Camera handling
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Não foi possível acessar a câmera. Verifique as permissões.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const photoData = canvas.toDataURL('image/jpeg', 0.8);
    setPhoto(photoData);
    stopCamera();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setPhoto(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Signature handling
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (signatureCanvasRef.current) {
      const context = signatureCanvasRef.current.getContext('2d');
      if (context) {
        context.beginPath();
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !signatureCanvasRef.current) return;

    const canvas = signatureCanvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e)
      ? e.touches[0].clientX - rect.left
      : e.clientX - rect.left;
    const y = ('touches' in e)
      ? e.touches[0].clientY - rect.top
      : e.clientY - rect.top;

    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#000';

    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
  };

  const clearSignature = () => {
    if (!signatureCanvasRef.current) return;
    const context = signatureCanvasRef.current.getContext('2d');
    if (context) {
      context.clearRect(0, 0, signatureCanvasRef.current.width, signatureCanvasRef.current.height);
    }
    setSignature(null);
  };

  const saveSignature = () => {
    if (!signatureCanvasRef.current) return;
    const signatureData = signatureCanvasRef.current.toDataURL('image/png');
    setSignature(signatureData);
  };

  const handleSubmit = async () => {
    if (deliveryStatus === 'completed' && !photo) {
      setError('Por favor, tire uma foto da entrega.');
      return;
    }

    if (deliveryStatus === 'completed' && !paymentMethod) {
      setError('Por favor, selecione a forma de pagamento.');
      return;
    }

    if (deliveryStatus === 'failed' && !failureReason) {
      setError('Por favor, selecione o motivo da falha.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm({
        photo: photo || undefined,
        signature: signature || undefined,
        notes: notes || undefined,
        status: deliveryStatus,
        failureReason: deliveryStatus === 'failed' ? failureReason : undefined,
        paymentMethod: deliveryStatus === 'completed' ? paymentMethod : undefined,
      });

      // Reset form
      setPhoto(null);
      setSignature(null);
      setNotes('');
      setDeliveryStatus('completed');
      setFailureReason('');
      setPaymentMethod('');
      onClose();
    } catch (err) {
      console.error('Error confirming delivery:', err);
      setError('Erro ao confirmar entrega. Tente novamente.');
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

  React.useEffect(() => {
    // Initialize signature canvas
    if (signatureCanvasRef.current && !signature) {
      const canvas = signatureCanvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [signature]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar Entrega</DialogTitle>
          <DialogDescription>
            {customerName && <span className="font-semibold">{customerName}</span>}
            {address && <span className="block text-xs mt-1">{address}</span>}
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
            <div className="space-y-2">
              <Label>Motivo da Falha</Label>
              <RadioGroup value={failureReason} onValueChange={setFailureReason}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ausente" id="ausente" />
                  <Label htmlFor="ausente" className="cursor-pointer">Cliente ausente</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="recusou" id="recusou" />
                  <Label htmlFor="recusou" className="cursor-pointer">Cliente recusou</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="endereco_incorreto" id="endereco_incorreto" />
                  <Label htmlFor="endereco_incorreto" className="cursor-pointer">Endereço incorreto</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="outro" id="outro" />
                  <Label htmlFor="outro" className="cursor-pointer">Outro motivo</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {deliveryStatus === 'completed' && (
            <>
              {/* Photo Capture */}
              <Tabs defaultValue="camera" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="camera">
                    <Camera className="mr-2 h-4 w-4" />
                    Câmera
                  </TabsTrigger>
                  <TabsTrigger value="upload">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="camera" className="space-y-2">
                  {!photo ? (
                    <>
                      {isCameraActive ? (
                        <div className="relative">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="w-full rounded-lg"
                          />
                          <div className="flex gap-2 mt-2">
                            <Button onClick={capturePhoto} className="flex-1">
                              Capturar Foto
                            </Button>
                            <Button onClick={stopCamera} variant="outline">
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button onClick={startCamera} variant="outline" className="w-full">
                          <Camera className="mr-2 h-4 w-4" />
                          Abrir Câmera
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="relative">
                      <img src={photo} alt="Foto da entrega" className="w-full rounded-lg" />
                      <Button
                        onClick={() => setPhoto(null)}
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                      >
                        <X className="h-4 w-4" />
                      </Button>
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
                          <p className="mt-2 text-sm text-muted-foreground">
                            Clique para selecionar uma foto
                          </p>
                        </div>
                      </Label>
                      <input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <img src={photo} alt="Foto da entrega" className="w-full rounded-lg" />
                      <Button
                        onClick={() => setPhoto(null)}
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Signature */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Assinatura (Opcional)</Label>
                  {!signature && (
                    <Button onClick={clearSignature} variant="ghost" size="sm">
                      Limpar
                    </Button>
                  )}
                </div>

                {!signature ? (
                  <div className="border rounded-lg p-2 bg-white">
                    <canvas
                      ref={signatureCanvasRef}
                      width={400}
                      height={200}
                      className="w-full touch-none cursor-crosshair"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                    <Button onClick={saveSignature} variant="outline" size="sm" className="w-full mt-2">
                      <PenTool className="mr-2 h-4 w-4" />
                      Salvar Assinatura
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <img src={signature} alt="Assinatura" className="w-full rounded-lg border" />
                    <Button
                      onClick={() => setSignature(null)}
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <Label>Forma de Pagamento *</Label>
                <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dinheiro" id="dinheiro" />
                    <Label htmlFor="dinheiro" className="cursor-pointer font-normal">Dinheiro</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pix" id="pix" />
                    <Label htmlFor="pix" className="cursor-pointer font-normal">PIX</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cartao_credito" id="cartao_credito" />
                    <Label htmlFor="cartao_credito" className="cursor-pointer font-normal">Cartão de Crédito</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cartao_debito" id="cartao_debito" />
                    <Label htmlFor="cartao_debito" className="cursor-pointer font-normal">Cartão de Débito</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="boleto" id="boleto" />
                    <Label htmlFor="boleto" className="cursor-pointer font-normal">Boleto</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="outro" id="outro_pagamento" />
                    <Label htmlFor="outro_pagamento" className="cursor-pointer font-normal">Outro</Label>
                  </div>
                </RadioGroup>
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
