'use strict';

const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createServer} = require('node:net');
const path = require('node:path');
const {test} = require('node:test');

async function unusedPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const {port} = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

test('contest flow works without Claude or a configured Google key', async t => {
  const port = await unusedPort();
  const testEnv={
    ...process.env,
    PORT:String(port),
    GEMINI_API_KEY:'',
    VERCEL:''
  };
  for (const key of [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN'
  ]) delete testEnv[key];
  const child = spawn(process.execPath, ['server.js'], {
    cwd:path.join(__dirname, '..'),
    env:testEnv,
    stdio:['ignore','pipe','pipe']
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  t.after(() => child.kill());

  const base = `http://127.0.0.1:${port}`;
  let health;
  for (let attempt=0; attempt<40; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${logs}`);
    try {
      health=await fetch(`${base}/api/health`);
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  assert.ok(health, `Server failed to start: ${logs}`);
  assert.deepEqual(await health.json(), {configured:false,storageConfigured:true});

  const page=await fetch(base);
  assert.equal(page.status, 200);
  const html=await page.text();
  assert.match(html, /bing\.com\/images\/create\/ai-image-generator\?setlang=ru/);
  assert.doesNotMatch(html, /\bclaude\b|craiyon/i);
  assert.match(html, /ASSIGNMENTS_RU\.length!==50/);
  assert.match(html, /PROMPT_TIPS/);

  const judge=await fetch(`${base}/api/judge`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:'{}'
  });
  assert.equal(judge.status, 503);

  const hostId='11111111-1111-4111-8111-111111111111';
  const studentId='22222222-2222-4222-8222-222222222222';
  const post=async (route, body) => fetch(`${base}${route}`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });

  assert.equal((await post('/api/room/presence', {
    id:hostId,role:'host',name:'',avatar:'🚀'
  })).status,200);
  // A second device cannot take the host role while the first host is active.
  const intruderId='33333333-3333-4333-8333-333333333333';
  assert.equal((await post('/api/room/presence', {
    id:intruderId,role:'host',name:'',avatar:'🚀'
  })).status,409);
  assert.equal((await post('/api/room/phase', {
    id:intruderId,phase:'results'
  })).status,403);
  assert.equal((await post('/api/room/presence', {
    id:hostId,role:'host',name:'',avatar:'🚀'
  })).status,200);
  assert.equal((await post('/api/room/presence', {
    id:studentId,role:'participant',name:'Алия',avatar:'🐼'
  })).status,200);

  let state=await (await fetch(`${base}/api/room/state`)).json();
  assert.equal(state.phase,'lobby');
  assert.deepEqual(state.peers,[{name:'Алия',avatar:'🐼'}]);

  assert.equal((await post('/api/room/phase', {
    id:studentId,phase:'round1'
  })).status,403);
  assert.equal((await post('/api/room/phase', {
    id:hostId,phase:'round1'
  })).status,200);

  assert.equal((await post('/api/room/score', {
    id:studentId,name:'Алия',roundKey:'r1',score:8
  })).status,200);
  assert.equal((await post('/api/room/score', {
    id:studentId,name:'Алия',roundKey:'r2',score:11
  })).status,400);
  state=await (await fetch(`${base}/api/room/state`)).json();
  assert.equal(state.phase,'round1');
  assert.equal(state.scores.Алия.r1,8);

  assert.equal((await post('/api/room/phase', {
    id:hostId,phase:'round2'
  })).status,200);
  assert.equal((await post('/api/room/score', {
    id:studentId,name:'Алия',roundKey:'r2',score:9
  })).status,200);
  assert.equal((await post('/api/room/phase', {
    id:hostId,phase:'round3'
  })).status,200);
  assert.equal((await post('/api/room/score', {
    id:studentId,name:'Алия',roundKey:'r3',score:10
  })).status,200);
  await post('/api/room/phase',{id:hostId,phase:'results'});
  state=await (await fetch(`${base}/api/room/state`)).json();
  assert.deepEqual(
    [state.scores.Алия.r1,state.scores.Алия.r2,state.scores.Алия.r3],
    [8,9,10]
  );
});
