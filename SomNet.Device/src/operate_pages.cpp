#include "operate_pages.h"

#include <ESPAsyncWebServer.h>
#include <Arduino.h>

namespace {

// Shared palette with config_pages (slate / indigo).
constexpr char kOperateHtml[] PROGMEM = R"raw(
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SomEsp Operate</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#020617;color:#cbd5e1}
.page{width:100%;max-width:36rem;margin:0 auto;padding:1rem 1rem 2.5rem}
h1{font-size:1.2rem;color:#f1f5f9;margin:0 0 .5rem}
.panel-actions{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.5rem}
.hist-detail{white-space:pre-wrap;font-size:.75rem;margin:.5rem 0 0}
@media (min-width:600px){
.page{max-width:42rem;padding:1.25rem 1.5rem 2.5rem}
#gate.gate-split{display:grid;grid-template-columns:1fr 1fr;gap:.5rem .75rem}
#gate.gate-split .gate-actions{grid-column:1/-1}
}
@media (min-width:768px){
.page{max-width:56rem;padding:1.5rem 2rem 3rem}
h1{font-size:1.35rem}
.tabs{max-width:28rem}
#tab-manual.layout-split:not(.hidden),#tab-auto.layout-split:not(.hidden),#tab-hist.layout-split:not(.hidden){
  display:grid;grid-template-columns:1fr 1fr;gap:1rem 1.25rem;align-items:start}
#tab-manual.layout-split:not(.hidden) .panel-actions,#tab-auto.layout-split:not(.hidden) .panel-actions{grid-column:1/-1}
#tab-manual.layout-split:not(.hidden) hr{grid-column:1/-1;margin:.25rem 0}
#tab-hist.layout-split:not(.hidden) .hist-detail{margin:0;max-height:min(70vh,28rem);overflow:auto;
  background:#1e293b;border:1px solid #334155;border-radius:.5rem;padding:.75rem}
}
@media (min-width:1024px){
.page{max-width:68rem}
h1{font-size:1.5rem}
.row.quad{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem}
}
@media (min-width:1280px){
.page{max-width:76rem;padding:1.75rem 2.5rem 3rem}
}
.tabs{display:flex;gap:.35rem;margin:.75rem 0}
.tab{flex:1;padding:.5rem;border:1px solid #334155;background:#0f172a;color:#94a3b8;border-radius:.5rem;cursor:pointer;font-weight:600}
.tab.active{background:#4f46e5;color:#fff;border-color:#4f46e5}
.panel{background:#0f172a;border:1px solid #334155;border-radius:.75rem;padding:1rem;margin:.6rem 0}
label{display:block;margin:.5rem 0 .25rem;font-size:.85rem;color:#e2e8f0}
input,select{width:100%;padding:.45rem;border-radius:.4rem;border:1px solid #475569;background:#1e293b;color:#f8fafc}
.row{display:flex;gap:.5rem}.row>*{flex:1}
button,.btn{padding:.55rem 1rem;border-radius:.5rem;border:none;font-weight:600;cursor:pointer;margin:.25rem .25rem .25rem 0}
.btn-primary{background:#4f46e5;color:#fff}.btn-danger{background:#7f1d1d;color:#fecaca}
.btn-secondary{background:#334155;color:#e2e8f0}
.note{font-size:.8rem;color:#94a3b8;margin:.35rem 0}
.hint{font-size:.75rem;color:#64748b;margin:-.15rem 0 .35rem}
.subpanel{border:1px solid #334155;border-radius:.5rem;padding:.75rem;margin:.75rem 0}
.subpanel h2{font-size:.9rem;color:#e2e8f0;margin:0 0 .5rem;font-weight:600}
label.chk{display:flex;align-items:center;gap:.5rem}label.chk input{width:auto;flex:0 0 auto}
.status{font-size:.85rem;color:#a5b4fc;min-height:1.2rem}
.panel.hidden{display:none!important}
.hidden{display:none}
a{color:#818cf8}
</style></head><body><div class="page">
<h1>SomEsp Operate</h1>
<p class="note"><a href="/">Status</a> &middot; LAN only &middot; default PIN 1234</p>
<div id="gate" class="panel gate-split">
<label>PIN<input id="pin" type="password" maxlength="16" value="1234"></label>
<label>New PIN (optional)<input id="pin-new" type="password" maxlength="16" placeholder="change on unlock"></label>
<div class="gate-actions panel-actions">
<button class="btn-primary" id="btn-unlock">Unlock</button>
<button class="btn-secondary hidden" id="btn-arm">Arm session</button>
<button class="btn-secondary hidden" id="btn-lock">Lock</button>
</div>
</div>
<div id="main" class="hidden">
<div class="tabs"><button type="button" class="tab active" data-tab="manual">Manual</button><button type="button" class="tab" data-tab="auto">Automatic</button><button type="button" class="tab" data-tab="hist">History</button></div>
<div id="tab-manual" class="panel layout-split">
<div class="layout-col">
<div class="row"><label>Min stroke ms<input id="m-min" type="number" min="1" max="30000" value="25"></label>
<label>Max stroke ms<input id="m-max" type="number" min="1" max="30000" value="400"></label></div>
<label>Power %<input id="m-power" type="range" min="0" max="100" value="50"></label>
<p class="note">Stroke ~ <span id="m-stroke-ms">212</span> ms</p>
<div class="panel-actions">
<button class="btn-primary" id="btn-stroke">Stroke</button>
<button class="btn-danger" id="btn-abort">Abort</button>
</div>
</div>
<hr style="border-color:#334155">
<div class="layout-col">
<div class="row"><label>Burst count<input id="b-count" type="number" min="1" max="100" value="5"></label>
<label>Delay sec<input id="b-delay" type="number" min="0" max="300" value="5"></label></div>
<button class="btn-primary" id="btn-burst">Burst</button>
</div>
</div>
<div id="tab-auto" class="panel hidden layout-split">
<div class="layout-col">
<label>Mode<select id="a-mode">
<option value="periodic">periodic</option><option value="randomPowerOnly">randomPowerOnly</option>
<option value="randomTimingOnly">randomTimingOnly</option><option value="randomPowerAndTiming" selected>randomPowerAndTiming</option>
<option value="powerWave">powerWave</option><option value="powerAndTimingWave">powerAndTimingWave</option>
<option value="buildUp">buildUp</option></select></label>
<div class="row"><label>Min ms<input id="a-minms" type="number" value="25"></label><label>Max ms<input id="a-maxms" type="number" value="400"></label></div>
<div class="row"><label>Min power<input id="a-minp" type="number" min="0" max="100" value="0"></label><label>Max power<input id="a-maxp" type="number" min="0" max="100" value="100"></label></div>
<div class="row"><label>Gap min s<input id="a-gmin" type="number" min="1" value="5"></label><label>Gap max s<input id="a-gmax" type="number" min="1" value="20"></label></div>
<label>Delay before start (s)<input id="a-delay" type="number" min="0" value="0"></label>
<div class="row"><label>End mode<select id="a-endmode"><option value="noAutoEnd">noAutoEnd</option><option value="minutes">minutes</option><option value="strokes">strokes</option></select></label>
<label>End value<input id="a-endval" type="number" min="1" value="100"></label></div>
</div>
<div class="layout-col">
<div class="subpanel" id="burst-panel">
<h2>Burst settings</h2>
<p class="note">When Bursts on is checked, scheduled burst clusters run on top of the automatic program. Burst stroke power 0–100 is relative to main power min/max.</p>
<div class="row"><label class="chk"><input id="a-bursts" type="checkbox"> Bursts on</label>
<label>Burst % (0–100)<input id="a-bpct" type="number" min="0" max="100" value="10"></label></div>
<label>Burst style<select id="a-bstyle">
<option value="fixedPowerDelay">Fixed Power/Delay</option>
<option value="randomPowerOnly">Random Power Only</option>
<option value="randomDelayOnly">Random Delay Only</option>
<option value="randomPowerAndDelay">Random Power/Delay</option></select></label>
<div class="row"><label>Burst power min %<input id="a-bpow-min" type="number" min="0" max="100" value="0"></label>
<label>Burst power max %<input id="a-bpow-max" type="number" min="0" max="100" value="100"></label></div>
<p class="hint" id="a-bpow-hint"></p>
<div class="row"><label>Burst delay min (s)<input id="a-bdel-min" type="number" min="0" max="300" value="1"></label>
<label>Burst delay max (s)<input id="a-bdel-max" type="number" min="0" max="300" value="5"></label></div>
<p class="hint" id="a-bdel-hint"></p>
<div class="row"><label>Strokes per burst min<input id="a-bstr-min" type="number" min="1" max="100" value="5"></label>
<label>Strokes per burst max<input id="a-bstr-max" type="number" min="1" max="100" value="10"></label></div>
</div>
</div>
<div class="panel-actions">
<button class="btn-primary" id="btn-auto-start">Start automatic</button>
<button class="btn-secondary" id="btn-auto-stop">Stop</button>
<button class="btn-secondary" id="btn-auto-update">Apply update</button>
</div>
</div>
<div id="tab-hist" class="panel hidden layout-split">
<div class="layout-col">
<div class="panel-actions">
<button class="btn-secondary" id="btn-hist-refresh">Refresh</button>
<button class="btn-danger" id="btn-hist-clear">Clear history</button>
</div>
<ul id="hist-list" class="note" style="padding-left:1.1rem"></ul>
</div>
<pre id="hist-detail" class="note hist-detail"></pre>
</div>
<p class="status" id="status-line">Idle</p>
</div>
<script>
(function(){
var TOKEN_KEY='somesp-bearer';
var MANUAL_KEY='somnet-local-manual';
var AUTO_KEY='somnet-local-automatic';
var TAB_KEY='somesp-operate-tab';
var token=sessionStorage.getItem(TOKEN_KEY)||'';
var pollTimer=null;
var updateTimer=null;
var autoLiveActive=false;
var lastPushedAuto=null;
var deviceSaveTimer=null;
var MAX_BURST_STROKES=100,MAX_BURST_DELAY_SEC=300,MIN_BURST_DELAY_SEC=1,MIN_BURST_STROKE_POWER=1;
function $(id){return document.getElementById(id);}
function headers(){return token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{'Content-Type':'application/json'};}
function strokeMs(p,minMs,maxMs){minMs=+minMs;maxMs=+maxMs;var lo=Math.min(minMs,maxMs),hi=Math.max(minMs,maxMs);return Math.round(lo+(hi-lo)*(p/100));}
function setStatus(t){$('status-line').textContent=t||'';}
function showMain(on){$('main').classList.toggle('hidden',!on);$('btn-arm').classList.toggle('hidden',!token);$('btn-lock').classList.toggle('hidden',!token);}
function rules(mode){
  var r={disMinP:false,disGmin:false,disNoEnd:false};
  if(mode==='periodic'||mode==='randomTimingOnly')r.disMinP=true;
  if(['periodic','randomPowerOnly','powerWave'].indexOf(mode)>=0)r.disGmin=true;
  if(['buildUp','powerWave','powerAndTimingWave'].indexOf(mode)>=0)r.disNoEnd=true;
  return r;
}
function applyRules(){
  var m=$('a-mode').value,r=rules(m);
  $('a-minp').disabled=r.disMinP;
  $('a-gmin').disabled=r.disGmin;
  if(r.disNoEnd&&$('a-endmode').value==='noAutoEnd')$('a-endmode').value='minutes';
  if(r.disNoEnd)$('a-endmode').querySelector('option[value="noAutoEnd"]').disabled=true;
  else $('a-endmode').querySelector('option[value="noAutoEnd"]').disabled=false;
}
function clampInt(v,lo,hi){v=+v;if(!isFinite(v))return lo;return Math.min(hi,Math.max(lo,Math.round(v)));}
function normMinMax(min,max,minLim,maxLim){
  var a=clampInt(min,minLim,maxLim),b=clampInt(max,minLim,maxLim);
  if(a>b)a=b;return {min:a,max:b};
}
function getBurstFieldRules(style){
  switch(style){
    case 'randomPowerOnly':return {disPowMin:false,disDelMin:true};
    case 'randomDelayOnly':return {disPowMin:true,disDelMin:false};
    case 'randomPowerAndDelay':return {disPowMin:false,disDelMin:false};
    default:return {disPowMin:true,disDelMin:true};
  }
}
function normalizeBurst(raw){
  var bpmin=clampInt(raw.burstStrokePowerMin,MIN_BURST_STROKE_POWER,100);
  var bpmax=clampInt(raw.burstStrokePowerMax,0,100);
  if(bpmin>bpmax)bpmax=bpmin;
  var bdmin=clampInt(raw.burstDelayMin,MIN_BURST_DELAY_SEC,MAX_BURST_DELAY_SEC);
  var bdmax=clampInt(raw.burstDelayMax,0,MAX_BURST_DELAY_SEC);
  if(bdmin>bdmax)bdmax=bdmin;
  var st=normMinMax(raw.burstStrokesMin,raw.burstStrokesMax,1,MAX_BURST_STROKES);
  return {
    burstPercent:clampInt(raw.burstPercent,0,100),
    burstStyle:raw.burstStyle,
    burstStrokePowerMin:bpmin,burstStrokePowerMax:bpmax,
    burstDelayMin:bdmin,burstDelayMax:bdmax,
    burstStrokesMin:st.min,burstStrokesMax:st.max
  };
}
function applyBurstRules(){
  var on=$('a-bursts').checked;
  var br=getBurstFieldRules($('a-bstyle').value);
  var ids=['a-bpct','a-bstyle','a-bpow-min','a-bpow-max','a-bdel-min','a-bdel-max','a-bstr-min','a-bstr-max'];
  ids.forEach(function(id){$(id).disabled=!on;});
  if(on){
    $('a-bpow-min').disabled=br.disPowMin;
    $('a-bdel-min').disabled=br.disDelMin;
    $('a-bpow-hint').textContent=br.disPowMin?'Min not used — device uses maximum power.':'';
    $('a-bdel-hint').textContent=br.disDelMin?'Min not used — device uses maximum delay.':'';
  }else{
    $('a-bpow-hint').textContent='';
    $('a-bdel-hint').textContent='';
  }
}
function readAutoSnapshot(){
  return {
    automaticMode:$('a-mode').value,
    minimumStrokeMs:+$('a-minms').value,maximumStrokeMs:+$('a-maxms').value,
    minimumPower:+$('a-minp').value,maximumPower:+$('a-maxp').value,
    strokeMinSeconds:+$('a-gmin').value,strokeMaxSeconds:+$('a-gmax').value,
    delayBeforeStartSeconds:+$('a-delay').value,
    endSessionMode:$('a-endmode').value,endSessionValue:+$('a-endval').value,
    burstsOn:$('a-bursts').checked,
    burstPercent:+$('a-bpct').value,burstStyle:$('a-bstyle').value,
    burstStrokePowerMin:+$('a-bpow-min').value,burstStrokePowerMax:+$('a-bpow-max').value,
    burstDelayMin:+$('a-bdel-min').value,burstDelayMax:+$('a-bdel-max').value,
    burstStrokesMin:+$('a-bstr-min').value,burstStrokesMax:+$('a-bstr-max').value
  };
}
function fillAutoForm(s){
  if(!s)return;
  if(s.automaticMode)$('a-mode').value=s.automaticMode;
  if(s.minimumStrokeMs!=null)$('a-minms').value=s.minimumStrokeMs;
  if(s.maximumStrokeMs!=null)$('a-maxms').value=s.maximumStrokeMs;
  if(s.minimumPower!=null)$('a-minp').value=s.minimumPower;
  if(s.maximumPower!=null)$('a-maxp').value=s.maximumPower;
  if(s.strokeMinSeconds!=null)$('a-gmin').value=s.strokeMinSeconds;
  if(s.strokeMaxSeconds!=null)$('a-gmax').value=s.strokeMaxSeconds;
  if(s.delayBeforeStartSeconds!=null)$('a-delay').value=s.delayBeforeStartSeconds;
  if(s.endSessionMode)$('a-endmode').value=s.endSessionMode;
  if(s.endSessionValue!=null)$('a-endval').value=s.endSessionValue;
  $('a-bursts').checked=!!s.burstsOn;
  if(s.burstPercent!=null)$('a-bpct').value=s.burstPercent;
  if(s.burstStyle)$('a-bstyle').value=s.burstStyle;
  if(s.burstStrokePowerMin!=null)$('a-bpow-min').value=s.burstStrokePowerMin;
  if(s.burstStrokePowerMax!=null)$('a-bpow-max').value=s.burstStrokePowerMax;
  if(s.burstDelayMin!=null)$('a-bdel-min').value=s.burstDelayMin;
  if(s.burstDelayMax!=null)$('a-bdel-max').value=s.burstDelayMax;
  if(s.burstStrokesMin!=null)$('a-bstr-min').value=s.burstStrokesMin;
  if(s.burstStrokesMax!=null)$('a-bstr-max').value=s.burstStrokesMax;
}
function saveAutoSettings(){
  try{localStorage.setItem(AUTO_KEY,JSON.stringify(readAutoSnapshot()));}catch(e){}
}
function loadAutoSettings(){
  try{
    var raw=localStorage.getItem(AUTO_KEY);
    if(raw)fillAutoForm(JSON.parse(raw));
  }catch(e){}
}
function autoPayload(){
  var snap=readAutoSnapshot();
  var burst=normalizeBurst(snap);
  var o={
    automaticMode:snap.automaticMode,
    minimumStrokeMs:snap.minimumStrokeMs,maximumStrokeMs:snap.maximumStrokeMs,
    minimumPower:snap.minimumPower,maximumPower:snap.maximumPower,
    strokeMinSeconds:snap.strokeMinSeconds,strokeMaxSeconds:snap.strokeMaxSeconds,
    delayBeforeStartSeconds:snap.delayBeforeStartSeconds,
    endSessionMode:snap.endSessionMode,endSessionValue:snap.endSessionValue,
    burstsOn:snap.burstsOn
  };
  Object.assign(o,burst);
  return JSON.stringify(o);
}
function queueAutoUpdate(){
  if(!autoLiveActive)return;
  if(updateTimer)clearTimeout(updateTimer);
  updateTimer=setTimeout(async function(){
    updateTimer=null;
    var p=autoPayload();
    if(p===lastPushedAuto)return;
    try{
      await cmd('automatic-update',p);
      lastPushedAuto=p;
      setStatus('Update queued');
      poll();
    }catch(e){setStatus(e.message);}
  },400);
}
function onAutoFieldChange(){
  applyRules();
  applyBurstRules();
  persistAllOperateSettings();
  queueAutoUpdate();
}
async function api(path,opt){
  opt=opt||{};var h=headers();if(opt.headers)Object.assign(h,opt.headers);
  var r=await fetch(path,{method:opt.method||'GET',headers:h,body:opt.body});
  var j=null;try{j=await r.json();}catch(e){}
  if(!r.ok)throw new Error((j&&j.error)||r.status);
  return j;
}
async function cmd(key,payload){
  var body=JSON.stringify({commandKey:key,payloadJson:payload||'{}'});
  return api('/api/local/commands',{method:'POST',body:body});
}
function readManualSnapshot(){
  return {
    minimumStrokeMs:+$('m-min').value,maximumStrokeMs:+$('m-max').value,
    powerPercent:+$('m-power').value,
    burstStrokes:+$('b-count').value,burstDelaySeconds:+$('b-delay').value
  };
}
function normalizeManual(raw){
  var ms=normMinMax(raw.minimumStrokeMs,raw.maximumStrokeMs,1,30000);
  var burst=normMinMax(raw.burstStrokes,raw.burstStrokes,1,MAX_BURST_STROKES);
  return {
    minimumStrokeMs:ms.min,maximumStrokeMs:ms.max,
    powerPercent:clampInt(raw.powerPercent,0,100),
    burstStrokes:burst.min,burstDelaySeconds:clampInt(raw.burstDelaySeconds,0,MAX_BURST_DELAY_SEC)
  };
}
function fillManualForm(s){
  if(!s)return;
  var n=normalizeManual(s);
  $('m-min').value=n.minimumStrokeMs;
  $('m-max').value=n.maximumStrokeMs;
  $('m-power').value=n.powerPercent;
  $('b-count').value=n.burstStrokes;
  $('b-delay').value=n.burstDelaySeconds;
}
function saveManualSettings(){
  try{localStorage.setItem(MANUAL_KEY,JSON.stringify(normalizeManual(readManualSnapshot())));}catch(e){}
}
function loadManualSettings(){
  try{
    var raw=localStorage.getItem(MANUAL_KEY);
    if(raw)fillManualForm(JSON.parse(raw));
  }catch(e){}
}
function buildDeviceSettingsPayload(){
  return JSON.stringify({
    manual:normalizeManual(readManualSnapshot()),
    automatic:readAutoSnapshot(),
    activeTab:localStorage.getItem(TAB_KEY)||'manual'
  });
}
function queueDeviceSettingsSave(){
  if(!token)return;
  if(deviceSaveTimer)clearTimeout(deviceSaveTimer);
  deviceSaveTimer=setTimeout(async function(){
    deviceSaveTimer=null;
    try{
      await api('/api/local/settings',{method:'PUT',body:buildDeviceSettingsPayload()});
    }catch(e){}
  },600);
}
function persistAllOperateSettings(){
  saveManualSettings();
  saveAutoSettings();
  queueDeviceSettingsSave();
}
async function applyDeviceSettingsFromNvs(){
  if(!token)return;
  try{
    var j=await api('/api/local/settings');
    if(j.stored===false)return;
    if(j.manual)fillManualForm(j.manual);
    if(j.automatic)fillAutoForm(j.automatic);
    if(j.activeTab&&document.querySelector('.tab[data-tab="'+j.activeTab+'"]'))activateTab(j.activeTab);
    applyRules();applyBurstRules();refreshManualMs();
    saveManualSettings();saveAutoSettings();
  }catch(e){}
}
function refreshManualMs(){$('m-stroke-ms').textContent=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);}
function onManualFieldChange(){
  refreshManualMs();
  persistAllOperateSettings();
}
async function poll(){
  try{
    var s=await api('/api/local/status');
    var parts=[];
    if(s.busy)parts.push('busy');
    if(s.automaticActive)parts.push('automatic');
    if(s.armed)parts.push('armed');
    if(s.commandComplete){
      parts.push(s.commandSuccess?'ok':'fail');
      if(s.commandMessage)parts.push(s.commandMessage);
    }
    setStatus(parts.join(' · ')||'Idle');
    $('btn-auto-start').disabled=!!(s.busy||s.automaticActive);
    if(s.automaticActive&&!autoLiveActive){
      autoLiveActive=true;
      lastPushedAuto=autoPayload();
    }else if(!s.automaticActive&&autoLiveActive){
      autoLiveActive=false;
      lastPushedAuto=null;
    }
    if(s.busy||s.automaticActive){if(!pollTimer)pollTimer=setInterval(poll,800);}
    else if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
  }catch(e){setStatus(e.message);}
}
loadManualSettings();
loadAutoSettings();
$('tab-manual').querySelectorAll('input').forEach(function(el){
  el.addEventListener('change',onManualFieldChange);
  el.addEventListener('input',onManualFieldChange);
});
refreshManualMs();
$('tab-auto').querySelectorAll('input,select').forEach(function(el){
  el.addEventListener('change',onAutoFieldChange);
  if(el.type==='number'||el.type==='range')el.addEventListener('input',onAutoFieldChange);
});
applyRules();applyBurstRules();
function activateTab(tab){
  document.querySelectorAll('.tab').forEach(function(t){
    t.classList.toggle('active',t.dataset.tab===tab);
  });
  $('tab-manual').classList.toggle('hidden',tab!=='manual');
  $('tab-auto').classList.toggle('hidden',tab!=='auto');
  $('tab-hist').classList.toggle('hidden',tab!=='hist');
  if(tab==='hist')loadHistory();
  try{localStorage.setItem(TAB_KEY,tab);}catch(e){}
  queueDeviceSettingsSave();
}
document.querySelectorAll('.tab').forEach(function(b){
  b.onclick=function(){activateTab(b.dataset.tab);};
});
try{
  var savedTab=localStorage.getItem(TAB_KEY);
  if(savedTab&&document.querySelector('.tab[data-tab="'+savedTab+'"]'))activateTab(savedTab);
}catch(e){}
window.addEventListener('pagehide',persistAllOperateSettings);
async function loadHistory(){
  try{
    var j=await api('/api/local/history');
    var ul=$('hist-list');ul.innerHTML='';
    (j.items||[]).forEach(function(it){
      var li=document.createElement('li');
      li.textContent=(it.endedAtUtc||it.endedAtMs)+' — '+it.summary+(it.success?'':' (fail)');
      li.style.cursor='pointer';
      li.onclick=async function(){
        try{
          var d=await api('/api/local/history?id='+encodeURIComponent(it.id));
          $('hist-detail').textContent=JSON.stringify(d,null,2);
        }catch(e){$('hist-detail').textContent='Detail: '+e.message;}
      };
      ul.appendChild(li);
    });
  }catch(e){$('hist-detail').textContent=e.message;}
}
$('btn-hist-refresh').onclick=loadHistory;
$('btn-hist-clear').onclick=async function(){try{await api('/api/local/history',{method:'DELETE'});loadHistory();}catch(e){setStatus(e.message);}};
$('btn-unlock').onclick=async function(){
  try{
    var body={pin:$('pin').value};if($('pin-new').value)body.newPin=$('pin-new').value;
    var u=await api('/api/local/unlock',{method:'POST',body:JSON.stringify(body)});
    token=u.token;sessionStorage.setItem(TOKEN_KEY,token);showMain(true);setStatus('Unlocked');
    await applyDeviceSettingsFromNvs();
    await poll();
  }catch(e){setStatus('Unlock: '+e.message);}
};
$('btn-arm').onclick=async function(){try{await api('/api/local/arm',{method:'POST'});setStatus('Armed');await poll();}catch(e){setStatus(e.message);}};
$('btn-lock').onclick=async function(){try{await api('/api/local/lock',{method:'POST'});token='';sessionStorage.removeItem(TOKEN_KEY);showMain(false);setStatus('Locked');}catch(e){setStatus(e.message);}};
$('btn-stroke').onclick=async function(){
  saveManualSettings();
  var ms=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);
  var p=JSON.stringify({strokeMs:ms,powerPercent:+$('m-power').value});
  try{await cmd('stroke',p);setStatus('Stroke sent');poll();}catch(e){setStatus(e.message);}
};
$('btn-burst').onclick=async function(){
  saveManualSettings();
  var ms=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);
  var p=JSON.stringify({strokeMs:ms,powerPercent:+$('m-power').value,burstStrokes:+$('b-count').value,burstDelayMs:+$('b-delay').value*1000});
  try{await cmd('burst',p);setStatus('Burst sent');poll();}catch(e){setStatus(e.message);}
};
$('btn-abort').onclick=async function(){try{await cmd('abort','{}');setStatus('Abort');poll();}catch(e){setStatus(e.message);}};
$('btn-auto-start').onclick=async function(){
  try{
    saveAutoSettings();
    var p=autoPayload();
    await cmd('automatic-start',p);
    lastPushedAuto=p;
    setStatus('Automatic started');
    poll();
  }catch(e){setStatus(e.message);}
};
$('btn-auto-stop').onclick=async function(){try{await cmd('automatic-stop','{}');setStatus('Stop requested');poll();}catch(e){setStatus(e.message);}};
$('btn-auto-update').onclick=function(){
  if(updateTimer)clearTimeout(updateTimer);
  updateTimer=setTimeout(async function(){
    try{await cmd('automatic-update',autoPayload());setStatus('Update queued');poll();}catch(e){setStatus(e.message);}
  },400);
};
if(token){showMain(true);applyDeviceSettingsFromNvs().then(function(){return poll();});}
})();
</script></div></body></html>
)raw";

} // namespace

namespace OperatePages {

void handleOperateGet(AsyncWebServerRequest* request) {
    Serial.println(F("[HTTP] GET /operate"));
    request->send_P(200, "text/html", kOperateHtml);
}

} // namespace OperatePages
