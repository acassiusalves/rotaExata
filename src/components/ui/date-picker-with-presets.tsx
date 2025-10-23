'use client';

import * as React from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerWithPresetsProps {
  startDate?: Date;
  endDate?: Date;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  placeholder?: string;
  className?: string;
}

type PresetValue = 'today' | 'yesterday' | 'yesterday-and-today' | '7days' | '14days' | '28days';

interface PresetOption {
  label: string;
  value: PresetValue;
  getRange: () => { start: Date; end: Date };
}

const PRESET_DATES: PresetOption[] = [
  {
    label: 'Hoje',
    value: 'today',
    getRange: () => ({ start: startOfDay(new Date()), end: new Date() })
  },
  {
    label: 'Ontem',
    value: 'yesterday',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 1)), end: startOfDay(new Date()) })
  },
  {
    label: 'Hoje e ontem',
    value: 'yesterday-and-today',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 1)), end: new Date() })
  },
  {
    label: 'Últimos 7 dias',
    value: '7days',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 7)), end: new Date() })
  },
  {
    label: 'Últimos 14 dias',
    value: '14days',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 14)), end: new Date() })
  },
  {
    label: 'Últimos 28 dias',
    value: '28days',
    getRange: () => ({ start: startOfDay(subDays(new Date(), 28)), end: new Date() })
  },
];

export function DatePickerWithPresets({
  startDate,
  endDate,
  onDateRangeChange,
  placeholder = 'Selecione o período',
  className,
}: DatePickerWithPresetsProps) {
  const [recentRanges, setRecentRanges] = React.useState<Array<{ start: Date; end: Date; label: string }>>([]);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(undefined);

  // Carregar ranges recentes do localStorage
  React.useEffect(() => {
    const stored = localStorage.getItem('recent-report-ranges');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setRecentRanges(parsed.map((r: any) => ({
          start: new Date(r.start),
          end: new Date(r.end),
          label: r.label
        })));
      } catch (e) {
        console.error('Error parsing recent ranges:', e);
      }
    }
  }, []);

  // Salvar range selecionado como recente
  const handlePresetSelect = (preset: PresetOption) => {
    const range = preset.getRange();

    // Atualizar lista de ranges recentes
    const updated = [
      { ...range, label: preset.label },
      ...recentRanges.filter(r => r.label !== preset.label),
    ].slice(0, 5); // Manter apenas os 5 mais recentes

    setRecentRanges(updated);
    localStorage.setItem(
      'recent-report-ranges',
      JSON.stringify(updated.map(r => ({ start: r.start.toISOString(), end: r.end.toISOString(), label: r.label })))
    );

    onDateRangeChange?.(range.start, range.end);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      const start = startOfDay(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      onDateRangeChange?.(start, end);
    }
  };

  const getDisplayText = () => {
    if (startDate && endDate) {
      if (startOfDay(startDate).getTime() === startOfDay(endDate).getTime()) {
        return format(startDate, 'dd/MM/yyyy', { locale: ptBR });
      }
      return `${format(startDate, 'dd/MM/yyyy', { locale: ptBR })} - ${format(endDate, 'dd/MM/yyyy', { locale: ptBR })}`;
    }
    return placeholder;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !startDate && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="truncate text-xs">{getDisplayText()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 max-w-[90vw]" align="start" side="bottom">
        <div className="flex flex-col sm:flex-row">
          {/* Sidebar com presets */}
          <div className="border-r border-b sm:border-b-0 p-2 space-y-0.5 w-full sm:w-[140px] bg-muted/30">
            <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-2 uppercase tracking-wide">
              Recentes
            </div>
            {recentRanges.length > 0 ? (
              <div className="space-y-0.5 mb-2">
                {recentRanges.slice(0, 3).map((range, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-7 px-2 font-normal"
                    onClick={() => onDateRangeChange?.(range.start, range.end)}
                  >
                    {range.label}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground px-2 py-1">
                Nenhum
              </div>
            )}

            <div className="border-t pt-2 mt-2 space-y-0.5">
              {PRESET_DATES.map(preset => (
                <Button
                  key={preset.value}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-7 px-2 font-normal"
                  onClick={() => handlePresetSelect(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Calendário - 1 ou 2 meses dependendo do tamanho da tela */}
          <div className="p-2">
            <div className="hidden lg:block">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                locale={ptBR}
                numberOfMonths={2}
                initialFocus
              />
            </div>
            <div className="block lg:hidden">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                locale={ptBR}
                numberOfMonths={1}
                initialFocus
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
