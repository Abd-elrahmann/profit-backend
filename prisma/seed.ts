import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const prisma = new PrismaClient();

const load = (file: string): any[] =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf-8'));

// Orders accounts so a parent is always inserted before its children.
function sortByHierarchy(accounts: any[]): any[] {
  const sorted: any[] = [];
  const done = new Set<number>();
  let pending = [...accounts];
  while (pending.length) {
    const next = pending.filter((a) => a.parentId == null || done.has(a.parentId));
    if (!next.length) throw new Error('Account hierarchy has a missing/cyclic parent');
    next.forEach((a) => done.add(a.id));
    sorted.push(...next);
    pending = pending.filter((a) => !done.has(a.id));
  }
  return sorted;
}

async function seed(label: string, model: string, rows: any[]) {
  const res = await (prisma as any)[model].createMany({ data: rows, skipDuplicates: true });
  console.log(`${label}: ${res.count}/${rows.length} inserted`);
}

async function resetSequence(table: string) {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`,
  );
}

async function main() {
  await seed('Role', 'role', load('role.json'));
  await seed('RolePermission', 'rolePermission', load('rolePermission.json'));
  await seed('Account', 'account', sortByHierarchy(load('account.json')));
  await seed('User', 'user', load('user.json'));
  await seed('BANK_accounts', 'bANK_accounts', load('bANK_accounts.json'));
  await seed('PeriodHeader', 'periodHeader', load('periodHeader.json'));
  await seed('Client', 'client', load('client.json'));
  await seed('Kafeel', 'kafeel', load('kafeel.json'));
  await seed('ClientDocument', 'clientDocument', load('clientDocument.json'));
  await seed('Partner', 'partner', load('partner.json'));
  await seed('JournalHeader', 'journalHeader', load('journalHeader.json'));
  await seed('JournalLine', 'journalLine', load('journalLine.json'));
  await seed('ZakatAccrual', 'zakatAccrual', load('zakatAccrual.json'));
  await seed('Settings', 'settings', load('settings.json'));
  await seed('Template', 'template', load('template.json'));
  await seed('RefreshToken', 'refreshToken', load('refreshToken.json'));

  for (const t of [
    'Role', 'RolePermission', 'Account', 'User', 'BANK_accounts', 'PeriodHeader',
    'Client', 'Kafeel', 'ClientDocument', 'Partner', 'JournalHeader', 'JournalLine',
    'ZakatAccrual', 'Settings', 'Template', 'RefreshToken',
  ]) {
    await resetSequence(t);
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
