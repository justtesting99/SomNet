#include "operate_pages.h"

#include "web_ui_shared.h"

#include <ESPAsyncWebServer.h>
#include <Arduino.h>

namespace {

// Body HTML (shared CSS streamed separately in handleOperateGet).
constexpr char kOperateHtml[] PROGMEM = R"raw(
</head><body><script>try{if(sessionStorage.getItem('somesp-bearer'))document.documentElement.classList.add('session-resume');}catch(e){}</script>
<div class="shell-bg"></div>
<div id="gate" class="gate-screen">
<div class="gate-card ui-panel"><div class="ui-panel-hd"><h2>Unlock control panel</h2></div><div class="ui-panel-bd">
<label>Actuator profile<select id="act-kind">
<option value="relay">Relay — stroke / burst</option>
<option value="hbridge">Motor — H-bridge PWM</option>
</select></label>
<p class="note">Match the module on this board. Save profile while unlocked (device reboots when the kind changes).</p>
<button type="button" class="btn-secondary" id="btn-act-kind">Save profile &amp; reboot</button>
<label>PIN<input id="pin" type="password" maxlength="16" value="1234"></label>
<label>New PIN (optional)<input id="pin-new" type="password" maxlength="16" placeholder="change on unlock"></label>
<div class="panel-actions">
<button class="btn-primary lg" id="btn-unlock">Unlock</button>
</div>
<p class="note"><a href="/">Status</a> &middot; LAN only &middot; default PIN 1234</p>
</div></div></div>
<div id="main" class="app-shell hidden">
<header class="shell-header"><div class="shell-header-inner wide">
<div class="shell-brand"><div class="brand-title">SomEsp Control</div><div class="brand-sub">Local operate</div></div>
<div id="status-pill" class="status-pill tone-checking"><div class="status-pill-inner"><span class="dot"></span><span class="summary">Checking…</span></div></div>
<nav class="shell-nav">
<a class="nav-link" href="/">Status</a>
<a class="nav-link" href="/config">Configure</a>
<button type="button" class="btn-ghost sm" id="btn-hist-open">History</button>
<button type="button" class="btn-ghost sm hidden" id="btn-lock">Lock</button>
</nav></div></header>
<main class="shell-main wide">
<div class="dashboard-grid">
<div class="dashboard-controls">
<div class="ui-panel"><div class="ui-panel-hd">
<div style="flex:1;min-width:0"><h2 id="device-panel-title">Relay · …</h2>
<p class="note hidden" id="device-panel-sub" style="margin:0;font-size:.75rem"></p></div>
<label class="focus-label" style="max-width:14rem">Focus device<select id="focus-device" class="focus-select"><option value="">Loading…</option></select></label>
</div><div class="ui-panel-bd">
<div class="device-toolbar">
<span class="note" style="margin:0;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Mode</span>
<div class="mode-segment" role="tablist"><button type="button" class="mode-seg tab active" data-tab="manual">Manual</button><button type="button" class="mode-seg tab" data-tab="auto">Automatic</button></div>
<div id="scene-toggle-wrap" class="header-toggle"><span class="header-toggle-label">Scene</span><span class="header-toggle-state" id="scene-state">Off</span><label class="toggle-switch"><input type="checkbox" id="scene-on"><span class="toggle-knob"></span></label></div>
</div>
<p class="note hidden" id="arm-hint">Unlocked — press D33 once (same as hub mode). Status shows <strong>ready</strong>, then enable Scene above.</p>
<p id="auto-session-banner" class="session-banner hidden" role="status">Session running — changes apply after the current stroke. Use Stop to end gracefully; Abort stops immediately.</p>
<div id="tab-manual">
<div id="relay-manual-panel" class="profile-relay control-grid cols-2 layout-split">
<div class="layout-col ui-panel"><div class="ui-panel-hd"><h2>Power settings</h2></div><div class="ui-panel-bd">
<div class="row"><label>Minimum stroke (ms)<input id="m-min" type="number" min="1" max="30000" value="25"></label>
<label>Maximum stroke (ms)<input id="m-max" type="number" min="1" max="30000" value="400"></label></div>
<label>Power %<input id="m-power" type="range" min="0" max="100" value="50"></label>
<p class="note">Stroke ~ <span id="m-stroke-ms">212</span> ms</p>
</div></div>
<div class="layout-col ui-panel"><div class="ui-panel-hd"><h2>Actions</h2></div><div class="ui-panel-bd">
<div class="panel-actions">
<button class="btn-primary lg" id="btn-stroke">Stroke</button>
<button class="btn-danger lg" id="btn-abort">Abort</button>
</div>
<div class="subpanel" style="margin-top:1rem">
<div class="row"><label>Burst strokes<input id="b-count" type="number" min="1" max="100" value="5"></label>
<label>Burst delay (sec)<input id="b-delay" type="number" min="0" max="300" value="5"></label></div>
<button class="btn-primary lg" id="btn-burst">Burst</button>
</div>
</div></div>
</div>
<div id="motor-manual-panel" class="profile-motor hidden control-grid cols-2 layout-split">
<div class="layout-col ui-panel"><div class="ui-panel-hd"><h2>Speed settings</h2></div><div class="ui-panel-bd">
<div class="row"><label>Min duty %<input id="mm-dmin" type="number" min="0" max="100" value="20"></label>
<label>Max duty %<input id="mm-dmax" type="number" min="0" max="100" value="80"></label></div>
<label>Speed %<input id="mm-speed" type="range" min="0" max="100" value="50"></label>
<p class="note">PWM duty ~ <span id="mm-duty">50</span>%</p>
</div></div>
<div class="layout-col ui-panel"><div class="ui-panel-hd"><h2>Actions</h2></div><div class="ui-panel-bd">
<div class="panel-actions">
<button class="btn-primary lg" id="btn-motor-run">Run</button>
<button class="btn-secondary lg" id="btn-motor-stop">Stop</button>
<button class="btn-danger lg" id="btn-motor-abort">Abort</button>
</div>
</div></div>
</div>
</div>
<div id="tab-auto" class="hidden">
<div id="relay-auto-panel" class="profile-relay">
<div class="control-grid cols-2 layout-split">
<div class="layout-col">
<div class="ui-panel"><div class="ui-panel-hd"><h2>Program</h2></div><div class="ui-panel-bd">
<label>Automatic mode<select id="a-mode">
<option value="periodic">Periodic</option><option value="randomPowerOnly">Random Power Only</option>
<option value="randomTimingOnly">Random Timing Only</option><option value="randomPowerAndTiming" selected>Random Power and Timing</option>
<option value="powerWave">Power Wave</option><option value="powerAndTimingWave">Power and Timing Wave</option>
<option value="buildUp">Build-Up</option></select></label>
</div></div>
<div class="ui-panel"><div class="ui-panel-hd"><h2>Power settings</h2></div><div class="ui-panel-bd">
<div class="row"><label>Minimum stroke (ms)<input id="a-minms" type="number" value="25"></label><label>Maximum stroke (ms)<input id="a-maxms" type="number" value="400"></label></div>
<div class="power-slider-grid">
<div class="power-slider-cell"><p class="power-slider-label">Minimum power</p>
<input id="a-minp" type="range" min="0" max="100" value="0">
<p class="note power-slider-val"><span id="a-minp-val">0</span>% · ~ <span id="a-minp-ms">25</span> ms</p></div>
<div class="power-slider-cell"><p class="power-slider-label">Maximum power</p>
<input id="a-maxp" type="range" min="0" max="100" value="100">
<p class="note power-slider-val"><span id="a-maxp-val">100</span>% · ~ <span id="a-maxp-ms">400</span> ms</p></div>
</div>
</div></div>
<div class="ui-panel"><div class="ui-panel-hd"><h2>Timing settings</h2></div><div class="ui-panel-bd">
<p class="note" style="margin-top:0">Time between strokes</p>
<div class="row"><label>Minimum gap (sec)<input id="a-gmin" type="number" min="1" value="5"></label>
<label>Maximum gap (sec)<input id="a-gmax" type="number" min="1" value="20"></label></div>
<label>Delay before start (sec)<input id="a-delay" type="number" min="0" value="0"></label>
<div class="row"><label>End session<select id="a-endmode"><option value="noAutoEnd">No AutoEnd</option><option value="minutes">Minutes</option><option value="strokes">Strokes</option></select></label>
<label>End value<input id="a-endval" type="number" min="1" value="100"></label></div>
</div></div>
</div>
<div class="layout-col">
<div class="ui-panel" id="burst-panel"><div class="ui-panel-hd"><h2>Burst settings</h2></div><div class="ui-panel-bd">
<p class="note" style="margin-top:0">Burst stroke power 0–100 is relative to main power min/max.</p>
<div class="row"><label class="chk"><input id="a-bursts" type="checkbox"> Bursts on</label>
<label>Burst chance %<input id="a-bpct" type="number" min="0" max="100" value="10"></label></div>
<label>Burst style<select id="a-bstyle">
<option value="fixedPowerDelay">Fixed Power/Delay</option>
<option value="randomPowerOnly">Random Power Only</option>
<option value="randomDelayOnly">Random Delay Only</option>
<option value="randomPowerAndDelay">Random Power/Delay</option></select></label>
<div class="row"><label>Burst power min %<input id="a-bpow-min" type="number" min="0" max="100" value="0"></label>
<label>Burst power max %<input id="a-bpow-max" type="number" min="0" max="100" value="100"></label></div>
<p class="hint" id="a-bpow-hint"></p>
<div class="row"><label>Burst delay min (sec)<input id="a-bdel-min" type="number" min="0" max="300" value="1"></label>
<label>Burst delay max (sec)<input id="a-bdel-max" type="number" min="0" max="300" value="5"></label></div>
<p class="hint" id="a-bdel-hint"></p>
<div class="row"><label>Strokes per burst min<input id="a-bstr-min" type="number" min="1" max="100" value="5"></label>
<label>Strokes per burst max<input id="a-bstr-max" type="number" min="1" max="100" value="10"></label></div>
</div></div>
</div>
</div>
</div>
<div id="motor-auto-panel" class="profile-motor hidden">
<div class="control-grid cols-2 layout-split">
<div class="layout-col">
<div class="ui-panel"><div class="ui-panel-hd"><h2>Program</h2></div><div class="ui-panel-bd">
<label>Automatic mode<select id="ma-mode">
<option value="periodic">Set Speed</option><option value="randomSpeed">Random Speed</option>
<option value="randomSpeedAndTiming" selected>Random Speed and Timing</option>
<option value="powerWave">Speed Wave</option><option value="buildUp">Build-Up</option></select></label>
</div></div>
<div class="ui-panel"><div class="ui-panel-hd"><h2>Speed settings</h2></div><div class="ui-panel-bd">
<div class="row"><label>Min duty %<input id="ma-dmin" type="number" min="0" max="100" value="20"></label>
<label>Max duty %<input id="ma-dmax" type="number" min="0" max="100" value="80"></label></div>
<div class="power-slider-grid">
<div class="power-slider-cell"><p class="power-slider-label">Minimum speed</p>
<input id="ma-smin" type="range" min="0" max="100" value="0">
<p class="note power-slider-val"><span id="ma-smin-val">0</span>%</p></div>
<div class="power-slider-cell"><p class="power-slider-label">Maximum speed</p>
<input id="ma-smax" type="range" min="0" max="100" value="100">
<p class="note power-slider-val"><span id="ma-smax-val">100</span>%</p></div>
</div>
</div></div>
<div class="ui-panel"><div class="ui-panel-hd"><h2>Timing settings</h2></div><div class="ui-panel-bd">
<div class="row"><label>Segment min (sec)<input id="ma-segmin" type="number" min="1" value="5"></label>
<label>Segment max (sec)<input id="ma-segmax" type="number" min="1" value="20"></label></div>
<label>Delay before start (sec)<input id="ma-delay" type="number" min="0" value="0"></label>
<label>Ramp ms<input id="ma-ramp" type="number" min="0" max="30000" value="500"></label>
<div class="row"><label>End session<select id="ma-endmode"><option value="noAutoEnd">No AutoEnd</option><option value="minutes" selected>Minutes</option></select></label>
<label>End value<input id="ma-endval" type="number" min="1" value="30"></label></div>
<div class="subpanel">
<h2>Segment target ramp</h2>
<div class="row"><label>Ramp mode<select id="ma-ramp-mode">
<option value="segmentDuration" selected>Full segment</option><option value="instant">Instant step</option>
<option value="fixedMs">Fixed ms</option></select></label>
<label>Ramp ms (fixed)<input id="ma-ramp-ms" type="number" min="0" max="30000" value="500"></label></div>
</div>
</div></div>
</div>
<div class="layout-col">
<div class="ui-panel" id="ma-burst-panel"><div class="ui-panel-hd"><h2>Burst settings</h2></div><div class="ui-panel-bd">
<p class="note" style="margin-top:0">Burst speed 0–100 is relative to duty min/max.</p>
<div class="row"><label class="chk"><input id="ma-bursts" type="checkbox"> Bursts on</label>
<label>Burst chance %<input id="ma-bpct" type="number" min="0" max="100" value="10"></label></div>
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
<div class="row"><label>Burst delay min (sec)<input id="ma-bdel-min" type="number" min="0" max="300" value="1"></label>
<label>Burst delay max (sec)<input id="ma-bdel-max" type="number" min="0" max="300" value="5"></label></div>
<p class="hint" id="ma-bdel-hint"></p>
<div class="row"><label>Strokes per burst min<input id="ma-bstr-min" type="number" min="1" max="100" value="5"></label>
<label>Strokes per burst max<input id="ma-bstr-max" type="number" min="1" max="100" value="10"></label></div>
</div></div>
</div>
</div>
</div>
<div class="ui-panel"><div class="ui-panel-hd"><h2>Session control</h2></div><div class="ui-panel-bd">
<div class="panel-actions">
<button class="btn-primary lg" id="btn-auto-start">Start automatic</button>
<button class="btn-secondary lg" id="btn-auto-stop">Stop</button>
<button class="btn-secondary" id="btn-auto-update">Apply update</button>
</div></div></div>
</div>
</div></div></div>
<aside class="dashboard-aside">
<div class="ui-panel graph-panel"><div class="ui-panel-hd"><h2>Pattern preview</h2></div><div class="ui-panel-bd">
<canvas id="pattern-graph" width="480" height="180" role="img" aria-label="Power or speed over time preview"></canvas>
<p class="note" id="graph-caption">Illustrative preview from current settings (not live telemetry).</p>
</div></div>
</aside>
</div>
<p class="status sr-only" id="status-line">Idle</p>
</main></div>
<div id="hist-modal" class="modal-backdrop hidden" aria-hidden="true">
<div class="modal ui-panel"><div class="ui-panel-hd"><h2>Session history</h2>
<button type="button" class="btn-ghost sm" id="btn-hist-close" style="margin-left:auto">Close</button></div>
<div class="ui-panel-bd">
<div class="panel-actions">
<button class="btn-secondary" id="btn-hist-refresh">Refresh</button>
<button class="btn-danger" id="btn-hist-clear">Clear history</button>
</div>
<ul id="hist-list" class="note"></ul>
<pre id="hist-detail" class="note hist-detail"></pre>
</div></div></div>
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
var graphTimer=null;
var focusDeviceId='';
var liveSegments=[];
var lastLiveSegmentIndex=-1;
var graphNowSec=null;
var sceneTogglePending=false;
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
  refreshDevicePanelHeader(null);
  scheduleGraphUpdate();
}
async function loadCapsProfile(){
  try{
    var c=await fetch('/api/local/caps').then(function(r){return r.json();});
    capsProfile=(c&&c.actuatorKind)||'relay';
    if($('act-kind')&&c.actuatorKind)$('act-kind').value=c.actuatorKind;
    applyProfileUi();
    refreshFocusDevice(null);
    scheduleGraphUpdate();
  }catch(e){applyProfileUi();}
}
function $(id){return document.getElementById(id);}
function headers(){return token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{'Content-Type':'application/json'};}
function strokeMs(p,minMs,maxMs){minMs=+minMs;maxMs=+maxMs;var lo=Math.min(minMs,maxMs),hi=Math.max(minMs,maxMs);return Math.round(lo+(hi-lo)*(p/100));}
function setStatus(t){$('status-line').textContent=t||'';}
function setStatusPill(tone,summary){
  var pill=$('status-pill');
  if(!pill)return;
  pill.className='status-pill tone-'+(tone||'checking');
  var s=pill.querySelector('.summary');
  if(s)s.textContent=summary||'';
}
function syncSceneToggleUi(on){
  var wrap=$('scene-toggle-wrap');
  if(wrap)wrap.classList.toggle('on',!!on);
  var st=$('scene-state');
  if(st)st.textContent=on?'On':'Off';
}
function updateSceneControlFromStatus(s){
  var el=$('scene-on');
  var wrap=$('scene-toggle-wrap');
  if(!el||!s)return;
  var wantOn=!!s.sceneActive;
  if(!sceneTogglePending){
    el.checked=wantOn;
    syncSceneToggleUi(wantOn);
  }
  var blockEnable=!s.subReady&&!wantOn;
  el.disabled=blockEnable;
  if(wrap){
    wrap.classList.toggle('is-disabled',blockEnable);
    wrap.title=blockEnable?'Press device button (D33) once — status shows Ready — then turn Scene on.':'';
  }
}
function endSessionResume(){
  document.documentElement.classList.remove('session-resume');
}
function showMain(on){
  endSessionResume();
  $('gate').classList.toggle('hidden',on);
  $('main').classList.toggle('hidden',!on);
  $('btn-lock').classList.toggle('hidden',!token);
  $('arm-hint').classList.toggle('hidden',!token);
  if(on)scheduleGraphUpdate();
}
function lockUi(message){
  token='';
  sessionStorage.removeItem(TOKEN_KEY);
  endSessionResume();
  showMain(false);
  if(message)setStatus(message);
  setStatusPill('checking','Locked');
  refreshDevicePanelHeader(null);
}
function ensureDeviceSession(status){
  if(!token)return true;
  if(status&&status.unlocked)return true;
  lockUi('PIN session ended (reboot or lock) — unlock again, then press D33');
  return false;
}
function deviceConnectionLabel(s){
  if(!token||!(s&&s.unlocked))return 'locked';
  if(s.busy||s.automaticActive)return 'busy';
  if(s.wifiConnected===false)return 'offline';
  return 'online';
}
function devicePanelReadinessLine(s){
  if(!token||!s)return '';
  if(s.busy||s.automaticActive)return s.automaticActive?'Automatic session running':'Busy';
  if(s.sceneActive)return 'Scene session on';
  if(s.subReady)return 'Ready for commands';
  if(s.unlocked)return 'Press device button (D33)';
  return '';
}
function refreshDevicePanelHeader(status){
  var title=$('device-panel-title');
  var sub=$('device-panel-sub');
  if(!title)return;
  var kind=capsProfile==='hbridge'?'Motor':'Relay';
  var id=focusDeviceId||'…';
  var conn=status?deviceConnectionLabel(status):'…';
  title.textContent=kind+' · '+id+' ('+conn+')';
  if(sub){
    var line=devicePanelReadinessLine(status);
    sub.textContent=line;
    sub.classList.toggle('hidden',!line);
  }
}
async function refreshFocusDevice(liveStatus){
  var sel=$('focus-device');
  if(!sel)return;
  try{
    var st=liveStatus;
    if(!st)st=await fetch('/api/status').then(function(r){return r.json();});
    focusDeviceId=st.deviceId||'local';
    var kindLabel=capsProfile==='hbridge'?'Motor':'Relay';
    var conn=deviceConnectionLabel(st);
    sel.innerHTML='';
    var opt=document.createElement('option');
    opt.value=focusDeviceId;
    opt.textContent=kindLabel+' · '+focusDeviceId+' ('+conn+')';
    opt.selected=true;
    sel.appendChild(opt);
    refreshDevicePanelHeader(st);
  }catch(e){
    sel.innerHTML='<option value="">This device</option>';
    refreshDevicePanelHeader(null);
  }
}
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
  scheduleGraphUpdate();
}
function onMotorAutoFieldChange(){
  applyMotorRules();
  applyMotorBurstRules();
  refreshAutoPowerLabels();
  persistAllOperateSettings();
  queueAutoUpdate();
  scheduleGraphUpdate();
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
  refreshAutoPowerLabels();
  persistAllOperateSettings();
  queueAutoUpdate();
  scheduleGraphUpdate();
}
async function api(path,opt){
  opt=opt||{};var h=headers();if(opt.headers)Object.assign(h,opt.headers);
  var r=await fetch(path,{method:opt.method||'GET',headers:h,body:opt.body});
  var j=null;try{j=await r.json();}catch(e){}
  if(r.status===401&&token){
    lockUi('Session expired — enter PIN again, then press D33');
  }
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
    if(j.activeTab&&j.activeTab!=='hist'&&document.querySelector('.tab[data-tab="'+j.activeTab+'"]'))activateTab(j.activeTab);
  }catch(e){}
}
function refreshManualMs(){$('m-stroke-ms').textContent=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);}
function onManualFieldChange(){
  refreshManualMs();
  persistAllOperateSettings();
  scheduleGraphUpdate();
}
function refreshAutoPowerLabels(){
  if($('a-minp-val'))$('a-minp-val').textContent=$('a-minp').value;
  if($('a-maxp-val'))$('a-maxp-val').textContent=$('a-maxp').value;
  if($('a-minp-ms'))$('a-minp-ms').textContent=strokeMs($('a-minp').value,$('a-minms').value,$('a-maxms').value);
  if($('a-maxp-ms'))$('a-maxp-ms').textContent=strokeMs($('a-maxp').value,$('a-minms').value,$('a-maxms').value);
  if($('ma-smin-val'))$('ma-smin-val').textContent=$('ma-smin').value;
  if($('ma-smax-val'))$('ma-smax-val').textContent=$('ma-smax').value;
}
function clearLiveGraph(){
  liveSegments=[];lastLiveSegmentIndex=-1;graphNowSec=null;
}
function tryIngestLiveSegment(status){
  if(!status||!status.resultJson)return;
  try{
    var parsed=JSON.parse(status.resultJson);
    var idx=+parsed.segmentIndex;
    if(!isFinite(idx)||idx<=lastLiveSegmentIndex)return;
    if(parsed.commandKey==='relay-automatic-segment'){
      lastLiveSegmentIndex=idx;
      liveSegments.push({phase:parsed.phase,powerPercent:+parsed.powerPercent,durationMs:+parsed.durationMs,programElapsedMs:+parsed.programElapsedMs});
      graphNowSec=(+parsed.programElapsedMs+(+parsed.durationMs))/1000;
      scheduleGraphUpdate();
    }else if(parsed.commandKey==='motor-automatic-segment'){
      lastLiveSegmentIndex=idx;
      liveSegments.push({fromSpeed:+parsed.fromSpeedPercent,toSpeed:+parsed.toSpeedPercent,durationMs:+parsed.durationMs,programElapsedMs:+parsed.programElapsedMs});
      graphNowSec=(+parsed.programElapsedMs+(+parsed.durationMs))/1000;
      scheduleGraphUpdate();
    }
  }catch(e){}
}
function buildLiveGraphSchedule(){
  if(!liveSegments.length||activeOperateMode()!=='auto')return null;
  var horizon=PREVIEW_HORIZON;
  var label=isMotorProfile()?'Speed %':'Power %';
  if(isMotorProfile())horizon=autoHorizonSecMotor(normalizeMotorAuto(readMotorAutoSnapshot()));
  else horizon=autoHorizonSecRelay(readAutoSnapshot());
  var pts=[];
  if(isMotorProfile()){
    pts.push({t:0,v:liveSegments[0].fromSpeed||0});
    for(var i=0;i<liveSegments.length;i++){
      var seg=liveSegments[i];
      var t0=seg.programElapsedMs/1000;
      var t1=t0+seg.durationMs/1000;
      pts.push({t:t0,v:seg.fromSpeed});pts.push({t:t0,v:seg.toSpeed});pts.push({t:t1,v:seg.toSpeed});
      horizon=Math.max(horizon,t1+5);
    }
  }else{
    pts.push({t:0,v:0});
    var level=0;
    for(var j=0;j<liveSegments.length;j++){
      var r=liveSegments[j];
      var rs=r.programElapsedMs/1000;
      var re=rs+r.durationMs/1000;
      var target=r.phase==='stroke'?r.powerPercent:0;
      if(rs>pts[pts.length-1].t)pts.push({t:rs,v:level});
      if(target!==level){pts.push({t:rs,v:level});pts.push({t:rs,v:target});}
      pts.push({t:re,v:target});
      level=target;
      horizon=Math.max(horizon,re+5);
    }
  }
  return {points:pts,horizon:horizon,label:label,nowSec:graphNowSec,live:true};
}
function activeOperateMode(){
  return $('tab-auto').classList.contains('hidden')?'manual':'auto';
}
var PREVIEW_HORIZON=300;
function hashSeed(str){
  var h=2166136261;
  for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
function seededRand(seed){
  var s=seed>>>0;
  return function(){
    s=Math.imul(s,1664525)+1013904223>>>0;
    return s/4294967296;
  };
}
function lerpInt(a,b,t){return Math.round(a+(b-a)*Math.min(1,Math.max(0,t)));}
function triangle01(p){p=p-Math.floor(p);if(p<0)p+=1;return p<0.5?p*2:2-p*2;}
function autoHorizonSecRelay(s){
  if(s.endSessionMode==='minutes')return Math.max(60,s.endSessionValue*60);
  if(s.endSessionMode==='strokes'){
    var avgGap=(s.strokeMinSeconds+s.strokeMaxSeconds)/2;
    var strokeSec=strokeMs(s.maximumPower,s.minimumStrokeMs,s.maximumStrokeMs)/1000;
    return Math.max(30,s.endSessionValue*(avgGap+strokeSec));
  }
  return PREVIEW_HORIZON;
}
function pushGraphPoint(points,t,v){
  var last=points[points.length-1];
  if(last&&last.t===t&&last.v===v)return;
  points.push({t:t,v:v});
}
function relayPeriodicStrokeRow(s){
  return {powerPercent:s.maximumPower,gapSec:s.strokeMaxSeconds};
}
function relayRandomStrokeRow(s,strokeIndex,seed){
  var lo=Math.min(s.minimumPower,s.maximumPower);
  var hi=Math.max(s.minimumPower,s.maximumPower);
  var rand=seededRand((seed+strokeIndex*9973)>>>0);
  if(s.automaticMode==='randomPowerOnly'){
    return {powerPercent:lo+Math.floor(rand()*(hi-lo+1)),gapSec:s.strokeMaxSeconds};
  }
  if(s.automaticMode==='randomTimingOnly'){
    return {powerPercent:hi,gapSec:s.strokeMinSeconds+Math.floor(rand()*(s.strokeMaxSeconds-s.strokeMinSeconds+1))};
  }
  if(s.automaticMode==='randomPowerAndTiming'){
    return {powerPercent:lo+Math.floor(rand()*(hi-lo+1)),gapSec:s.strokeMinSeconds+Math.floor(rand()*(s.strokeMaxSeconds-s.strokeMinSeconds+1))};
  }
  return relayPeriodicStrokeRow(s);
}
function relayWaveStrokeRow(s,strokeIndex,seed,elapsedSec,tWaveSec){
  var phase=(elapsedSec/tWaveSec+seed/4294967296)%1;
  return {
    powerPercent:lerpInt(s.minimumPower,s.maximumPower,triangle01(phase)),
    gapSec:s.strokeMaxSeconds
  };
}
function relayBuildUpStrokeRow(s,strokeIndex,count,seed){
  var rowPhase=count>1?strokeIndex/(count-1):0;
  var t=Math.min(1,rowPhase+seed/4294967296);
  return {
    powerPercent:lerpInt(s.minimumPower,s.maximumPower,t),
    gapSec:lerpInt(s.strokeMaxSeconds,s.strokeMinSeconds,t)
  };
}
function relayPreviewStrokeCount(s,nominalGap){
  if(s.endSessionMode==='strokes'&&s.endSessionValue>0)return s.endSessionValue;
  if(s.endSessionMode==='minutes'&&s.endSessionValue>0&&nominalGap>0){
    return Math.floor((s.endSessionValue*60)/nominalGap)+1;
  }
  return Math.floor(PREVIEW_HORIZON/Math.max(1,nominalGap));
}
function appendRelayStrokePulse(points,tSec,level,powerPercent,state,horizon){
  var ms=strokeMs(powerPercent,state.minimumStrokeMs,state.maximumStrokeMs);
  var strokeSec=Math.max(0.001,ms/1000);
  var strokeEnd=Math.min(tSec+strokeSec,horizon);
  if(powerPercent!==level){
    pushGraphPoint(points,tSec,level);
    pushGraphPoint(points,tSec,powerPercent);
  }else pushGraphPoint(points,tSec,level);
  pushGraphPoint(points,strokeEnd,powerPercent);
  return {tSec:strokeEnd,level:powerPercent};
}
function appendRelayGapInterval(points,tSec,level,gapSec,horizon){
  var gapEnd=Math.min(tSec+Math.max(0,gapSec),horizon);
  if(level!==0){
    pushGraphPoint(points,tSec,level);
    pushGraphPoint(points,tSec,0);
  }else pushGraphPoint(points,tSec,0);
  pushGraphPoint(points,gapEnd,0);
  return {tSec:gapEnd,level:0};
}
function hashRelayScheduleSeed(s){
  return hashSeed([
    s.automaticMode,s.minimumPower,s.maximumPower,s.strokeMinSeconds,s.strokeMaxSeconds,
    s.minimumStrokeMs,s.maximumStrokeMs,s.delayBeforeStartSeconds,s.endSessionMode,s.endSessionValue,
    s.burstsOn,s.burstPlacement,s.burstPercent,s.burstStyle
  ].join('|'));
}
function buildRelayAutoPreview(state){
  var horizon=autoHorizonSecRelay(state);
  var seed=hashRelayScheduleSeed(state);
  var avgGap=(state.strokeMinSeconds+state.strokeMaxSeconds)/2;
  var fixedGap=state.strokeMaxSeconds;
  var count=relayPreviewStrokeCount(state,state.automaticMode==='powerWave'?fixedGap:avgGap);
  var points=[];
  var tSec=0;
  if(state.delayBeforeStartSeconds>0){
    pushGraphPoint(points,0,0);
    tSec=state.delayBeforeStartSeconds;
    pushGraphPoint(points,tSec,0);
  }else pushGraphPoint(points,0,0);
  var strokeIndex=0;
  var level=0;
  var waveElapsed=0;
  var tWaveSec=(state.endSessionMode==='minutes'&&state.endSessionValue>0)
    ?state.endSessionValue*60*2:Math.max(2,count*fixedGap);
  while(tSec<horizon){
    var row;
    if(state.automaticMode==='powerWave'){
      row=relayWaveStrokeRow(state,strokeIndex,seed,waveElapsed,tWaveSec);
      waveElapsed+=row.gapSec;
    }else if(state.automaticMode==='buildUp'){
      row=relayBuildUpStrokeRow(state,strokeIndex,count,seed);
    }else if(state.automaticMode==='periodic'){
      row=relayPeriodicStrokeRow(state);
    }else{
      row=relayRandomStrokeRow(state,strokeIndex,seed);
    }
    var main=appendRelayStrokePulse(points,tSec,level,row.powerPercent,state,horizon);
    tSec=main.tSec;
    level=main.level;
    if(tSec>=horizon)break;
    var gap=appendRelayGapInterval(points,tSec,level,row.gapSec,horizon);
    tSec=gap.tSec;
    level=gap.level;
    strokeIndex++;
    if(state.endSessionMode==='strokes'&&strokeIndex>=state.endSessionValue)break;
    if(state.automaticMode==='powerWave'&&strokeIndex>=count)break;
  }
  var last=points[points.length-1];
  if(!last||last.t!==horizon)pushGraphPoint(points,horizon,level);
  return {points:points,horizon:horizon,label:'Power %'};
}
function autoHorizonSecMotor(s){
  if(s.endSessionMode==='minutes')return Math.max(60,s.endSessionValue*60);
  return PREVIEW_HORIZON;
}
function buildPreviewPoints(){
  var mode=activeOperateMode();
  var horizon=PREVIEW_HORIZON;
  var pts=[];
  if(isMotorProfile()){
    if(mode==='manual'){
      var mm=normalizeMotorManual(readMotorManualSnapshot());
      var sp=motorDutyFromSpeed(mm.speedPercent,mm.minimumDutyPercent,mm.maximumDutyPercent);
      pts.push({t:0,v:sp});pts.push({t:horizon,v:sp});
      return {points:pts,horizon:horizon,label:'Speed %'};
    }
    var ma=normalizeMotorAuto(readMotorAutoSnapshot());
    horizon=autoHorizonSecMotor(ma);
    var rnd=seededRand(hashSeed(JSON.stringify(ma)));
    var t=ma.delayBeforeStartSeconds||0;
    var segMin=ma.segmentMinSeconds,segMax=ma.segmentMaxSeconds;
    var pwr=lerpInt(ma.minimumSpeedPercent,ma.maximumSpeedPercent,0.5);
    pts.push({t:0,v:pwr});
    while(t<horizon){
      var seg=segMin===segMax?segMin:segMin+Math.floor(rnd()*(segMax-segMin+1));
      var next=Math.min(horizon,t+seg);
      var v;
      if(ma.automaticMode==='periodic')v=lerpInt(ma.minimumSpeedPercent,ma.maximumSpeedPercent,triangle01(t/60));
      else if(ma.automaticMode==='powerWave'||ma.automaticMode==='buildUp')v=lerpInt(ma.minimumSpeedPercent,ma.maximumSpeedPercent,triangle01(t/45));
      else v=lerpInt(ma.minimumSpeedPercent,ma.maximumSpeedPercent,rnd());
      pts.push({t:next,v:v});
      t=next;
    }
    return {points:pts,horizon:horizon,label:'Speed %'};
  }
  if(mode==='manual'){
    var mn=normalizeManual(readManualSnapshot());
    pts.push({t:0,v:mn.powerPercent});pts.push({t:horizon,v:mn.powerPercent});
    return {points:pts,horizon:horizon,label:'Power %'};
  }
  var snap=readAutoSnapshot();
  return buildRelayAutoPreview(snap);
}
function drawPatternGraph(){
  var canvas=$('pattern-graph');
  if(!canvas||!canvas.getContext)return;
  var ctx=canvas.getContext('2d');
  var w=canvas.width,h=canvas.height;
  var padL=36,padR=12,padT=10,padB=26;
  var sched=buildLiveGraphSchedule();
  if(!sched)sched=buildPreviewPoints();
  var pts=sched.points;
  var horizon=sched.horizon||PREVIEW_HORIZON;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#0f172a';
  ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#334155';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(padL,padT);
  ctx.lineTo(padL,h-padB);
  ctx.lineTo(w-padR,h-padB);
  ctx.stroke();
  if(!pts.length)return;
  ctx.strokeStyle='#818cf8';
  ctx.lineWidth=2;
  ctx.beginPath();
  for(var i=0;i<pts.length;i++){
    var x=padL+(pts[i].t/horizon)*(w-padL-padR);
    var y=(h-padB)-(pts[i].v/100)*(h-padT-padB);
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.stroke();
  if(sched.nowSec!=null&&sched.nowSec>=0){
    var nx=padL+(sched.nowSec/horizon)*(w-padL-padR);
    if(nx>=padL&&nx<=w-padR){
      ctx.strokeStyle='#fbbf24';
      ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(nx,padT);
      ctx.lineTo(nx,h-padB);
      ctx.stroke();
    }
  }
  ctx.fillStyle='#64748b';
  ctx.font='10px system-ui,sans-serif';
  ctx.fillText('0',padL-8,h-padB+14);
  ctx.fillText(Math.round(horizon)+'s',w-padR-24,h-padB+14);
  ctx.fillText((sched.live?'Live · ':'Preview · ')+(sched.label||''),padL,padT+8);
  var cap=$('graph-caption');
  if(cap){
    cap.textContent=sched.live
      ?('Recording '+liveSegments.length+' segment(s) from device telemetry. Yellow line = now.')
      :('Preview — '+sched.label+' over ~'+Math.round(horizon)+'s (illustrative; seeded from settings).');
  }
}
function scheduleGraphUpdate(){
  if(graphTimer)clearTimeout(graphTimer);
  graphTimer=setTimeout(function(){graphTimer=null;drawPatternGraph();},100);
}
async function poll(){
  try{
    var s=await fetch('/api/local/status').then(function(r){return r.json();});
    if(!ensureDeviceSession(s))return;
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
    var tone='checking',summary=parts.join(' · ')||'Idle';
    if(!token){tone='checking';summary='Locked';}
    else if(s.busy||s.automaticActive){tone='warning';summary=s.automaticActive?'Automatic running':'Busy';}
    else if(s.sceneActive){tone='ready';summary='Scene session on';}
    else if(s.subReady){tone='ready';summary='Ready for commands';}
    else if(s.unlocked){tone='warning';summary='Press device button (D33)';}
    else{tone='error';summary='Unavailable';}
    setStatusPill(tone,summary);
    refreshDevicePanelHeader(s);
    var sel=$('focus-device');
    if(sel&&sel.options.length&&focusDeviceId){
      var kindLabel=capsProfile==='hbridge'?'Motor':'Relay';
      sel.options[0].textContent=kindLabel+' · '+focusDeviceId+' ('+deviceConnectionLabel(s)+')';
    }
    if($('scene-on')){
      updateSceneControlFromStatus(s);
    }
    $('btn-auto-start').disabled=!!(s.busy||s.automaticActive);
    if(s.automaticActive&&!autoLiveActive){
      autoLiveActive=true;
      clearLiveGraph();
      lastPushedAuto=autoPayload();
    }else if(!s.automaticActive&&autoLiveActive){
      autoLiveActive=false;
      lastPushedAuto=null;
    }
    if(s.automaticActive)tryIngestLiveSegment(s);
    var banner=$('auto-session-banner');
    if(banner){
      var showBanner=s.automaticActive&&activeOperateMode()==='auto';
      banner.classList.toggle('hidden',!showBanner);
      if(showBanner&&$('a-bursts')&&$('a-bursts').checked&&!isMotorProfile()){
        banner.textContent='Session running — Stop finishes the current burst; Abort cuts off immediately.';
      }else if(showBanner){
        banner.textContent='Session running — changes apply after the current stroke. Use Stop to end gracefully; Abort stops immediately.';
      }
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
refreshAutoPowerLabels();
function activateTab(tab){
  if(tab==='hist')tab='manual';
  document.querySelectorAll('.tab').forEach(function(t){
    t.classList.toggle('active',t.dataset.tab===tab);
  });
  $('tab-manual').classList.toggle('hidden',tab!=='manual');
  $('tab-auto').classList.toggle('hidden',tab!=='auto');
  try{localStorage.setItem(TAB_KEY,tab);}catch(e){}
  queueDeviceSettingsSave();
  scheduleGraphUpdate();
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
    if(!(j.items&&j.items.length))$('hist-detail').textContent='No sessions recorded yet.';
  }catch(e){
    var msg=e.message||String(e);
    if(msg==='history_unavailable'){
      msg='Session history is not available (filesystem not mounted). Reflash with the latest firmware; new sessions will be recorded after that.';
    }
    $('hist-detail').textContent=msg;
  }
}
$('btn-hist-refresh').onclick=loadHistory;
$('btn-hist-clear').onclick=async function(){try{await api('/api/local/history',{method:'DELETE'});loadHistory();}catch(e){setStatus(e.message);}};
function openHistModal(){var m=$('hist-modal');if(!m)return;m.classList.remove('hidden');m.setAttribute('aria-hidden','false');loadHistory();}
function closeHistModal(){var m=$('hist-modal');if(!m)return;m.classList.add('hidden');m.setAttribute('aria-hidden','true');}
$('btn-hist-open').onclick=openHistModal;
$('btn-hist-close').onclick=closeHistModal;
$('hist-modal').onclick=function(e){if(e.target===$('hist-modal'))closeHistModal();};
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
  if(sceneTogglePending||$('scene-on').disabled)return;
  var want=$('scene-on').checked;
  sceneTogglePending=true;
  syncSceneToggleUi(want);
  try{
    await api('/api/local/scene',{method:'POST',body:JSON.stringify({active:want})});
    setStatus(want?'Scene session on':'Scene session off');
    await poll();
  }catch(e){
    $('scene-on').checked=!want;
    syncSceneToggleUi(!want);
    setStatus(e.message||'Scene update failed');
  }finally{
    sceneTogglePending=false;
  }
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
    clearLiveGraph();
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
async function bootstrapOperateSession(){
  if(!token){endSessionResume();showMain(false);refreshFocusDevice();return;}
  try{
    var s=await fetch('/api/local/status').then(function(r){return r.json();});
    if(!s.unlocked){
      lockUi('PIN session ended (reboot or lock) — unlock again, then press D33');
      refreshFocusDevice();
      return;
    }
    showMain(true);
    await applyDeviceSettingsFromNvs();
    await poll();
  }catch(e){
    lockUi('');
  }
  refreshFocusDevice();
}
bootstrapOperateSession();
})();
</script></body></html>
)raw";

} // namespace

namespace OperatePages {

void handleOperateGet(AsyncWebServerRequest* request) {
    Serial.println(F("[HTTP] GET /operate"));
    AsyncResponseStream* response = request->beginResponseStream("text/html", 200);
    response->print(F("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" "
                      "content=\"width=device-width,initial-scale=1\"><title>SomEsp Control</title>"
                      "<link rel=\"stylesheet\" href=\"/ui/somnet.css\">"));
    response->print(FPSTR(kOperateHtml));
    request->send(response);
}

} // namespace OperatePages
