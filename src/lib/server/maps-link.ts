import { extractCoordsFromMapsUrl,isShortMapsLink } from '../maps-link.ts';
import { EarningsError } from './earnings/transport.ts';

const mapsHost=/^(?:(?:www|maps)\.)?google\.(?:com(?:\.br)?|co\.uk)$/i;

function accepted(input:string,base?:URL) {
  let url:URL;
  try {url=new URL(input,base);} catch {throw new EarningsError(422,'staff_invalid_maps_link');}
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !(isShortMapsLink(url.href) || (mapsHost.test(url.hostname) &&
        (url.pathname==='/maps' || url.pathname.startsWith('/maps/') ||
          (url.hostname.startsWith('maps.') && url.pathname==='/'))))) {
    throw new EarningsError(422,'staff_invalid_maps_link');
  }
  return url;
}

export async function resolveStaffMapsLink(input:string,fetchLink:typeof fetch=fetch) {
  let url=accepted(input.trim());
  const signal=AbortSignal.timeout(8000);
  for (let hops=0;hops<=4;hops++) {
    const coords=extractCoordsFromMapsUrl(url.href);
    if (coords) return {...coords,expandedUrl:url.href};
    if (!isShortMapsLink(url.href) || hops===4) break;
    let response:Response;
    try {response=await fetchLink(url,{redirect:'manual',signal});}
    catch {throw new EarningsError(422,'staff_maps_link_unavailable');}
    const location=response.headers.get('location');
    void response.body?.cancel();
    if (!location || response.status<300 || response.status>399) break;
    url=accepted(location,url);
  }
  throw new EarningsError(422,'staff_maps_coordinates_not_found');
}
