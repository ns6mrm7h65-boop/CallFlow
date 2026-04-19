/* ── Config ──────────────────────────────────────────────────────────────────── */
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : 'https://callflow-api.onrender.com';
const SUPABASE_URL = 'https://sdkcpvauhwixnmaaitcp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka2NwdmF1aHdpeG5tYWFpdGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0Mzk4NTgsImV4cCI6MjA5MjAxNTg1OH0.jo_iF8kDPbxP2CoSjQ0mk7DLqiyKoQkpyq8xvxa1_Ak';

/* ── Supabase REST helper ─────────────────────────────────────────────────────── */
const sb = {
  _h: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },

  async query(table, params = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers: { ...this._h, 'Prefer': 'return=representation' } });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    return r.json();
  },

  // Realtime subscription via WebSocket
  subscribe(table, onEvent) {
    const ws = new WebSocket(`${SUPABASE_URL.replace('https','wss')}/realtime/v1/websocket?apikey=${SUPABASE_ANON}&vsn=1.0.0`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ topic: `realtime:public:${table}`, event: 'phx_join', payload: { config: { broadcast: { self: true }, presence: { key: '' } } }, ref: '1' }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
        onEvent({ type: msg.event, record: msg.payload?.record });
      }
    };
    ws.onerror = () => {};
    return ws;
  }
};

/* ── FastAPI calls ───────────────────────────────────────────────────────────── */
const API = {
  async uploadCall(file) {
    const form = new FormData();
    form.append('file', file);
    const r = await fetch(`${API_BASE}/calls`, { method: 'POST', body: form });
    if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
    return r.json();
  },

  async getCallStatus(callId) {
    const r = await fetch(`${API_BASE}/calls/${callId}/status`);
    if (!r.ok) throw new Error(`Status error: ${r.status}`);
    return r.json();
  },

  async getCallDetail(callId) {
    const r = await fetch(`${API_BASE}/calls/${callId}`);
    if (!r.ok) throw new Error(`Detail error: ${r.status}`);
    return r.json();
  }
};

/* ── Supabase data helpers ───────────────────────────────────────────────────── */
const DB = {
  async listCalls() {
    return sb.query('calls', '?select=*&order=created_at.desc&limit=50');
  },

  async getKPIs() {
    const [calls, qa] = await Promise.all([
      sb.query('calls', '?select=id,status,duration_ms,created_at'),
      sb.query('qa_results', '?select=scor_final,sentiment_client'),
    ]);
    const done = calls.filter(c => c.status === 'done');
    const avgScore = qa.length ? Math.round(qa.reduce((s, r) => s + (r.scor_final || 0), 0) / qa.length) : null;
    const totalDurMs = done.reduce((s, c) => s + (c.duration_ms || 0), 0);
    const avgDurMs = done.length ? Math.round(totalDurMs / done.length) : null;
    const flagged = qa.filter(r => r.scor_final != null && r.scor_final < 50).length;
    return { total: calls.length, done: done.length, avgScore, avgDurMs, flagged };
  },

  async getRecentActivity() {
    return sb.query('calls', '?select=id,filename,status,created_at,duration_ms&order=created_at.desc&limit=5');
  }
};

/* ── Utilities ───────────────────────────────────────────────────────────────── */
function msToMmss(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function formatBytes(b) {
  if (!b) return '—';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return 'acum ' + diff + 's';
  if (diff < 3600) return 'acum ' + Math.floor(diff / 60) + 'm';
  if (diff < 86400) return 'acum ' + Math.floor(diff / 3600) + 'h';
  return new Date(iso).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
}

function scoreColor(score) {
  if (score == null) return 'var(--ink-dim)';
  if (score >= 70) return 'var(--lime)';
  if (score >= 50) return 'var(--orange)';
  return 'var(--magenta)';
}

const AVATARS = [
  'linear-gradient(135deg,#00e5ff,#8b5cf6)',
  'linear-gradient(135deg,#ff3ea5,#8b5cf6)',
  'linear-gradient(135deg,#b4ff39,#00e5ff)',
  'linear-gradient(135deg,#8b5cf6,#ff3ea5)',
  'linear-gradient(135deg,#00e5ff,#b4ff39)',
];
