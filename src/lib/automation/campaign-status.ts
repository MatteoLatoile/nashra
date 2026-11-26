import type {Campaign,Destination} from '../store';
export type Job = {id:string;campaign_id:string;destination_id:string;status:string;scheduled_at:string;attempted_at?:string|null;last_error?:string|null;telegram_message_id?:number|null;telegram_scheduled_ids?:number[]|null};
export type Rule = {id:string;status:string;last_problem:string|null};
type Action = 'verify'|'connect'|'groups'|'repair'|'stop'|'refresh'|'details'|null;
type Phase = 'scheduled'|'paused'|'waiting'|'review'|'ended';
export type Summary = {phase:Phase;label:string;message:string;action:Action;next:Job|undefined;resume:boolean;edit:boolean;remove:boolean};
export function campaignStatus(c:Campaign,jobs:Job[],rule:Rule|undefined,dests:Destination[],loaded:boolean,enabled:boolean,now:number,connected:boolean|null=null):Summary {
  const recurring=c.recurrence?.mode==='interval';
  const paused=c.status==='paused'||rule?.status==='paused';
  const future=(j:Job)=>Date.parse(j.scheduled_at)>now;
  const next=loaded ? jobs.filter(j=>future(j)&&['telegram_scheduled','approved'].includes(j.status)).sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at))[0] : undefined;
  const result=(phase:Phase,label:string,message='',action:Action=null,extra:Partial<Summary>={}):Summary=>({
    phase,label,message,action,next,resume:false,edit:false,remove:false,...extra
  });
  if(!loaded) return result('waiting','Suivi indisponible','Actualisez le suivi pour retrouver vos publications.','refresh');
  // A Telegram-confirmed schedule whose delivery time has passed is NOT an
  // uncertain Telegram send. Reconciliation checks the published history first.
  const outstanding=jobs.filter(j=>j.status==='needs_review'||(!recurring&&j.status==='telegram_scheduled'&&!future(j)));
  const processing=jobs.filter(j=>j.status==='processing');
  if(outstanding.length || processing.some(j=>now-Date.parse(j.attempted_at||j.scheduled_at)>15*60_000)) {
    const job=outstanding[0]||processing[0];
    const group=dests.find(d=>d.id===job.destination_id)?.name||'le groupe concerné';
    const planned=Date.parse(job.scheduled_at);
    // Before delivery (and during Telegram's safety window), the user cannot
    // meaningfully resolve an uncertain send. Keep the read-only check active
    // after delivery, but never display a premature "Action nécessaire".
    if(Number.isFinite(planned) && now<planned)
      return result('waiting','Vérification en cours',
        `Nashra contrôle la programmation dans ${group}. Aucune relance ne sera effectuée sans confirmation.`);
    if(Number.isFinite(planned) && now<planned+30*60_000)
      return result('waiting','Vérification en cours',
        `Nashra recherche la publication dans ${group}. Vous n’avez rien à faire pour le moment.`,'verify');
    return result('review','Action nécessaire',
      `Nashra n’a pas pu confirmer la publication dans ${group}. Une vérification est nécessaire avant toute relance.`,'verify');
  }
  if(processing.length) return result('waiting','En cours','Nashra attend la réponse de Telegram.');
  // A one-time campaign with all its jobs cancelled is definitively cancelled,
  // even when a stale paused flag or last_problem remains in the old workspace.
  if(!recurring && jobs.length>0 && jobs.every(j=>j.status==='cancelled'))
    return result('ended','Annulée','Aucun nouvel envoi n’est prévu.',null,{remove:true});
  const awaitingProof=jobs.some(j=>j.status==='telegram_scheduled'&&!future(j));
  if(paused && next) {
    if(recurring && /réponse Telegram incertaine/i.test(rule?.last_problem||''))
      return result('paused','Prête à reprendre',
        'Des publications futures sont déjà programmées. Nashra ne les programmera pas deux fois.',
        null,{resume:enabled});
    return result('review','Action nécessaire','La répétition est arrêtée. Une publication future reste programmée.','stop');
  }
  const problem=[rule?.last_problem,...jobs.filter(j=>['failed','blocked'].includes(j.status)).map(j=>j.last_error)].filter(Boolean).join(' ');
  const failed=jobs.find(j=>['blocked','failed'].includes(j.status));
  if(/^Reprise automatique après /.test(problem) && !paused)
    return result('waiting','Reprise automatique prévue','Nashra attend le délai de Telegram avant de préparer les prochaines publications.',null,{remove:true});
  if(connected===true && paused && !failed && /déconnect|reconnect/i.test(problem))
    return result('paused','Prête à reprendre','Votre compte Telegram est de nouveau connecté.',null,{resume:enabled,edit:true,remove:true});
  if(/reconnect|déconnect|session.*expir/i.test(problem))
    return result('review','Action nécessaire','Reconnectez votre compte Telegram pour continuer.','connect',{remove:true});
  if(paused && recurring && !failed && /réponse Telegram incertaine/i.test(problem))
    return result('paused','En pause','Le suivi a été mis à jour.',null,{resume:enabled,edit:true,remove:true});
  if (/groupe|destination|sujet|canal/i.test(problem) && !/désynchronis/i.test(problem)) {
    const id=failed?.destination_id||c.destinationIds.find(id=>!dests.find(d=>d.id===id)?.authorized);
    const name=dests.find(d=>d.id===id)?.name||c.destinationHandles?.[id||''];
    return result('review','Action nécessaire',name?`Vérifiez votre autorisation de publier dans « ${name} ».`:'Vérifiez les destinations autorisées pour cette campagne.','groups',{remove:true});
  }
  if(paused && /désynchronis|règle modifiée/i.test(problem))
    return result('review','Action nécessaire','Nashra peut restaurer les réglages de cette campagne.','repair',{remove:true});
  if(paused && !failed && (!problem || /incertain|vérifi/i.test(problem))) {
    const legacySafe=c.nativeTelegram||!jobs.some(j=>j.status==='sent') && (c.scheduledDates||[c.scheduledAt]).every(d=>Date.parse(d)>now+180_000);
    return result('paused','En pause','',null,{resume:Boolean(legacySafe&&(!recurring||enabled)),edit:true,remove:true});
  }
  if(problem||failed) return result('review','Action nécessaire','Certaines destinations n’ont pas pu être programmées.','details',{remove:true});
  const instant=(c as Campaign & {startsImmediately?:boolean}).startsImmediately;
  if(instant && c.destinationIds.some(id=>!jobs.some(j=>j.destination_id===id))) {
    if(now-Date.parse(c.createdAt)<120000) return result('waiting','Démarrage en cours');
    return result('review','Action nécessaire','La demande n’a pas abouti pour toutes les destinations. Consultez les résultats avant toute nouvelle publication.','details',{remove:true});
  }
  if(recurring && !enabled && !paused) return result('waiting','Répétition suspendue','Les publications déjà acceptées restent programmées. Le renouvellement est indisponible.',null,{remove:true});
  if(next && next.status==='approved') return result('waiting','En préparation','Le créneau est enregistré ; Nashra attend la confirmation de Telegram.',null,{remove:true});
  if(next) return result('scheduled',recurring?'Active':'Programmée','',null,{edit:recurring||!jobs.some(j=>j.status==='sent'),remove:true});
  if(jobs.some(j=>['approved','held'].includes(j.status))) return result('waiting','En attente de diffusion','',null,{remove:true});
  const until=c.recurrence?.mode==='interval'&&c.recurrence.until;
  let ended=false;
  if(until && c.recurrence?.mode==='interval') {
    try { ended=until < new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:c.recurrence.timeZone}).format(now); } catch { /* invalid legacy date */ }
  }
  if(recurring && !ended) return result('waiting',paused?'En pause':enabled&&rule?'Prochaine diffusion en préparation':'Répétition indisponible',
    awaitingProof?'Telegram a accepté la programmation. Nashra recherche une confirmation de publication.':'',null,{edit:true,remove:true});
  if(jobs.length && jobs.every(j=>j.status==='cancelled')) return result('ended','Annulée','',null,{remove:true});
  if(ended||jobs.length && jobs.every(j=>['sent','cancelled'].includes(j.status))) return result('ended','Terminée','',null,{remove:true});
  return result('waiting',awaitingProof?'Livraison en cours de vérification':'Horaire à confirmer',
    awaitingProof?'Telegram avait accepté cette programmation. Nashra vérifie l’historique sans rien renvoyer.':'',null,{remove:!instant});
}
