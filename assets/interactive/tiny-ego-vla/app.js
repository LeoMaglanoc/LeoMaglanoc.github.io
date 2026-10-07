const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const human = $('#human'), expert = $('#expert');
const policies = [$('#robot-only'), $('#ego-policy')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { stage: 'experience', overlay: 'all', clip: null, annotations: null, budget: 4, prediction: 0, playing: false, loadingClip: 0 };
let results;
const colors = { human: '#ef8b69', object: '#f6cf63', trail: '#9fe6c0', teal: '#17695f', robot: '#7b827e' };
const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const fmt = (n, digits = 3) => Number(n).toFixed(digits);
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setText(s, value) { $(s).textContent = value; }
function safePlay(video) { const p = video.play(); if (p) p.catch(() => { if(video === human) setText('#play-human','Play'); if(video === expert) setText('#play-expert','Play robot demonstration'); }); }
function changeStage(id, scroll = false) {
  if (!['experience','pretrain','adapt','execute','practice'].includes(id)) return;
  state.stage = id;
  $$('.stage').forEach(el => { el.hidden = el.id !== id; });
  $$('.pipeline button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.stage === id)));
  if (id !== 'experience') { human.pause(); expert.pause(); }
  else if (!reducedMotion) { safePlay(human); safePlay(expert); }
  if (id !== 'execute') pausePolicies();
  if (id === 'pretrain') drawPrediction();
  if (id === 'execute' && !policies[0].getAttribute('src')) updateComparison();
  if (scroll) $('.pipeline').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
}
$$('[data-stage]').forEach(b => b.addEventListener('click', () => changeStage(b.dataset.stage)));
$$('[data-go]').forEach(b => b.addEventListener('click', () => changeStage(b.dataset.go, true)));
$$('[data-overlay]').forEach(b => b.addEventListener('click', () => {
  state.overlay = b.dataset.overlay;
  $$('[data-overlay]').forEach(el => el.setAttribute('aria-pressed', String(el === b)));
  drawOverlay();
}));
async function selectClip(id) {
  const request = ++state.loadingClip;
  const clip = results.clips.find(c => c.id === id);
  human.pause(); state.annotations = null; state.clip = clip;
  human.src = clip.video; human.poster = clip.poster;
  setText('#human-source', `${clip.source} · ${clip.split} video`);
  setText('#instruction', clip.label);
  try {
    const response = await fetch(clip.annotations);
    if (!response.ok) throw new Error('Missing clip labels');
    const annotations = await response.json();
    if (request !== state.loadingClip) return;
    state.annotations = annotations;
    if (state.stage === 'experience' && !reducedMotion) safePlay(human);
    drawOverlay();
  } catch (e) { if(request === state.loadingClip) setText('#contact','Overlay unavailable; video remains playable.'); }
}
$('#clip').addEventListener('change', e => selectClip(e.target.value));
$('#play-human').addEventListener('click', () => human.paused ? safePlay(human) : human.pause());
$('#play-expert').addEventListener('click', () => expert.paused ? safePlay(expert) : expert.pause());
human.addEventListener('play', () => setText('#play-human','Pause'));
human.addEventListener('pause', () => setText('#play-human','Play'));
expert.addEventListener('play', () => setText('#play-expert','Pause robot demonstration'));
expert.addEventListener('pause', () => setText('#play-expert','Play robot demonstration'));
$('#human-time').addEventListener('input', e => { if(Number.isFinite(human.duration)) human.currentTime = human.duration * e.target.value / 1000; drawOverlay(); });
function drawOverlay() {
  const a = state.annotations, canvas = $('#overlay');
  if (!a || !human.videoWidth) return;
  if (canvas.width !== human.videoWidth) { canvas.width = human.videoWidth; canvas.height = human.videoHeight; }
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  const index = Math.min(a.hands.length-1, Math.floor(human.currentTime * a.fps));
  const mode = state.overlay;
  const point = p => [p[0]*w,p[1]*h];
  const line = (a,b,color,width=2) => { ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath(); ctx.moveTo(...point(a)); ctx.lineTo(...point(b)); ctx.stroke(); };
  if (mode === 'trajectory' || mode === 'all') {
    // Break trails when a label disappears or jumps; do not bridge unknown tracks.
    for (let i=Math.max(1,index-12); i<=index; i++) {
      const now=a.hands[i]?.[0], before=a.hands[i-1]?.[0];
      ctx.globalAlpha=.25+.75*(i-Math.max(1,index-12))/12;
      if(now && before && Math.hypot(now[0][0]-before[0][0],now[0][1]-before[0][1])<.12) line(before[0],now[0],colors.human,3);
      const ob=a.objects[i], old=a.objects[i-1];
      if(ob && old) { const p=[(ob[0]+ob[2])/2,(ob[1]+ob[3])/2], q=[(old[0]+old[2])/2,(old[1]+old[3])/2]; if(Math.hypot(p[0]-q[0],p[1]-q[1])<.12) line(q,p,colors.trail,3); }
    }
    ctx.globalAlpha=1;
  }
  if (mode === 'hands' || mode === 'all') for (const hand of a.hands[index] || []) {
    for(const [i,j] of edges) line(hand[i],hand[j],colors.human,2);
    hand.forEach((p,i) => { ctx.beginPath(); ctx.arc(...point(p),[4,8,12,16,20].includes(i)?4:2.5,0,Math.PI*2); ctx.fillStyle=[4,8,12,16,20].includes(i)?'#fff5df':colors.human; ctx.fill(); });
  }
  const box = a.objects[index];
  if((mode === 'object' || mode === 'all') && box) {
    ctx.strokeStyle=colors.object; ctx.lineWidth=2;
    ctx.strokeRect(box[0]*w,box[1]*h,(box[2]-box[0])*w,(box[3]-box[1])*h);
    ctx.font='12px Arial'; ctx.fillStyle='#262b2ae8'; ctx.fillRect(box[0]*w,Math.max(0,box[1]*h-23),100,21);
    ctx.fillStyle=colors.object; ctx.fillText(`object · ${fmt(box[4],2)}`,box[0]*w+5,Math.max(15,box[1]*h-8));
  }
  const contact=a.contact[index];
  setText('#contact',contact === null ? 'Contact: no confident hand detection' : contact ? 'Contact estimate: object interaction' : 'Contact estimate: no object contact');
  setText('#instruction',a.instructions[index] || state.clip.label);
  setText('#human-clock',`${fmt(human.currentTime,1)} s`);
  if(Number.isFinite(human.duration)) $('#human-time').value = human.currentTime/human.duration*1000;
}
human.addEventListener('seeked',drawOverlay);
human.addEventListener('loadeddata',drawOverlay);
function frameLoop() {
  if(state.stage === 'experience' && !human.paused) drawOverlay();
  if(state.stage === 'execute' && state.playing) {
    const maxTime=Math.max(...policies.map(v => Number.isFinite(v.currentTime)?v.currentTime:0));
    const duration=Math.max(...policies.map(v => Number.isFinite(v.duration)?v.duration:0));
    if(duration) $('#policy-time').value=maxTime/duration*1000;
    setText('#policy-clock',`${fmt(maxTime,1)} s`);
    // A stopped short episode holds its last frame while the longer one continues.
    if(policies.every(v => v.ended || v.paused)) pausePolicies();
    else if(!policies[0].ended && !policies[1].ended && !policies[0].paused && !policies[1].paused && Math.abs(policies[0].currentTime-policies[1].currentTime)>.18) policies[1].currentTime=policies[0].currentTime;
  }
  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);
document.addEventListener('visibilitychange', () => { if(document.hidden) { human.pause(); expert.pause(); pausePolicies(); } });

function svgLineChart(series, { ylabel='Loss', xlabel='Epoch', percentage=false }={}) {
  const w=560,h=270,l=53,r=20,t=23,b=47;
  const all=series.flatMap(s=>s.points), maxX=Math.max(1,...all.map(p=>p[0])), maxY=Math.max(.001,...all.map(p=>p[1]))*(percentage?1:1.1);
  const x=v=>l+v/maxX*(w-l-r), y=v=>h-b-v/maxY*(h-t-b);
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(ylabel)} by ${escapeHTML(xlabel)}"><title>${escapeHTML(ylabel)} by ${escapeHTML(xlabel)}</title>`;
  for(let i=0;i<5;i++){ const v=maxY*i/4; svg+=`<line x1="${l}" x2="${w-r}" y1="${y(v)}" y2="${y(v)}" stroke="#e1e4db"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end" font-size="10" fill="#5c6864">${percentage?Math.round(v*100)+'%':fmt(v,2)}</text>`; }
  for(const s of series) svg+=`<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${s.points.map(p=>`${x(p[0])},${y(p[1])}`).join(' ')}"/>`;
  svg+=`<text x="${l}" y="${h-23}" font-size="10" fill="#5c6864">1</text><text x="${w-r}" y="${h-23}" text-anchor="end" font-size="10" fill="#5c6864">${maxX}</text><text x="${w/2}" y="${h-7}" text-anchor="middle" font-size="10" fill="#5c6864">${xlabel}</text>`;
  series.forEach((s,i)=>{ svg+=`<rect x="${l+i*145}" y="5" width="12" height="3" fill="${s.color}"/><text x="${l+17+i*145}" y="10" font-size="10" fill="#5c6864">${escapeHTML(s.label)}</text>`; });
  return svg+'</svg>';
}
function successChart(rows) {
  const w=560,h=270,l=48,t=30,b=45,inner=w-l-20;
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Closed-loop success by robot demonstration budget"><title>Closed-loop success by robot demonstration budget</title>`;
  for(let i=0;i<=4;i++){const y=h-b-(h-t-b)*i/4;svg+=`<line x1="${l}" x2="540" y1="${y}" y2="${y}" stroke="#e1e4db"/><text x="${l-8}" y="${y+4}" text-anchor="end" font-size="10" fill="#5c6864">${i*25}%</text>`;}
  results.robot.budgets.forEach((budget,i)=> {
    const center=l+inner*(i+.5)/results.robot.budgets.length;
    ['robot','ego'].forEach((regime,j)=>{const row=rows.find(r=>r.budget===budget&&r.regime===regime); const barHeight=(h-t-b)*row.success_rate, x=center+(j?6:-42), y=h-b-barHeight;
      svg+=`<rect x="${x}" y="${y}" width="36" height="${Math.max(1,barHeight)}" rx="2" fill="${j?colors.teal:colors.robot}"/><text x="${x+18}" y="${y-8}" text-anchor="middle" fill="#242b2a" font-size="11">${Math.round(row.success_rate*100)}%</text>`; });
    svg+=`<text x="${center}" y="${h-23}" text-anchor="middle" font-size="11" fill="#5c6864">${budget}</text>`;
  });
  svg+=`<text x="${w/2}" y="${h-6}" text-anchor="middle" font-size="10" fill="#5c6864">Robot demonstrations per task</text><rect x="48" y="7" width="12" height="3" fill="${colors.robot}"/><text x="65" y="12" font-size="10" fill="#5c6864">Robot-only</text><rect x="185" y="7" width="12" height="3" fill="${colors.teal}"/><text x="202" y="12" font-size="10" fill="#5c6864">Ego-pretrained</text>`;
  return svg+'</svg>';
}
function setupPretrain() {
  const e=results.ego;
  $('#trunk-name').innerHTML=`Tiny ${escapeHTML(e.kind.toUpperCase())}<small>shared temporal trunk</small>`;
  $('#ego-stats').innerHTML=[['Trainable parameters',e.params.toLocaleString()],['Training windows',e.train_samples.toLocaleString()],['CPU pretraining',`${fmt(e.seconds/60,1)} min`],['Held-out loss',fmt(e.best_validation_loss)]].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('#ego-chart').innerHTML=svgLineChart([{label:'Train',color:colors.robot,points:e.curve.map(r=>[r.epoch,r.train_loss])},{label:'Validation',color:colors.teal,points:e.curve.map(r=>[r.epoch,r.validation_loss])}]);
  $('#architecture-table tbody').innerHTML=e.architectures.map(a=>`<tr><td>${escapeHTML(a.kind.toUpperCase())}${a.kind===e.kind?' · selected':''}</td><td>${a.params.toLocaleString()}</td><td>${fmt(a.best_validation_loss,4)}</td><td>${fmt(a.seconds,1)} s</td></tr>`).join('');
}
const predictionImage = new Image();
predictionImage.onload = drawPredictionFrame;
function drawPrediction() { if(!results?.ego.predictions.length) return; const p=results.ego.predictions[state.prediction]; predictionImage.src=p.image; setText('#prediction-count',`${state.prediction+1} / ${results.ego.predictions.length}`); if(predictionImage.complete) drawPredictionFrame(); }
function drawPredictionFrame() {
  if(!results) return;
  const p=results.ego.predictions[state.prediction], canvas=$('#prediction'), ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h); if(predictionImage.naturalWidth) ctx.drawImage(predictionImage,0,0,w,h);
  const arrow=(origin,delta,color,dashed)=>{ if(!origin)return; const x=origin[0]*w,y=origin[1]*h,ex=x+delta[0]*w/10,ey=y+delta[1]*h/10;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;ctx.setLineDash(dashed?[8,5]:[]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();ctx.setLineDash([]);const a=Math.atan2(ey-y,ex-x);ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-10*Math.cos(a-.45),ey-10*Math.sin(a-.45));ctx.lineTo(ex-10*Math.cos(a+.45),ey-10*Math.sin(a+.45));ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();};
  if(p.mask[0]){ arrow(p.wrist,p.target.slice(0,2),colors.human,false);arrow(p.wrist,p.predicted.slice(0,2),colors.human,true); }
  if(p.mask[2]){ arrow(p.object,p.target.slice(2,4),colors.object,false);arrow(p.object,p.predicted.slice(2,4),colors.object,true); }
  ctx.font='12px Arial';ctx.fillStyle='#242b2ae8';ctx.fillRect(10,10,330,28);ctx.fillStyle='#fff';ctx.fillText(`${p.video} · ${fmt(p.time,1)} s · held-out video`,20,28);
}
$('#prev-pred').addEventListener('click',()=>{state.prediction=(state.prediction-1+results.ego.predictions.length)%results.ego.predictions.length;drawPrediction();});
$('#next-pred').addEventListener('click',()=>{state.prediction=(state.prediction+1)%results.ego.predictions.length;drawPrediction();});
function selectedEpisode(regime) {return results.robot.rollouts.find(r=>r.regime===regime&&r.budget_per_task===state.budget&&r.seed===Number($('#seed').value)&&r.task===$('#task').value&&r.initialization===Number($('#initialization').value));}
function pausePolicies() {state.playing=false;policies.forEach(v=>v.pause());setText('#play-policies','Play comparison');}
function updateComparison() {
  pausePolicies();
  const task=$('#task').value;
  ['robot','ego'].forEach((regime,i)=>{
    const row=selectedEpisode(regime),video=policies[i];
    if(!row){video.removeAttribute('src');setText(i?'#ego-status':'#robot-status','No recorded rollout');return;}
    video.src=row.video;video.poster=row.poster;video.playbackRate=Number($('#speed').value);video.load();
    setText(i?'#ego-status':'#robot-status',row.success?'Success':'Did not complete');
    const metric=results.robot.metrics.find(m=>m.regime===regime&&m.budget_per_task===state.budget&&m.seed===Number($('#seed').value));
    const rows=results.robot.rollouts.filter(r=>r.regime===regime&&r.budget_per_task===state.budget&&r.task===task);
    const success=rows.filter(r=>r.success).length;
    $(i?'#ego-policy-metrics':'#robot-metrics').innerHTML=`<div><strong>${success} / ${rows.length}</strong>successes across seeds</div><div><strong>${fmt(metric.best_validation_mse)}</strong>BC validation MSE</div><div><strong>${row.length}</strong>steps · this rollout</div>`;
  });
  const summary=results.robot.summary;
  $('#success-chart').innerHTML=successChart(summary);
  $('#results-table tbody').innerHTML=results.robot.budgets.map(b=>{const r=summary.find(x=>x.budget===b&&x.regime==='robot'),e=summary.find(x=>x.budget===b&&x.regime==='ego');return `<tr><td>${b} (${Math.round(b/35*100)}% of training pool)</td><td>${r.successes} / ${r.episodes}</td><td>${e.successes} / ${e.episodes}</td></tr>`;}).join('');
  const r=summary.find(s=>s.budget===state.budget&&s.regime==='robot'),e=summary.find(s=>s.budget===state.budget&&s.regime==='ego'),delta=(e.success_rate-r.success_rate)*100;
  const conclusion=delta>0?`Ego-pretraining leads by ${fmt(delta,1)} percentage points at this budget.`:delta<0?`Robot-only leads by ${fmt(-delta,1)} percentage points at this budget.`:'No success-rate difference at this budget.';
  $('#result-headline').innerHTML=`${escapeHTML(conclusion)}<span>All tasks and seeds: robot-only ${r.successes}/${r.episodes}, ego-pretrained ${e.successes}/${e.episodes}. ${state.budget} demonstrations per task. Small exploratory evaluation; seed and initialization variation matter.</span>`;
  const curves=['robot','ego'].map(regime=>{const m=results.robot.metrics.find(m=>m.regime===regime&&m.budget_per_task===state.budget&&m.seed===Number($('#seed').value));return {label:regime==='robot'?'Robot-only':'Ego-pretrained',color:regime==='robot'?colors.robot:colors.teal,points:m.curve.map(p=>[p.epoch,p.validation_mse])};});
  $('#bc-chart').innerHTML=svgLineChart(curves,{ylabel:'Validation action MSE'});
  setText('#evaluation-note',`${results.robot.seeds.length} training seeds × ${results.robot.tasks.length} tasks × ${results.robot.initializations} held-out starts per model and budget. Bars pool all starts; the same starts repeat across seeds. No independence or statistical significance is assumed.`);
  $('#policy-time').value=0;setText('#policy-clock','0.0 s');
}
$('#task').addEventListener('change',updateComparison);$('#seed').addEventListener('change',updateComparison);$('#initialization').addEventListener('change',updateComparison);
$('#play-policies').addEventListener('click',async()=>{
  if(state.playing){pausePolicies();return;}
  if(policies.every(v=>v.ended)) policies.forEach(v=>v.currentTime=0);
  const outcomes=await Promise.allSettled(policies.filter(v=>!v.ended).map(v=>v.play()));
  state.playing=outcomes.some(r=>r.status==='fulfilled');setText('#play-policies',state.playing?'Pause comparison':'Play comparison');
});
$('#restart-policies').addEventListener('click',()=>{pausePolicies();policies.forEach(v=>{v.currentTime=0;});$('#policy-time').value=0;setText('#policy-clock','0.0 s');});
$('#policy-time').addEventListener('input',e=>{const d=Math.max(...policies.map(v=>Number.isFinite(v.duration)?v.duration:0));const time=d*e.target.value/1000;policies.forEach(v=>{if(Number.isFinite(v.duration)) v.currentTime=Math.min(time,v.duration);});setText('#policy-clock',`${fmt(time,1)} s`);});
$('#speed').addEventListener('change',e=>policies.forEach(v=>v.playbackRate=Number(e.target.value)));
async function init() {
  try{
    const response=await fetch('results.json');if(!response.ok)throw new Error('results missing');results=await response.json();
    $('#clip').innerHTML=results.clips.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.label)}</option>`).join('');
    $('#task').innerHTML=results.robot.tasks.map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.label)}</option>`).join('');
    $('#seed').innerHTML=results.robot.seeds.map(s=>`<option value="${s}">${s}</option>`).join('');
    $('#initialization').innerHTML=Array.from({length:results.robot.initializations},(_,i)=>`<option value="${i}">Start ${i+1}</option>`).join('');
    state.budget=results.robot.budgets[0];
    $('#budgets').insertAdjacentHTML('beforeend',results.robot.budgets.map((b,i)=>`<button data-budget="${b}" aria-pressed="${i===0}">${b} demos</button>`).join(''));
    $$('[data-budget]').forEach(b=>b.addEventListener('click',()=>{state.budget=Number(b.dataset.budget);$$('[data-budget]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));updateComparison();}));
    setupPretrain();
    $('#method-data').innerHTML=results.method.map(([key,value])=>`<p><strong>${escapeHTML(key)}</strong><br>${escapeHTML(value)}</p>`).join('');
    $('#loading').hidden=true;$$('[data-stage]').forEach(b=>b.disabled=false);changeStage('experience');await selectClip(results.clips[0].id);
    if(reducedMotion){setText('#play-human','Play');setText('#play-expert','Play robot demonstration');}
  }catch(error){$('#loading').hidden=true;$('#error').hidden=false;console.error('TinyEgoVLA initialization failed:',error);}
}
init();
