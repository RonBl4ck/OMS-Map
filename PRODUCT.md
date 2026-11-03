# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Supervisores y Coordinadores de Pluz Energía:** Responsables del centro de control de emergencias, asignación y despacho de recursos, monitoreo de criticidad de SEDs (Subestaciones Eléctricas de Distribución) y cumplimiento normativo de tiempos de atención.
- **Cuadrillas y Contratistas Técnicos en Campo:** Empresas aliadas (COBRA, DOMINION, INMEL, LARI, PA) que atienden incidencias de media y baja tensión, liquidan tickets y reportan actividad operativa desde terreno.

## Product Purpose

Proveer una consola geográfica y analítica unificada en tiempo real para el monitoreo, gestión y despacho de incidencias y averías en la red de distribución eléctrica de Pluz Energía, garantizando el cumplimiento de plazos de atención y el control operativo de cuadrillas contratistas.

## Positioning

Centro de control de emergencias eléctricas operativo y ágil de Pluz Energía: integra cartografía interactiva Leaflet/CARTO, visualización de indicadores y seguimiento de cuadrillas sincronizado directamente con Google Sheets y backend serverless en Vercel, eliminando la dependencia de licencias pesadas de GIS de escritorio sin exponer credenciales críticas.

## Operating Context

- Operación continua 24/7 en centro de control de emergencias eléctricas y acceso móvil en terreno para supervisores de zona.
- Flujo de datos híbrido: backend Serverless en Vercel (`/api/login`, proxies y seguridad de llaves) y sincronización con Google Sheets (averías pendientes, ejecutados, llamadas, técnicos, SEDs críticas y supervisión).
- Entornos de uso variados: estaciones de trabajo multidisplay en sala de operaciones y laptops/tablets bajo condiciones de campo.

## Capabilities and Constraints

- **Vistas Principales:**
  - `Mapa`: Visualización georreferenciada de averías con clustering, filtros por tipo/contratista/zona/criticidad, perímetros SED y popups de inspección técnica.
  - `Indicadores`: Métricas operativas consolidadas, gráficos de rendimiento y tabla detallada de incidencias.
  - `Seguimiento`: Desempeño por contratista, funnel operativo y tabla de cuadrillas con columnas obligatorias `Primer cierre` y `Último cierre`.
  - `Llamadas`: Registro y correlación de reportes de clientes con tickets de avería.
- **Seguridad y Control de Acceso:** Login seguro por rol (`PLUZ` como admin global con PIN maestro para configuración avanzada, y contratistas limitados a su asignación operativa). API Key de mapas protegida en backend.
- **Restricción Terminológica Estricta:** Toda la interfaz y reportes deben emplear el término `plazo` y nunca `SLA`.
- **Integridad de Datos:** Conservación estricta de métricas operativas (`Primer cierre`, `Último cierre`, tiempo transcurrido, alertas de vencimiento de plazo).

## Brand Commitments

- **Identidad:** Pluz Energía oficial (logotipo `PLUZ.png`).
- **Paleta Estructural:** Pluz Dark Blue para encabezados y shell de navegación persistente; Pluz Blue para elementos activos y selección; acento amarillo exclusivo para detalles de marca.
- **Semántica de Estado:** Rojo, ámbar y verde reservados estrictamente para estados de plazo (crítico/por vencer/a tiempo) y severidad operativa. Nunca usar colores de alarma para filtros neutros.
- **Tipografía:** `Inter` para la interfaz general, datos tabulares y métricas; `Outfit` restringida a títulos institucionales y de sección.

## Evidence on Hand

- Código fuente en producción (`index.html`, `server.js`, `assets/css/`, `assets/js/`).
- Especificación arquitectónica y directrices de UI en `docs/superpowers/specs/2026-09-10-oms-map-visual-reform-design.md`.
- Documentación de despliegue y variables de entorno en `README_VERCEL.md`.
- Registros de supervisión y estructura de datos en `data_supervisor_logs.json`.

## Product Principles

- **Prioridad Operativa Inmediata:** La cartografía y el estado de plazos deben ser legibles de un vistazo; la información crítica jamás compite con decoración.
- **Cero Fricción en Despacho:** Filtros accesibles, navegación persistente sin saltos de contexto ni recargas destructivas de estado.
- **Rigor Terminológico y Confianza:** Tiempos exactos, terminología corporativa precisa (`plazo`) y fidelidad total a los cierres de cuadrillas.
- **Sobriedad y Contraste:** Interfaz limpia de centro de mando, donde el color tiene valor funcional inequívoco.

## Accessibility & Inclusion

- Contraste alto para legibilidad en condiciones de campo y bajo luz solar directa.
- Compatibilidad responsiva en pantallas móviles y tablets sin desbordamientos horizontales.
- Identificación de estados no dependiente exclusivamente del color (acompañada de texto explícito de tiempo/estado).
