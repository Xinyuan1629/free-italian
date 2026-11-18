// Each key refers to one source recording, not a lesson array position.
const questions = {
  '159398104': ['安娜通常和谁一起吃周六的午饭？', ['父母', '朋友', '同事'], 0, '她在午饭前去看父母，通常会留下和他们一起吃。'],
  '143487160': ['Giovanni 从米兰中央车站怎样去办公室？', ['坐公交车', '步行', '乘火车'], 1, '坐火车抵达米兰后，他步行前往办公室。'],
  '158235265': ['Maria 星期二上午安排了什么？', ['去看医生', '去买食材', '参加数学考试'], 2, '她星期二上午十一点参加数学考试。']
};
const listeners = new WeakMap();
const causes = ['尚未判断','音素混淆','词汇切分','词汇提取','句法处理','语义整合','注意或记忆'];
function words(s) {
  return (s.normalize('NFC').replace(/[’‘]/g,"'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu)||[]).slice(0,400);
}
// Minimum edit distance. Each output operation preserves the learner's words.
export function compareWords(reference, answer) {
  const a=words(reference), b=words(answer);
  const equal=(i,j)=>a[i].toLocaleLowerCase('it')===b[j].toLocaleLowerCase('it');
  const d=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=0;i<=a.length;i++)d[i][0]=i;
  for(let j=0;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+Number(!equal(i-1,j-1)));
  }
  let i=a.length,j=b.length;
  const result=[];
  while(i||j){
    if(i&&j&&d[i][j]===d[i-1][j-1]+Number(!equal(i-1,j-1))){
      const same=equal(i-1,j-1);
      result.push({type:same?'match':'replace',expected:a[--i],actual:b[--j]});
    }else if(i&&d[i][j]===d[i-1][j]+1) result.push({type:'missing',expected:a[--i]});
    else result.push({type:'extra',actual:b[--j]});
  }
  return result.reverse();
}
function materialLines(lesson) {
  const all=lesson.lines.map(([s])=>s);
  const title=all.findIndex(s=>/^(Transcript|Testo)(?:\b|$)/i.test(s));
  let items=title>=0?all.slice(title+1):all;
  const end=items.findIndex(s=>/^Soluzioni\b/i.test(s));
  if(end>=0)items=items.slice(0,end);
  return items.filter(s=>words(s).length>=2&&!s.includes('___'));
}
export function mountTraining({lesson,trackId,onReplay}){
  const root=document.getElementById('trainingRoot');
  const key='onda-training-v1-'+trackId;
  function read(){try{return JSON.parse(localStorage.getItem(key))||{}}catch{return {}}}
  let state=read();
  function save(patch){state={...read(),...patch};localStorage.setItem(key,JSON.stringify(state))}
  const q=questions[trackId], refs=materialLines(lesson);
  root.innerHTML='<section class="tr-first"><h3>首听理解</h3><p class="tr-prompt"></p><div class="tr-answer"></div><label>对这次理解有多大把握？ <select class="tr-confidence"><option value="">选择信心</option><option value="25">25% · 不太确定</option><option value="50">50% · 一半把握</option><option value="75">75% · 比较确定</option><option value="100">100% · 非常确定</option></select></label><button class="tr-submit">保存首听回答</button><output class="tr-result" aria-live="polite"></output></section><details class="tr-check"><summary>听写核对</summary><div class="tr-body"><p>先记下听到的词，再选择与刚才片段对应的原站句子。</p><label class="tr-entry">我的听写<textarea maxlength="1800"></textarea></label><label>对照句 <select class="tr-reference"></select></label><button class="tr-reveal">查看这句原文</button><blockquote class="tr-source" hidden></blockquote><button class="tr-compare">逐词核对</button><output class="tr-diff" aria-live="polite"></output><label>我遇到的困难 <select class="tr-tag"></select></label></div></details><details class="tr-reflect"><summary>重听与反思</summary><div class="tr-body"><label>再听一次，哪处听得更清楚了？<textarea class="tr-note" maxlength="1800"></textarea></label><button class="tr-replay">收起文本，从头重听</button></div></details>';
  const get=s=>root.querySelector(s);
  const prompt=get('.tr-prompt'), answerBox=get('.tr-answer');
  prompt.textContent=q?q[0]:'先完整听一遍，再写下你听懂的人物、事件或意图。';
  const answer=document.createElement(q?'select':'textarea');
  answer.setAttribute('aria-label','首听回答');
  if(q){answer.add(new Option('选择你听到的信息',''));q[1].forEach((s,i)=>answer.add(new Option(s,i)))}
  else answer.maxLength=1800;
  answerBox.append(answer);
  const confidence=get('.tr-confidence'),result=get('.tr-result');
  function lockFirst(first){
    answer.value=first.answer;confidence.value=first.confidence;
    answer.disabled=confidence.disabled=true;get('.tr-submit').hidden=true;
    result.textContent=q?((first.correct?'听对了。':'再听一遍这处细节。')+q[3]):'已保留首听大意。核对原文后，可在反思中写下修正。';
  }
  answer.value=state.firstDraft||'';answer.oninput=()=>save({firstDraft:answer.value});
  if(state.first)lockFirst(state.first);
  get('.tr-submit').onclick=()=>{
    if(!answer.value.trim()||!confidence.value){result.textContent='请先填写回答，并选择这次的信心。';return}
    const first=read().first||{answer:answer.value.trim(),confidence:Number(confidence.value),correct:q?Number(answer.value)===q[2]:null,createdAt:new Date().toISOString(),assisted:Boolean(read().revealed||document.getElementById('materials')?.open)};
    save({first});lockFirst(first);
    root.dispatchEvent(new CustomEvent('onda-training-saved',{bubbles:true,detail:{trackId,first}}));
  };
  const full=document.getElementById('materials');
  listeners.get(root)?.abort();
  const lifetime=new AbortController();
  listeners.set(root,lifetime);
  if(full)full.addEventListener('toggle',()=>{if(full.open)save({revealed:true})},{signal:lifetime.signal});
  const reference=get('.tr-reference'),source=get('.tr-source'),diff=get('.tr-diff');
  refs.forEach((s,i)=>reference.add(new Option('材料句 '+(i+1),i)));
  reference.value=String(Math.min(state.reference||0,Math.max(0,refs.length-1)));
  const draft=get('.tr-entry textarea');
  draft.lang='it';source.lang='it';
  draft.value=state.dictation??document.getElementById('draft')?.value??'';
  draft.oninput=()=>{save({dictation:draft.value});diff.replaceChildren()};
  reference.onchange=()=>{save({reference:Number(reference.value)});source.hidden=true;diff.replaceChildren()};
  function reveal(){save({revealed:true});source.textContent=refs[reference.value]||'本课暂无可对照的原句。';source.hidden=false}
  get('.tr-reveal').onclick=reveal;
  get('.tr-compare').onclick=()=>{
    if(!draft.value.trim()){diff.textContent='先写下听到的内容，再核对。';return}
    reveal();diff.replaceChildren();
    if(!refs.length)return;
    const parts=compareWords(refs[reference.value],draft.value);
    const revisions=parts.filter(part=>part.type!=='match').length;
    const summary=document.createElement('p');
    summary.textContent=revisions?'有 '+revisions+' 处可以再听。看看漏掉的词，或对照箭头右侧的原词。':'这句的词都听出来了。合上原文，再听一次。';
    diff.append(summary);
    for(const part of parts){
      const span=document.createElement('span');span.className='tr-word tr-'+part.type;
      span.textContent=part.type==='missing'?'漏：'+part.expected:part.type==='replace'?part.actual+' → '+part.expected:part.type==='extra'?'多：'+part.actual:part.expected;
      diff.append(span,' ');
    }
  };
  const tag=get('.tr-tag');causes.forEach(s=>tag.add(new Option(s,s)));tag.value=state.tag||causes[0];tag.onchange=()=>save({tag:tag.value});
  const note=get('.tr-note');note.value=state.note||'';note.oninput=()=>save({note:note.value});
  get('.tr-replay').onclick=()=>{root.querySelectorAll('details').forEach(d=>d.open=false);if(full)full.open=false;onReplay?.()};
}
