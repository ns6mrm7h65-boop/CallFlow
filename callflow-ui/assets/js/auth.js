const Auth = {
  _key: 'cf_token',
  _userKey: 'cf_user',

  getToken() { return localStorage.getItem(this._key); },
  getUser()  { try { return JSON.parse(localStorage.getItem(this._userKey)); } catch { return null; } },
  isLoggedIn() { return !!this.getToken(); },

  save(session, user) {
    localStorage.setItem(this._key, session.access_token);
    localStorage.setItem(this._userKey, JSON.stringify({ email: user.email, id: user.id }));
  },

  clear() {
    localStorage.removeItem(this._key);
    localStorage.removeItem(this._userKey);
  },

  async login(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || 'Eroare la autentificare');
    this.save(data, data.user);
    return data;
  },

  async logout() {
    const token = this.getToken();
    if (token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    this.clear();
    Router.navigate('/login');
  }
};
