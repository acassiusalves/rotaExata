import type { PlaceValue } from './types';

type AddressComponent = {
  types: readonly string[];
  long_name: string;
  short_name: string;
};

export function geocodedMunicipality(components?: readonly AddressComponent[] | null) {
  const component = (type: string) => components?.find(value => value.types.includes(type));
  const city = component('administrative_area_level_2')?.long_name.trim() ||
    component('locality')?.long_name.trim();
  const state = component('administrative_area_level_1')?.short_name.trim();
  return {
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
  };
}

type GeocodedStopAddress = Pick<PlaceValue, 'address' | 'placeId' | 'lat' | 'lng' | 'city' | 'state'>;
type ExistingStopAddress = Pick<PlaceValue, 'id' | 'pointCode' | 'lat' | 'lng' | 'city' | 'state' | 'cidade'> & {
  uf?: string;
};

export function geocodedStopEdit(
  previous: ExistingStopAddress,
  location: GeocodedStopAddress,
  usingSelectedCoordinates: boolean,
) {
  const previousCity = previous.cidade || previous.city;
  const previousState = previous.uf || previous.state;
  const retain = usingSelectedCoordinates && previous.lat === location.lat && previous.lng === location.lng &&
    (!location.city || !previousCity || location.city === previousCity) &&
    (!location.state || !previousState || location.state === previousState);
  return {
    ...location,
    id: previous.id,
    ...(previous.pointCode ? { pointCode: previous.pointCode } : {}),
    // Explicit empty fields clear prior values when the server rebases the edit.
    city: location.city || (retain ? previousCity : '') || '',
    state: location.state || (retain ? previousState : '') || '',
    cidade: '',
    uf: '',
  };
}
