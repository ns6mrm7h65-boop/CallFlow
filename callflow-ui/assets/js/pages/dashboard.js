async function pageDashboard() {
  document.getElementById('page').innerHTML = `
    <section style="margin-bottom:40px">
      <div class="eyebrow">Live · ${new Date().toLocaleDateString('ro-RO',{day:'numeric',month:'long',year:'numeric'})}</div>
      <h1>Dashboard</h1>
      <p style="color:var(--ink-dim);font-size:17px;margin-top:16px;max-width:420px;line-height:1.5">
        Monitorizare și analiză apeluri în timp real, cu QA automatizat.
      </p>
    </section>

    <section class="kpis" id="kpisGrid">
      ${[1,2,3,4].map(i=>`<div class="kpi c${i}"><div class="kpi-head"><div class="kpi-label">—</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg></div></div><div class="kpi-value" style="font-size:28px;color:var(--ink-faint)">···</div></div>`).join('')}
    </section>

    <section class="main-grid">
      <div class="panel">
        <div class="panel-head">
          <div><div class="panel-title">Apeluri recente</div><div class="panel-sub" id="recentSub">Se încarcă...</div></div>
          <a href="#/calls" class="btn btn-ghost" style="font-size:13px;padding:6px 12px">Vezi toate →</a>
        </div>
        <div id="recentCalls"><div class="loading-row">Se încarcă...</div></div>
      </div>
      <div class="stack">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Activitate recentă</div><div class="panel-sub">Ultimele evenimente</div></div></div>
          <div class="activity" id="activityFeed"><div class="loading-row">Se încarcă...</div></div>
        </div>
      </div>
    </section>`;

  // Load KPIs + recent in parallel
  try {
    const [kpis, recent] = await Promise.all([DB.getKPIs(), DB.getRecentActivity()]);
    renderKPIs(kpis);
    renderRecentCalls(recent);
    renderActivity(recent);
  } catch(e) {
    document.getElementById('kpisGrid').innerHTML = `<div class="loading-row" style="color:var(--magenta);grid-column:1/-1">Backend offline</div>`;
  }

  // Realtime: refresh KPIs on new call
  SubscriptionManager.subscribe('dashboard-kpis', 'calls', () => {
    DB.getKPIs().then(renderKPIs).catch(()=>{});
    DB.getRecentActivity().then(r => { renderRecentCalls(r); renderActivity(r); }).catch(()=>{});
  });
}

function renderKPIs(kpis) {
  document.getElementById('kpisGrid').innerHTML = `
    <div class="kpi c1">
      <div class="kpi-head">
        <div class="kpi-label">Apeluri totale</div>
        <div class="kpi-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.74-.03-1.02.24l-2.2 2.2a15.07 15.07 0 01-6.59-6.58l2.2-2.21a.96.96 0 00.25-1A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg></div>
      </div>
      <div class="kpi-value">${kpis.total}</div>
      <div class="kpi-foot"><span class="kpi-delta kpi-delta-up">${kpis.done} procesate</span></div>
    </div>
    <div class="kpi c2">
      <div class="kpi-head">
        <div class="kpi-label">Scor mediu QA</div>
        <div class="kpi-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm-2 16l-4-4 1.41-1.41L10 15.17l6.59-6.59L18 10l-8 8z"/></svg></div>
      </div>
      <div class="kpi-value" style="color:${scoreColor(kpis.avgScore)}">${kpis.avgScore ?? '—'}<span style="font-size:20px;color:var(--ink-dim)">${kpis.avgScore != null ? '/100':''}</span></div>
      <div class="kpi-foot"><span class="kpi-note">medie apeluri analizate</span></div>
    </div>
    <div class="kpi c3">
      <div class="kpi-head">
        <div class="kpi-label">Scor sub 50</div>
        <div class="kpi-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></div>
      </div>
      <div class="kpi-value">${kpis.flagged}</div>
      <div class="kpi-foot"><span class="kpi-delta kpi-delta-down">necesită coaching</span></div>
    </div>
    <div class="kpi c4">
      <div class="kpi-head">
        <div class="kpi-label">Durată medie</div>
        <div class="kpi-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg></div>
      </div>
      <div class="kpi-value" style="font-size:36px">${msToMmss(kpis.avgDurMs)}</div>
      <div class="kpi-foot"><span class="kpi-note">per apel procesat</span></div>
    </div>`;
}

function renderRecentCalls(calls) {
  document.getElementById('recentSub').textContent = `Ultimele ${calls.length} apeluri`;
  document.getElementById('recentCalls').innerHTML = calls.length
    ? calls.map((c, i) => `
        <div class="call-row" onclick="Router.navigate('/calls/${c.id}')">
          <div class="call-avatar" style="background:${AVATARS[i%AVATARS.length]}">${c.filename.slice(0,2).toUpperCase()}</div>
          <div>
            <div class="call-name">${c.filename}</div>
            <div class="call-meta">${timeAgo(c.created_at)} · ${msToMmss(c.duration_ms)}</div>
          </div>
          <div class="call-duration">${msToMmss(c.duration_ms)}</div>
          <div class="tag tag-${c.status==='done'?'ok':c.status==='error'?'error':'processing'}">${c.status.toUpperCase()}</div>
        </div>`).join('')
    : '<div class="empty-state"><div class="empty-icon">📞</div><div class="empty-text">Niciun apel încă.</div></div>';
}

function renderActivity(calls) {
  const colors = { done: 'var(--lime)', error: 'var(--magenta)', transcribing: 'var(--cyan)', uploading: 'var(--violet)' };
  document.getElementById('activityFeed').innerHTML = calls.length
    ? calls.map(c => `
        <div class="act-item">
          <div class="act-dot" style="background:${colors[c.status]||'var(--ink-faint)'};color:${colors[c.status]||'var(--ink-faint)'}"></div>
          <div>
            <div class="act-text"><b>${c.filename}</b> — ${c.status}</div>
            <div class="act-time">${timeAgo(c.created_at)}</div>
          </div>
        </div>`).join('')
    : '<div style="font-size:13px;color:var(--ink-faint)">Nicio activitate recentă.</div>';
}
