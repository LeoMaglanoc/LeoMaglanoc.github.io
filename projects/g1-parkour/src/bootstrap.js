const loading = document.querySelector('#loading');
const watchdog = setTimeout(() => { loading.textContent = 'Still loading… If this persists, reload and check your connection.'; }, 45000);
try {
  await import('./main.js');
  loading.hidden = true;
} catch (error) {
  console.error(error);
  document.querySelector('#state').textContent = 'Unavailable';
  loading.textContent = `Unable to start: ${error.message}. WebGL2 and WebAssembly are required. Reload to retry.`;
  loading.classList.add('error');
} finally { clearTimeout(watchdog); }
