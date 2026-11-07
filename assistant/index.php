<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>助理</title>
  <style>
    :root {
      --ink:#152018; --muted:#6b786f; --moss:#1f6b45; --leaf:#c8e6d0;
      --panel:#fff; --line:#d5ddd6; --paper:#f3f6f2;
    }
    * { box-sizing: border-box; }
    body {
      margin:0; font-family:"Segoe UI","PingFang SC",sans-serif; color:var(--ink);
      background: radial-gradient(900px 420px at 10% -10%, rgba(31,107,69,.14), transparent 60%),
                  linear-gradient(180deg,#eef3ec,var(--paper));
      min-height:100vh;
    }
    main { max-width:720px; margin:0 auto; padding:28px 16px 48px; }
    h1 { font-size:40px; margin:0 0 6px; }
    .sub { color:var(--muted); margin-bottom:18px; line-height:1.5; }
    .card {
      background:var(--panel); border:1px solid var(--line); border-radius:16px;
      padding:16px; margin-bottom:14px;
    }
    textarea, button {
      font:inherit; width:100%; border-radius:12px; border:1px solid var(--line);
      padding:10px 12px; background:#fbfcfb;
    }
    textarea { min-height:78px; resize:vertical; }
    button {
      background:var(--moss); color:#fff; border:none; font-weight:700; cursor:pointer;
      margin-top:10px; width:auto;
    }
    button:disabled { opacity:.55; }
    button.danger { background:#f6eaea; color:#9b2c2c; margin:0; padding:6px 10px; font-size:12px; }
    button.tiny { margin:0; padding:6px 10px; font-size:12px; }
    .item { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
    .tag { display:inline-block; background:var(--leaf); color:#145233; border-radius:999px; padding:2px 8px; font-size:11px; font-weight:700; }
    .detail { color:#145233; font-weight:600; margin-top:4px; font-size:14px; }
    .calc {
      margin-top:8px; padding:10px 12px; border-radius:12px; background:#f4f8f5;
      color:#145233; font-size:13px; line-height:1.55; font-weight:600;
    }
    .per { margin-top:6px; font-size:22px; font-weight:800; color:var(--moss); }
    .err { background:#fde8e8; color:#9b2c2c; padding:10px 12px; border-radius:12px; margin-bottom:12px; }
    .ok { color:var(--moss); font-weight:700; font-size:13px; }
    .summary { margin-top:10px; color:#3d4a40; font-size:14px; line-height:1.55; white-space:pre-wrap; }
    .hint { margin:6px 0 0; color:var(--muted); font-size:13px; line-height:1.5; }
    .model { font-size:12px; color:var(--muted); margin-top:6px; }
    .think-box {
      margin-top:12px; border:1px dashed #c5d0c8; border-radius:12px; padding:10px 12px;
      background:#f7faf7; display:none;
    }
    .think-box.show { display:block; }
    .think-title {
      font-size:12px; font-weight:700; color:var(--muted); margin-bottom:6px;
      display:flex; justify-content:space-between; align-items:center;
    }
    .think-body {
      font-size:12px; line-height:1.55; color:#5a685f; white-space:pre-wrap;
      max-height:180px; overflow:auto;
    }
    .think-body.streaming::after,
    .summary.streaming::after {
      content:'▋'; animation: blink 1s step-end infinite; color:var(--moss);
    }
    @keyframes blink { 50% { opacity: 0; } }

    .timeline {
      margin-top: 12px; padding-left: 2px; max-height: 360px; overflow:auto;
      border-top: 1px solid var(--line); padding-top: 12px;
    }
    .tl-item {
      display:grid; grid-template-columns: 54px 14px 1fr; gap: 8px;
      min-height: 44px;
    }
    .tl-time { font-size:12px; font-weight:700; color:var(--muted); padding-top:2px; }
    .tl-rail { position:relative; }
    .tl-rail::before {
      content:''; position:absolute; left:5px; top:0; bottom:0; width:2px; background:#d5ddd6;
    }
    .tl-item:last-child .tl-rail::before { bottom: 60%; }
    .tl-dot {
      width:12px; height:12px; border-radius:50%; background:#c8e6d0; border:2px solid #1f6b45;
      position:relative; z-index:1; margin-top:3px;
    }
    .tl-item.past .tl-dot { background:#b9c4bc; border-color:#8a968e; }
    .tl-item.past .tl-time, .tl-item.past .tl-main { color:#8a968e; }
    .tl-item.current .tl-dot { background:#1f6b45; box-shadow:0 0 0 4px rgba(31,107,69,.18); }
    .tl-item.current .tl-time { color:#1f6b45; }
    .tl-main { font-size:13px; line-height:1.35; padding-bottom:12px; }
    .tl-main strong { font-size:13px; }
    .tl-amt { color:#145233; font-weight:700; }
    .tl-badge {
      display:inline-block; font-size:10px; font-weight:700; padding:1px 6px; border-radius:999px;
      background:#e7f5eb; color:#145233; margin-left:6px;
    }
    .tl-item.past .tl-badge { background:#eef1ef; color:#8a968e; }

    .chat-log {
      margin-top: 12px; display:flex; flex-direction:column; gap:8px;
      max-height: 280px; overflow:auto; padding-right:2px;
    }
    .bubble {
      max-width: 92%; padding:10px 12px; border-radius:14px; font-size:14px; line-height:1.5;
      white-space:pre-wrap; word-break:break-word;
    }
    .bubble.user { align-self:flex-end; background:#1f6b45; color:#fff; border-bottom-right-radius:4px; }
    .bubble.assistant { align-self:flex-start; background:#f4f8f5; color:#152018; border:1px solid var(--line); border-bottom-left-radius:4px; }
    .chat-tools { margin-top:8px; }
    .chat-tools button { background:#eef2ef; color:#314038; font-size:12px; padding:6px 10px; }
  </style>
</head>
<body>
<main>
  <h1>助理</h1>
  <p class="sub">你说话，助理改数据库：建任务、改时间、改目标、记进度、排序、删除——人尽量少点按钮。</p>
  <div id="msg" class="ok">加载中…</div>
  <div id="err" class="err" style="display:none"></div>

  <section class="card">
    <strong>跟助理说</strong>
    <p class="hint">
      例1：9点到23点，每20分钟喝水，全天3L<br/>
      例2：现在12点了，已经喝了500ml<br/>
      例3：把喝水间隔改成30分钟 / 目标改成2.5L / 按紧急程度排个序
    </p>
    <textarea id="aiPrompt" placeholder="用自然语言说目标和进度…"></textarea>
    <button id="aiBtn" type="button">发送给助理</button>
    <div class="model">模型：deepseek-flash · 思考模式开启 · 流式输出</div>

    <div id="chatLog" class="chat-log"></div>
    <div class="chat-tools"><button id="clearChatBtn" type="button">清空对话</button></div>
    <div id="thinkBox" class="think-box">
      <div class="think-title"><span>思考过程</span><span id="thinkStatus">进行中</span></div>
      <div id="thinkBody" class="think-body"></div>
    </div>
    <div id="aiSummary" class="summary"></div>
  </section>

  <section>
    <strong>进行中的目标</strong>
    <div id="list" style="margin-top:10px"></div>
  </section>
</main>
<script>
const errEl = document.getElementById('err');
const msgEl = document.getElementById('msg');
const listEl = document.getElementById('list');
const aiSummary = document.getElementById('aiSummary');
const thinkBox = document.getElementById('thinkBox');
const thinkBody = document.getElementById('thinkBody');
const thinkStatus = document.getElementById('thinkStatus');

function showErr(t){ errEl.style.display='block'; errEl.textContent=t; }
function clearErr(){ errEl.style.display='none'; errEl.textContent=''; }

function detail(t){
  if(t.cycle_type==='interval'){
    const parts=[];
    if(t.interval_minutes) parts.push('每 '+t.interval_minutes+' 分钟');
    if(t.window_start && t.window_end) parts.push(t.window_start+'–'+t.window_end);
    if(t.goal_amount) parts.push('目标 '+t.goal_amount+(t.goal_unit||''));
    if(t.progress_amount!=null) parts.push('已完成 '+t.progress_amount+(t.goal_unit||''));
    return parts.join(' · ');
  }
  return t.cycle_type;
}

async function api(action, body){
  const opt = body ? {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)} : {};
  const res = await fetch('api.php?action='+action, opt);
  const data = await res.json();
  if(!res.ok) throw new Error(data.error||('请求失败 '+res.status));
  return data;
}

function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


function renderChat(messages){
  const box = document.getElementById('chatLog');
  if(!box) return;
  const list = Array.isArray(messages) ? messages : [];
  if(!list.length){
    box.innerHTML = '<div class="hint">还没有对话。先说一句，我会记住上下文。</div>';
    return;
  }
  box.innerHTML = list.map(m => {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    return `<div class="bubble ${role}">${escapeHtml(m.content||'')}</div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

async function loadChat(){
  const data = await api('chat_history');
  renderChat(data.messages||[]);
}

// 用户在对话里说的「现在12点」会写成逻辑时钟；刷新列表时优先用它，避免真实凌晨把上午任务又刷回来
let logicalNow = localStorage.getItem('assistant_logical_now') || '';

function rememberRefTime(ref){
  if(!ref || !/^\d{1,2}:\d{2}$/.test(ref)) return;
  logicalNow = ref;
  try { localStorage.setItem('assistant_logical_now', ref); } catch(e){}
}

function listNowParam(){
  // 有测试逻辑时钟就用它；否则用设备当前时间
  if(logicalNow) return 'prefer_logical=1&now=' + encodeURIComponent(logicalNow);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  return 'now=' + encodeURIComponent(hh + ':' + mm);
}

async function refresh(){
  clearErr();
  const res = await fetch('api.php?action=list&' + listNowParam());
  const data = await res.json();
  if(!res.ok) throw new Error(data.error||('请求失败 '+res.status));
  if(data.ref_time) rememberRefTime(data.ref_time);
  const clockNote = data.ref_time && data.ref_time !== data.server_time
    ? ` · 参考 ${data.ref_time}（测试）`
    : ` · ${data.server_time||''}`;
  msgEl.textContent = '已连接 · deepseek-flash · 思考开 · '+data.todos.length+' 条' + clockNote;
  const goals = data.todos.filter(t => t.status==='open');
  if(!goals.length){
    listEl.innerHTML = '<div class="card" style="color:#6b786f">还没有目标。先丢一句给上面的助理。</div>';
    return;
  }
  listEl.innerHTML = goals.map(t => {
    const calc = t.calc || {};
    const per = calc.per_interval_display;
    const timeline = Array.isArray(t.timeline) ? t.timeline : [];
    const tlHtml = timeline.length ? `
      <div class="timeline">
        ${timeline.map(s => {
          const badge = s.state==='current' ? '<span class="tl-badge">当前</span>' : (s.state==='past' ? '<span class="tl-badge">已过</span>' : '<span class="tl-badge">待做</span>');
          return `<div class="tl-item ${s.state}">
            <div class="tl-time">${escapeHtml(s.time)}</div>
            <div class="tl-rail"><div class="tl-dot"></div></div>
            <div class="tl-main">
              <strong>${escapeHtml(s.title||t.title)}</strong>${badge}<br/>
              <span class="tl-amt">${escapeHtml(s.amount_text || per || '')}</span>
            </div>
          </div>`;
        }).join('')}
      </div>` : '<div class="hint" style="margin-top:8px">暂无时间轴（需要间隔+时间窗）</div>';
    return `
    <div class="card">
      <div class="item">
        <div style="flex:1">
          <div><strong>${escapeHtml(t.title)}</strong> <span class="tag">${escapeHtml(t.cycle_type)}</span></div>
          <div class="detail">${escapeHtml(detail(t))}</div>
          ${per ? `<div class="per">每次约 ${escapeHtml(per)}</div>` : ''}
          <div class="calc">${escapeHtml(calc.status_text || '')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-direction:column">
          <button class="tiny" type="button" onclick="markDone(${t.id})">完成</button>
          <button class="danger" type="button" onclick="removeTodo(${t.id})">删除</button>
        </div>
      </div>
      ${tlHtml}
    </div>`;
  }).join('');
}

async function streamAssistant(prompt){
  const res = await fetch('api.php?action=ai_stream', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({prompt})
  });
  if(!res.ok){
    let msg = '请求失败 '+res.status;
    try { const j = await res.json(); if(j.error) msg=j.error; } catch(e){}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let answer = '';
  let thinking = '';
  let finalResult = null;

  thinkBox.classList.add('show');
  thinkBody.textContent = '';
  thinkBody.classList.add('streaming');
  thinkStatus.textContent = '思考中…';
  aiSummary.textContent = '';
  aiSummary.classList.remove('streaming');

  while(true){
    const {value, done} = await reader.read();
    if(done) break;
    buf += decoder.decode(value, {stream:true});
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for(const block of parts){
      const lines = block.split('\n');
      for(const line of lines){
        if(!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if(data === '[DONE]') continue;
        let ev;
        try { ev = JSON.parse(data); } catch(e){ continue; }
        if(ev.type === 'thinking'){
          thinking += (ev.text || '');
          thinkBody.textContent = thinking;
          thinkBody.scrollTop = thinkBody.scrollHeight;
        } else if(ev.type === 'token'){
          if(thinkBody.classList.contains('streaming')){
            thinkBody.classList.remove('streaming');
            thinkStatus.textContent = '思考完成';
          }
          answer += (ev.text || '');
          aiSummary.classList.add('streaming');
          aiSummary.textContent = answer;
        } else if(ev.type === 'done'){
          finalResult = ev.result;
          if(finalResult && finalResult.summary){
            aiSummary.textContent = finalResult.summary;
          }
        } else if(ev.type === 'error'){
          throw new Error(ev.error || '流式失败');
        }
      }
    }
  }
  thinkBody.classList.remove('streaming');
  aiSummary.classList.remove('streaming');
  if(!thinking){
    thinkStatus.textContent = '无思考内容';
  } else if(thinkStatus.textContent === '思考中…'){
    thinkStatus.textContent = '思考完成';
  }
  return finalResult;
}

document.getElementById('clearChatBtn').onclick = async () => {
  try{
    await api('chat_clear', {});
    logicalNow = '';
    try { localStorage.removeItem('assistant_logical_now'); } catch(e){}
    renderChat([]);
    aiSummary.textContent = '';
    thinkBox.classList.remove('show');
    await refresh();
  }catch(e){ showErr(e.message); }
};

document.getElementById('aiBtn').onclick = async () => {
  const btn = document.getElementById('aiBtn');
  const prompt = document.getElementById('aiPrompt').value.trim();
  if(!prompt) return;
  btn.disabled = true;
  btn.textContent = '生成中…';
  try{
    clearErr();
    const result = await streamAssistant(prompt);
    document.getElementById('aiPrompt').value = '';
    if(result && result.ref_time) rememberRefTime(result.ref_time);
    else if(result && result.todos && result.todos[0] && result.todos[0].ref_time){
      rememberRefTime(result.todos[0].ref_time);
    }
    if(result && result.messages) renderChat(result.messages);
    else await loadChat();
    // 若本轮结果已带更新后的 todo，先直接渲染，避免刷新用错时钟
    if(result && Array.isArray(result.todos) && result.todos.length){
      const openTodos = result.todos.filter(t => (t.status||'open')==='open');
      if(openTodos.length){
        // fall through to refresh which uses remembered logical now
      }
    }
    await refresh();
  }catch(e){
    showErr(e.message);
    thinkBody.classList.remove('streaming');
    aiSummary.classList.remove('streaming');
  }finally{
    btn.disabled = false;
    btn.textContent = '发送给助理';
  }
};

async function markDone(id){
  try{ await api('done',{id}); await refresh(); }catch(e){ showErr(e.message); }
}
async function removeTodo(id){
  try{ await api('delete',{id}); await refresh(); }catch(e){ showErr(e.message); }
}

Promise.all([refresh(), loadChat()]).catch(e => { msgEl.textContent=''; showErr(e.message); });
</script>
</body>
</html>
