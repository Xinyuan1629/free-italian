const $ = id => document.getElementById(id);
const stamp = ms => {
  const sec = Math.floor(ms / 1000);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
};
const clipTime = ms => stamp(ms) + '.' + Math.floor(ms % 1000 / 100);
const timeline = document.createElement('div');
timeline.className = 'player-timeline';
timeline.innerHTML = '<label for="seekTime">录音位置</label><input type="range" id="seekTime" min="0" max="0" step="100" disabled><span id="totalTime">—</span>';
$('transport').before(timeline);
const sourceTools = document.createElement('details');
sourceTools.className = 'player-source-tools';
sourceTools.innerHTML = '<summary>音源、语速与快捷键</summary><p>原站播放器支持定位和分段循环。要调整语速，可选择本课同一录音的本地文件。</p><label>选择本地录音 <input type="file" accept="audio/*" id="localTrack"></label> <label>语速 <select id="playRate" disabled><option value=".75">0.75×</option><option selected value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label> <button id="originalTrack" hidden>返回原站录音</button><p>空格播放或暂停，左右键前后跳 5 秒，A / B 标记起点和终点。</p>';
$('transport').after(sourceTools);

let track, data, source, duration = 0, generation = 0, ready = false;
let cleanup, readyTimer, gapTimer, loop, queued;
function message(s){ $('notice').textContent = s }
function save(){ localStorage.setItem('onda-track-' + track, JSON.stringify(data)) }
function draw(){
  $('range').textContent = 'A　' + clipTime(data.a) + '　—　B　' + (data.b == null ? '待标记' : clipTime(data.b));
  $('clips').replaceChildren();
  for(const [a,b] of data.clips){
    const button = document.createElement('button');
    button.textContent = '↻ ' + clipTime(a) + ' – ' + clipTime(b);
    button.disabled = !ready;
    button.onclick = () => {data.a=a; data.b=b; save(); draw(); startLoop(a,b,Number($('reps').value)||Infinity)};
    $('clips').append(button);
  }
}
function stop(){
  clearTimeout(gapTimer); loop=null;
  $('loop').textContent='循环片段';
}
function startLoop(a,b,count){
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a||b>duration+1){
    message('请在录音范围内标好起点与终点。');return;
  }
  stop();loop={a,b,count,phase:'seeking'};
  $('loop').textContent='结束循环';
  message('正在播放 '+clipTime(a)+' – '+clipTime(b));
  source.seek(a);source.play();
}
function finishPass(){
  if(loop?.phase!=='playing')return;
  loop.phase='waiting';source.pause();
  if(--loop.count===0){stop();message('这一段听完了。');return}
  gapTimer=setTimeout(()=>{
    loop.phase='seeking';source.seek(loop.a);source.play();
  },Number($('gap').value)*1000);
}
function progress(ms){
  $('clock').textContent=stamp(ms);$('seekTime').value=ms;
  $('seekTime').setAttribute('aria-valuetext',stamp(ms));
  if(loop?.phase==='seeking' && ms>=loop.a-100 && ms<loop.b)loop.phase='playing';
  if(loop?.phase==='playing' && ms>=loop.b)finishPass();
}
function fail(){
  clearTimeout(readyTimer);stop();ready=false;
  $('transport').disabled=true;$('seekTime').disabled=true;draw();
  message('音源未就绪，可重试原站录音或选择本课的本地音频。');
  $('originalTrack').hidden=false;
}
function loaded(ms){
  if(!Number.isFinite(ms)||ms<=0){fail();return}
  clearTimeout(readyTimer);duration=ms;ready=true;
  $('seekTime').max=ms;$('seekTime').disabled=false;$('totalTime').textContent=stamp(ms);
  $('transport').disabled=false;draw();message('可以开始盲听。');
  if(queued){const [a,b]=queued;queued=null;startLoop(a,b,1)}
}
function resetSource(){
  ++generation;stop();clearTimeout(readyTimer);
  cleanup?.();cleanup=null;source=null;ready=false;duration=0;queued=null;
  $('transport').disabled=true;$('seekTime').disabled=true;$('seekTime').max=0;
  $('totalTime').textContent='—';progress(0);
  readyTimer=setTimeout(fail,15000);
  return generation;
}
function remote(){
  const version=resetSource();
  $('localTrack').value='';$('playRate').disabled=true;$('playRate').value='1';$('originalTrack').hidden=true;
  const frame=$('player').cloneNode(false);frame.hidden=false;
  frame.src='https://w.soundcloud.com/player/?url=https://api.soundcloud.com/tracks/'+track+'&color=%23985b42&show_comments=false&visual=false';
  $('player').replaceWith(frame);draw();message('正在连接原站录音…');
  function attach(){
    if(version!==generation||!window.SC?.Widget)return;
    const widget=SC.Widget(frame), events=SC.Widget.Events;
    source={play:()=>widget.play(),pause:()=>widget.pause(),seek:ms=>widget.seekTo(ms),toggle:()=>widget.toggle(),position:cb=>widget.getPosition(ms=>{if(version===generation)cb(ms)})};
    function on(event,fn){widget.bind(event,(...args)=>{if(version===generation)fn(...args)})}
    on(events.READY,()=>widget.getDuration(ms=>{if(version===generation)loaded(ms)}));
    on(events.ERROR,fail);on(events.PLAY_PROGRESS,e=>progress(e.currentPosition));on(events.FINISH,finishPass);
    cleanup=()=>{Object.values(events).forEach(e=>widget.unbind(e));widget.pause()};
  }
  if(window.SC?.Widget)attach();else {
    $('widgetApi').addEventListener('load',attach,{once:true});
    cleanup=()=>$('widgetApi').removeEventListener('load',attach);
  }
}
function local(file){
  const version=resetSource();const audio=new Audio(),url=URL.createObjectURL(file);
  $('player').hidden=true;$('playRate').disabled=false;$('originalTrack').hidden=false;
  draw();message('正在读取 '+file.name);
  const play=()=>audio.play().catch(()=>{if(version===generation){stop();message('请再次点播放，并检查音频格式。')}});
  source={play,pause:()=>audio.pause(),seek:ms=>{audio.currentTime=ms/1000},toggle:()=>audio.paused?play():audio.pause(),position:cb=>cb(audio.currentTime*1000)};
  audio.onloadedmetadata=()=>{if(version===generation)loaded(audio.duration*1000)};
  audio.ontimeupdate=()=>{if(version===generation)progress(audio.currentTime*1000)};
  audio.onended=finishPass;audio.onerror=fail;
  $('playRate').onchange=()=>{audio.playbackRate=Number($('playRate').value)};
  audio.playbackRate=Number($('playRate').value);audio.src=url;
  cleanup=()=>{audio.onended=null;audio.onerror=null;audio.onloadedmetadata=null;audio.ontimeupdate=null;audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url)};
}
export function openRecording(id){
  track=String(id);data={a:0,b:null,clips:[],draft:''};
  try{Object.assign(data,JSON.parse(localStorage.getItem('onda-track-'+track)))}catch{}
  if(!Array.isArray(data.clips))data.clips=[];
  for(const field of ['draft','gist','cause'])$(field).value=data[field]||'';
  remote();
}
export function playClip(trackId,a,b){
  if(String(trackId)!==track)openRecording(trackId);
  if(ready)startLoop(a,b,1);else queued=[a,b];
}
function jump(amount){
  stop();source.position(ms=>{source.seek(Math.min(duration,Math.max(0,ms+amount)));source.play()});
}
$('toggle').onclick=()=>{if(loop){stop();source.pause();message('已暂停。')}else source.toggle()};
$('back').onclick=()=>jump(-5000);
$('markA').onclick=()=>source.position(ms=>{stop();data.a=ms;if(data.b<=ms)data.b=null;save();draw()});
$('markB').onclick=()=>source.position(ms=>{if(ms-data.a<500){message('请在起点至少半秒之后标记终点。');return}stop();data.b=ms;save();draw()});
$('loop').onclick=()=>{if(loop){stop();source.pause()}else startLoop(data.a,data.b,Number($('reps').value)||Infinity)};
$('storeClip').onclick=()=>{
  if(!Number.isFinite(data.b)||data.b<=data.a||data.b>duration+1){message('请先标好这一段的起点与终点。');return}
  if(!data.clips.some(([a,b])=>a===data.a&&b===data.b))data.clips.push([data.a,data.b]);
  save();draw();message('片段已加入复习库。');document.dispatchEvent(new Event('onda:clips-changed'));
};
for(const field of ['draft','gist','cause'])$(field).addEventListener(field==='cause'?'change':'input',()=>{data[field]=$(field).value;save()});
$('whole').onclick=()=>{stop();$('materials').open=false;source.seek(0);source.play();document.dispatchEvent(new Event('onda:blind-replay'));message('从头再听一遍。')};
$('seekTime').oninput=()=>{stop();source.seek(Number($('seekTime').value))};
$('localTrack').onchange=()=>{const file=$('localTrack').files[0];if(file)local(file)};
$('originalTrack').onclick=remote;
document.addEventListener('keydown',e=>{
  if(!ready||e.repeat||e.defaultPrevented||e.altKey||e.metaKey||e.ctrlKey||e.target.closest('input,textarea,select,button,a,summary,[contenteditable]'))return;
  const action={' ':()=> $('toggle').click(),arrowleft:()=>jump(-5000),arrowright:()=>jump(5000),a:()=>$('markA').click(),b:()=>$('markB').click()}[e.key.toLowerCase()];
  if(action){e.preventDefault();action()}
});
