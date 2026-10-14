import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('purchase-order list accepts an optional validated project filter for the guided project snapshot', () => {
  const routes = read('../src/routes/procurementAccounting.js');
  const service = read('../src/services/procurementAccountingService.js');
  assert.match(routes, /const poListQuery=q\.extend\(\{projectId:z\.string\(\)\.uuid\(\)\.optional\(\)\}\)/);
  assert.match(routes, /service\.list\('purchase_orders',\{companyId:req\.params\.companyId,\.\.\.poListQuery\.parse\(req\.query\),order:'order_date'\}\)/);
  assert.match(service, /if\(projectId&&table==='purchase_orders'\)q=q\.eq\('project_id',projectId\)/);
});

test('project filter is restricted to purchase orders and does not alter other generic list queries', () => {
  const service = read('../src/services/procurementAccountingService.js');
  assert.match(service, /if\(projectId&&table==='purchase_orders'\)/);
});
