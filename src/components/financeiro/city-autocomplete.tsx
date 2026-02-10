'use client';

import * as React from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export interface City {
  name: string;
  placeId: string;
  fullName: string; // Nome completo com estado (ex: "Goiânia, Goiás")
}

interface CityAutocompleteProps {
  selectedCities: City[];
  onChange: (cities: City[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CityAutocomplete({
  selectedCities,
  onChange,
  placeholder = 'Digite o nome da cidade...',
  disabled = false,
}: CityAutocompleteProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const acRef = React.useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GMAPS_KEY!,
      libraries: ['places'],
      language: 'pt-BR',
      region: 'BR',
    });

    loader.load().then(() => {
      if (!mounted || !inputRef.current) return;

      acRef.current = new google.maps.places.Autocomplete(inputRef.current!, {
        types: ['(cities)'], // Restringe apenas a cidades
        componentRestrictions: { country: ['br'] }, // Apenas Brasil
        fields: ['place_id', 'name', 'formatted_address', 'address_components'],
      });

      acRef.current.addListener('place_changed', () => {
        const place = acRef.current!.getPlace();

        if (!place || !place.place_id) {
          return;
        }

        // Extrai nome da cidade e estado
        let cityName = '';
        let stateName = '';

        if (place.address_components) {
          for (const component of place.address_components) {
            if (component.types.includes('administrative_area_level_2')) {
              cityName = component.long_name;
            }
            if (component.types.includes('administrative_area_level_1')) {
              stateName = component.short_name; // Ex: GO, SP, RJ
            }
          }
        }

        // Se não encontrou nos components, usa o nome do place
        if (!cityName && place.name) {
          cityName = place.name;
        }

        const fullName = stateName ? `${cityName}, ${stateName}` : cityName;

        const newCity: City = {
          name: cityName,
          placeId: place.place_id,
          fullName: fullName,
        };

        // Verifica se a cidade já está na lista
        const cityExists = selectedCities.some(
          (c) => c.placeId === newCity.placeId || c.name === newCity.name
        );

        if (!cityExists) {
          onChange([...selectedCities, newCity]);
        }

        // Limpa o input
        if (inputRef.current) {
          inputRef.current.value = '';
          setInputValue('');
        }
      });
    });

    return () => {
      mounted = false;
    };
  }, [selectedCities, onChange]);

  const removeCity = (cityToRemove: City) => {
    onChange(selectedCities.filter((c) => c.placeId !== cityToRemove.placeId));
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {selectedCities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCities.map((city) => (
            <Badge
              key={city.placeId}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <span>{city.fullName}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => removeCity(city)}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
