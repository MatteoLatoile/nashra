import test from 'node:test';
import assert from 'node:assert/strict';
import { recurringOccurrences, destinationSendAt, localClockToISOString } from '../src/lib/automation/recurrence.ts';
const twoDays = { mode:'interval',intervalDays:2,timeZone:'Asia/Riyadh' };
test('Every 2 days at 10:00 Riyadh local regardless of UTC', () => {
  const anchor = localClockToISOString('2026-11-01T10:00','Asia/Riyadh');
  const dates = recurringOccurrences(anchor,twoDays,Date.parse(anchor),Date.parse(anchor)+8*86_400_000);
  assert.deepEqual(dates,[1,3,5,7].map(d => `2026-11-${String(d).padStart(2,'0')}T07:00:00.000Z`));
});
test('Ten authorized groups stagger delivery by 90 seconds', () => {
  const anchor='2026-11-01T07:00:00.000Z';
  assert.equal(destinationSendAt(anchor,0),anchor);
  assert.equal(destinationSendAt(anchor,9),'2026-11-01T07:13:30.000Z');
});
test('A date limit stops future occurrences',()=>{
  const anchor='2026-11-01T07:00:00.000Z';
  const dates=recurringOccurrences(anchor,{...twoDays,until:'2026-11-03'},Date.parse(anchor),Date.parse(anchor)+30*86_400_000);
  assert.equal(dates.length,2);
});
test('Paris wall-clock remains at 10:00 across DST',()=>{
  const anchor=localClockToISOString('2027-03-26T10:00','Europe/Paris');
  const dates=recurringOccurrences(anchor,{mode:'interval',intervalDays:2,timeZone:'Europe/Paris'},
    Date.parse(anchor),Date.parse(anchor)+7*86_400_000);
  assert.deepEqual(dates.slice(0,3),[
    '2027-03-26T09:00:00.000Z','2027-03-28T08:00:00.000Z','2027-03-30T08:00:00.000Z']);
});
test('Nonexistent local hour is rejected rather than drifting time',()=>{
  assert.throws(()=>localClockToISOString('2027-03-28T02:30','Europe/Paris'));
});
test('Malformed rule or time zone fails closed',()=>{
  assert.throws(()=>recurringOccurrences('2026-11-01T07:00:00.000Z',{...twoDays, intervalDays:0},0,100));
  assert.throws(()=>localClockToISOString('2026-11-01T10:00','No/Such_Zone'));
});
