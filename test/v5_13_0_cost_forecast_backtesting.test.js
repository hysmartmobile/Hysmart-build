import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('v5.13 cost forecast performance uses completed projects, same currency, and pre-end-date forecasts',()=>{
 const service=read('src/services/costForecastLearningService.js');
 for(const guard of ["String(r.status||'').toUpperCase()!=='COMPLETED'",'!r.expectedEndDate','!r.hasActualEvidence','r.currencyMismatch','predictedAt<=plannedEnd',"String(p.currency||'').toUpperCase()===String(r.currency||'').toUpperCase()",'latestByProject','INSUFFICIENT_EVIDENCE','features.budget']) assert.ok(service.includes(guard),`missing cost backtesting safeguard: ${guard}`);
});
test('v5.13 cost forecast performance route requires project access and read permission',()=>{
 const routes=read('src/routes/projectCostPlanning.js');
 assert.match(routes,/cost-forecast\/performance/);assert.match(routes,/authorize\('project-cost-plan:read'\)/);assert.match(routes,/learningService\.performance\(\{companyId:req\.params\.companyId,projectId:req\.params\.projectId\}\)/);
});
test('v5.13 frontend exposes portfolio cost forecast backtesting metrics',()=>{
 const api=read('../HySmart-Build-Web/src/lib/api.js');const page=read('../HySmart-Build-Web/src/pages/ProjectCostPlanning.jsx');
 assert.match(api,/costForecastPerformance/);assert.match(page,/Completed-project cost forecast accuracy/);assert.match(page,/budgetBaselineMae/);
});
test('v5.13 backend, frontend and service worker release versions agree',()=>{
 const backend=JSON.parse(read('package.json'));const web=JSON.parse(read('../HySmart-Build-Web/package.json'));
 assert.equal(backend.version,'5.13.2');assert.equal(web.version,'5.13.2');assert.match(read('../HySmart-Build-Web/public/sw.js'),/5\.13\.2-guided-onboarding/);
});
