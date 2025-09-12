"use client";

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface ImportAssistantDialogProps {
  isOpen: boolean;
  onClose: () => void;
  headers: string[];
  onConfirm: (mapping: Record<string, string>) => void;
}

const availableFields = [
  'Nome do Cliente',
  'Rua',
  'Número',
  'Complemento',
  'Bairro',
  'Município',
  'Estado',
  'CEP',
  'Telefone',
  'Ignorar',
];

export function ImportAssistantDialog({
  isOpen,
  onClose,
  headers,
  onConfirm,
}: ImportAssistantDialogProps) {
  const [mapping, setMapping] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Tenta fazer um mapeamento automático inicial
    const initialMapping: Record<string, string> = {};
    headers.forEach((header) => {
      const foundField = availableFields.find(
        (field) => field.toLowerCase() === header.toLowerCase()
      );
      initialMapping[header] = foundField || 'Ignorar';
    });
    setMapping(initialMapping);
  }, [headers]);

  const handleMappingChange = (header: string, field: string) => {
    setMapping((prev) => ({ ...prev, [header]: field }));
  };

  const handleConfirm = () => {
    onConfirm(mapping);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assistente de Importação</DialogTitle>
          <DialogDescription>
            Associe os cabeçalhos da sua planilha aos campos do sistema para
            importar os endereços corretamente.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
          {/* Header Titles */}
          <h4 className="font-semibold">Cabeçalhos encontrados</h4>
          <h4 className="font-semibold">Campos disponíveis para atribuição</h4>

          {/* Mapping Rows */}
          {headers.map((header) => (
            <React.Fragment key={header}>
              <div className="flex items-center">
                <p className="text-sm text-muted-foreground">{header}</p>
              </div>
              <div>
                <Select
                  value={mapping[header]}
                  onValueChange={(value) => handleMappingChange(header, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um campo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((field) => (
                      <SelectItem key={field} value={field}>
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </React.Fragment>
          ))}
        </div>
        <DialogFooter className="mt-6 flex-col items-start gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center space-x-2">
            <Checkbox id="save-mapping" />
            <Label htmlFor="save-mapping" className="text-sm font-normal">
              Salvar configurações como padrão
            </Label>
          </div>
          <div className='space-x-2'>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm}>Confirmar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
