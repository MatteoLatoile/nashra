const fs=require('node:fs');
const required=['src/lib/automation/recurrence.ts','src/lib/automation/recurring-service.ts',
  'src/app/api/automation/recurring/route.ts','src/app/api/cron/recurring/route.ts',
  'supabase/018_recurring_rules.sql','tests/recurrence.test.mjs'];
for(const p of required) if(!fs.existsSync(p)) throw Error(`Fichier manquant : ${p}`);
const calendar=fs.readFileSync('src/app/(dashboard)/campagnes/page.tsx','utf8');
const tour=fs.readFileSync('src/components/dashboard-tour.tsx','utf8');
const store=fs.readFileSync('src/lib/store.tsx','utf8');
if(!calendar.includes('isRecurringCreation')||!calendar.includes('group-stagger')||
 !store.includes("mode: 'interval'")||!tour.includes('calendarstagger')) throw Error('Intégration incomplète.');
const steps=tour.split('const STEPS: Step[] = [')[1].split('];')[0].match(/id: '/g)||[];
if(steps.length<43) throw Error('Le tutoriel n’a pas ses 43 étapes.');
const cron=JSON.parse(fs.readFileSync('vercel.json','utf8'));
if(!cron.crons?.some(c=>c.path==='/api/cron/recurring')) throw Error('Cron manquant dans vercel.json.');
console.log('NASHRA RECURRING OK : 43 étapes, calendrier, backend, SQL et Cron présents.');
console.log('Ce contrôle ne remplace pas une validation Supabase / Telegram / déploiement.');
