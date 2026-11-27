type Assignment={id:string;driverId:string;serviceId?:string;serviceCode?:string;code?:string};
type Count={services:Set<string>;serviceCodes:Set<string>;standaloneCodes:Set<string>;standalone:number;routes:number};
type DriverState<T>={id:string;rawStatus?:string;status:T;lastSeenAt:string|null};

export function staffDriverAssignments<T>(drivers:DriverState<T>[],assignments:Assignment[]) {
  const byDriver=new Map<string,Count>();
  for (const route of assignments) {
    const summary=byDriver.get(route.driverId) ?? {services:new Set(),serviceCodes:new Set(),standaloneCodes:new Set(),standalone:0,routes:0};
    summary.routes++;
    if (route.serviceId) {
      summary.services.add(route.serviceId);
      if (route.serviceCode) summary.serviceCodes.add(route.serviceCode);
    } else {
      summary.standalone++;
      if (route.code) summary.standaloneCodes.add(route.code);
    }
    byDriver.set(route.driverId,summary);
  }
  return new Map(drivers.map(driver=>{
    const summary=byDriver.get(driver.id);
    const pendingAssignmentsCount=(summary?.services.size ?? 0)+(summary?.standalone ?? 0);
    const status=driver.status!=='offline' && pendingAssignmentsCount ? 'busy' as const:driver.status;
    return [driver.id,{status,pendingAssignmentsCount,pendingServicesCount:summary?.services.size ?? 0,
      pendingRoutesCount:summary?.routes ?? 0,pendingStandaloneRoutesCount:summary?.standalone ?? 0,
      pendingServiceCodes:[...(summary?.serviceCodes ?? [])].sort(),pendingStandaloneRouteCodes:[...(summary?.standaloneCodes ?? [])].sort()}];
  }));
}

export type StaffDriverAssignment=Assignment;
