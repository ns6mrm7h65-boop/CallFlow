const Router = {
  routes: {},
  currentPath: null,

  register(path, handler) { this.routes[path] = handler; },
  navigate(path) { window.location.hash = path; },

  resolve() {
    const hash = window.location.hash.slice(1) || '/dashboard';

    // Auth guard — redirect to login if not authenticated
    if (hash !== '/login' && !Auth.isLoggedIn()) {
      this._render(this.routes['/login'], {});
      this.currentPath = '/login';
      return;
    }

    for (const [pattern, handler] of Object.entries(this.routes)) {
      const keys = [];
      const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
      const match = hash.match(regex);
      if (match) {
        const params = Object.fromEntries(keys.map((k, i) => [k, match[i + 1]]));
        this._cleanupPreviousPage();
        this._render(handler, params);
        this.currentPath = hash;
        return;
      }
    }

    this._cleanupPreviousPage();
    this._render(this.routes['/dashboard'], {});
    this.currentPath = '/dashboard';
  },

  _cleanupPreviousPage() {
    if (!this.currentPath) return;
    if (this.currentPath.startsWith('/calls')) SubscriptionManager.close('calls-list');
    if (this.currentPath.startsWith('/dashboard')) SubscriptionManager.close('dashboard-kpis');
  },

  _render(handler, params) {
    document.getElementById('page').innerHTML = '';
    handler(params);
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.toggle('active', a.dataset.route === window.location.hash.slice(1).split('/')[1]);
    });
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
    window.addEventListener('beforeunload', () => SubscriptionManager.closeAll());
  }
};
