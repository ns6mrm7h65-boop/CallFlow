function renderNav() {
  document.getElementById('nav').innerHTML = `
    <a class="logo" href="#/dashboard">
      <div class="logo-mark">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.74-.03-1.02.24l-2.2 2.2a15.07 15.07 0 01-6.59-6.58l2.2-2.21a.96.96 0 00.25-1A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg>
      </div>
      Call Flow
    </a>
    <div class="nav-links">
      <a href="#/dashboard" data-route="dashboard">Dashboard</a>
      <a href="#/calls"     data-route="calls">Apeluri</a>
      <a href="#/reports"   data-route="reports">Rapoarte</a>
    </div>
    <div class="nav-right">
      <span class="nav-user">Contul meu</span>
      <button class="btn btn-primary" onclick="UploadModal.open()">+ Încarcă apel</button>
    </div>`;
}
