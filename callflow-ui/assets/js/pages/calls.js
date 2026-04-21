async function pageCalls() {
  document.getElementById('page').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Apeluri</div>
        <div class="page-sub" id="callsSub">Se încarcă...</div>
      </div>
      <button class="btn btn-ghost" onclick="loadCallsList()">↻ Refresh</button>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div><div class="panel-title">Toate apelurile</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="callsSearch" placeholder="Caută fișier..." oninput="filterCalls()" style="background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--ink);font-size:13px;font-family:var(--font-sans);width:200px"/>
        </div>
      </div>
      <div id="callsList"><div class="loading-row">Se încarcă...</div></div>
    </div>`;

  window._callsPageRefresh = loadCallsList;
  await loadCallsList();

  // Realtime subscription
  SubscriptionManager.subscribe('calls-list', 'calls', () => loadCallsList());
}

let _allCalls = [];

async function loadCallsList() {
  try {
    _allCalls = await DB.listCalls();
    renderCallsList(_allCalls);
  } catch(e) {
    document.getElementById('callsList').innerHTML = `<div class="loading-row" style="color:var(--magenta)">Backend offline — pornește: uvicorn api:app --reload</div>`;
  }
}

function filterCalls() {
  const q = document.getElementById('callsSearch')?.value.toLowerCase() || '';
  renderCallsList(q ? _allCalls.filter(c => c.filename.toLowerCase().includes(q)) : _allCalls);
}

function renderCallsList(calls) {
  document.getElementById('callsSub').textContent = `${calls.length} apeluri · actualizare live`;

  const container = document.getElementById('callsList');

  if (!calls.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📞</div>
        <div class="empty-text">Niciun apel găsit.<br>Apasă "+ Încarcă apel" pentru a începe.</div>
      </div>`;
    return;
  }

  if (!container.firstChild || container.children.length !== calls.length) {
    container.innerHTML = '';
  }

  calls.forEach((c, i) => {
    let row = container.querySelector(`[data-call-id="${c.id}"]`);

    if (!row) {
      row = document.createElement('div');
      row.className = 'call-row';
      row.dataset.callId = c.id;
      row.addEventListener('click', () => Router.navigate(`/calls/${c.id}`));
      row.innerHTML = `
        <div class="call-avatar" style="background:${AVATARS[i%AVATARS.length]}">${c.filename.slice(0,2).toUpperCase()}</div>
        <div>
          <div class="call-name"></div>
          <div class="call-meta"></div>
        </div>
        <div class="call-duration"></div>
        <div class="call-score"></div>
        <div class="tag"></div>`;
      container.appendChild(row);
    }

    const sc = c.qa_score;
    const date = new Date(c.created_at).toLocaleString('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const tagCls = c.status === 'done' ? (sc != null && sc < CONFIG.SCORE_WARNING ? 'tag-flag' : 'tag-ok') : c.status === 'error' ? 'tag-error' : 'tag-processing';

    row.querySelector('.call-name').textContent = c.filename;
    row.querySelector('.call-meta').textContent = `ID-${c.id.slice(0,8).toUpperCase()} · ${date} · ${formatBytes(c.file_size)}`;
    row.querySelector('.call-duration').textContent = msToMmss(c.duration_ms);

    const scoreDiv = row.querySelector('.call-score');
    scoreDiv.textContent = c.status === 'done' ? (sc != null ? sc+'/100' : '—') : '';
    scoreDiv.style.color = c.status === 'done' ? scoreColor(sc) : '';

    const tagDiv = row.querySelector('.tag');
    tagDiv.className = 'tag ' + tagCls;
    tagDiv.textContent = c.status.toUpperCase();
  });
}
