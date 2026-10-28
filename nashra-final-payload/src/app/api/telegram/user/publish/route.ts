/** Legacy MTProto publisher retired: use the single audited announcement workflow. */
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    error: 'Cette ancienne méthode de publication est désactivée. Importez votre message dans Mes annonces, puis utilisez Publier ou Programmer.',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
