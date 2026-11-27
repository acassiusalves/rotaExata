const operationalDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});

export function currentRouteDay(now=new Date()) {
  const start=Date.parse(operationalDay.format(now)+'T00:00:00-03:00');
  return [start,start+24*3_600_000] as const;
}
