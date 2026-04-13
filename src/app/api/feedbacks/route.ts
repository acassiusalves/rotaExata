import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { description, user, url, userAgent, resolution, logs } = body;

        if (!description || !user?.uid) {
            return NextResponse.json(
                { error: 'A descrição do problema e a identificação do usuário são obrigatórias.' },
                { status: 400 }
            );
        }

        if (!adminDb) {
            return NextResponse.json(
                { error: 'Firebase Admin não inicializado.' },
                { status: 500 }
            );
        }

        const reportRef = await adminDb.collection('error_reports').add({
            description,
            user: {
                uid: user.uid,
                email: user.email,
                name: user.name,
            },
            context: {
                url,
                userAgent,
                resolution,
            },
            logs: logs || [],
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({ success: true, id: reportRef.id });
    } catch (error: any) {
        console.error('Erro ao salvar reporte de problema:', error);
        return NextResponse.json(
            { error: 'Falha interna ao salvar o reporte.' },
            { status: 500 }
        );
    }
}
