/** Read scheduled Telegram messages; never initiate a publish. */
import { NextRequest, NextResponse } from 'next/server';
import bigInt from 'big-integer';
import { Api, context, getAccount, listDialogsRaw } from '@/lib/telegram-user/core';
import { withSchedulingClient } from '@/lib/automation/telegram-native';
import { getServiceClient } from '@/lib/automation/worker';
import type { AppData } from '@/lib/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMIT=35, MAX_CHATS=8;
type Job={ id:string; campaign_id:string; destination_id:string; status:string; scheduled_at:string; telegram_scheduled_ids:unknown; telegram_message_id:number|null };
type Result={jobId:string;status:'scheduled'|'partial'|'missing'|'possible'|'unknown'|'error';detail:string;possibleMatches?:number};
type Body={action?:'check'|'mark_sent'|'mark_not_sent';campaignId?:string;jobId?:string;confirmed?:boolean};
const fail=(error:string,status=400)=>NextResponse.json({ok:false,error},{status,headers});
function peerOf(c:AppData['campaigns'][number],destinationId:string){
  const peer=c.destinationHandles?.[destinationId];
  return typeof peer==='string' && /^-?\d{3,30}$/.test(peer) ? peer : null;
}
function idsOf(j:Job):number[]{
  const raw=Array.isArray(j.telegram_scheduled_ids)?j.telegram_scheduled_ids:[];
  const ids=raw.filter((id):id is number=>typeof id==='number'&&Number.isSafeInteger(id)&&id>0);
  if(ids.length)return ids;
  return typeof j.telegram_message_id==='number'&&Number.isSafeInteger(j.telegram_message_id)&&j.telegram_message_id>0?[j.telegram_message_id]:[];
}
export async function POST(req:NextRequest){
  try{
    const c=await context(req,true);
    const body=await req.json() as Body;
    if(!body.campaignId||!UUID.test(body.campaignId))return fail('Programmation invalide.');
    if(!['check','mark_sent','mark_not_sent'].includes(body.action??''))return fail('Action inconnue.');
    const {data:ws,error:wsError}=await c.supabase.from('workspaces').select('data').eq('user_id',c.userId).maybeSingle();
    if(wsError||!ws?.data)return fail('Espace Nashra inaccessible.',500);
    const campaign=(ws.data as AppData).campaigns?.find(x=>x.id===body.campaignId);
    if(!campaign)return fail('Programmation introuvable.',404);
    const service=getServiceClient();
    if(body.action!=='check'){
      if(body.confirmed!==true||!body.jobId||!UUID.test(body.jobId))return fail('Confirmez le message concerné.');
      const {data:job,error}=await service.from('delivery_queue').select('id,status,scheduled_at')
        .eq('user_id',c.userId).eq('campaign_id',campaign.id).eq('id',body.jobId).maybeSingle();
      if(error||!job)return fail('Message introuvable.',404);
      const cutoff=new Date(Date.now()-30*60_000).toISOString();
      if(!Number.isFinite(Date.parse(job.scheduled_at))||job.scheduled_at>=cutoff)
        return fail('Attendez 30 minutes après l’heure prévue pour éviter une confusion avec un envoi en cours.',409);
      if(!['needs_review','telegram_scheduled','processing'].includes(job.status))return fail('Statut déjà résolu ou non éligible.',409);
      const sent=body.action==='mark_sent';
      const status=sent?'sent':'cancelled';
      const note=sent?'Déclaré envoyé manuellement par l’utilisateur : non certifié par Telegram.':'Déclaré non envoyé manuellement : aucune nouvelle tentative.';
      const {data:saved,error:saveError}=await service.from('delivery_queue')
        .update({status,last_error:note,finished_at:new Date().toISOString(),updated_at:new Date().toISOString()})
        .eq('user_id',c.userId).eq('campaign_id',campaign.id).eq('id',job.id).eq('status',job.status)
        .lt('scheduled_at',cutoff).select('id').maybeSingle();
      if(saveError||!saved)return fail('Statut modifié entre-temps. Actualisez la page.',409);
      return NextResponse.json({ok:true,message:sent?'Déclaration « envoyé » enregistrée. Aucun envoi effectué.':'Déclaration « non envoyé » enregistrée. Aucun message renvoyé.'},{headers});
    }
    const {data:rows,error:jobsError}=await service.from('delivery_queue')
      .select('id,campaign_id,destination_id,status,scheduled_at,telegram_scheduled_ids,telegram_message_id')
      .eq('user_id',c.userId).eq('campaign_id',campaign.id)
      .in('status',['needs_review','processing','telegram_scheduled'])
      .order('scheduled_at',{ascending:false}).limit(501);
    if(jobsError||!rows)return fail('File inaccessible.',500);
    const jobs=(rows as Job[]).filter(j=>j.status!=='processing'||Date.now()-Date.parse(j.scheduled_at)>15*60_000).slice(0,LIMIT);
    if(!jobs.length)return NextResponse.json({ok:true,results:[],checked:0,partial:false},{headers});
    const account=await getAccount(c);
    if(!account?.session_ciphertext)return fail('Reconnectez votre compte personnel Telegram.',409);
    const peers=new Map<string,Job[]>(), results:Result[]=[];
    for(const job of jobs){
      const peer=peerOf(campaign,job.destination_id);
      if(!peer){results.push({jobId:job.id,status:'unknown',detail:'Groupe d’origine non enregistré : vérification manuelle nécessaire.'});continue;}
      const batch=peers.get(peer)??[]; batch.push(job);peers.set(peer,batch);
    }
    await withSchedulingClient(account.session_ciphertext,async client=>{
      // Load dialogs once rather than up to eight independent Telegram dialog scans.
      const dialogs = new Map((await listDialogsRaw(client)).map(d => [d.id, d.entity]));
      let seen=0;
      for(const [chatId,group] of peers){
        if(seen++>=MAX_CHATS){for(const j of group)results.push({jobId:j.id,status:'unknown',detail:'Limite de destinations atteinte. Vérification incomplète.'});continue;}
        try{
          const entity=dialogs.get(chatId);
          if(!entity){for(const j of group)results.push({jobId:j.id,status:'unknown',detail:'Groupe d’origine introuvable dans les conversations Telegram.'});continue;}
          const peer=await client.getInputEntity(entity);
          const history=await client.invoke(new Api.messages.GetScheduledHistory({peer,hash:bigInt.zero}));
          if(!('messages' in history)||('count' in history&&history.count>history.messages.length)){
            for(const j of group)results.push({jobId:j.id,status:'unknown',detail:'Telegram n’a pas renvoyé une liste complète.'});continue;
          }
          const messages=history.messages.filter((m):m is Api.Message=>m instanceof Api.Message);
          const present=new Set(messages.map(m=>m.id));
          for(const job of group){
            const ids=idsOf(job);
            if(ids.length){
              const found=ids.filter(id=>present.has(id)).length;
              if(found===ids.length){
                results.push({jobId:job.id,status:'scheduled',detail:'Toujours dans les messages programmés de Telegram.'});
                if(job.status==='needs_review'&&Date.parse(job.scheduled_at)>Date.now()+3*60_000){
                  // Only positive Telegram evidence can restore a FUTURE scheduling state.
                  await service.from('delivery_queue').update({status:'telegram_scheduled',last_error:null,updated_at:new Date().toISOString()})
                    .eq('user_id',c.userId).eq('campaign_id',campaign.id).eq('id',job.id).eq('status','needs_review')
                    .gt('scheduled_at',new Date(Date.now()+3*60_000).toISOString());
                }
              }else if(found){results.push({jobId:job.id,status:'partial',detail:`Seulement ${found} identifiant(s) sur ${ids.length} présents : ne relancez pas.`});}
              else{results.push({jobId:job.id,status:'missing',detail:'Absent de la file programmée : ceci ne prouve ni un envoi ni une annulation.'});}
            }else{
              const date=Date.parse(job.scheduled_at);
              const matches=messages.filter(m=>Math.abs(m.date*1000-date)<=120_000).length;
              results.push({jobId:job.id,status:matches?'possible':'unknown',possibleMatches:matches,
                detail:matches?`${matches} candidat(s) proche(s) de l’heure prévue, sans preuve qu’il s’agit du bon message.`:'Identifiant Telegram manquant : correspondance automatique impossible.'});
            }
          }
        }catch{for(const j of group)results.push({jobId:j.id,status:'error',detail:'Impossible de consulter cette destination sur Telegram pour le moment.'});}
      }
    });
    return NextResponse.json({ok:true,results,checked:results.length,partial:rows.length>jobs.length},{headers});
  }catch{return fail('Vérification temporairement indisponible. Contrôlez la connexion Telegram.',503);}
}
