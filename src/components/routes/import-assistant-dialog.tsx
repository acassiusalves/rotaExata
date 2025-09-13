
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
  'Número',
  'Ignorar',
];

const normalizeString = (str: string) => {
  if (!str) return '';
  return str
    .replace(/^\uFEFF/, '')      // BOM
    .replace(/\uFFFD/g, '')      // replacement char 
    .normalize('NFKC')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // remove acentos
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // tira símbolos/espaços extras
    .trim();
};

const fieldSynonyms: Record<string, string[]> = {
  'Nome do Cliente': ['nome cliente', 'cliente', 'destinatario', 'contato'],
  'Observações':     ['observacao', 'observacoes', 'obs', 'comentario', 'nota'],
  'Número Pedido':   [
    'numero pedido', 'n pedido', 'pedido numero', 'pedido n',
    'nº pedido', 'n° pedido', 'no pedido', 'pedido', 'order id', 'id pedido'
  ],
  'Início do intervalo permitido': ['inicio intervalo', 'janela inicio', 'inicio janela', 'inicio permitido'],
  'Fim do intervalo permitido':    ['fim intervalo', 'janela fim', 'fim janela', 'fim permitido'],
  'Rua': ['logradouro', 'endereco'],
  'Município': ['cidade'],
  'Estado': ['uf'],
  'Número': ['numero', 'nº', 'n°', 'no', 'n', 'num', '#', 'numero casa', 'numero endereco'],
};


const normalizedFieldBank: Array<{label:string; keys:string[]}> =
  availableFields.map(lbl => ({
    label: lbl,
    keys: [normalizeString(lbl), ...(fieldSynonyms[lbl] ?? []).map(normalizeString)].filter(Boolean)
  }));

function autoMap(header: string) {
  const H = normalizeString(header);
  if (!H) return 'Ignorar';

  // 1) Igualdade exata com qualquer chave/sinônimo
  for (const f of normalizedFieldBank) {
    if (f.keys.some(k => k === H)) return f.label;
  }

  // 2) Tokens muito curtos (<=2) só mapeiam se forem sinônimos exatos
  if (H.length <= 2) {
    const tiny = normalizedFieldBank.find(f => f.keys.includes(H));
    return tiny?.label ?? 'Ignorar';
  }

  // 3) Match por "palavra inteira"
  for (const f of normalizedFieldBank) {
    if (f.keys.some(k => new RegExp(`\\b${k}\\b`).test(H))) return f.label;
  }

  // 4) Substring: escolha o candidato com a chave MAIS LONGA
  let best: { label: string; len: number } | undefined;
  for (const f of normalizedFieldBank) {
    for (const k of f.keys) {
      if (k && (H.includes(k) || k.includes(H))) {
        if (!best || k.length > best.len) best = { label: f.label, len: k.length };
      }
    }
  }
  return best?.label ?? 'Ignorar';
}


export function ImportAssistantDialog({
  isOpen,
  onClose,
  headers,
  onConfirm,
}: ImportAssistantDialogProps) {
  const [mapping, setMapping] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!isOpen) return;
    const initialMapping: Record<string, string> = {};
    headers.forEach((header) => { 
      initialMapping[header] = autoMap(header);
    });
    setMapping(initialMapping);
  }, [headers, isOpen]);

  const handleMappingChange = (header: string, field: string) => {
    setMapping(prev => {
        const next = {...prev};
        // se o campo for válido, remove esse campo de quem o tinha antes
        if (field !== 'Ignorar') {
            for (const [h, f] of Object.entries(next)) {
                if (h !== header && f === field) {
                    next[h] = 'Ignorar'; // ou o valor padrão
                }
            }
        }
        next[header] = field;
        return next;
    });
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

    