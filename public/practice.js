// Local calendar days keep tomorrow's review stable across daylight-saving changes.
function day(date = new Date()) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}
function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function normalize(text) {
  return text.normalize('NFC').toLocaleLowerCase('it').replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function clock(ms) {
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
function node(tag, text) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}
function action(label, handler) {
  const button = node('button', label);
  button.type = 'button';
  button.onclick = handler;
  return button;
}
function field(label, control) {
  const wrapper = node('label', label);
  wrapper.append(control);
  return wrapper;
}
function allocation(minutes, hasDue) {
  const review = hasDue && minutes >= 2 ? Math.min(10, Math.ceil(minutes / 6)) : 0;
  const whole = Math.floor((minutes - review) / 3);
  return [['精听与听写', minutes - review - whole], ['整段无字幕重听', whole], ['到期片段复习', review]].filter(([,time]) => time);
}

export function mountPractice({lessons, openClip}) {
  if (!document.getElementById('practiceStyles')) {
    const stylesheet = document.createElement('link');
    Object.assign(stylesheet,{id:'practiceStyles',rel:'stylesheet',href:new URL('./practice.css',import.meta.url).href});
    document.head.append(stylesheet);
  }
  const root = document.getElementById('practiceRoot');
  root.innerHTML = '<section class="practice-plan"><h3>每日计划</h3><div class="practice-settings"></div><div class="practice-tasks"></div></section><section class="practice-review"><h3>音频复习</h3><div class="practice-queue"></div></section>';
  const settings = root.querySelector('.practice-settings');
  const tasks = root.querySelector('.practice-tasks');
  const queue = root.querySelector('.practice-queue');
  const minutes = node('input');
  Object.assign(minutes, {type:'number', min:'1', max:'240', step:'1', value:read('onda-budget', 15)});
  const level = node('select');
  for (const v of ['A1','A2','B1','B2']) level.add(new Option(v,v));
  level.value = read('onda-study-level','A1');
  const goal = node('select');
  for (const v of ['日常对话','旅行','学术','考试']) goal.add(new Option(v,v));
  goal.value = read('onda-study-goal','日常对话');
  const theme = node('input');
  theme.placeholder = '如旅行、饮食';
  theme.maxLength = 80;
  theme.value = read('onda-study-topic','');
  const preferences = node('details');
  preferences.append(node('summary','学习设置'));
  const form = node('form');
  form.append(field('每天可用分钟',minutes),field('意大利语等级',level),field('学习目标',goal),field('偏好主题',theme));
  const submit = node('button','保存设置');
  submit.type = 'submit';
  form.append(submit);
  form.onsubmit = e => {
    e.preventDefault();
    if (!minutes.reportValidity() || !minutes.value) return;
    for (const [key,val] of [['budget',Number(minutes.value)],['study-level',level.value],['study-goal',goal.value],['study-topic',theme.value.trim()]]) localStorage.setItem('onda-'+key,JSON.stringify(val));
    preferences.open = false;
    refresh();
  };
  preferences.append(form);
  settings.append(preferences);
  let active = '', stage = '', lastDay;
  function refresh() {
    const today = day();
    const clips = [];
    for (const lesson of lessons) {
      for (const track of lesson.tracks || [lesson.track]) {
        const cached = read('onda-track-'+track,{});
        for (const pair of cached.clips || []) {
          if (!Array.isArray(pair)) continue;
          const [a,b]=pair;
          if (!Number.isFinite(a) || !Number.isFinite(b) || a<0 || a>=b) continue;
          const key = 'onda-audio-review-'+track+'-'+a+'-'+b;
          clips.push({track,a,b,key,lesson,record:read(key,{events:[],due:0})});
        }
      }
    }
    const due = clips.filter(c=>c.record.due<=today).sort((x,y)=>x.record.due-y.record.due);
    const budget = read('onda-budget',15);
    const doneKey = 'onda-plan-done-'+today;
    const done = read(doneKey,{});
    tasks.replaceChildren(node('p',budget+' 分钟 · '+(due.length?'今天有 '+due.length+' 段可复习，已预留提取练习时间。':'今天没有到期片段，时间分给精听和整段重听。')));
    for (const [name,time] of allocation(budget,!!due.length)) {
      const check=node('input');
      check.type='checkbox';check.checked=!!done[name];
      check.onchange=()=>localStorage.setItem(doneKey,JSON.stringify({...read(doneKey,{}),[name]:check.checked}));
      const label=node('label');
      label.append(check,document.createTextNode(name+' · '+time+' 分钟'));
      tasks.append(label);
    }
    const current = due.find(c=>c.key===active) || due[0];
    if (!current) {
      active='';stage='';
      const next=clips.length ? Math.min(...clips.map(c=>c.record.due))-today : 0;
      queue.replaceChildren(node('p',clips.length?'今天的复习已完成。下一次在 '+next+' 天后。':'在播放器标记起点和终点，收藏的片段会出现在这里。'));
      return;
    }
    if (active===current.key && stage && lastDay===today) return;
    const {key,track,a,b,record,lesson}=current;
    active=key;lastDay=today;stage='listen';
    queue.replaceChildren(node('p',lesson.name+' · '+clock(a)+' – '+clock(b)+' · '+due.length+' 段待复习'));
    const message=node('output');message.setAttribute('aria-live','polite');
    const play=action('播放复习片段',async()=>{
      try {
        const ok=await openClip(track,a,b);
        if(ok===false) throw Error();
        message.textContent='听一遍，再试着写下听到的原话。';
      } catch { message.textContent='录音尚未就绪，请检查播放器后重试。'; }
    });
    const input=node('textarea');
    input.placeholder='写下听到的意大利语，也可以记录听清的部分';
    const response=field('我的首次识别',input);
    queue.append(play,response,message);
    function reveal(answer) {
      stage='reveal';input.value=answer;input.readOnly=true;
      const reference=node('textarea');
      reference.value=record.reference||'';
      reference.readOnly=!!record.reference;
      const correct=record.reference ? normalize(answer)===normalize(record.reference) : null;
      queue.append(node('p',correct===null?'这个手动片段尚未绑定原句。可对照课文，保存一份参考文本供下次核对。':correct?'与上次保存的参考原句一致。':'对照参考原句，再留意词界和弱读。'),field('片段参考文本',reference));
      const effort=node('select');
      for(const v of ['还需要多听','基本听清','听得很清楚']) effort.add(new Option(v,v));
      queue.append(field('听感自评',effort),action('保存并继续',()=>{
        const latest=read(key,{events:[],due:0});
        if(latest.due<=today) {
          const previous=latest.events.at(-1);
          const streak=correct===true?(latest.streak||0)+1:0;
          const delay=[1,3,7,14,30][Math.min(streak,4)];
          latest.events.push({at:Date.now(),day:today,answer,reference:record.reference||null,matchesReference:correct,selfReport:effort.value,elapsedDays:previous?today-previous.day:null});
          Object.assign(latest,{streak,due:today+delay,reference:reference.value.trim(),pending:null});
          localStorage.setItem(key,JSON.stringify(latest));
        }
        stage='';refresh();
      }));
    }
    if (record.pending) {reveal(record.pending.answer);return}
    const verify=action('提交后核对',()=>{
      if(!input.value.trim()){message.textContent='写下听清的部分，或填写「没听清」。';input.focus();return}
      const latest=read(key,{events:[],due:0});
      if(latest.due>today){stage='';refresh();return}
      latest.pending ||= {answer:input.value.trim(),at:Date.now()};
      localStorage.setItem(key,JSON.stringify(latest));
      verify.remove();reveal(latest.pending.answer);
    });
    queue.append(verify);
  }
  refresh();
  return refresh;
}
