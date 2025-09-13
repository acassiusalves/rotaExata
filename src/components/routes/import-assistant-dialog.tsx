
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
import { ScrollArea } from '@/components/ui/scroll-area';

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
  'Observações',
  'Número Pedido',
  'Início do intervalo permitido',
  'Fim do intervalo permitido',
  'Ignorar',
];

const normalizeString = (str: string) => {
  return str
    .normalize('NFD') // Decomposes accented characters into base characters and combining marks
    .replace(/[\u0300-\u036f]/g, '') // Removes the combining marks
    .toLowerCase()
    .trim();
};


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
      const normalizedHeader = normalizeString(header);
      const foundField = availableFields.find((field) => {
        if (field === 'Ignorar') return false;
        const normalizedField = normalizeString(field);
        // Mapeamento mais flexível e robusto com normalização
        return normalizedHeader.includes(normalizedField) || normalizedField.includes(normalizedHeader);
      });
      initialMapping[header] = foundField || 'Ignorar';
    });
    setMapping(initialMapping);
  }, [headers, isOpen]); // Roda quando abre a dialog

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
        <ScrollArea className="max-h-[60vh] pr-4">
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
            {/* Header Titles */}
            <h4 className="font-semibold">Cabeçalhos encontrados</h4>
            <h4 className="font-semibold">Campos disponíveis para atribuição</h4>

            {/* Mapping Rows */}
            {headers.map((header) => (
                <React.Fragment key={header}>
                <div className="flex items-center">
                    <p className="text-sm text-muted-foreground truncate" title={header}>{header}</p>
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
        </ScrollArea>
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
