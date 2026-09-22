import test from 'node:test';
import assert from 'node:assert/strict';
import { backupAge, BACKUP_STALE_DAYS } from './backup';

const DAY = 86_400_000;

test('backupAge：从未备份 → days 为 null 且视为过期', () => {
  assert.deepEqual(backupAge(null), { days: null, stale: true });
  assert.deepEqual(backupAge(undefined), { days: null, stale: true });
});

test('backupAge：31 天内不提醒（含恰好 31 天的边界）', () => {
  assert.deepEqual(backupAge(Date.now() - 2 * DAY), { days: 2, stale: false });
  assert.equal(backupAge(Date.now() - BACKUP_STALE_DAYS * DAY).stale, false);
});

test('backupAge：超过 31 天提醒', () => {
  const r = backupAge(Date.now() - (BACKUP_STALE_DAYS + 1) * DAY);
  assert.equal(r.days, BACKUP_STALE_DAYS + 1);
  assert.equal(r.stale, true);
});
