(() => {
  const query = new URLSearchParams(location.search);
  let saved;
  try { saved = JSON.parse(localStorage.getItem('baocaongay_ui_theme')); } catch { /* mặc định */ }
  const skins = ['luxe', 'classic', 'navy', 'ngoc', 'neutral', 'glass', 'frost', 'forest', 'night'];
  const requested = query.get('skin') ?? saved?.skin;
  const skin = skins.includes(requested) ? requested : 'frost';
  if (skin !== 'luxe') document.documentElement.dataset.skin = skin;
  const mode = query.get('mode') ?? saved?.mode ?? (skin === 'night' ? 'dark' : 'auto');
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
})();
