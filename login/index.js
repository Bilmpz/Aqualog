  
    const API_BASE = '';
    const btn = document.getElementById('loginBtn');
    const emailEl = document.getElementById('email');
    const pwEl = document.getElementById('pw');

    document.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
    document.getElementById("loginBtn").click();
        } 
    });



    btn?.addEventListener('click', async () => {
      const email = emailEl.value.trim();
      const password = pwEl.value;
      if (!email || !password) {
        alert('Udfyld e-mail og adgangskode');
        return;
      }
      try {
        const res = await fetch(API_BASE + '/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Ukendt fejl' }));
          throw new Error(data.error || 'Login fejlede');
        }

        window.location.href = '/forside/forside.html';
      } catch (err) {
        alert(err.message || 'Noget gik galt');
      }
    });