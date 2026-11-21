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
