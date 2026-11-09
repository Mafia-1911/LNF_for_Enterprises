// Applies the last known university theme before the app loads, to avoid a flash of the wrong
// colours. The app replaces it with GET /api/tenant (src/lib/theme.ts). Users cannot change it.
(function () {
  try {
    var cached = JSON.parse(window.localStorage.getItem('lf.appearance') || 'null');
    if (cached && cached.preset && cached.mode) {
      document.documentElement.setAttribute('data-theme', cached.custom ? 'custom' : cached.preset);
      document.documentElement.setAttribute('data-mode', cached.mode);
    }
  } catch {
    /* storage blocked: keep the default theme */
  }
})();
