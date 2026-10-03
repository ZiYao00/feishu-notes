(() => {
  try {
    const saved = localStorage.getItem('feishu-notes-theme');
    document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
  } catch {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
