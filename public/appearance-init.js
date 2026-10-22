try {
  document.documentElement.dataset.theme = localStorage.getItem('krypta-appearance') === 'dark' ? 'dark' : 'light';
} catch {}
