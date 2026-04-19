/* ── Simple hash router ──────────────────────────────────────────────────────── */
const Router = {
  routes: {},
  currentPage: null,

  register(path, handler) {
    this.routes[path] = handler;
  },

  navigate(path) {
    window.location.hash = path;
  },

  resolve() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    // match dynamic segments: /calls/:id
    for (const [pattern, handler] of Object.entries(this.routes)) {
      const keys = [];
      const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
      const match = hash.match(regex);
      if (match) {
        const params = Object.fromEntries(keys.map((k, i) => [k, match[i + 1]]));
        this._render(handler, params);
        return;
      }
    }
    // fallback
    this._render(this.routes['/dashboard'], {});
  },

  _render(handler, params) {
    document.getElementById('page').innerHTML = '';
    handler(params);
    // update active nav link
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.toggle('active', a.dataset.route === window.location.hash.slice(1).split('/')[1]);
    });
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  }
};
