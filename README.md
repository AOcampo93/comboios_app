# 🚆 comboios.live (fork)

Fork del trabajo original de [@joaodcp](https://github.com/joaodcp/cp-rt-ui) con
mejoras de visualización en vivo, PWA mobile-first, y conexión opcional a un
backend histórico propio (Backend B).

## Features añadidas a este fork

### En vivo (no requieren histórico)

- **Heading del tren**: el icono apunta en la dirección real de movimiento,
  calculado vía `turf.bearing` entre polls consecutivos.
- **ETA real por parada**: lista completa del trayecto en el popup con próxima
  parada destacada, paradas pasadas/futuras diferenciadas, ETA realtime + delay
  por parada.
- **Tendencia del retraso**: flecha roja/verde junto al delay cuando éste sube
  o baja entre polls (con threshold de 30s para filtrar ruido).
- **ETA físico GPS**: cálculo alternativo proyectando posición + velocidad
  contra la geometría de la ruta (`turf.nearestPointOnLine` + `turf.lineSlice`).
  Mostrado junto al ETA de CP; resaltado cuando difieren >2 min.
- **Contador de tiempo en estación**: en `AT_STATION`/`AT_ORIGIN`, pill en vivo
  con segundos transcurridos desde llegada vs dwell programado. Persiste en
  `sessionStorage` para sobrevivir refresh.

### PWA

- `app/manifest.ts` con iconos placeholder (192/512/maskable).
- Service worker via Serwist (`app/sw.ts`, isolated tsconfig).
- Bottom sheet mobile con 3 snap points y gestos swipe (vaul).
- En desktop sigue mostrando el popup tradicional de MapLibre.

### Histórico (Backend B opcional)

- `ReliabilityBadge` en el popup/sheet del tren — score de puntualidad histórica.
  Mientras Backend B no tiene data suficiente, muestra placeholder
  "in Nd" con countdown.
- Endpoints en `app/api/`:
  - `GET /api/reliability/train/[number]` — score de un tren (lee de
    `station_dwell_events` con fallback a `train_snapshots`).
  - `GET /api/history/train/[number]` — últimos N snapshots para replay.
  - `GET /api/stats/line/[code]` — placeholder, pendiente integrar GTFS routes.

Si no se configura `DATABASE_URL`, los endpoints retornan 404 y el frontend
oculta las secciones históricas. La app sigue funcionando solo con el feed real.

## Stack

- Next.js 14 + TypeScript + React 18.
- MapLibre GL via `react-map-gl/maplibre`.
- Tailwind + shadcn-style components.
- SWR para fetching.
- Vaul para bottom sheet.
- Serwist para PWA.
- `pg` para conexión opcional a Backend B.

## Dev local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`. Sin más config, el frontend usa el endpoint
público de comboios.live como fuente de datos en vivo (fallback en
`lib/upstream.ts` cuando `WORKER_BASE_URL` no está set).

### Conectar a un Backend B local (opcional)

Para que el `ReliabilityBadge` muestre datos reales, necesitás un Postgres con
los datos del scraper. Lo más rápido:

```bash
# en el repo del scraper
cd ../comboios_scrapper
docker compose up postgres -d

# cargar seed data (corre migrations + inserta 5 trenes con personalities)
DATABASE_URL='postgres://postgres:postgres@localhost:5432/comboios' npm run seed

# volver al frontend, levantarlo apuntando ahí
cd ../comboios_app
DATABASE_URL='postgres://postgres:postgres@localhost:5432/comboios' npm run dev
```

Click en cualquier tren con número 528, 529, 4401, 4437, o 3401 → badge encendido.

## Variables de entorno

| Var | Required | Notas |
|-----|----------|-------|
| `WORKER_BASE_URL` | no | URL del Cloudflare Worker privado (uso original de Joao). Si no está, fallback al endpoint público de comboios.live. |
| `WORKER_KEY` | no | Bearer token del worker. |
| `DATABASE_URL` | no | Postgres del Backend B. Sin esto los endpoints históricos devuelven 404 y el badge muestra placeholder. |
| `NEXT_PUBLIC_HISTORY_START_DATE` | no | Fecha desde la que el scraper empezó a acumular (formato `YYYY-MM-DD`). Default `2026-05-01`. Se usa para el countdown del badge. |

## Estructura

```
app/
  api/                      Proxy + endpoints de Backend B
    history/train/[n]/      últimos N snapshots
    reliability/train/[n]/  score histórico
    stats/line/[c]/         (placeholder)
  manifest.ts               PWA manifest
  sw.ts                     Service worker (Serwist, tsconfig.sw.json aparte)
  layout.tsx                Meta tags + viewport
  page.tsx                  Mapa + popup + estado global
components/
  TrainStopsList/           Lista de paradas con marcadores past/current/next
  StationDwellTimer/        Contador en vivo + comparación con dwell programado
  VehicleBottomSheet/       Drawer mobile (vaul)
  ReliabilityBadge/         Badge de score, placeholder cuando no hay data
hooks/
  useReliability.ts         SWR hook contra /api/reliability/train/[n]
lib/
  upstream.ts               Fallback de proxy worker→público
  historyDb.ts              pg pool opcional para Backend B
utils/
  eta.ts                    computePhysicsETA (proyección sobre ruta)
  time.ts                   formatDuration, parseHHMM, scheduledDwellSeconds
  useIsMobile.ts            media query hook
public/icons/               PWA icons (placeholder, reemplazar con branded)
```

## Créditos

Repo original: [joaodcp/cp-rt-ui](https://github.com/joaodcp/cp-rt-ui). Datos en
vivo provistos por Comboios de Portugal vía el worker de joaodcp.
