import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { scanActionNeeded, dispatchNotifications } from '@/lib/email/dispatch';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const noStore={'Cache-Control':'no-store'};
function authorized(req:NextRequest) {
  const secret=process.env.CRON_SECRET||'';
  const header=req.headers.get('authorization')||'';
  if(secret.length<32||!header.startsWith('Bearer '))return false;
  const a=Buffer.from(header.slice(7));const b=Buffer.from(secret);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export async function GET(req:NextRequest) {
  if(!authorized(req))return NextResponse.json({error:'Non autorisé.'},{status:401,headers:noStore});
  if(req.nextUrl.searchParams.get('dry_run')==='1')return NextResponse.json({state:'dry_run',enabled:process.env.NASHRA_EMAILS_ENABLED==='1'},{headers:noStore});
  try {
    const scanned=await scanActionNeeded();
    const delivered=await dispatchNotifications();
    return NextResponse.json({...scanned,...delivered},{headers:noStore});
  }catch{
    // Do not leak Resend, billing, or Supabase data.
    return NextResponse.json({error:'Traitement des notifications indisponible.'},{status:503,headers:noStore});
  }
}
