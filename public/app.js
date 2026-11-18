import {openRecording, playClip} from './listening.js';
import {mountTraining} from './training.js';
import {mountPractice} from './practice.js';

const el = id => document.getElementById(id);
const lessons = await fetch('lessons.json').then(response => response.json());
const sourceBase = 'https://onlineitalianclub.com/free-italian-exercises-and-resources/';
const tracksOf = lesson => (lesson.tracks || [lesson.track]).map(String);
let lessonIndex, lineIndex, revision = 0, activeTrack;
let refreshPractice;

function showPane(name) {
  for (const button of document.querySelectorAll('[data-pane]')) {
    const selected = button.dataset.pane === name;
    button.setAttribute('aria-pressed', String(selected));
    el(button.dataset.pane).hidden = !selected;
  }
  if (name === 'practice') { refreshPractice?.(); renderResults(); }
}
document.querySelectorAll('[data-pane]').forEach(button => {
  button.onclick = () => showPane(button.dataset.pane);
});

function resetTutor() {
  revision++;
  el('reply').textContent = '';
  el('question').value = '';
  el('ask').disabled = true;
  lineIndex = null;
  el('quote').textContent = '展开课文，选择想问的句子。';
}

function renderLines(lesson) {
  const fragment = document.createDocumentFragment();
  lesson.lines.forEach(([sentence, meaning], i) => {
    if (/^(Transcript|Esercizio|Soluzioni|Testo)(?:$|\s+[-–(]|\s+\d)/i.test(sentence)) {
      const heading = document.createElement('h4');
      heading.textContent = sentence;
      fragment.append(heading);
      return;
    }
    const row = document.createElement('div');
    row.className = 'row';
    const body = document.createElement('div');
    const text = document.createElement('p');
    text.textContent = sentence;
    body.append(text);
    if (meaning) {
      const translation = document.createElement('small');
      translation.lang = 'zh-CN';
      translation.textContent = meaning;
      body.append(translation);
    }
    const ask = document.createElement('button');
    ask.textContent = '问这句';
    ask.onclick = () => {
      resetTutor();
      lineIndex = i;
      el('quote').textContent = sentence;
      el('ask').disabled = false;
      el('lines').querySelector('.active')?.classList.remove('active');
      row.classList.add('active');
      el('question').focus();
    };
    row.append(body, ask);
    fragment.append(row);
  });
  el('lines').replaceChildren(fragment);
}

function selectRecording(id) {
  activeTrack = String(id);
  el('track').value = activeTrack;
  resetTutor();
  el('materials').open = false;
  el('notebook').open = false;
  localStorage.setItem('onda-last-course', activeTrack);
  history.replaceState(null, '', '?audio=' + encodeURIComponent(activeTrack));
  openRecording(activeTrack);
  refreshPractice?.();
  mountTraining({lesson: lessons[lessonIndex], trackId: activeTrack, onReplay: () => el('whole').click()});
}

function openLesson(index, track) {
  lessonIndex = index;
  const lesson = lessons[index];
  el('title').textContent = lesson.name;
  el('meta').textContent = lesson.level + '  /  ONLINE ITALIAN CLUB';
  el('subtitle').textContent = lesson.zh;
  el('source').href = lesson.url || sourceBase + lesson.path;
  const ids = tracksOf(lesson);
  el('track').replaceChildren(...ids.map((id, i) => new Option('录音 ' + (i + 1), id)));
  el('tracklabel').hidden = ids.length === 1;
  el('figures').replaceChildren(...(lesson.images || []).map(url => {
    const image = new Image();
    image.src = url.replace('http:', 'https:');
    image.alt = '原站练习题图';
    return image;
  }));
  el('solutions').replaceChildren(...(lesson.links || []).map(([label, url]) => {
    const link = document.createElement('a');
    Object.assign(link, {href:url, textContent:label, target:'_blank', rel:'noopener'});
    return link;
  }));
  renderLines(lesson);
  selectRecording(ids.includes(track) ? track : ids[0]);
}

function renderPicker() {
  const query = el('courseSearch').value.trim().toLocaleLowerCase();
  const matches = [];
  lessons.forEach((lesson, i) => {
    if (!(lesson.name + ' ' + lesson.level + ' ' + lesson.zh).toLocaleLowerCase().includes(query)) return;
    const button = document.createElement('button');
    button.textContent = lesson.level + '　' + lesson.name;
    button.setAttribute('aria-current', String(i === lessonIndex));
    button.onclick = () => {
      el('picker').close();
      openLesson(i);
      showPane('train');
    };
    matches.push(button);
  });
  el('courseList').replaceChildren(...matches);
  if (!matches.length) el('courseList').textContent = '没有找到课程，试试级别或意大利语关键词。';
}
el('choose').onclick = () => {
  el('courseSearch').value = '';
  renderPicker();
  el('picker').showModal();
  el('courseSearch').focus();
};
el('courseSearch').oninput = renderPicker;
el('dismiss').onclick = () => el('picker').close();
el('track').onchange = () => selectRecording(el('track').value);
el('materials').addEventListener('toggle', () => {
  if (!el('materials').open) resetTutor();
});
el('tutorForm').onsubmit = async event => {
  event.preventDefault();
  const question = el('question').value.trim();
  if (!question || lineIndex === null) return;
  const version = revision;
  el('ask').disabled = true;
  el('reply').textContent = '正在读这句话…';
  try {
    const response = await fetch('/ask', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lesson:lessonIndex, line:lineIndex, question})});
    const answer = await response.text();
    if (version === revision) el('reply').textContent = response.ok || response.status === 503 ? answer : '暂时无法提问，请重试。';
  } catch {
    if (version === revision) el('reply').textContent = '连接中断，请重试。';
  } finally {
    if (version === revision) el('ask').disabled = false;
  }
};

const requested = new URLSearchParams(location.search).get('audio') || localStorage.getItem('onda-last-course');
openLesson(Math.max(0, lessons.findIndex(l => tracksOf(l).includes(requested))), requested);

const practice = mountPractice({lessons, openClip: (trackId, a, b) => {
  const id = String(trackId);
  const index = lessons.findIndex(l => tracksOf(l).includes(id));
  if (index < 0) return false;
  if (activeTrack !== id) openLesson(index, id);
  return playClip(id, a, b);
}});
refreshPractice = typeof practice === 'function' ? practice : practice?.refresh;

function renderResults() {
  const counts = {correct:0, graded:0, aided:0, summaries:0};
  for (const id of new Set(lessons.flatMap(tracksOf))) {
    const attempt = JSON.parse(localStorage.getItem('onda-training-v1-' + id) || '{}').first;
    if (!attempt) continue;
    if (typeof attempt.correct !== 'boolean') counts.summaries++;
    else if (attempt.assisted) counts.aided++;
    else {counts.graded++; counts.correct += Number(attempt.correct)}
  }
  el('scores').textContent = '未揭示课文的首次提交：' +
    (counts.graded ? '答对 ' + counts.correct + ' / ' + counts.graded + ' 题' : '尚无已判分题目') +
    '。另有 ' + counts.aided + ' 道看过文本的题目，' + counts.summaries + ' 条大意记录。';
}
document.addEventListener('onda:clips-changed', () => refreshPractice?.());
document.addEventListener('onda:blind-replay', () => {
  for (const details of el('trainingRoot').querySelectorAll('details')) details.open = false;
  el('notebook').open = false;
  showPane('train');
});
