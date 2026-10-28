import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({ error: 'Bot API désactivée dans Nashra V0.4. Utilisez la connexion personnelle Telegram.' }, { status: 410 }); }
