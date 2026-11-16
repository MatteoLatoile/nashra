import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route=readFileSync('src/app/api/automation/recurring/route.ts','utf8');
const svc=readFileSync('src/lib/automation/recurring-service.ts','utf8');
const ui=readFileSync('src/app/(dashboard)/campagnes/page.tsx','utf8');
test('réparation explicite conserve la pause et ne programme aucun message',()=>{
 const part=route.split("if (body.action === 'repair' || body.action === 'repair_safe') {")[1]?.split("if (body.action === 'resume') {")[0];
 assert.ok(part,'Action de réparation absente');
 assert.match(part,/rule.status !== 'paused'/);
 assert.match(part,/status:'paused'/);
 assert.match(part,/rule.status !== 'paused'/);
 assert.match(part,/original\[destId\] !== dest.handle/);
 assert.match(part,/previous\.announcements\.some/);
 assert.match(route,/body.action !== 'repair_safe' && body.confirmed !== true/);
 assert.doesNotMatch(part,/fillRecurringRule|scheduleOnConnectedTelegram|cancelTelegramSchedule/);
});
test('réparation refuse une destination Telegram altérée',()=>{
 assert.match(route,/original\[destId\] !== dest.handle/);
 assert.match(route,/originalTopics\[destId\]/);
});
test('reprise bloquée quand futur incertain, même avec reviewed',()=>{
 const resume=route.split("if (body.action === 'resume') {")[1];
 assert.ok(resume);
 assert.ok(resume.indexOf('unsafeFuture') < resume.indexOf('body.reviewed'));
 assert.match(resume,/\['needs_review','processing'\]/);
});
test('diagnostic identifie les champs réellement différents',()=>{
 assert.match(svc,/recurringMismatch/);
 assert.match(svc,/date de départ différente/);
 assert.match(svc,/destinations différentes/);
});
test('interface a une réparation avec loader et confirmation',()=>{
 assert.match(ui,/Tenter une réparation manuelle/);
 assert.match(ui,/Réparation…/);
 assert.match(ui,/Réparer sans publier/);
 assert.match(ui,/action:'repair'/);
 assert.match(ui,/action: 'repair_safe'/);
 assert.match(ui,/safeRepairAttempts\.current\.has\(c\.id\)/);
 assert.match(ui,/isPaused\(c\)/);
 assert.match(ui,/<details className="n46-details">/);
});
