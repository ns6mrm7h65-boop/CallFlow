let _detailCallId = null;

async function pageCallDetail({ id }) {
  _detailCallId = id;

  document.getElementById('page').innerHTML = `
    <div class="page-header" style="margin-bottom:24px">
      <div>
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-dim);margin-bottom:12px">
          <a href="#/calls" style="color:var(--ink-dim);text-decoration:none">Apeluri</a>
          <span>/</span>
          <span style="color:var(--ink)" id="breadcrumbId">···</span>
        </div>
        <h3 id="detailTitle" style="font-size:24px">Se încarcă...</h3>
        <div id="detailSubtitle" style="font-size:13px;color:var(--ink-dim);margin-top:6px;font-family:var(--font-mono)"></div>
        <div id="detailTags" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"></div>
      </div>
      <div style="display:flex;gap:12px;align-items:center">
        <button class="btn btn-violet" id="qaBtn" onclick="runQA()" disabled>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
          Analiză QA
        </button>
      </div>
    </div>

    <div class="meta-strip" id="detailMeta" style="margin-bottom:24px"></div>

    <div id="audioPlayerWrap" style="display:none;margin-bottom:20px">
      <div class="panel" style="padding:16px 20px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);letter-spacing:.08em">REDARE APEL</div>
          <audio id="callAudio" controls style="flex:1;height:36px;accent-color:var(--cyan)" preload="none"></audio>
        </div>
      </div>
    </div>

    <div class="timeline-label">Distribuție vorbitori</div>
    <div class="timeline" id="detailTimeline"></div>

    <div class="detail-grid">
      <div class="panel">
        <div class="panel-head">
          <div><div class="panel-title">Transcript clasificat</div><div class="panel-sub" id="segCount"></div></div>
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--ink-faint)">AGENT · CLIENT</span>
        </div>
        <div class="scroll-area">
          <div class="transcript" id="detailTranscript"><div class="loading-row">Se încarcă...</div></div>
        </div>
      </div>

      <div class="stack">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Harta PII</div><div class="panel-sub">Date anonimizate</div></div></div>
          <div id="detailPII"><div class="loading-row">···</div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Vorbitori detectați</div><div class="panel-sub">Clasificare AI</div></div></div>
          <div id="detailSpeakers"></div>
        </div>
      </div>
    </div>

    <div id="qaSection" style="margin-top:24px;display:none"></div>`;

  try {
    const data = await API.getCallDetail(id);
    renderDetail(data);
  } catch(e) {
    document.getElementById('detailTitle').textContent = 'Eroare la încărcare';
  }
}

function renderDetail({ call, segments, pii_mappings, qa }) {
  // Audio player
  if (call.audio_url) {
    const wrap = document.getElementById('audioPlayerWrap');
    const audio = document.getElementById('callAudio');
    audio.src = call.audio_url;
    wrap.style.display = 'block';

    console.log('[AUDIO] src set to:', call.audio_url);

    audio.addEventListener('loadstart',      () => console.log('[AUDIO] loadstart'));
    audio.addEventListener('loadedmetadata', () => console.log('[AUDIO] loadedmetadata · duration=', audio.duration));
    audio.addEventListener('loadeddata',     () => console.log('[AUDIO] loadeddata'));
    audio.addEventListener('canplay',        () => console.log('[AUDIO] canplay'));
    audio.addEventListener('canplaythrough', () => console.log('[AUDIO] canplaythrough'));
    audio.addEventListener('play',           () => console.log('[AUDIO] play event'));
    audio.addEventListener('playing',        () => console.log('[AUDIO] playing'));
    audio.addEventListener('pause',          () => console.log('[AUDIO] pause'));
    audio.addEventListener('waiting',        () => console.log('[AUDIO] waiting (buffering)'));
    audio.addEventListener('stalled',        () => console.warn('[AUDIO] stalled'));
    audio.addEventListener('suspend',        () => console.log('[AUDIO] suspend'));
    audio.addEventListener('abort',          () => console.warn('[AUDIO] abort'));
    audio.addEventListener('emptied',        () => console.warn('[AUDIO] emptied'));
    audio.addEventListener('error', () => {
      const err = audio.error;
      console.error('[AUDIO] error', { code: err?.code, message: err?.message, networkState: audio.networkState, readyState: audio.readyState, src: audio.src });
    });

    audio.addEventListener('timeupdate', () => {
      const ms = audio.currentTime * 1000;
      let active = null;
      document.querySelectorAll('.turn[data-start]').forEach(el => {
        const s = +el.dataset.start, e = +el.dataset.end;
        if (ms >= s && ms < e) active = el;
        el.classList.remove('turn-active');
      });
      if (active) {
        active.classList.add('turn-active');
        active.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      }
    });
  }

  document.getElementById('breadcrumbId').textContent = call.id.slice(0,8).toUpperCase();
  document.getElementById('detailTitle').textContent = call.filename;
  document.getElementById('detailSubtitle').textContent = `ID-${call.id.slice(0,8).toUpperCase()} · ${new Date(call.created_at).toLocaleString('ro-RO')} · ${call.language?.toUpperCase() || 'RO'}`;

  // Tags
  const tagMap = { done:'tag-ok', error:'tag-error', transcribing:'tag-processing', anonymizing:'tag-processing', classifying:'tag-processing', analyzing:'tag-processing', uploading:'tag-processing' };
  document.getElementById('detailTags').innerHTML = `
    <span class="tag ${tagMap[call.status]||'tag-cyan'}">${call.status.toUpperCase()}</span>
    <span class="tag tag-cyan">RO</span>
    ${pii_mappings.length ? '<span class="tag tag-violet">ANONIMIZAT</span>' : ''}`;

  // Meta
  document.getElementById('detailMeta').innerHTML = [
    { label:'Durată',    value: msToMmss(call.duration_ms) },
    { label:'Segmente',  value: call.segment_count ?? segments.length },
    { label:'Vorbitori', value: call.speaker_count ?? '—' },
    { label:'PII',       value: pii_mappings.length },
    { label:'Dim. fișier',value: formatBytes(call.file_size) },
    { label:'Model STT', value: 'stt-async-v4' },
  ].map(m => `<div class="meta-item"><div class="meta-label">${m.label}</div><div class="meta-value mono">${m.value}</div></div>`).join('');

  // Timeline
  const tl = document.getElementById('detailTimeline');
  tl.innerHTML = '';
  let prev = 0;
  if (call.duration_ms) {
    segments.forEach(s => {
      if (!s.start_ms || !s.end_ms) return;
      const ml = (s.start_ms / call.duration_ms * 100);
      const w  = ((s.end_ms - s.start_ms) / call.duration_ms * 100);
      const seg = document.createElement('div');
      seg.className = 'tl-seg ' + s.role.toLowerCase();
      seg.style.cssText = `width:${Math.max(w,.2)}%;margin-left:${ml - prev}%`;
      prev = ml + w;
      tl.appendChild(seg);
    });
  }

  // Transcript
  document.getElementById('segCount').textContent = `${segments.length} segmente · roluri clasificate de AI`;
  const tc = document.getElementById('detailTranscript');
  tc.innerHTML = '';
  segments.forEach(s => {
    const role = s.role.toLowerCase();
    const div = document.createElement('div');
    div.className = `turn ${role}`;
    if (s.start_ms != null) div.dataset.start = s.start_ms;
    if (s.end_ms != null)   div.dataset.end   = s.end_ms;

    const timeClick = s.start_ms != null
      ? `onclick="(function(){const a=document.getElementById('callAudio');if(a&&a.src){a.currentTime=${s.start_ms/1000};a.play().catch(function(){});}})()" style="cursor:pointer;color:var(--cyan)" title="Sari la acest moment"`
      : '';

    div.innerHTML = `
      <div class="turn-avatar">${role==='agent'?'AG':'CL'}</div>
      <div class="turn-body">
        <div class="turn-meta">
          <span class="turn-role">${s.role}</span>
          <span ${timeClick}>${msToMmss(s.start_ms)}–${msToMmss(s.end_ms)}</span>
          ${s.confidence ? `<span>${Math.round(s.confidence*100)}%</span>` : ''}
        </div>
        <div class="turn-bubble">${s.text}</div>
        <div class="turn-stats">
          ${s.duration_ms ? `<span class="stat-chip">${(s.duration_ms/1000).toFixed(1)}s</span>` : ''}
          ${s.wpm ? `<span class="stat-chip ${s.wpm>CONFIG.WPM_HIGH?'wpm-high':''}">${Math.round(s.wpm)} cuv/min</span>` : ''}
        </div>
      </div>`;
    tc.appendChild(div);
  });

  // PII
  document.getElementById('detailPII').innerHTML = pii_mappings.length
    ? pii_mappings.map(p=>`<div class="pii-row"><span class="pii-original">${p.original}</span><span class="pii-arrow">→</span><span class="pii-placeholder">${p.placeholder}</span></div>`).join('')
    : '<div style="font-size:12px;color:var(--ink-faint)">Niciun PII detectat</div>';

  // Speakers
  const speakers = {};
  segments.forEach(s => { if (!speakers[s.speaker]) speakers[s.speaker] = {role:s.role,count:0}; speakers[s.speaker].count++; });
  document.getElementById('detailSpeakers').innerHTML = Object.entries(speakers).map(([sp, info]) => {
    const role = info.role.toLowerCase();
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--glass-strong);border:1px solid var(--border);margin-bottom:8px">
      <div style="width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:${role==='agent'?'linear-gradient(135deg,var(--cyan),var(--violet))':'rgba(255,255,255,.06)'};color:${role==='agent'?'#000':'var(--ink-dim)'}">${role==='agent'?'AG':'CL'}</div>
      <div style="flex:1"><div style="font-size:12px;font-weight:600">Speaker ${sp}</div><div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);margin-top:2px">${info.count} segmente</div></div>
      <span class="tag ${role==='agent'?'tag-cyan':'tag-processing'}" style="${role!=='agent'?'color:var(--ink-dim);background:rgba(255,255,255,.05);border-color:var(--border)':''}">${info.role}</span>
    </div>`;
  }).join('');

  // QA button
  const qaBtn = document.getElementById('qaBtn');
  qaBtn.disabled = call.status !== 'done';
  if (qa) { renderQASection(qa); qaBtn.style.display = 'none'; }
}

async function runQA() {
  const btn = document.getElementById('qaBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-ring"></span> Se analizează...';
  try {
    const data = await API.getCallDetail(_detailCallId);
    if (data.qa) {
      renderQASection(data.qa);
      btn.style.display = 'none';
    } else {
      btn.disabled = false;
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> Analiză QA';
    }
  } catch(e) {
    btn.disabled = false;
    btn.innerHTML = 'Eroare — încearcă din nou';
  }
}

function renderQASection(qa) {
  const sec = document.getElementById('qaSection');
  sec.style.display = 'block';
  const sc = qa.scor_final;
  const circumference = 289;
  const sentColor = qa.sentiment_client==='Negativ'?'var(--magenta)':qa.sentiment_client==='Neutru'?'var(--ink-dim)':'var(--lime)';
  const catDefs = [
    {key:'scor_structura',    label:'Structură',     max:40, color:'#00e5ff'},
    {key:'scor_calitate',     label:'Calitate',      max:40, color:'#8b5cf6'},
    {key:'scor_profesionalism',label:'Profesionalism',max:20,color:'#b4ff39'},
    {key:'scor_ritm',         label:'Ritm & Livrare', max:15, color:'#ff9500'},
    {key:'scor_penalizari',   label:'Penalizări',    max:0,  color:'#ff3ea5'},
  ];
  const chkLabels = {salut_greeting:'Salut & greeting',incheiere_politicoasa:'Încheiere politicoasă',problema_identificata:'Problemă identificată',solutie_oferita:'Soluție oferită',solutie_corecta:'Soluție corectă',ton_profesional:'Ton profesional',fara_intreruperi_agent:'Fără întreruperi',ritm_rezonabil:'Ritm rezonabil'};
  const pens = qa.penalizari_detalii || [];
  const chk  = qa.checklist || {};

  sec.innerHTML = `
    <div class="panel fade-in">
      <div class="panel-head">
        <div><div class="panel-title">Analiză QA completă</div><div class="panel-sub">Generat de AI</div></div>
        <span style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:${scoreColor(sc)}">${sc}/100</span>
      </div>

      <div class="score-hero">
        <div class="score-ring-wrap">
          <svg width="110" height="110" viewBox="0 0 110 110">
            <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="10"/>
            <circle cx="55" cy="55" r="46" fill="none" stroke="url(#sg)" stroke-width="10"
              stroke-linecap="round" stroke-dasharray="${circumference}" id="scoreArc"
              stroke-dashoffset="${circumference}" style="transition:stroke-dashoffset .8s ease"/>
            <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#ff3ea5"/>
              <stop offset=".5" stop-color="#8b5cf6"/>
              <stop offset="1" stop-color="#00e5ff"/>
            </linearGradient></defs>
          </svg>
          <div class="score-ring-val">${sc}<small>/100</small></div>
        </div>
        <div style="flex:1">
          <div style="font-size:13px;line-height:1.6;color:var(--ink-dim);margin-bottom:16px">${qa.rezumat||''}</div>
          <div style="display:flex;gap:24px">
            <div><div style="font-family:var(--font-mono);font-size:9px;color:var(--ink-faint);margin-bottom:4px">EMPATIE</div><div style="font-size:16px;font-weight:700;color:var(--violet)">${qa.empatie}/10</div></div>
            <div><div style="font-family:var(--font-mono);font-size:9px;color:var(--ink-faint);margin-bottom:4px">SENTIMENT CLIENT</div><div style="font-size:16px;font-weight:700;color:${sentColor}">${qa.sentiment_client||'—'}</div></div>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">
        <div>
          <div class="qa-section-title">Categorii de scor</div>
          ${catDefs.map(c=>{
            const v = qa[c.key]||0;
            const pct = c.max>0 ? Math.max(0,(v/c.max)*100) : Math.min(100,Math.abs(v)*8);
            return `<div class="cat-row"><span class="cat-name">${c.label}</span><div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%;background:${c.color}"></div></div><span class="cat-score" style="color:${c.color}">${v>0?'+':''}${v}</span></div>`;
          }).join('')}
          ${pens.length?`<div style="margin-top:16px"><div class="qa-section-title">Penalizări</div>${pens.map(p=>`<div class="pen-item"><div class="pen-dot"></div><span>${p}</span></div>`).join('')}</div>`:''}
        </div>
        <div>
          <div class="qa-section-title">Checklist apel</div>
          <div class="checklist-grid">
            ${Object.entries(chk).map(([k,v])=>`<div class="chk-item"><div class="chk-icon ${v?'pass':'fail'}">${v?'✓':'✕'}</div><span class="chk-label">${chkLabels[k]||k}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const arc = document.getElementById('scoreArc');
    if (arc) arc.style.strokeDashoffset = circumference - (sc/100)*circumference;
  }, 100);
}
