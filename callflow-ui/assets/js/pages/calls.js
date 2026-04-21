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

  if (!calls.length) {
    document.getElementById('callsList').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📞</div>
        <div class="empty-text">Niciun apel găsit.<br>Apasă "+ Încarcă apel" pentru a începe.</div>
      </div>`;
    return;
  }

  document.getElementById('callsList').innerHTML = calls.map((c, i) => {
    const sc = c.qa_score;
    const scoreHtml = c.status === 'done'
      ? `<div class="call-score" style="color:${scoreColor(sc)}">${sc != null ? sc+'/100' : '—'}</div>`
      : `<div></div>`;
    const tagCls = c.status === 'done' ? (sc != null && sc < 50 ? 'tag-flag' : 'tag-ok') : c.status === 'error' ? 'tag-error' : 'tag-processing';
    const date = new Date(c.created_at).toLocaleString('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

    return `<div class="call-row" onclick="Router.navigate('/calls/${c.id}')">
      <div class="call-avatar" style="background:${AVATARS[i%AVATARS.length]}">${c.filename.slice(0,2).toUpperCase()}</div>
      <div>
        <div class="call-name">${c.filename}</div>
        <div class="call-meta">ID-${c.id.slice(0,8).toUpperCase()} · ${date} · ${formatBytes(c.file_size)}</div>
      </div>
      <div class="call-duration">${msToMmss(c.duration_ms)}</div>
      ${scoreHtml}
      <div class="tag ${tagCls}">${c.status.toUpperCase()}</div>
    </div>`;
  }).join('');
}
