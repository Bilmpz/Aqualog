
    const API_BASE = '';
    (async () => {
      const el = document.getElementById('serverStatus');
      try {
        const res = await fetch(API_BASE + '/api/ping', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          el.textContent = 'Server forbundet';
        } else {
          el.textContent = 'Server offline';
        }
      } catch {
        if (el) el.textContent = 'Server offline';
      }
    })();