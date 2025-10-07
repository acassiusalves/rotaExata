
"use client";
import * as React from "react";
import { Loader } from "@googlemaps/js-api-loader";
import type { PlaceValue } from "@/lib/types";

export function AutocompleteInput({
  id,
  label,
  value,
  onChange,
  placeholder = "Digite o endereço",
}: {
  id?: string;
  label?: string;
  value?: PlaceValue | null;
  onChange: (v: PlaceValue | null) => void;
  placeholder?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const acRef = React.useRef<google.maps.places.Autocomplete | null>(null);

  React.useEffect(() => {
    if (inputRef.current && value && value.address) {
      const displayAddress = value.complemento
        ? `${value.address} - ${value.complemento}`
        : value.address;
      inputRef.current.value = displayAddress;
    }
  }, [value]);

  React.useEffect(() => {
    let mounted = true;
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GMAPS_KEY!,
      libraries: ["places", "geometry", "geocoding", "marker"],
      language: "pt-BR",
      region: "BR",
    });

    loader.load().then(() => {
      if (!mounted || !inputRef.current) return;
      acRef.current = new google.maps.places.Autocomplete(inputRef.current!, {
        fields: ["place_id", "formatted_address", "geometry"],
        componentRestrictions: { country: ["br"] },
      });
      acRef.current.addListener("place_changed", () => {
        const p = acRef.current!.getPlace();
        if (!p || !p.geometry) {
            // User entered the name of a Place that was not suggested and
            // pressed the Enter key, or the Place Details request failed.
            return;
        }
        const loc = p.geometry?.location;
        if (!loc || !p.place_id) return;
        onChange({
          id: p.place_id,
          placeId: p.place_id,
          address: p.formatted_address ?? "",
          lat: loc.lat(),
          lng: loc.lng(),
        });
      });
    });

    return () => { mounted = false; };
  }, [onChange]);

  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="block text-sm font-medium mb-1">{label}</label>}
      <input
        id={id}
        ref={inputRef}
        defaultValue={value?.address}
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
      />
    </div>
  );
}
