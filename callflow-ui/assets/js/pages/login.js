function pageLogin() {
  // Hide nav while on login
  document.getElementById('nav').style.display = 'none';

  document.getElementById('page').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center">
      <div style="width:100%;max-width:400px;padding:0 16px">
        <div style="text-align:center;margin-bottom:40px">
          <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:16px">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--cyan),var(--violet));display:flex;align-items:center;justify-content:center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.74-.03-1.02.24l-2.2 2.2a15.07 15.07 0 01-6.59-6.58l2.2-2.21a.96.96 0 00.25-1A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg>
            </div>
            <span style="font-size:20px;font-weight:700;letter-spacing:-.03em">Call Flow</span>
          </div>
          <div style="font-size:13px;color:var(--ink-dim)">Platformă de analiză QA pentru call center</div>
        </div>

        <div class="panel" style="padding:32px">
          <div style="font-size:18px;font-weight:700;margin-bottom:4px">Bun venit</div>
          <div style="font-size:13px;color:var(--ink-dim);margin-bottom:24px">Autentifică-te pentru a continua</div>

          <div id="loginError" style="display:none;background:rgba(255,62,165,.1);border:1px solid rgba(255,62,165,.3);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--magenta);margin-bottom:16px"></div>

          <div style="margin-bottom:16px">
            <label style="font-size:12px;color:var(--ink-dim);font-weight:600;display:block;margin-bottom:6px">EMAIL</label>
            <input id="loginEmail" type="email" placeholder="demo@callflow.ro" autocomplete="email"
              style="width:100%;background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--ink);font-size:14px;font-family:var(--font-sans);box-sizing:border-box;outline:none"
              onkeydown="if(event.key==='Enter')document.getElementById('loginPassword').focus()"/>
          </div>

          <div style="margin-bottom:24px">
            <label style="font-size:12px;color:var(--ink-dim);font-weight:600;display:block;margin-bottom:6px">PAROLĂ</label>
            <input id="loginPassword" type="password" placeholder="••••••••" autocomplete="current-password"
              style="width:100%;background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--ink);font-size:14px;font-family:var(--font-sans);box-sizing:border-box;outline:none"
              onkeydown="if(event.key==='Enter')submitLogin()"/>
          </div>

          <button class="btn btn-primary btn-full" id="loginBtn" onclick="submitLogin()">
            Autentificare
          </button>
        </div>

        <div style="text-align:center;margin-top:20px;font-size:12px;color:var(--ink-faint)">
          CallFlow · QA Analytics Platform
        </div>
      </div>
    </div>`;

  // Focus email
  setTimeout(() => document.getElementById('loginEmail')?.focus(), 100);
}

async function submitLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');

  err.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-ring"></span> Se autentifică...';

  try {
    await Auth.login(email, password);
    document.getElementById('nav').style.display = '';
    renderNav();
    UploadModal.render();
    Router.navigate('/dashboard');
  } catch(e) {
    err.textContent = e.message;
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Autentificare';
  }
}
