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
.page{max-width:36rem;margin:0 auto;padding:1rem 1rem 2.5rem}
h1{font-size:1.2rem;color:#f1f5f9;margin:0 0 .5rem}
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
.status{font-size:.85rem;color:#a5b4fc;min-height:1.2rem}
.hidden{display:none}
a{color:#818cf8}
</style></head><body><div class="page">
<h1>SomEsp Operate</h1>
<p class="note"><a href="/">Status</a> &middot; LAN only &middot; default PIN 1234</p>
<div id="gate" class="panel">
<label>PIN<input id="pin" type="password" maxlength="16" value="1234"></label>
<label>New PIN (optional)<input id="pin-new" type="password" maxlength="16" placeholder="change on unlock"></label>
<button class="btn-primary" id="btn-unlock">Unlock</button>
<button class="btn-secondary hidden" id="btn-arm">Arm session</button>
<button class="btn-secondary hidden" id="btn-lock">Lock</button>
</div>
<div id="main" class="hidden">
<div class="tabs"><button type="button" class="tab active" data-tab="manual">Manual</button><button type="button" class="tab" data-tab="auto">Automatic</button></div>
<div id="tab-manual" class="panel">
<div class="row"><label>Min stroke ms<input id="m-min" type="number" min="1" max="30000" value="25"></label>
<label>Max stroke ms<input id="m-max" type="number" min="1" max="30000" value="400"></label></div>
<label>Power %<input id="m-power" type="range" min="0" max="100" value="50"></label>
<p class="note">Stroke ~ <span id="m-stroke-ms">212</span> ms</p>
<button class="btn-primary" id="btn-stroke">Stroke</button>
<button class="btn-danger" id="btn-abort">Abort</button>
<hr style="border-color:#334155">
<div class="row"><label>Burst count<input id="b-count" type="number" min="1" max="100" value="5"></label>
<label>Delay sec<input id="b-delay" type="number" min="0" max="300" value="5"></label></div>
<button class="btn-primary" id="btn-burst">Burst</button>
</div>
<div id="tab-auto" class="panel hidden">
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
<label><input id="a-bursts" type="checkbox"> Bursts on</label>
<button class="btn-primary" id="btn-auto-start">Start automatic</button>
<button class="btn-secondary" id="btn-auto-stop">Stop</button>
<button class="btn-secondary" id="btn-auto-update">Apply update</button>
</div>
<p class="status" id="status-line">Idle</p>
</div>
<script>
(function(){
var TOKEN_KEY='somesp-bearer';
var token=sessionStorage.getItem(TOKEN_KEY)||'';
var pollTimer=null;
var updateTimer=null;
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
function autoPayload(){
  var o={
    automaticMode:$('a-mode').value,
    minimumStrokeMs:+$('a-minms').value,maximumStrokeMs:+$('a-maxms').value,
    minimumPower:+$('a-minp').value,maximumPower:+$('a-maxp').value,
    strokeMinSeconds:+$('a-gmin').value,strokeMaxSeconds:+$('a-gmax').value,
    delayBeforeStartSeconds:+$('a-delay').value,
    endSessionMode:$('a-endmode').value,endSessionValue:+$('a-endval').value,
    burstsOn:$('a-bursts').checked,
    burstPercent:10,burstStyle:'fixedPowerDelay',
    burstStrokePowerMin:0,burstStrokePowerMax:100,
    burstDelayMin:1,burstDelayMax:5,burstStrokesMin:5,burstStrokesMax:10
  };
  return JSON.stringify(o);
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
function refreshManualMs(){$('m-stroke-ms').textContent=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);}
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
    if(s.busy||s.automaticActive){if(!pollTimer)pollTimer=setInterval(poll,800);}
    else if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
  }catch(e){setStatus(e.message);}
}
$('m-power').oninput=refreshManualMs;refreshManualMs();
$('a-mode').onchange=applyRules;applyRules();
document.querySelectorAll('.tab').forEach(function(b){
  b.onclick=function(){
    document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
    b.classList.add('active');
    $('tab-manual').classList.toggle('hidden',b.dataset.tab!=='manual');
    $('tab-auto').classList.toggle('hidden',b.dataset.tab!=='auto');
  };
});
$('btn-unlock').onclick=async function(){
  try{
    var body={pin:$('pin').value};if($('pin-new').value)body.newPin=$('pin-new').value;
    var u=await api('/api/local/unlock',{method:'POST',body:JSON.stringify(body)});
    token=u.token;sessionStorage.setItem(TOKEN_KEY,token);showMain(true);setStatus('Unlocked');
    await poll();
  }catch(e){setStatus('Unlock: '+e.message);}
};
$('btn-arm').onclick=async function(){try{await api('/api/local/arm',{method:'POST'});setStatus('Armed');await poll();}catch(e){setStatus(e.message);}};
$('btn-lock').onclick=async function(){try{await api('/api/local/lock',{method:'POST'});token='';sessionStorage.removeItem(TOKEN_KEY);showMain(false);setStatus('Locked');}catch(e){setStatus(e.message);}};
$('btn-stroke').onclick=async function(){
  var ms=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);
  var p=JSON.stringify({strokeMs:ms,powerPercent:+$('m-power').value});
  try{await cmd('stroke',p);setStatus('Stroke sent');poll();}catch(e){setStatus(e.message);}
};
$('btn-burst').onclick=async function(){
  var ms=strokeMs($('m-power').value,$('m-min').value,$('m-max').value);
  var p=JSON.stringify({strokeMs:ms,powerPercent:+$('m-power').value,burstStrokes:+$('b-count').value,burstDelayMs:+$('b-delay').value*1000});
  try{await cmd('burst',p);setStatus('Burst sent');poll();}catch(e){setStatus(e.message);}
};
$('btn-abort').onclick=async function(){try{await cmd('abort','{}');setStatus('Abort');poll();}catch(e){setStatus(e.message);}};
$('btn-auto-start').onclick=async function(){try{await cmd('automatic-start',autoPayload());setStatus('Automatic started');poll();}catch(e){setStatus(e.message);}};
$('btn-auto-stop').onclick=async function(){try{await cmd('automatic-stop','{}');setStatus('Stop requested');poll();}catch(e){setStatus(e.message);}};
$('btn-auto-update').onclick=function(){
  if(updateTimer)clearTimeout(updateTimer);
  updateTimer=setTimeout(async function(){
    try{await cmd('automatic-update',autoPayload());setStatus('Update queued');poll();}catch(e){setStatus(e.message);}
  },400);
};
if(token){showMain(true);poll();}
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
