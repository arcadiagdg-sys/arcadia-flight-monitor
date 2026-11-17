// Arcadia Flight Monitor — lógica de la interfaz.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const S = () => Store.state;

  const STATUS_LABEL = {
    scheduled: 'Programado', active: 'En vuelo', landed: 'Aterrizó', delayed: 'Retrasado',
    cancelled: 'Cancelado', diverted: 'Desviado', incident: 'Incidente', unknown: 'Sin datos', error: 'Error',
  };
  const CURRENCY_FMT = {};
  const money = (v, cur) => {
    CURRENCY_FMT[cur] = CURRENCY_FMT[cur] || new Intl.NumberFormat('es-MX', { style: 'currency', currency: cur, maximumFractionDigits: 0 });
    return `${CURRENCY_FMT[cur].format(v)} ${cur}`;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const fmtStamp = iso => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const normFlight = f => f.toUpperCase().replace(/\s+/g, '');
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

  // ---------- Utilidades UI ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  function notify(title, body) {
    toast(`${title}: ${body}`);
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
    } catch (e) { /* sin notificaciones */ }
  }

  function renderBadge() {
    const b = $('#modeBadge');
    const live = S().settings.provider === 'aviationstack';
    b.textContent = live ? 'Datos reales: AviationStack' : 'Modo DEMO: datos simulados';
    b.className = 'badge ' + (live ? 'live' : 'demo');
  }

  // ---------- Pestañas ----------
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
    try { localStorage.setItem('afm-tab', btn.dataset.tab); } catch (e) {}
  }));
  try {
    const saved = localStorage.getItem('afm-tab');
    if (saved) document.querySelector(`.tab[data-tab="${saved}"]`)?.click();
  } catch (e) {}

  // ================= ESTADO DE VUELOS =================
  // Contador mensual de consultas reales (AviationStack).
  const monthKey = () => today().slice(0, 7);
  function usage() {
    const u = S().usage || (S().usage = { month: '', count: 0 });
    if (u.month !== monthKey()) { u.month = monthKey(); u.count = 0; }
    return u;
  }
  function renderQuota() {
    const u = usage();
    $('#quotaInfo').textContent = `Consultas a AviationStack este mes: ${u.count} de ${S().settings.quotaLimit}.`;
  }

  async function refreshFlight(f, { silent } = {}) {
    const prev = f.lastStatus;
    if (S().settings.provider === 'aviationstack') {
      const u = usage();
      if (u.count >= S().settings.quotaLimit) {
        f.error = `Se alcanzó el límite de ${S().settings.quotaLimit} consultas de este mes. Puedes cambiarlo en Ajustes.`;
        f.updatedAt = new Date().toISOString();
        Store.save();
        return;
      }
      u.count++;
    }
    try {
      const data = await Providers.lookup(f.flight, f.date, S().settings);
      f.lastData = data;
      f.lastStatus = data.status;
      f.error = null;
    } catch (err) {
      f.error = err.message;
    }
    f.updatedAt = new Date().toISOString();
    Store.save();
    if (!silent && prev && f.lastStatus && prev !== f.lastStatus) {
      notify(`Vuelo ${f.flight}`, `${STATUS_LABEL[prev] || prev} → ${STATUS_LABEL[f.lastStatus] || f.lastStatus}`);
    }
  }

  function legHTML(l, right) {
    const changed = l.estimated && l.estimated !== l.scheduled;
    const time = l.actual
      ? `Real ${fmtTime(l.actual)}`
      : changed ? `<s>${fmtTime(l.scheduled)}</s> ${fmtTime(l.estimated)}` : fmtTime(l.scheduled);
    return `<div class="leg ${right ? 'right' : ''}">
      <div class="iata">${esc(l.iata || '—')}</div>
      <div class="city">${esc(l.airport || '')}</div>
      <div class="time">${time}</div>
    </div>`;
  }

  function flightCard(f) {
    const d = f.lastData;
    const st = f.error ? 'error' : (f.lastStatus || 'unknown');
    let body;
    if (f.error) {
      body = `<p class="muted">${esc(f.error)}</p>`;
    } else if (d) {
      const delay = Math.max(d.dep.delay || 0, d.arr.delay || 0);
      body = `
        <div class="legs">${legHTML(d.dep)}<span class="arrow">→</span>${legHTML(d.arr, true)}</div>
        <div class="meta">
          <span>Salida: terminal <b>${esc(d.dep.terminal || '—')}</b>, puerta <b>${esc(d.dep.gate || '—')}</b></span>
          <span>Llegada: terminal <b>${esc(d.arr.terminal || '—')}</b></span>
          ${delay ? `<span>Retraso <b>${delay} min</b></span>` : ''}
          ${d.source === 'demo' ? '<span><b>Datos simulados</b></span>' : ''}
        </div>`;
    } else {
      body = '<p class="muted">Consultando…</p>';
    }
    return `<article class="card" data-id="${f.id}">
      <div class="flight-head">
        <div>
          <div class="flight-code">${esc(f.flight)}</div>
          <div class="muted">${esc(d?.airline || '')} · ${fmtDate(f.date)}${f.note ? ' · ' + esc(f.note) : ''}</div>
        </div>
        <span class="status ${st}">${STATUS_LABEL[st] || st}</span>
      </div>
      ${body}
      <div class="card-actions">
        <button data-act="refresh" class="ghost">Actualizar</button>
        <button data-act="remove" class="ghost danger">Quitar</button>
        ${f.updatedAt ? `<span class="muted small">Actualizado ${fmtStamp(f.updatedAt)}</span>` : ''}
      </div>
    </article>`;
  }

  function renderFlights() {
    const list = [...S().flights].sort((a, b) => a.date.localeCompare(b.date));
    $('#flightList').innerHTML = list.length
      ? list.map(flightCard).join('')
      : '<div class="empty">Todavía no sigues ningún vuelo. Escribe el número de vuelo y la fecha arriba.</div>';
  }

  $('#flightForm').date.value = today();
  $('#flightForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const f = { id: Store.uid(), flight: normFlight(fd.get('flight')), date: fd.get('date'), note: fd.get('note').trim() };
    if (S().flights.some(x => x.flight === f.flight && x.date === f.date)) return toast('Ya sigues ese vuelo en esa fecha.');
    S().flights.push(f);
    Store.save();
    e.target.flight.value = ''; e.target.note.value = '';
    renderFlights();
    await refreshFlight(f, { silent: true });
    renderFlights();
  });

  $('#flightList').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const f = S().flights.find(x => x.id === id);
    if (btn.dataset.act === 'remove') {
      if (!confirm(`¿Dejar de seguir el vuelo ${f.flight}?`)) return;
      S().flights = S().flights.filter(x => x.id !== id);
      Store.save();
    } else {
      btn.disabled = true; btn.textContent = 'Actualizando…';
      await refreshFlight(f);
    }
    renderFlights();
  });

  $('#refreshAll').addEventListener('click', async () => {
    const flights = S().flights;
    if (!flights.length) return;
    if (S().settings.provider === 'aviationstack' && !confirm(`Se harán ${flights.length} consultas a AviationStack (cuentan para tu límite mensual). ¿Continuar?`)) return;
    for (const f of flights) await refreshFlight(f);
    $('#lastRefresh').textContent = 'Última actualización: ' + fmtStamp(new Date().toISOString());
    renderFlights();
    renderQuota();
  });

  // ---------- Actualización automática ----------
  let autoTimer = null;
  const isNearToday = d => Math.abs(new Date(d + 'T12:00:00') - new Date(today() + 'T12:00:00')) <= 86400000;
  const FINAL = ['landed', 'cancelled'];

  async function autoRefresh() {
    const list = S().flights.filter(f => isNearToday(f.date) && !FINAL.includes(f.lastStatus));
    if (!list.length) return;
    for (const f of list) await refreshFlight(f);
    $('#lastRefresh').textContent = 'Actualización automática: ' + fmtStamp(new Date().toISOString());
    renderFlights();
    renderQuota();
  }

  function scheduleAuto() {
    clearInterval(autoTimer);
    autoTimer = null;
    const min = Number(S().settings.autoInterval) || 0;
    if (min > 0) autoTimer = setInterval(autoRefresh, min * 60000);
  }

  // ================= PRECIOS =================
  function searchLink(r) {
    const q = `Flights from ${r.from} to ${r.to} on ${r.depart}` + (r.return ? ` returning ${r.return}` : ' one way');
    return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q) + '&curr=' + r.currency;
  }

  function sparkline(r) {
    const pts = r.prices.map(p => p.price);
    if (pts.length < 2) return '';
    const all = [...pts, r.target];
    const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
    const W = 300, H = 48, pad = 4;
    const x = i => pad + (i * (W - 2 * pad)) / (pts.length - 1);
    const y = v => H - pad - ((v - min) / span) * (H - 2 * pad);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Historial de precios">
      <line x1="0" x2="${W}" y1="${y(r.target)}" y2="${y(r.target)}"></line>
      <polyline points="${pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"></polyline>
    </svg>`;
  }

  function routeCard(r) {
    const last = r.prices[r.prices.length - 1];
    const min = r.prices.length ? Math.min(...r.prices.map(p => p.price)) : null;
    const hit = last && last.price <= r.target;
    return `<article class="card" data-id="${r.id}">
      <div class="route-head">
        <div>
          <div class="flight-code">${esc(r.from)} → ${esc(r.to)}</div>
          <div class="muted">${fmtDate(r.depart)}${r.return ? ' – ' + fmtDate(r.return) : ' · solo ida'}</div>
        </div>
        ${hit ? '<span class="status landed">Objetivo alcanzado</span>' : ''}
      </div>
      <div class="price-now ${hit ? 'hit' : ''}">${last ? money(last.price, r.currency) : 'Sin precios registrados'}</div>
      <div class="target">Objetivo: ${money(r.target, r.currency)}${min !== null ? ` · Mínimo visto: ${money(min, r.currency)}` : ''}</div>
      ${sparkline(r)}
      <form class="price-entry" data-act="addprice">
        <input name="price" type="number" min="0" step="1" placeholder="Precio visto hoy (${r.currency})" required>
        <button class="primary" type="submit">Registrar</button>
      </form>
      ${r.prices.length ? `<ul class="history">${[...r.prices].reverse().slice(0, 10).map(p => `<li>${fmtStamp(p.at)}: ${money(p.price, r.currency)}</li>`).join('')}</ul>` : ''}
      <div class="card-actions">
        <a class="ghost" href="${searchLink(r)}" target="_blank" rel="noopener">Buscar en Google Flights ↗</a>
        <button data-act="remove" class="ghost danger">Quitar</button>
      </div>
    </article>`;
  }

  function renderRoutes() {
    const list = [...S().routes].sort((a, b) => a.depart.localeCompare(b.depart));
    $('#routeList').innerHTML = list.length
      ? list.map(routeCard).join('')
      : '<div class="empty">No vigilas ninguna ruta. Agrega origen, destino, fecha y precio objetivo arriba.</div>';
  }

  $('#routeForm').depart.min = today();
  $('#routeForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = {
      id: Store.uid(),
      from: fd.get('from').trim().toUpperCase(),
      to: fd.get('to').trim().toUpperCase(),
      depart: fd.get('depart'),
      return: fd.get('return') || '',
      target: Number(fd.get('target')),
      currency: fd.get('currency'),
      prices: [],
    };
    if (!/^[A-Z]{3}$/.test(r.from) || !/^[A-Z]{3}$/.test(r.to)) return toast('Usa códigos IATA de 3 letras, por ejemplo MEX o MAD.');
    if (r.return && r.return < r.depart) return toast('La fecha de regreso es anterior a la salida.');
    S().routes.push(r);
    Store.save();
    e.target.reset();
    renderRoutes();
  });

  $('#routeList').addEventListener('submit', e => {
    if (e.target.dataset.act !== 'addprice') return;
    e.preventDefault();
    const id = e.target.closest('[data-id]').dataset.id;
    const r = S().routes.find(x => x.id === id);
    const price = Number(e.target.price.value);
    if (!(price > 0)) return;
    r.prices.push({ at: new Date().toISOString(), price });
    Store.save();
    if (price <= r.target) notify(`Precio objetivo ${r.from}→${r.to}`, `${money(price, r.currency)} (objetivo ${money(r.target, r.currency)})`);
    renderRoutes();
  });

  $('#routeList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act="remove"]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const r = S().routes.find(x => x.id === id);
    if (!confirm(`¿Dejar de vigilar ${r.from} → ${r.to}? Se borrará su historial de precios.`)) return;
    S().routes = S().routes.filter(x => x.id !== id);
    Store.save();
    renderRoutes();
  });

  // ================= AJUSTES =================
  function loadSettings() {
    const s = S().settings;
    document.querySelectorAll('input[name="provider"]').forEach(r => { r.checked = r.value === s.provider; });
    $('#apiKey').value = s.apiKey || '';
    $('#autoInterval').value = String(s.autoInterval || 0);
    $('#quotaLimit').value = s.quotaLimit;
    renderQuota();
  }

  $('#saveAuto').addEventListener('click', () => {
    const autoInterval = Number($('#autoInterval').value);
    const quotaLimit = Math.max(1, Math.floor(Number($('#quotaLimit').value) || 100));
    const s = S().settings;
    // Aviso de consumo: consultas por hora × vuelos activos.
    const active = S().flights.filter(f => isNearToday(f.date) && !FINAL.includes(f.lastStatus)).length;
    if (s.provider === 'aviationstack' && autoInterval > 0 && active > 0) {
      const perDay = Math.round((24 * 60 / autoInterval) * active);
      if (!confirm(`Con ${active} vuelo(s) activo(s), esto puede usar hasta ${perDay} consultas al día si dejas la app abierta. Tu límite es ${quotaLimit} al mes. ¿Continuar?`)) return;
    }
    S().settings = { ...s, autoInterval, quotaLimit };
    Store.save();
    scheduleAuto();
    renderQuota();
    $('#autoMsg').textContent = autoInterval ? `Se actualizará cada ${autoInterval} min.` : 'Actualización automática desactivada.';
  });

  $('#saveSettings').addEventListener('click', () => {
    const provider = document.querySelector('input[name="provider"]:checked')?.value || 'demo';
    const apiKey = $('#apiKey').value.trim();
    if (provider === 'aviationstack' && !apiKey) {
      $('#settingsMsg').textContent = 'Para usar AviationStack necesitas una clave API.';
      return;
    }
    S().settings = { ...S().settings, provider, apiKey };
    Store.save();
    renderBadge();
    $('#settingsMsg').textContent = 'Ajustes guardados.';
  });

  $('#enableNotif').addEventListener('click', async () => {
    if (!('Notification' in window)) return ($('#notifMsg').textContent = 'Este navegador no admite notificaciones.');
    const p = await Notification.requestPermission();
    $('#notifMsg').textContent = p === 'granted' ? 'Notificaciones activadas.' : 'Permiso no concedido.';
  });

  $('#exportData').addEventListener('click', () => {
    const data = { ...S(), settings: { ...S().settings, apiKey: '' } }; // nunca exportar la clave
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${today()}_Arcadia_Flight_Monitor_respaldo.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#importData').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.flights) || !Array.isArray(data.routes)) throw new Error('formato');
      if (!confirm('Esto reemplazará los vuelos y rutas actuales. ¿Continuar?')) return;
      data.settings = { ...S().settings }; // conservar ajustes y clave locales
      Store.replaceAll(data);
      renderAll();
      toast('Respaldo importado.');
    } catch (err) {
      toast('El archivo no es un respaldo válido.');
    } finally {
      e.target.value = '';
    }
  });

  function renderAll() { renderBadge(); loadSettings(); renderFlights(); renderRoutes(); scheduleAuto(); }
  renderAll();
  // Para pruebas desde la consola.
  window.AFM = { autoRefresh };
})();
