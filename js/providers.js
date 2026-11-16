// Fuentes de datos de estado de vuelo.
// Todas devuelven un objeto normalizado:
// { status, airline, flight, dep: {iata, airport, scheduled, estimated, actual, terminal, gate, delay},
//   arr: {...igual}, source }

const Providers = (() => {

  // ---------- DEMO (datos simulados, deterministas por vuelo+fecha) ----------
  const AIRPORTS = [
    ['MEX', 'Ciudad de México'], ['CUN', 'Cancún'], ['MID', 'Mérida'], ['VSA', 'Villahermosa'],
    ['GDL', 'Guadalajara'], ['MTY', 'Monterrey'], ['MAD', 'Madrid'], ['JFK', 'Nueva York JFK'],
    ['MIA', 'Miami'], ['LAX', 'Los Ángeles'], ['BOG', 'Bogotá'], ['CDG', 'París CDG'],
  ];
  const AIRLINES = { AM: 'Aeroméxico', Y4: 'Volaris', VB: 'Viva Aerobus', IB: 'Iberia', AA: 'American Airlines', UA: 'United', DL: 'Delta', AV: 'Avianca', AF: 'Air France' };
  const STATUSES = ['scheduled', 'scheduled', 'active', 'landed', 'delayed', 'delayed', 'cancelled'];

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  async function demo(flight, date) {
    await new Promise(r => setTimeout(r, 250));
    const h = hash(flight + date);
    const a = AIRPORTS[h % AIRPORTS.length];
    let b = AIRPORTS[(h >>> 4) % AIRPORTS.length];
    if (b[0] === a[0]) b = AIRPORTS[(AIRPORTS.indexOf(a) + 3) % AIRPORTS.length];
    const status = STATUSES[(h >>> 8) % STATUSES.length];
    const depHour = 6 + ((h >>> 12) % 15);
    const depMin = ((h >>> 16) % 4) * 15;
    const durMin = 75 + ((h >>> 18) % 9) * 30;
    const delay = status === 'delayed' ? 20 + ((h >>> 20) % 6) * 15 : 0;
    const dep = new Date(`${date}T${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}:00`);
    const arr = new Date(dep.getTime() + durMin * 60000);
    const add = (d, m) => new Date(d.getTime() + m * 60000).toISOString();
    const prefix = flight.slice(0, 2);
    return {
      status,
      airline: AIRLINES[prefix] || 'Aerolínea (demo)',
      flight,
      dep: {
        iata: a[0], airport: a[1], scheduled: dep.toISOString(),
        estimated: delay ? add(dep, delay) : null,
        actual: ['active', 'landed'].includes(status) ? add(dep, 5) : null,
        terminal: String(1 + (h % 2)), gate: String.fromCharCode(65 + (h % 6)) + (1 + (h >>> 3) % 30), delay,
      },
      arr: {
        iata: b[0], airport: b[1], scheduled: arr.toISOString(),
        estimated: delay ? add(arr, delay) : null,
        actual: status === 'landed' ? add(arr, 2) : null,
        terminal: String(1 + ((h >>> 2) % 2)), gate: null, delay,
      },
      source: 'demo',
    };
  }

  // ---------- AVIATIONSTACK ----------
  // Documentación: https://aviationstack.com/documentation
  // El plan gratuito solo admite HTTP (no HTTPS).
  async function aviationstack(flight, date, apiKey) {
    if (!apiKey) throw new Error('Falta la clave API de AviationStack (Ajustes).');
    const url = new URL('http://api.aviationstack.com/v1/flights');
    url.searchParams.set('access_key', apiKey);
    url.searchParams.set('flight_iata', flight);
    const res = await fetch(url.toString());
    let json;
    try { json = await res.json(); } catch (e) { json = {}; }
    if (json.error) {
      const code = json.error.code || '';
      const msg = {
        invalid_access_key: 'La clave API no es válida. Revísala en Ajustes.',
        missing_access_key: 'Falta la clave API de AviationStack (Ajustes).',
        usage_limit_reached: 'Se agotaron las consultas del mes de tu plan de AviationStack.',
        function_access_restricted: 'Tu plan de AviationStack no incluye esta consulta.',
      }[code];
      throw new Error(msg || json.error.message || json.error.info || 'Error de AviationStack');
    }
    if (!res.ok) throw new Error(`AviationStack respondió ${res.status}`);
    const list = json.data || [];
    // Elegir el registro cuya fecha de salida coincide con la fecha pedida.
    const match = list.find(f => (f.flight_date || '').startsWith(date)) || null;
    if (!match) throw new Error(`No hay datos para ${flight} el ${date}. AviationStack solo cubre vuelos cercanos a hoy.`);
    const leg = x => ({
      iata: x.iata, airport: x.airport, scheduled: x.scheduled, estimated: x.estimated,
      actual: x.actual, terminal: x.terminal, gate: x.gate, delay: x.delay || 0,
    });
    let status = match.flight_status || 'unknown';
    if (status === 'scheduled' && (match.departure?.delay || 0) >= 15) status = 'delayed';
    return {
      status,
      airline: match.airline?.name || '',
      flight: match.flight?.iata || flight,
      dep: leg(match.departure || {}),
      arr: leg(match.arrival || {}),
      source: 'aviationstack',
    };
  }

  async function lookup(flight, date, settings) {
    if (settings.provider === 'aviationstack') return aviationstack(flight, date, settings.apiKey);
    return demo(flight, date);
  }

  return { lookup };
})();
