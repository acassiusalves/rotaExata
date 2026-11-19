import { authorizeOperationalWriter } from '@/lib/firebase/operational-writer-auth';
import { EarningsError } from '@/lib/server/earnings/transport';
import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { logRouteCreatedAdmin,logPointsCreatedAdmin,logRouteDispatchedAdmin } from '@/lib/firebase/activity-log-admin';
import { InvalidDispatchDriverError } from '@/lib/dispatch-driver';
import { createServiceRoutesAtomically,serviceRouteConfigs } from '@/lib/server/driver/service-route-creation';

export async function POST(request:NextRequest,{params}:{params:Promise<{serviceId:string}>}) {
  try {
    const userId=await authorizeOperationalWriter(request);
    const {serviceId}=await params;
    if (!adminDb) throw new EarningsError(500,'Firebase Admin não inicializado');
    const {routes}=await request.json();
    const parsed=serviceRouteConfigs.safeParse(routes);
    if (!parsed.success) throw new EarningsError(400,'routes é obrigatório e deve conter configurações válidas');
    const {result,logs}=await createServiceRoutesAtomically(adminDb,serviceId,userId,parsed.data);
    for (const entry of logs) {
      const context={userId,userName:'Sistema Lunna',routeId:entry.id,routeCode:entry.code,serviceId,serviceCode:entry.serviceCode};
      try {
        if (entry.driver) {
          await logRouteDispatchedAdmin({...context,driverId:entry.driver.id,driverName:entry.driver.name,totalPoints:entry.stopsCount});
        } else await logRouteCreatedAdmin({...context,totalPoints:entry.stopsCount});
        if (entry.pointCodes.length) await logPointsCreatedAdmin({...context,pointCodes:entry.pointCodes,totalPoints:entry.pointCodes.length});
      } catch (error) { console.error('Erro ao registrar atividade:',error); }
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EarningsError) return NextResponse.json({error:error.code},{status:error.status});
    if (error instanceof InvalidDispatchDriverError) return NextResponse.json({error:error.message},{status:400});
    console.error('Erro ao criar rotas do serviço:',error);
    return NextResponse.json({error:'Erro interno ao criar rotas',details:error instanceof Error?error.message:String(error)},{status:500});
  }
}
