import { NextResponse } from 'next/server';
import { adminDb, verifyAuthToken, hasAllowedRole } from '@/lib/firebase/admin';

const ADMIN_ROLES = ['admin', 'socio', 'gestor'];

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        const authUser = await verifyAuthToken(authHeader);

        if (!authUser) {
            return NextResponse.json({ error: 'Não Autorizado' }, { status: 401 });
        }

        if (!hasAllowedRole(authUser.role, ADMIN_ROLES)) {
            return NextResponse.json({ error: 'Acesso Negado' }, { status: 403 });
        }

        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase Admin não inicializado.' }, { status: 500 });
        }

        const snapshot = await adminDb
            .collection('error_reports')
            .orderBy('createdAt', 'desc')
            .get();

        const reports = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return NextResponse.json({ reports });
    } catch (error: any) {
        console.error('Erro na leitura de reportes (API):', error);
        return NextResponse.json({ error: 'Falha interna' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        const authUser = await verifyAuthToken(authHeader);

        if (!authUser) {
            return NextResponse.json({ error: 'Não Autorizado' }, { status: 401 });
        }

        if (!hasAllowedRole(authUser.role, ADMIN_ROLES)) {
            return NextResponse.json({ error: 'Acesso Negado' }, { status: 403 });
        }

        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase Admin não inicializado.' }, { status: 500 });
        }

        const body = await request.json();
        const { reportId, status } = body;

        if (!reportId || !status) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
        }

        const reportRef = adminDb.collection('error_reports').doc(reportId);
        const reportDoc = await reportRef.get();

        if (!reportDoc.exists) {
            return NextResponse.json({ error: 'Reporte não encontrado' }, { status: 404 });
        }

        const reportData = reportDoc.data()!;
        const statusAnterior = reportData.status;

        await reportRef.update({ status });

        // Notificar o usuário quando o admin resolve a demanda
        const autorUid = reportData.user?.uid;
        if (status === 'resolved' && statusAnterior !== 'resolved' && autorUid) {
            const descricao = reportData.description ?? '';
            const mensagem = `Sua solicitação foi marcada como resolvida: "${descricao.slice(0, 80)}${descricao.length > 80 ? '...' : ''}"`;
            await adminDb.collection('notificacoes').add({
                tipo: 'reporte_resolvido',
                titulo: 'Demanda resolvida!',
                mensagem,
                lida: false,
                usuarioId: autorUid,
                link: '/admin/erros',
                createdAt: new Date(),
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Erro na edição do reporte (API):', error);
        return NextResponse.json({ error: 'Falha interna' }, { status: 500 });
    }
}
