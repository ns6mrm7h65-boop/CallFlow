const UploadModal = {
  file: null,
  pollTimer: null,

  open() {
    this._reset();
    document.getElementById('uploadOverlay').classList.add('open');
  },

  close() {
    document.getElementById('uploadOverlay').classList.remove('open');
    if (this.pollTimer) clearInterval(this.pollTimer);
  },

  _reset() {
    this.file = null;
    document.getElementById('uFileInput').value = '';
    document.getElementById('uFilePreview').classList.remove('visible');
    document.getElementById('uPipeline').classList.remove('visible');
    document.getElementById('uUploadZone').style.display = '';
    document.getElementById('uBtn').disabled = true;
    document.getElementById('uBtn').textContent = 'Procesează apelul';
    document.getElementById('uBtn').onclick = () => this.start();
    [1,2,3,4].forEach(i => this._setStep(i, 'waiting', 'în așteptare'));
  },

  _setStep(n, state, label) {
    const dot = document.getElementById(`udot${n}`);
    const st  = document.getElementById(`ups${n}`);
    dot.className = 'pipe-dot ' + state;
    st.className  = 'pipe-status ' + state;
    st.textContent = label;
    dot.textContent = state === 'done' ? '✓' : state === 'err' ? '✕' : n;
  },

  setFile(f) {
    this.file = f;
    document.getElementById('uFileName').textContent = f.name;
    document.getElementById('uFileSize').textContent = formatBytes(f.size);
    document.getElementById('uFilePreview').classList.add('visible');
    document.getElementById('uPipeline').classList.add('visible');
    document.getElementById('uBtn').disabled = false;
    document.getElementById('uUploadZone').style.display = 'none';
  },

  removeFile() {
    this.file = null;
    document.getElementById('uFileInput').value = '';
    document.getElementById('uFilePreview').classList.remove('visible');
    document.getElementById('uPipeline').classList.remove('visible');
    document.getElementById('uBtn').disabled = true;
    document.getElementById('uUploadZone').style.display = '';
    [1,2,3,4].forEach(i => this._setStep(i, 'waiting', 'în așteptare'));
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
            // refresh calls list if it's cached
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

  render() {
    document.getElementById('uploadMount').innerHTML = `
      <div class="modal-overlay" id="uploadOverlay" onclick="if(event.target===this)UploadModal.close()">
        <div class="modal-box" style="width:100%;max-width:520px">
          <button class="modal-close" onclick="UploadModal.close()">✕</button>
          <div class="modal-eyebrow">● Pipeline · Apel nou</div>
          <div class="modal-title">Încarcă apel audio</div>

          <div class="upload-zone" id="uUploadZone">
            <input type="file" id="uFileInput" accept=".wav,.mp3,.m4a,.flac,.ogg" onchange="UploadModal.setFile(event.target.files[0])"/>
            <div class="upload-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 100 18A9 9 0 0012 3zm-1 14v-4H7l5-7 5 7h-4v4h-2z"/></svg></div>
            <div style="font-size:15px;font-weight:600;margin-bottom:6px">Trage fișierul aici sau apasă</div>
            <div style="font-size:12px;color:var(--ink-dim);margin-bottom:12px">Selectează un fișier audio pentru transcriere</div>
            <div class="upload-formats">
              <span class="fmt-chip">.wav</span><span class="fmt-chip">.mp3</span>
              <span class="fmt-chip">.m4a</span><span class="fmt-chip">.flac</span><span class="fmt-chip">.ogg</span>
            </div>
          </div>

          <div class="file-preview" id="uFilePreview">
            <div class="file-icon-wrap"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/></svg></div>
            <div class="file-info">
              <div class="file-name" id="uFileName">—</div>
              <div class="file-size" id="uFileSize">—</div>
            </div>
            <button class="file-remove" onclick="UploadModal.removeFile()">✕</button>
          </div>

          <div class="pipeline" id="uPipeline">
            <div class="pipe-step"><div class="pipe-dot waiting" id="udot1">1</div><span class="pipe-label"><strong>Soniox STT</strong> · Transcriere + diarizare</span><span class="pipe-status" id="ups1">în așteptare</span></div>
            <div class="pipe-step"><div class="pipe-dot waiting" id="udot2">2</div><span class="pipe-label"><strong>Anonymize</strong> · Detectare PII</span><span class="pipe-status" id="ups2">în așteptare</span></div>
            <div class="pipe-step"><div class="pipe-dot waiting" id="udot3">3</div><span class="pipe-label"><strong>AI Classify</strong> · Roluri AGENT / CLIENT</span><span class="pipe-status" id="ups3">în așteptare</span></div>
            <div class="pipe-step"><div class="pipe-dot waiting" id="udot4">4</div><span class="pipe-label"><strong>AI QA</strong> · Scor, checklist, sentiment</span><span class="pipe-status" id="ups4">în așteptare</span></div>
          </div>

          <button class="btn btn-primary btn-full" id="uBtn" disabled onclick="UploadModal.start()">Procesează apelul</button>
        </div>
      </div>`;

    // Drag & drop
    const zone = document.getElementById('uUploadZone');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) UploadModal.setFile(f); });
  }
};
