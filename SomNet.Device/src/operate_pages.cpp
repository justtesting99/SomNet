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
<label>Actuator profile<select id="act-kind">
<option value="relay">Relay — stroke / burst</option>
<option value="hbridge">Motor — H-bridge PWM</option>
</select></label>
<p class="note">Match the module on this board. Unlock, then save (disarms automatically if needed). Device reboots when the kind changes.</p>
<button type="button" class="btn-secondary" id="btn-act-kind">Save profile &amp; reboot</button>
<label>PIN<input id="pin" type="password" maxlength="16" value="1234"></label>
<label>New PIN (optional)<input id="pin-new" type="password" maxlength="16" placeholder="change on unlock"></label>
<div class="gate-actions panel-actions">
<button class="btn-primary" id="btn-unlock">Unlock</button>
<p class="note hidden" id="arm-hint">Unlocked — press D33 once (same as hub mode). Status shows <strong>ready</strong>, then enable Scene session below.</p>
<button class="btn-secondary hidden" id="btn-lock">Lock</button>
</div>
</div>
<div id="main" class="hidden">
<p class="panel note" id="scene-panel"><label><input type="checkbox" id="scene-on"> Scene session (LED solid green)</label></p>
<div class="tabs"><button type="button" class="tab active" data-tab="manual">Manual</button><button type="button" class="tab" data-tab="auto">Automatic</button><button type="button" class="tab" data-tab="hist">History</button></div>
<div id="tab-manual" class="panel">
<div id="relay-manual-panel" class="profile-relay layout-split">
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
<div id="motor-manual-panel" class="profile-motor hidden layout-split">
<div class="layout-col">
<div class="row"><label>Min duty %<input id="mm-dmin" type="number" min="0" max="100" value="20"></label>
<label>Max duty %<input id="mm-dmax" type="number" min="0" max="100" value="80"></label></div>
<label>Speed %<input id="mm-speed" type="range" min="0" max="100" value="50"></label>
<p class="note">PWM duty ~ <span id="mm-duty">50</span>%</p>
<div class="panel-actions">
<button class="btn-primary" id="btn-motor-run">Run</button>
<button class="btn-secondary" id="btn-motor-stop">Stop</button>
<button class="btn-danger" id="btn-motor-abort">Abort</button>
</div>
</div>
</div>
</div>
<div id="tab-auto" class="panel hidden">
<div id="relay-auto-panel" class="profile-relay layout-split">
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
</div>
<div id="motor-auto-panel" class="profile-motor hidden layout-split">
<div class="layout-col">
<label>Mode<select id="ma-mode">
<option value="periodic">Set Speed</option><option value="randomSpeed">Random Speed</option>
<option value="randomSpeedAndTiming" selected>Random Speed and Timing</option>
<option value="powerWave">Speed Wave</option><option value="buildUp">Build-Up</option></select></label>
<div class="row"><label>Min duty %<input id="ma-dmin" type="number" min="0" max="100" value="20"></label>
<label>Max duty %<input id="ma-dmax" type="number" min="0" max="100" value="80"></label></div>
<div class="row"><label>Min speed %<input id="ma-smin" type="number" min="0" max="100" value="0"></label>
<label>Max speed %<input id="ma-smax" type="number" min="0" max="100" value="100"></label></div>
<div class="row"><label>Segment min s<input id="ma-segmin" type="number" min="1" value="5"></label>
<label>Segment max s<input id="ma-segmax" type="number" min="1" value="20"></label></div>
<label>Delay before start (s)<input id="ma-delay" type="number" min="0" value="0"></label>
<label>Ramp ms<input id="ma-ramp" type="number" min="0" max="30000" value="500"></label>
<div class="row"><label>End mode<select id="ma-endmode"><option value="noAutoEnd">noAutoEnd</option><option value="minutes" selected>minutes</option></select></label>
<label>End value<input id="ma-endval" type="number" min="1" value="30"></label></div>
<div class="subpanel">
<h2>Segment target ramp (start payload)</h2>
<div class="row"><label>Ramp mode<select id="ma-ramp-mode">
<option value="segmentDuration" selected>Full segment</option><option value="instant">Instant step</option>
<option value="fixedMs">Fixed ms</option></select></label>
<label>Ramp ms (fixed)<input id="ma-ramp-ms" type="number" min="0" max="30000" value="500"></label></div>
</div>
</div>
<div class="layout-col">
<div class="subpanel" id="ma-burst-panel">
<h2>Burst settings</h2>
<p class="note">Burst speed 0–100 is relative to duty min/max. Set Speed (periodic) uses session-spread placements only.</p>
<div class="row"><label class="chk"><input id="ma-bursts" type="checkbox"> Bursts on</label>
<label>Burst %<input id="ma-bpct" type="number" min="0" max="100" value="10"></label></div>
<label>Placement<select id="ma-bplacement">
<option value="mainPlusSessionSpread" selected>Main + spread across session</option>
<option value="insteadOfSessionSpread">Burst instead of main — spread</option>
<option value="mainPlusAfterMainStroke">Main + after main (even)</option>
<option value="insteadOfAfterMainStroke">Instead of main — even</option>
<option value="mainPlusChanceAfterMainStroke">Main + chance after main</option>
<option value="insteadOfChanceAfterMainStroke">Instead of main — chance</option></select></label>
<label>Burst style<select id="ma-bstyle">
<option value="fixedPowerDelay">Fixed Speed/Delay</option>
<option value="randomPowerOnly">Random Speed Only</option>
<option value="randomDelayOnly">Random Delay Only</option>
<option value="randomPowerAndDelay">Random Speed/Delay</option></select></label>
<div class="row"><label>Burst speed min %<input id="ma-bpow-min" type="number" min="0" max="100" value="0"></label>
<label>Burst speed max %<input id="ma-bpow-max" type="number" min="0" max="100" value="100"></label></div>
<p class="hint" id="ma-bpow-hint"></p>
<div class="row"><label>Burst delay min (s)<input id="ma-bdel-min" type="number" min="0" max="300" value="1"></label>
<label>Burst delay max (s)<input id="ma-bdel-max" type="number" min="0" max="300" value="5"></label></div>
<p class="hint" id="ma-bdel-hint"></p>
<div class="row"><label>Strokes per burst min<input id="ma-bstr-min" type="number" min="1" max="100" value="5"></label>
<label>Strokes per burst max<input id="ma-bstr-max" type="number" min="1" max="100" value="10"></label></div>
</div>
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
var capsProfile='relay';
var MOTOR_MANUAL_KEY='somnet-local-motor-manual';
var MOTOR_AUTO_KEY='somnet-local-motor-automatic';
var APP_OPTIONS_KEY='somnet-local-app-options';
var MIN_SEGMENT_SEC=1;
var MAX_BURST_STROKES=100,MAX_BURST_DELAY_SEC=300,MIN_BURST_DELAY_SEC=1,MIN_BURST_STROKE_POWER=1;
function isMotorProfile(){return capsProfile==='hbridge';}
function applyProfileUi(){
  var motor=isMotorProfile();
  $('relay-manual-panel').classList.toggle('hidden',motor);
  $('motor-manual-panel').classList.toggle('hidden',!motor);
  $('relay-auto-panel').classList.toggle('hidden',motor);
  $('motor-auto-panel').classList.toggle('hidden',!motor);
}
async function loadCapsProfile(){
  try{
    var c=await fetch('/api/local/caps').then(function(r){return r.json();});
    capsProfile=(c&&c.actuatorKind)||'relay';
    if($('act-kind')&&c.actuatorKind)$('act-kind').value=c.actuatorKind;
    applyProfileUi();
  }catch(e){applyProfileUi();}
}
function $(id){return document.getElementById(id);}
function headers(){return token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{'Content-Type':'application/json'};}
function strokeMs(p,minMs,maxMs){minMs=+minMs;maxMs=+maxMs;var lo=Math.min(minMs,maxMs),hi=Math.max(minMs,maxMs);return Math.round(lo+(hi-lo)*(p/100));}
function setStatus(t){$('status-line').textContent=t||'';}
function showMain(on){$('main').classList.toggle('hidden',!on);$('btn-lock').classList.toggle('hidden',!token);$('arm-hint').classList.toggle('hidden',!token);}
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
function motorRules(mode){
  var r={disMinSpeed:false,disSegMin:false,disSegMax:false,disNoEnd:false};
  if(mode==='periodic'){r.disMinSpeed=true;r.disSegMin=true;r.disSegMax=true;}
  if(mode==='randomSpeed')r.disSegMin=true;
  if(mode==='powerWave'||mode==='buildUp')r.disNoEnd=true;
  return r;
}
function burstPlacementSchedule(p){
  if(['afterMainStroke','mainPlusAfterMainStroke','insteadOfAfterMainStroke'].indexOf(p)>=0)return 'afterMainStroke';
  if(['chanceAfterMainStroke','mainPlusChanceAfterMainStroke','insteadOfChanceAfterMainStroke'].indexOf(p)>=0)return 'chanceAfterMainStroke';
  return 'sessionSpread';
}
function coerceMotorBurstPlacement(placement,mode){
  if(mode!=='periodic')return placement;
  if(burstPlacementSchedule(placement)==='sessionSpread')return placement;
  return placement.indexOf('insteadOf')===0?'insteadOfSessionSpread':'mainPlusSessionSpread';
}
function applyMotorRules(){
  var m=$('ma-mode').value,r=motorRules(m);
  $('ma-smin').disabled=r.disMinSpeed;
  $('ma-segmin').disabled=r.disSegMin;
  $('ma-segmax').disabled=r.disSegMax;
  if(r.disNoEnd&&$('ma-endmode').value==='noAutoEnd')$('ma-endmode').value='minutes';
  var noOpt=$('ma-endmode').querySelector('option[value="noAutoEnd"]');
  if(noOpt)noOpt.disabled=r.disNoEnd;
  var pl=$('ma-bplacement');
  if(pl&&m==='periodic'){
    for(var i=0;i<pl.options.length;i++){
      var v=pl.options[i].value;
      pl.options[i].disabled=burstPlacementSchedule(v)!=='sessionSpread';
    }
    pl.value=coerceMotorBurstPlacement(pl.value,m);
  }else if(pl){
    for(var j=0;j<pl.options.length;j++)pl.options[j].disabled=false;
  }
  if(m==='periodic'&&$('ma-bursts').checked&&$('ma-endmode').value!=='minutes')$('ma-endmode').value='minutes';
}
function applyMotorBurstRules(){
  var on=$('ma-bursts').checked;
  var br=getBurstFieldRules($('ma-bstyle').value);
  ['ma-bpct','ma-bstyle','ma-bplacement','ma-bpow-min','ma-bpow-max','ma-bdel-min','ma-bdel-max','ma-bstr-min','ma-bstr-max'].forEach(function(id){$(id).disabled=!on;});
  if(on){
    $('ma-bpow-min').disabled=br.disPowMin;
    $('ma-bdel-min').disabled=br.disDelMin;
    $('ma-bpow-hint').textContent=br.disPowMin?'Min not used — device uses maximum speed.':'';
    $('ma-bdel-hint').textContent=br.disDelMin?'Min not used — device uses maximum delay.':'';
  }else{
    $('ma-bpow-hint').textContent='';
    $('ma-bdel-hint').textContent='';
  }
}
function readMotorManualSnapshot(){
  return {minimumDutyPercent:+$('mm-dmin').value,maximumDutyPercent:+$('mm-dmax').value,speedPercent:+$('mm-speed').value};
}
function normalizeMotorManual(raw){
  var d=normMinMax(raw.minimumDutyPercent,raw.maximumDutyPercent,0,100);
  return {minimumDutyPercent:d.min,maximumDutyPercent:d.max,speedPercent:clampInt(raw.speedPercent,0,100)};
}
function motorDutyFromSpeed(speed,minDuty,maxDuty){
  return strokeMs(speed,minDuty,maxDuty);
}
function fillMotorManualForm(s){
  if(!s)return;
  var n=normalizeMotorManual(s);
  $('mm-dmin').value=n.minimumDutyPercent;
  $('mm-dmax').value=n.maximumDutyPercent;
  $('mm-speed').value=n.speedPercent;
  refreshMotorDuty();
}
function readMotorAutoSnapshot(){
  return {
    automaticMode:$('ma-mode').value,
    minimumDutyPercent:+$('ma-dmin').value,maximumDutyPercent:+$('ma-dmax').value,
    minimumSpeedPercent:+$('ma-smin').value,maximumSpeedPercent:+$('ma-smax').value,
    segmentMinSeconds:+$('ma-segmin').value,segmentMaxSeconds:+$('ma-segmax').value,
    delayBeforeStartSeconds:+$('ma-delay').value,rampMs:+$('ma-ramp').value,
    endSessionMode:$('ma-endmode').value,endSessionValue:+$('ma-endval').value,
    burstsOn:$('ma-bursts').checked,
    burstPlacement:$('ma-bplacement').value,
    burstPercent:+$('ma-bpct').value,burstStyle:$('ma-bstyle').value,
    burstStrokePowerMin:+$('ma-bpow-min').value,burstStrokePowerMax:+$('ma-bpow-max').value,
    burstDelayMin:+$('ma-bdel-min').value,burstDelayMax:+$('ma-bdel-max').value,
    burstStrokesMin:+$('ma-bstr-min').value,burstStrokesMax:+$('ma-bstr-max').value
  };
}
function normalizeMotorAuto(raw){
  var mode=raw.automaticMode;
  if(mode==='randomPowerOnly')mode='randomSpeed';
  if(mode==='randomPowerAndTiming')mode='randomSpeedAndTiming';
  var snap=Object.assign({},raw,{automaticMode:mode});
  var r=motorRules(mode);
  var duty=normMinMax(snap.minimumDutyPercent,snap.maximumDutyPercent,0,100);
  var spd=normMinMax(snap.minimumSpeedPercent,snap.maximumSpeedPercent,0,100);
  var seg=normMinMax(snap.segmentMinSeconds,snap.segmentMaxSeconds,MIN_SEGMENT_SEC,3600);
  var endMode=snap.endSessionMode;
  if(endMode==='strokes')endMode='noAutoEnd';
  if(r.disNoEnd&&endMode==='noAutoEnd')endMode='minutes';
  var burst=normalizeBurst(snap);
  burst.burstPlacement=coerceMotorBurstPlacement(burst.burstPlacement||$('ma-bplacement').value,mode);
  if(mode==='periodic'&&snap.burstsOn)endMode='minutes';
  return Object.assign(snap,{
    minimumDutyPercent:duty.min,maximumDutyPercent:duty.max,
    minimumSpeedPercent:spd.min,maximumSpeedPercent:spd.max,
    segmentMinSeconds:seg.min,segmentMaxSeconds:seg.max,
    delayBeforeStartSeconds:clampInt(snap.delayBeforeStartSeconds,0,3600),
    rampMs:clampInt(snap.rampMs,0,30000),
    endSessionMode:endMode,
    endSessionValue:clampInt(snap.endSessionValue,1,1440)
  },burst);
}
function fillMotorAutoForm(s){
  if(!s)return;
  if(s.automaticMode)$('ma-mode').value=s.automaticMode;
  if(s.minimumDutyPercent!=null)$('ma-dmin').value=s.minimumDutyPercent;
  if(s.maximumDutyPercent!=null)$('ma-dmax').value=s.maximumDutyPercent;
  if(s.minimumSpeedPercent!=null)$('ma-smin').value=s.minimumSpeedPercent;
  if(s.maximumSpeedPercent!=null)$('ma-smax').value=s.maximumSpeedPercent;
  if(s.segmentMinSeconds!=null)$('ma-segmin').value=s.segmentMinSeconds;
  if(s.segmentMaxSeconds!=null)$('ma-segmax').value=s.segmentMaxSeconds;
  if(s.delayBeforeStartSeconds!=null)$('ma-delay').value=s.delayBeforeStartSeconds;
  if(s.rampMs!=null)$('ma-ramp').value=s.rampMs;
  if(s.endSessionMode)$('ma-endmode').value=s.endSessionMode==='strokes'?'noAutoEnd':s.endSessionMode;
  if(s.endSessionValue!=null)$('ma-endval').value=s.endSessionValue;
  $('ma-bursts').checked=!!s.burstsOn;
  if(s.burstPlacement)$('ma-bplacement').value=s.burstPlacement;
  if(s.burstPercent!=null)$('ma-bpct').value=s.burstPercent;
  if(s.burstStyle)$('ma-bstyle').value=s.burstStyle;
  if(s.burstStrokePowerMin!=null)$('ma-bpow-min').value=s.burstStrokePowerMin;
  if(s.burstStrokePowerMax!=null)$('ma-bpow-max').value=s.burstStrokePowerMax;
  if(s.burstDelayMin!=null)$('ma-bdel-min').value=s.burstDelayMin;
  if(s.burstDelayMax!=null)$('ma-bdel-max').value=s.burstDelayMax;
  if(s.burstStrokesMin!=null)$('ma-bstr-min').value=s.burstStrokesMin;
  if(s.burstStrokesMax!=null)$('ma-bstr-max').value=s.burstStrokesMax;
}
function readAppOptions(){
  return {
    motorSegmentTargetRampMode:$('ma-ramp-mode').value,
    motorSegmentTargetRampMs:+$('ma-ramp-ms').value
  };
}
function fillAppOptions(o){
  if(!o)return;
  if(o.motorSegmentTargetRampMode)$('ma-ramp-mode').value=o.motorSegmentTargetRampMode;
  if(o.motorSegmentTargetRampMs!=null)$('ma-ramp-ms').value=o.motorSegmentTargetRampMs;
}
function resolveSegmentTargetRampMs(mode,opts){
  if(mode==='powerWave'||mode==='buildUp')return -1;
  if(opts.motorSegmentTargetRampMode==='instant')return 0;
  if(opts.motorSegmentTargetRampMode==='fixedMs')return clampInt(opts.motorSegmentTargetRampMs,0,30000);
  return -1;
}
function motorAutoPayload(){
  var snap=normalizeMotorAuto(readMotorAutoSnapshot());
  var opts=readAppOptions();
  var segmentTargetRampMs=resolveSegmentTargetRampMs(snap.automaticMode,opts);
  var o={
    actuatorKind:'hbridge',
    segmentTargetRampMs:segmentTargetRampMs,
    automaticMode:snap.automaticMode,
    minimumDutyPercent:snap.minimumDutyPercent,maximumDutyPercent:snap.maximumDutyPercent,
    minimumSpeedPercent:snap.minimumSpeedPercent,maximumSpeedPercent:snap.maximumSpeedPercent,
    segmentMinSeconds:snap.segmentMinSeconds,segmentMaxSeconds:snap.segmentMaxSeconds,
    delayBeforeStartSeconds:snap.delayBeforeStartSeconds,rampMs:snap.rampMs,
    endSessionMode:snap.endSessionMode,endSessionValue:snap.endSessionValue,
    burstsOn:snap.burstsOn,
    burstPlacement:snap.burstPlacement,burstPercent:snap.burstPercent,burstStyle:snap.burstStyle,
    burstStrokePowerMin:snap.burstStrokePowerMin,burstStrokePowerMax:snap.burstStrokePowerMax,
    burstDelayMin:snap.burstDelayMin,burstDelayMax:snap.burstDelayMax,
    burstStrokesMin:snap.burstStrokesMin,burstStrokesMax:snap.burstStrokesMax
  };
  return JSON.stringify(o);
}
function saveMotorSettings(){
  try{
    localStorage.setItem(MOTOR_MANUAL_KEY,JSON.stringify(normalizeMotorManual(readMotorManualSnapshot())));
    localStorage.setItem(MOTOR_AUTO_KEY,JSON.stringify(readMotorAutoSnapshot()));
    localStorage.setItem(APP_OPTIONS_KEY,JSON.stringify(readAppOptions()));
  }catch(e){}
}
function loadMotorSettings(){
  try{
    var mm=localStorage.getItem(MOTOR_MANUAL_KEY);
    if(mm)fillMotorManualForm(JSON.parse(mm));
    var ma=localStorage.getItem(MOTOR_AUTO_KEY);
    if(ma)fillMotorAutoForm(JSON.parse(ma));
    var ao=localStorage.getItem(APP_OPTIONS_KEY);
    if(ao)fillAppOptions(JSON.parse(ao));
  }catch(e){}
}
function refreshMotorDuty(){
  var n=normalizeMotorManual(readMotorManualSnapshot());
  $('mm-duty').textContent=motorDutyFromSpeed(n.speedPercent,n.minimumDutyPercent,n.maximumDutyPercent);
}
function onMotorManualFieldChange(){
  refreshMotorDuty();
  persistAllOperateSettings();
}
function onMotorAutoFieldChange(){
  applyMotorRules();
  applyMotorBurstRules();
  persistAllOperateSettings();
  queueAutoUpdate();
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
    burstPlacement:($('a-bplacement')?$('a-bplacement').value:'sessionSpread'),
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
  if(s.burstPlacement&&$('a-bplacement'))$('a-bplacement').value=s.burstPlacement;
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
  if(isMotorProfile())return motorAutoPayload();
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
  if(isMotorProfile()){
    return JSON.stringify({
      motorManual:normalizeMotorManual(readMotorManualSnapshot()),
      motorAutomatic:readMotorAutoSnapshot(),
      appOptions:readAppOptions(),
      activeTab:localStorage.getItem(TAB_KEY)||'manual'
    });
  }
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
  if(isMotorProfile())saveMotorSettings();
  else{saveManualSettings();saveAutoSettings();}
  queueDeviceSettingsSave();
}
async function applyDeviceSettingsFromNvs(){
  if(!token)return;
  try{
    await loadCapsProfile();
    var j=await api('/api/local/settings');
    if(j.stored===false){
      if(isMotorProfile()){loadMotorSettings();applyMotorRules();applyMotorBurstRules();refreshMotorDuty();}
      else{loadManualSettings();loadAutoSettings();applyRules();applyBurstRules();refreshManualMs();}
      return;
    }
    if(isMotorProfile()){
      if(j.motorManual)fillMotorManualForm(j.motorManual);
      if(j.motorAutomatic)fillMotorAutoForm(j.motorAutomatic);
      if(j.appOptions)fillAppOptions(j.appOptions);
      applyMotorRules();applyMotorBurstRules();refreshMotorDuty();
      saveMotorSettings();
    }else{
      if(j.manual)fillManualForm(j.manual);
      if(j.automatic)fillAutoForm(j.automatic);
      applyRules();applyBurstRules();refreshManualMs();
      saveManualSettings();saveAutoSettings();
    }
    if(j.activeTab&&document.querySelector('.tab[data-tab="'+j.activeTab+'"]'))activateTab(j.activeTab);
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
    if(s.sceneActive)parts.push('scene');
    else if(s.subReady)parts.push('ready');
    else if(s.unlocked)parts.push('awaiting device button');
    if(s.rgbState)parts.push('led:'+s.rgbState);
    if(s.busy)parts.push('busy');
    if(s.automaticActive)parts.push('automatic');
    if(s.commandComplete){
      parts.push(s.commandSuccess?'ok':'fail');
      if(s.commandMessage)parts.push(s.commandMessage);
    }
    setStatus(parts.join(' · ')||'Idle');
    if($('scene-on')){
      $('scene-on').checked=!!s.sceneActive;
      $('scene-on').disabled=!s.subReady||!!(s.busy||s.automaticActive);
    }
    $('btn-auto-start').disabled=!!(s.busy||s.automaticActive);
    if(s.automaticActive&&!autoLiveActive){
      autoLiveActive=true;
      lastPushedAuto=autoPayload();
    }else if(!s.automaticActive&&autoLiveActive){
      autoLiveActive=false;
      lastPushedAuto=null;
    }
    var needsFastPoll=!!(s.busy||s.automaticActive||(s.unlocked&&!s.subReady));
    if(needsFastPoll){if(!pollTimer)pollTimer=setInterval(poll,800);}
    else if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
  }catch(e){setStatus(e.message);}
}
loadManualSettings();
loadAutoSettings();
loadMotorSettings();
loadCapsProfile();
$('tab-manual').querySelectorAll('#relay-manual-panel input').forEach(function(el){
  el.addEventListener('change',onManualFieldChange);
  el.addEventListener('input',onManualFieldChange);
});
refreshManualMs();
$('motor-manual-panel').querySelectorAll('input').forEach(function(el){
  el.addEventListener('change',onMotorManualFieldChange);
  el.addEventListener('input',onMotorManualFieldChange);
});
refreshMotorDuty();
$('tab-auto').querySelectorAll('#relay-auto-panel input,#relay-auto-panel select').forEach(function(el){
  el.addEventListener('change',onAutoFieldChange);
  if(el.type==='number'||el.type==='range')el.addEventListener('input',onAutoFieldChange);
});
applyRules();applyBurstRules();
$('motor-auto-panel').querySelectorAll('input,select').forEach(function(el){
  el.addEventListener('change',onMotorAutoFieldChange);
  if(el.type==='number'||el.type==='range')el.addEventListener('input',onMotorAutoFieldChange);
});
applyMotorRules();applyMotorBurstRules();
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
$('btn-lock').onclick=async function(){try{await api('/api/local/lock',{method:'POST'});token='';sessionStorage.removeItem(TOKEN_KEY);showMain(false);setStatus('Locked');}catch(e){setStatus(e.message);}};
$('scene-on').onchange=async function(){
  try{
    await api('/api/local/scene',{method:'POST',body:JSON.stringify({active:$('scene-on').checked})});
    await poll();
  }catch(e){setStatus(e.message);$('scene-on').checked=!$('scene-on').checked;}
};
$('btn-stroke').onclick=async function(){
  if(isMotorProfile())return;
  saveManualSettings();
  var ms=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);
  var p=JSON.stringify({strokeMs:ms,powerPercent:+$('m-power').value});
  try{await cmd('stroke',p);setStatus('Stroke sent');poll();}catch(e){setStatus(e.message);}
};
$('btn-burst').onclick=async function(){
  if(isMotorProfile())return;
  saveManualSettings();
  var ms=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);
  var p=JSON.stringify({strokeMs:ms,powerPercent:+$('m-power').value,burstStrokes:+$('b-count').value,burstDelayMs:+$('b-delay').value*1000});
  try{await cmd('burst',p);setStatus('Burst sent');poll();}catch(e){setStatus(e.message);}
};
$('btn-motor-run').onclick=async function(){
  saveMotorSettings();
  var n=normalizeMotorManual(readMotorManualSnapshot());
  var duty=motorDutyFromSpeed(n.speedPercent,n.minimumDutyPercent,n.maximumDutyPercent);
  try{await cmd('motor-run',JSON.stringify({dutyPercent:duty}));setStatus('Motor run');poll();}catch(e){setStatus(e.message);}
};
$('btn-motor-stop').onclick=async function(){try{await cmd('motor-stop','{}');setStatus('Motor stop');poll();}catch(e){setStatus(e.message);}};
$('btn-motor-abort').onclick=async function(){try{await cmd('abort','{}');setStatus('Abort');poll();}catch(e){setStatus(e.message);}};
$('btn-abort').onclick=async function(){try{await cmd('abort','{}');setStatus('Abort');poll();}catch(e){setStatus(e.message);}};
$('btn-auto-start').onclick=async function(){
  try{
    if(isMotorProfile())saveMotorSettings();else saveAutoSettings();
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
async function loadActuatorKind(){
  try{
    var c=await fetch('/api/local/caps').then(function(r){return r.json();});
    if(c&&c.actuatorKind)$('act-kind').value=c.actuatorKind;
  }catch(e){}
}
$('btn-act-kind').onclick=async function(){
  try{
    if(!token){setStatus('Unlock first to change actuator profile');return;}
    var st=await api('/api/local/status');
    if(st.busy||st.automaticActive){setStatus('Wait for motion to finish');return;}
    var kind=$('act-kind').value;
    var j=await api('/api/local/actuator-kind',{method:'PUT',body:JSON.stringify({actuatorKind:kind})});
    setStatus(j.reboot?'Profile saved — rebooting…':'Profile unchanged');
  }catch(e){setStatus(e.message);}
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
