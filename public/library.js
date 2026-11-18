const lessons = await (await fetch('lessons.json')).json();
const el = id => document.getElementById(id);
const sourceBase = 'https://onlineitalianclub.com/free-italian-exercises-and-resources/';
const deck=await (await fetch('review.json')).json();
const state=JSON.parse(localStorage.getItem('onda-review-v1')||'{}');
function day(){const d=new Date();return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000}
function review(){
 const box=el('cards'),today=day();
 const completed=deck.filter(([s])=>state[s]?.last===today).length;
 const due=deck.filter(([s])=>(state[s]?.due||0)<=today).sort(([a],[b])=>(state[a]?.attempt||0)-(state[b]?.attempt||0));
 box.innerHTML='<p>今日已记起 '+completed+' 个短语　<progress max="6" value="'+completed+'"></progress></p>';
 if(!due.length){box.append('今天的复习完成了。明天回来，让这些表达再熟悉一点。');return}
 const [s,zh,word]=due[0];const card=document.createElement('div');
 card.innerHTML='<strong></strong><p></p><input id="guess" aria-label="补全原句" placeholder="试着补全短语"><button id="check">核对</button><button id="hint">给我一点提示</button><output aria-live="polite"></output>';
 box.append(card);card.querySelector('strong').textContent=s.replace(word,'______');card.querySelector('p').textContent=zh;
 const msg=card.querySelector('output');
 el('hint').onclick=()=>{msg.textContent='从 '+word[0]+' 开始。再点一次可以看完整短语。';el('hint').onclick=()=>{msg.textContent=word+'　读一遍整句，稍后再试。';el('hint').textContent='稍后再练';el('hint').onclick=()=>{state[s]={...state[s],attempt:Date.now()};save();review()}}};
 const check=()=>{if(el('guess').value.trim().toLocaleLowerCase('it')!==word.toLocaleLowerCase('it')){msg.textContent='再看看前后搭配，也可以点提示。';return}
 const stage=(state[s]?.stage||0)+1;
 state[s]={stage,last:today,due:today+[1,3,7,14,30][Math.min(stage-1,4)]};save();
 msg.textContent='记起来了！读一遍完整的句子，再继续。';card.querySelector('strong').textContent=s;el('guess').disabled=true;el('hint').hidden=true;el('check').textContent='继续';el('check').onclick=review};
 el('check').onclick=check;el('guess').onkeydown=e=>{if(e.key==='Enter')check()};
}
function save(){localStorage.setItem('onda-review-v1',JSON.stringify(state))}
review();
const catalog=await (await fetch('catalog.json')).json();
for(const v of ['全部','A1','A2','B1','B2','C1','C2','any level'])el('level').add(new Option(v,v));
function filterCatalog(){
 const query=el('search').value.trim().toLowerCase();
 const matches=catalog.filter(([name,level])=>(el('level').value==='全部'||level===el('level').value)&&name.toLowerCase().includes(query));
 const list=el('catalog');list.replaceChildren();
 if(!matches.length)list.textContent='暂时没有匹配的练习，试试其他关键词。';
 for(const [name,level,url] of matches){
 const link=document.createElement('a');const idx=lessons.findIndex(l=>(l.url||sourceBase+l.path)===url.replace(/%20| /g,''));link.href=idx>=0?'workspace.html?audio='+lessons[idx].track:url;if(idx<0)link.target='_blank';link.rel='noopener';link.textContent=level+'　'+name+' ↗';list.append(link)}
}
el('level').value='A1';el('search').oninput=filterCatalog;el('level').onchange=filterCatalog;filterCatalog();
