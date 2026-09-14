import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

test('deployment authentication, disabled AI, records, reports and persistence', async () => {
  const directory=mkdtempSync(join(tmpdir(),'agrisphere-test-'));
  const oldPassword=process.env.APP_PASSWORD;
  process.env.APP_PASSWORD='test-only-password-123';
  let app;
  const start=async()=>{app=createApp({directory});await new Promise(r=>app.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${app.address().port}`;};
  const stop=()=>new Promise(r=>app.close(r));
  try {
    let base=await start();
    const headers={Authorization:'Basic '+Buffer.from('sumit:test-only-password-123').toString('base64'),'Content-Type':'application/json'};
    const call=(path,method='GET',body)=>fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
    assert.equal((await fetch(base+'/api/state')).status,401);
    assert.equal((await fetch(base+'/healthz')).status,200);
    assert.equal((await call('/')).status,200);
    assert.equal((await call('/api/chat','POST',{})).status,403);
    const initial=await (await call('/api/state')).json();
    assert.equal(initial.mode,'disabled');
    assert.equal((await call('/api/profile','PUT',{...initial.profile,name:'Test farmer'})).status,200);
    const record=await (await call('/api/records','POST',{date:'2020-01-01',type:'revenue',category:'Sale',amount:1000,note:''})).json();
    const report=await (await call('/api/reports','POST',{from:'2020-01-01',to:'2020-01-31'})).json();
    assert.equal(report.analytics.revenue,1000);
    assert.match(await (await call(`/api/reports/${report.id}/csv`)).text(),/Sale/);
    assert.match(await (await call(`/api/reports/${report.id}/html`)).text(),/Revenue: INR 1000.00/);
    const reminder=await (await call('/api/reminders','POST',{title:'Test reminder',dueDate:'2020-01-01'})).json();
    assert.equal((await call(`/api/reminders/${reminder.id}`,'PATCH',{done:true})).status,200);
    assert.equal((await fetch(base+'/api/profile',{method:'PUT',headers:{...headers,Origin:'https://other.example'},body:'{}'})).status,403);
    await stop();base=await start();
    const saved=await (await call('/api/state')).json();
    assert.equal(saved.profile.name,'Test farmer');
    assert.ok(saved.records.some(r=>r.id===record.id));
    assert.equal(saved.reminders.find(r=>r.id===reminder.id).done,true);
    assert.equal((await call(`/api/records/${record.id}`,'DELETE')).status,200);
  } finally {
    if(app?.listening)await stop();
    if(oldPassword===undefined)delete process.env.APP_PASSWORD;else process.env.APP_PASSWORD=oldPassword;
    rmSync(directory,{recursive:true,force:true});
  }
});
