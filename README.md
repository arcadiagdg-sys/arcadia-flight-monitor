# Arcadia Flight Monitor

App web para seguir el **estado de vuelos** y **vigilar precios** de rutas.
Creada el 2026-11-16.

## Cómo abrirla
Haz doble clic en `index.html`. No requiere instalar nada.

## Funciones
- **Estado de vuelos:** agrega un número de vuelo y una fecha. Muestra estado, horarios programados, estimados y reales, terminal, puerta y retraso. Si el estado cambia al actualizar, avisa.
- **Precios:** agrega una ruta (origen, destino, fechas), un precio objetivo y una moneda (MXN, USD o EUR). Registra los precios que veas; la app guarda el historial, dibuja la tendencia y avisa cuando un precio llega al objetivo o queda por debajo. Incluye un enlace a Google Flights con la búsqueda ya armada.
- **Ajustes:** fuente de datos, notificaciones del navegador y respaldo/importación en JSON.

## Fuentes de datos
| Modo | Qué hace | Envío externo |
|---|---|---|
| Demo (predeterminado) | Datos **simulados**; sirven solo para probar la interfaz | Ninguno |
| AviationStack | Estado real de vuelos cercanos a hoy. Requiere clave gratuita en aviationstack.com (~100 consultas/mes) | Número de vuelo y clave a api.aviationstack.com |

Los precios **no** se consultan automáticamente: se registran a mano. Las APIs de tarifas requieren contrato o servidor propio (pendiente).

## Privacidad
Todo se guarda en el navegador (localStorage) del equipo donde abras la app. La clave API nunca se incluye en el respaldo exportado.

## Estructura
```
index.html        Interfaz
styles.css        Estilos (modo claro y oscuro)
js/storage.js     Persistencia local
js/providers.js   Fuentes de estado de vuelo (demo, AviationStack)
js/app.js         Lógica de pantallas
```

## Pendientes / siguientes pasos
- Consulta automática de precios (requiere un pequeño servidor y una API de tarifas).
- Actualización automática periódica del estado de vuelos.
- Migrar a React + Vite y publicar en GitHub (requiere instalar Node.js y git).
