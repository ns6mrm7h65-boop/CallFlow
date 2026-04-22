const UploadModal = {
  // single-file mode
  file: null,
  pollTimer: null,

  // bulk mode
  bulkFiles: [],
  bulkJobs: {},   // call_id → { filename, status, error }
  bulkPollTimer: null,

  activeTab: 'single',

  open() {
    this._reset();
    document.getElementById('uploadOverlay').classList.add('open');
  },

  close() {
    document.getElementById('uploadOverlay').classList.remove('open');
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.bulkPollTimer) { clearInterval(this.bulkPollTimer); this.bulkPollTimer = null; }
  },

  _reset() {
    this.file = null;
    this.bulkFiles = [];
    this.bulkJobs = {};
    this.activeTab = 'single';
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.bulkPollTimer) { clearInterval(this.bulkPollTimer); this.bulkPollTimer = null; }
    this._renderTabContent('single');
  },

  switchTab(tab) {
    this.activeTab = tab;
    ['single', 'folder', 'api'].forEach(t => {
      document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    });
    this._renderTabContent(tab);
  },

  // ── SINGLE FILE ──────────────────────────────────────────────────────────────

  _renderTabContent(tab) {
    const body = document.getElementById('uTabBody');
    if (tab === 'single') body.innerHTML = this._htmlSingle();
    else if (tab === 'folder') body.innerHTML = this._htmlFolder();
    else body.innerHTML = this._htmlApi();

    if (tab === 'single') this._bindSingleDrop();
    if (tab === 'folder') this._bindFolderDrop();
  },

  _htmlSingle() {
    return `
      <div class="upload-zone" id="uUploadZone">
        <input type="file" id="uFileInput" accept=".wav,.mp3,.m4a,.flac,.ogg"
               onchange="UploadModal.setFile(event.target.files[0])"/>
        <div class="upload-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 100 18A9 9 0 0012 3zm-1 14v-4H7l5-7 5 7h-4v4h-2z"/></svg></div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">Trage fișierul aici sau apasă</div>
        <div style="font-size:12px;color:var(--ink-dim);margin-bottom:12px">Un singur fișier audio</div>
        <div class="upload-formats">
          <span class="fmt-chip">.wav</span><span class="fmt-chip">.mp3</span>
          <span class="fmt-chip">.m4a</span><span class="fmt-chip">.flac</span><span class="fmt-chip">.ogg</span>
        </div>
      </div>

      <div class="file-preview" id="uFilePreview" style="display:none">
        <div class="file-icon-wrap"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/></svg></div>
        <div class="file-info">
          <div class="file-name" id="uFileName">—</div>
          <div class="file-size" id="uFileSize">—</div>
        </div>
        <button class="file-remove" onclick="UploadModal.removeFile()">✕</button>
      </div>

      <div class="pipeline" id="uPipeline" style="display:none">
        <div class="pipe-step"><div class="pipe-dot waiting" id="udot1">1</div><span class="pipe-label"><strong>Soniox STT</strong> · Transcriere + diarizare</span><span class="pipe-status" id="ups1">în așteptare</span></div>
        <div class="pipe-step"><div class="pipe-dot waiting" id="udot2">2</div><span class="pipe-label"><strong>Anonymize</strong> · Detectare PII</span><span class="pipe-status" id="ups2">în așteptare</span></div>
        <div class="pipe-step"><div class="pipe-dot waiting" id="udot3">3</div><span class="pipe-label"><strong>AI Classify</strong> · Roluri AGENT / CLIENT</span><span class="pipe-status" id="ups3">în așteptare</span></div>
        <div class="pipe-step"><div class="pipe-dot waiting" id="udot4">4</div><span class="pipe-label"><strong>AI QA</strong> · Scor, checklist, sentiment</span><span class="pipe-status" id="ups4">în așteptare</span></div>
      </div>

      <button class="btn btn-primary btn-full" id="uBtn" disabled onclick="UploadModal.start()">Procesează apelul</button>`;
  },

  _bindSingleDrop() {
    const zone = document.getElementById('uUploadZone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) this.setFile(f);
    });
  },

  setFile(f) {
    this.file = f;
    document.getElementById('uFileName').textContent = f.name;
    document.getElementById('uFileSize').textContent = formatBytes(f.size);
    document.getElementById('uFilePreview').style.display = 'flex';
    document.getElementById('uPipeline').style.display = '';
    document.getElementById('uBtn').disabled = false;
    document.getElementById('uUploadZone').style.display = 'none';
  },

  removeFile() {
    this.file = null;
    document.getElementById('uFileInput').value = '';
    document.getElementById('uFilePreview').style.display = 'none';
    document.getElementById('uPipeline').style.display = 'none';
    document.getElementById('uBtn').disabled = true;
    document.getElementById('uUploadZone').style.display = '';
    [1,2,3,4].forEach(i => this._setStep(i, 'waiting', 'în așteptare'));
  },

  _setStep(n, state, label) {
    const dot = document.getElementById(`udot${n}`);
    const st  = document.getElementById(`ups${n}`);
    if (!dot || !st) return;
    dot.className = 'pipe-dot ' + state;
    st.className  = 'pipe-status ' + state;
    st.textContent = label;
    dot.textContent = state === 'done' ? '✓' : state === 'err' ? '✕' : n;
  },

  async start() {
    if (!this.file) return;
    const btn = document.getElementById('uBtn');
    btn.disabled = true;
    btn.textContent = 'Se încarcă...';

    let callId;
    try {
      const data = await API.uploadCall(this.file);
      callId = data.call_id;
    } catch(e) {
      btn.disabled = false;
      btn.textContent = '✕ Backend offline';
      return;
    }

    btn.textContent = 'Se procesează...';
    this._setStep(1, 'running', 'se transcrie...');

    const STATUS_STEP  = { transcribing:1, anonymizing:2, classifying:3, analyzing:4, done:4 };
    const STATUS_LABEL = { transcribing:'se transcrie...', anonymizing:'se anonimizează...', classifying:'se clasifică...', analyzing:'se analizează...', done:'gata' };
    let lastStep = 1;

    this.pollTimer = setInterval(async () => {
      try {
        const s = await API.getCallStatus(callId);
        const step = STATUS_STEP[s.status] || 1;
        for (let i = lastStep; i < step; i++) this._setStep(i, 'done', 'gata');
        lastStep = step;

        if (s.status === 'done') {
          clearInterval(this.pollTimer);
          [1,2,3,4].forEach(i => this._setStep(i, 'done', 'gata'));
          btn.textContent = '✓ Gata — Vezi apelul';
          btn.disabled = false;
          btn.onclick = () => {
            this.close();
            Router.navigate(`/calls/${callId}`);
            if (window._callsPageRefresh) window._callsPageRefresh();
          };
        } else if (s.status === 'error') {
          clearInterval(this.pollTimer);
          this._setStep(step, 'err', 'eroare');
          btn.textContent = '✕ ' + (s.error_msg || 'Eroare necunoscută');
        } else {
          this._setStep(step, 'running', STATUS_LABEL[s.status] || s.status);
        }
      } catch(e) { /* ignore transient errors */ }
    }, CONFIG.UPLOAD_POLL_INTERVAL_MS);
  },

  // ── FOLDER / BULK ────────────────────────────────────────────────────────────

  _htmlFolder() {
    return `
      <div class="upload-zone" id="uFolderZone" style="cursor:pointer" onclick="document.getElementById('uFolderInput').click()">
        <input type="file" id="uFolderInput" accept=".wav,.mp3,.m4a,.flac,.ogg" multiple
               style="display:none" onchange="UploadModal.setFolderFiles(event.target.files)"/>
        <input type="file" id="uFolderDirInput" accept=".wav,.mp3,.m4a,.flac,.ogg" multiple webkitdirectory
               style="display:none" onchange="UploadModal.setFolderFiles(event.target.files)"/>
        <div class="upload-icon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/></svg>
        </div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">Trage fișiere sau folder aici</div>
        <div style="font-size:12px;color:var(--ink-dim);margin-bottom:12px">Selectează mai multe fișiere simultan</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button class="btn" style="font-size:12px;padding:6px 14px" onclick="event.stopPropagation();document.getElementById('uFolderInput').click()">Fișiere multiple</button>
          <button class="btn" style="font-size:12px;padding:6px 14px" onclick="event.stopPropagation();document.getElementById('uFolderDirInput').click()">Folder întreg</button>
        </div>
      </div>

      <div id="uBulkList" style="display:none;margin-top:12px;max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:6px"></div>

      <button class="btn btn-primary btn-full" id="uBulkBtn" disabled onclick="UploadModal.startBulk()" style="margin-top:12px">
        Procesează apelurile
      </button>`;
  },

  _bindFolderDrop() {
    const zone = document.getElementById('uFolderZone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      this.setFolderFiles(e.dataTransfer.files);
    });
  },

  setFolderFiles(fileList) {
    const allowed = new Set(['.wav', '.mp3', '.m4a', '.flac', '.ogg']);
    const files = Array.from(fileList).filter(f => allowed.has(f.name.slice(f.name.lastIndexOf('.')).toLowerCase()));
    if (!files.length) return;
    this.bulkFiles = files;
    this._renderBulkList();
    document.getElementById('uBulkBtn').disabled = false;
    document.getElementById('uFolderZone').style.display = 'none';
  },

  _renderBulkList() {
    const list = document.getElementById('uBulkList');
    if (!list) return;
    list.style.display = 'flex';
    list.innerHTML = this.bulkFiles.map(f => {
      const job = Object.values(this.bulkJobs).find(j => j.filename === f.name);
      const status = job ? job.status : 'queued';
      const statusLabel = { queued:'în coadă', uploading:'se încarcă...', transcribing:'se transcrie...', anonymizing:'se anonimizează...', classifying:'se clasifică...', analyzing:'se analizează...', done:'✓ gata', error:'✕ eroare' }[status] || status;
      const statusColor = status === 'done' ? 'var(--lime)' : status === 'error' ? 'var(--magenta)' : 'var(--ink-dim)';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--glass);border:1px solid var(--border);border-radius:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
          <div style="font-size:11px;color:var(--ink-dim)">${formatBytes(f.size)}</div>
        </div>
        <div style="font-size:11px;color:${statusColor};white-space:nowrap">${statusLabel}</div>
      </div>`;
    }).join('');
  },

  async startBulk() {
    if (!this.bulkFiles.length) return;
    const btn = document.getElementById('uBulkBtn');
    btn.disabled = true;
    btn.textContent = 'Se încarcă...';

    // mark all as uploading in UI
    this.bulkFiles.forEach(f => {
      this.bulkJobs[f.name] = { filename: f.name, status: 'uploading' };
    });
    this._renderBulkList();

    // upload all files
    const uploads = await Promise.allSettled(
      this.bulkFiles.map(async f => {
        try {
          const data = await API.uploadCall(f);
          this.bulkJobs[data.call_id] = { filename: f.name, status: 'transcribing' };
          delete this.bulkJobs[f.name];
          return data.call_id;
        } catch(e) {
          this.bulkJobs[f.name] = { filename: f.name, status: 'error', error: e.message };
          return null;
        }
      })
    );

    const callIds = uploads.map(r => r.value).filter(Boolean);
    this._renderBulkList();

    if (!callIds.length) {
      btn.textContent = '✕ Toate uploadurile au eșuat';
      return;
    }

    btn.textContent = `Se procesează ${callIds.length} apel${callIds.length > 1 ? 'uri' : ''}...`;

    // poll all active call ids
    this.bulkPollTimer = setInterval(async () => {
      const active = callIds.filter(id => {
        const j = this.bulkJobs[id];
        return j && j.status !== 'done' && j.status !== 'error';
      });

      if (!active.length) {
        clearInterval(this.bulkPollTimer);
        const doneCount = callIds.filter(id => this.bulkJobs[id]?.status === 'done').length;
        btn.textContent = `✓ ${doneCount}/${callIds.length} apeluri procesate`;
        btn.disabled = false;
        btn.onclick = () => { this.close(); if (window._callsPageRefresh) window._callsPageRefresh(); };
        if (window._callsPageRefresh) window._callsPageRefresh();
        return;
      }

      await Promise.allSettled(active.map(async id => {
        try {
          const s = await API.getCallStatus(id);
          if (this.bulkJobs[id]) this.bulkJobs[id].status = s.status;
        } catch(e) {}
      }));

      this._renderBulkList();
    }, CONFIG.UPLOAD_POLL_INTERVAL_MS);
  },

  // ── API PLACEHOLDER ──────────────────────────────────────────────────────────

  _htmlApi() {
    return `
      <div style="padding:24px;background:var(--glass);border:1px solid var(--border);border-radius:12px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),var(--violet));display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#000"><path d="M8 3a2 2 0 00-2 2v4a2 2 0 01-2 2H3v2h1a2 2 0 012 2v4a2 2 0 002 2h2v-2H8v-5a2 2 0 00-2-2 2 2 0 002-2V5h2V3H8zm8 0v2h2v5a2 2 0 002 2 2 2 0 00-2 2v5h-2v2h2a2 2 0 002-2v-4a2 2 0 012-2h1v-2h-1a2 2 0 01-2-2V5a2 2 0 00-2-2h-2z"/></svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:700">Integrare API</div>
            <div style="font-size:11px;color:var(--ink-dim)">Coming soon · În dezvoltare</div>
          </div>
        </div>

        <div style="font-size:13px;color:var(--ink-dim);margin-bottom:16px;line-height:1.6">
          Trimite apeluri direct din sistemul tău CRM, dialer sau platformă de stocare prin API REST.
        </div>

        <div style="background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.15);border-radius:8px;padding:14px;margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:var(--cyan);margin-bottom:8px;letter-spacing:.05em">ENDPOINT</div>
          <code style="font-size:12px;color:var(--ink);font-family:var(--font-mono)">POST /calls</code>
          <div style="font-size:11px;color:var(--ink-dim);margin-top:4px">multipart/form-data · câmp: <code style="color:var(--cyan)">file</code></div>
        </div>

        <div style="background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.15);border-radius:8px;padding:14px;margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:var(--cyan);margin-bottom:8px;letter-spacing:.05em">BATCH ENDPOINT</div>
          <code style="font-size:12px;color:var(--ink);font-family:var(--font-mono)">POST /calls/batch</code>
          <div style="font-size:11px;color:var(--ink-dim);margin-top:4px">multipart/form-data · câmp: <code style="color:var(--cyan)">files</code> (multiple)</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-dim)">
            <div style="width:6px;height:6px;border-radius:50%;background:var(--lime)"></div>
            Autentificare Bearer token
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-dim)">
            <div style="width:6px;height:6px;border-radius:50%;background:var(--lime)"></div>
            Polling status: <code style="color:var(--cyan);font-size:11px">GET /calls/{id}/status</code>
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-dim)">
            <div style="width:6px;height:6px;border-radius:50%;background:var(--orange)"></div>
            Webhook on complete — în curând
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-dim)">
            <div style="width:6px;height:6px;border-radius:50%;background:var(--orange)"></div>
            SDK Python / Node — în curând
          </div>
        </div>
      </div>`;
  },

  // ── RENDER ───────────────────────────────────────────────────────────────────

  render() {
    document.getElementById('uploadMount').innerHTML = `
      <div class="modal-overlay" id="uploadOverlay" onclick="if(event.target===this)UploadModal.close()">
        <div class="modal-box" style="width:100%;max-width:520px">
          <button class="modal-close" onclick="UploadModal.close()">✕</button>
          <div class="modal-eyebrow">● Pipeline · Apel nou</div>
          <div class="modal-title">Încarcă apel audio</div>

          <div style="display:flex;gap:4px;margin-bottom:20px;background:var(--glass);border:1px solid var(--border);border-radius:10px;padding:4px">
            <button id="tab-single" class="upload-tab active" onclick="UploadModal.switchTab('single')">Fișier</button>
            <button id="tab-folder" class="upload-tab" onclick="UploadModal.switchTab('folder')">Folder</button>
            <button id="tab-api"    class="upload-tab" onclick="UploadModal.switchTab('api')">API</button>
          </div>

          <div id="uTabBody"></div>
        </div>
      </div>`;

    this._renderTabContent('single');
  }
};
