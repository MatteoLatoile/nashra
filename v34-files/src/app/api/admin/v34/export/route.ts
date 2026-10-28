import { NextRequest, NextResponse } from 'next/server';
import { csv, requireAdmin, safeMessage } from '@/lib/nashra-admin/guards';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Export is deliberately limited to 200 entries; no sessions or private message bodies. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const resource = new URL(req.url).searchParams.get('resource');
  let rows: unknown[][];
  try {
    const db = auth.db!;
    if (resource === 'users') {
      const { data, error } = await db.auth.admin.listUsers({page:1,perPage:200});
      if (error) throw error;
      rows = [['ID','E-mail','Création (UTC)','Dernière connexion (UTC)'],
        ...(data?.users || []).map(u => [u.id,u.email || '',u.created_at,u.last_sign_in_at || ''])];
    } else if (resource === 'billing') {
      const { data, error } = await db.from('nashra_subscriptions')
        .select('user_id,status,price_id,current_period_end,updated_at').order('updated_at',{ascending:false}).limit(200);
      if (error) throw error;
      rows = [['Utilisateur','Statut','Prix Stripe test','Fin de période','Mis à jour'],
        ...(data || []).map(x => [x.user_id,x.status,x.price_id,x.current_period_end,x.updated_at])];
    } else if (resource === 'incidents') {
      const { data, error } = await db.from('delivery_queue')
        .select('id,user_id,status,scheduled_at,attempted_at,created_at,last_error')
        .in('status',['needs_review','blocked','processing']).order('created_at',{ascending:false}).limit(200);
      if (error) throw error;
      rows = [['ID opération','Utilisateur','Statut','Planifié','Tentative','Créé','Erreur'],
        ...(data || []).map(x => [x.id,x.user_id,x.status,x.scheduled_at,x.attempted_at,x.created_at,x.last_error])];
    } else return NextResponse.json({ error:'Export inconnu.' },{status:400,headers:{'Cache-Control':'no-store'}});
    return new NextResponse(csv(rows), {headers: {
      'Content-Type':'text/csv; charset=utf-8',
      'Content-Disposition':`attachment; filename="nashra-${resource}-${new Date().toISOString().slice(0,10)}.csv"`,
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    }});
  } catch (error) { return safeMessage(error); }
}
