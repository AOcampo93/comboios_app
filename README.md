# 🚆 comboios.live (fork)

Fork del trabajo original de [@joaodcp](https://github.com/joaodcp/cp-rt-ui) con
mejoras de visualización en vivo, PWA mobile-first, y conexión opcional a un
backend histórico propio (Backend B).

## Features añadidas a este fork

### En vivo (no requieren histórico)

- **Heading del tren**: el icono apunta en la dirección real de movimiento,
  calculado vía `turf.bearing` entre polls consecutivos. Una flecha blanca
  (capa `vehicle-arrow`, halo oscuro) marca la dirección por delante del punto,
  visible desde zoom 6.
- **ETA real por parada**: lista completa del trayecto en el panel de detalle
  con próxima parada destacada, paradas pasadas/futuras diferenciadas, ETA
  realtime + delay por parada.
- **Tendencia del retraso**: flecha roja/verde junto al delay cuando éste sube
  o baja entre polls (con threshold de 30s para filtrar ruido).
- **ETA físico GPS**: cálculo alternativo proyectando posición + velocidad
  contra la geometría de la ruta (`turf.nearestPointOnLine` + `turf.lineSlice`).
  Mostrado junto al ETA de CP; resaltado cuando difieren >2 min.
- **Contador de tiempo en estación**: en `AT_STATION`/`AT_ORIGIN`, pill en vivo
  con segundos transcurridos desde llegada vs dwell programado. Persiste en
  `sessionStorage` para sobrevivir refresh.

### UI / navegación

- **Panel de detalle unificado** (`components/DetailPanel`): al seleccionar un
  tren o una estación se abre un único panel deslizable — lateral derecho en
  desktop (retraíble a una pestaña en el borde), bottom sheet con 3 snap points
  en mobile (vaul). Sustituye al popup de MapLibre y al bottom sheet anterior;
  seleccionar otra entidad reemplaza el contenido. `VehicleDetailContent` /
  `StationDetailContent` renderizan el cuerpo según el tipo seleccionado.
- **Estaciones marcadas**: cada estación se dibuja como un punto azul pequeño
  (`#0B6CF2`) desde zoom 7.

### PWA

- `app/manifest.ts` con iconos placeholder (192/512/maskable).
- Service worker via Serwist (`app/sw.ts`, isolated tsconfig).

### Histórico (Backend B opcional)

- **`ReliabilityBadge`** en el panel de detalle — score de puntualidad
  histórica. Mientras Backend B no tiene data suficiente, muestra placeholder
  "in Nd".
- **`ReliabilityPanel`** — gráfico de 7 barras de puntualidad por día de la
  semana, con la línea del tren y atraso medio/P90.
- **ETA ajustada** — junto a cada parada próxima, el atraso histórico habitual
  para el día de hoy ("habitual +4m"). Vía `hooks/usePredictions.ts`.
- **Panel de puntualidad de la estación** (`StationReliabilityPanel`) — al
  seleccionar una estación: % de trenes a la hora, veredicto en texto y
  llegadas recientes con horario previsto vs real. Vía
  `hooks/useStationReliability.ts`.
- **Mapa de calor de la red** — toggle siempre disponible en la barra superior.
  Dibuja toda la red ferroviaria coloreada por velocidad media histórica
  (rojo→amarillo→verde) y cada estación como marcador. La capa va por debajo de
  trenes y estaciones y es semitransparente; la leyenda muestra los rangos de
  km/h. Con el heatmap apagado las vías siguen resaltadas con una línea verde
  punteada.

Endpoints en `app/api/`:

- `GET /api/reliability/train/[number]` — score + `byDayOfWeek[]` + línea (lee
  de `station_dwell_events` con fallback a `train_snapshots`).
- `GET /api/reliability/station/[code]` — % de puntualidad de la estación,
  trenes distintos, atraso medio/P90 y llegadas recientes (previsto vs real).
- `GET /api/predictions/train/[number]` — atraso medio histórico por (estación,
  día de la semana).
- `GET /api/heatmap/speed` — FeatureCollection de segmentos por velocidad media.
- `GET /api/heatmap/dwell` — detención media por estación + exceso sobre horario.
- `GET /api/stats/line/[code]` — score a nivel de línea (`code` = GTFS route_id).
- `GET /api/history/train/[number]` — últimos N snapshots para replay.

Si no se configura `DATABASE_URL`, los endpoints retornan 404 y el frontend
oculta las secciones históricas. La app sigue funcionando solo con el feed real.

> **Nota — endpoint de trips:** Backend A (`comboios.live/api/trips/*`) devuelve
> un trip vacío actualmente. `app/api/trips/[tripNumber]` hace fallback al
> horario estático GTFS de Backend B para reconstruir las paradas del tren
> (objetos con `source: "gtfs-schedule"`). Sin Backend B, la lista de paradas
> degrada con elegancia. Si Backend A se recupera, tiene prioridad automática.

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
    reliability/train/[n]/  score histórico + byDayOfWeek + línea
    reliability/station/[c]/ % puntualidad estación + llegadas recientes
    predictions/train/[n]/  atraso medio por (estación, día)
    heatmap/speed/          segmentos por velocidad media
    heatmap/dwell/          detención media + exceso por estación
    stats/line/[c]/         score a nivel de línea
    trips/[tripNumber]/     trip realtime, con fallback a GTFS de Backend B
  manifest.ts               PWA manifest
  sw.ts                     Service worker (Serwist, tsconfig.sw.json aparte)
  layout.tsx                Meta tags + viewport
  page.tsx                  Mapa + panel de detalle + estado global + heatmap de red
components/
  DetailPanel/              Panel deslizable único (tren o estación)
                            + VehicleDetailContent / StationDetailContent
  TrainStopsList/           Lista de paradas + hint de ETA ajustada
  StationDwellTimer/        Contador en vivo + comparación con dwell programado
  ReliabilityBadge/         Badge de score, placeholder cuando no hay data
  ReliabilityPanel/         Gráfico de puntualidad por día de la semana
  StationReliabilityPanel/  Puntualidad de la estación + llegadas recientes
hooks/
  useReliability.ts         SWR hook contra /api/reliability/train/[n]
  useStationReliability.ts  SWR hook contra /api/reliability/station/[c]
  usePredictions.ts         SWR hook contra /api/predictions/train/[n]
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
