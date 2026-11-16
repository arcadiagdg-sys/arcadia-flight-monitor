// Persistencia local (solo en este navegador).
const Store = (() => {
  const KEY = 'arcadia-flight-monitor-v1';
  const defaults = () => ({
    settings: { provider: 'demo', apiKey: '' },
    flights: [],   // { id, flight, date, note, lastStatus, lastData, updatedAt }
    routes: [],    // { id, from, to, depart, return, target, currency, prices: [{at, price}] , alerted }
  });

  let state;
  try {
    state = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) {
    state = defaults();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* almacenamiento no disponible */ }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function replaceAll(data) {
    state = Object.assign(defaults(), data);
    save();
  }

  return { get state() { return state; }, save, uid, replaceAll };
})();
