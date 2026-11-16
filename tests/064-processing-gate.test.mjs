import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/027_processing_gate_064.sql', import.meta.url), 'utf8');
test('064: manual claim refuses another processing job on the same account', () => {
  assert.match(sql, /p\.user_id = p_user_id AND p\.status = 'processing'/);
  assert.match(sql, /RAISE EXCEPTION 'NASHRA_ACCOUNT_PROCESSING'/);
});
test('064: worker claim excludes accounts with processing jobs', () => {
  assert.match(sql, /p\.user_id = q\.user_id AND p\.status = 'processing'/);
});
test('064: existing cooldowns, privilege restrictions and locks remain', () => {
  assert.match(sql, /pg_advisory_xact_lock\(7294, 24\)/g);
  assert.match(sql, /interval '30 seconds'/g);
  assert.match(sql, /interval '2 minutes'/g);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.nashra_manual_claim/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.nashra_v24_claim_one/);
  assert.equal((sql.match(/UPDATE public\.delivery_queue/g) || []).length, 1); // existing atomic worker claim only
});
