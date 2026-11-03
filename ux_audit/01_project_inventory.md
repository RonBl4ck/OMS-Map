# FASE 1: Inventario Completo del Producto y Mapeo Funcional
**Proyecto:** OMS Map — Pluz Energía  
**Rol:** Senior Product Director & Lead UX/UI Information Architect  
**Fecha de Auditoría:** Noviembre 2026  
**Fuentes Analizadas:** `index.html`, `PRODUCT.md`, `docs/superpowers/specs/`, `assets/js/*.js`, `assets/css/*.css`, API Endpoints.

---

## 1. Resumen Ejecutivo del Producto

**OMS Map** es una plataforma operativa web de misión crítica en tiempo real utilizada para el monitoreo, asignación, despacho y control de emergencias eléctricas de baja y media tensión en el área de concesión de **Pluz Energía** (Lima Norte y zonas de concesión asociadas).

La aplicación opera bajo una arquitectura híbrida:
- **Frontend:** SPA (Single Page Application) ligera construida en Vanilla JavaScript, Leaflet, PapaParse, Chart.js y CSS modular con diseño tokenizado.
- **Backend / Seguridad:** Node.js Serverless en Vercel (`/api/login`, `/api/config-data`, `/api/update-supervisor-status`, `/api/update-users`, `/api/verify-config-pin`), protegiendo credenciales y llaves de mapas.
- **Persistencia Dinámica:** Google Sheets en la nube como base de datos reactiva para incidencias pendientes, ejecutados, llamadas de clientes, cuadrillas técnicas, SEDs críticas y auditoría de supervisión.

---

## 2. Inventario de Pantallas, Vistas y Modales

Actualmente, la aplicación se estructura alrededor de un **mapa base** sobre el cual se montan 5 vistas de pantalla completa (*overlays/modals full-view*), 6 modales secundarios de diálogo y 1 panel lateral retráctil (*drawer*):

| Identificador UI | Tipo de Contenedor | Nombre Visible | Audiencia / Rol | Propósito Operativo |
| :--- | :--- | :--- | :--- | :--- |
| `#map` | Vista Base (Full Viewport) | **Mapa** | Todos (Admin y Contratistas) | Monitoreo georreferenciado en tiempo real de averías activas, agrupadas por clusters y coloreadas según plazo regulatorio. |
| `#tdOmsModalOverlay` | Pantalla Completa (*Overlay*) | **Indicadores** | Todos (Contratistas filtrados a su empresa) | Tablero ejecutivo de cumplimiento de plazos (<75%, ≥75%, ≥100%), gráficos estadísticos y tabla completa de casos pendientes. |
| `#seguimientoDiaOverlay` | Pantalla Completa (*Overlay*) | **Productividad** | Solo Administrador (PLUZ) | Balance diario de ingresos vs. cierres de averías, gráfico de cascada (*Waterfall*), backlog acumulado y monitor de recurrencia a 7 días. |
| `#tecnicosModalOverlay` | Pantalla Completa (*Overlay*) | **Seguimiento** | Todos (Contratistas filtrados a su empresa) | Monitoreo del ritmo de liquidación de cuadrillas técnicas, horas de primer/último cierre, tiempos sin actividad y alertas >4h. |
| `#historialPluzOverlay` | Pantalla Completa (*Overlay*) | **Historial Pluz** | Solo Administrador (PLUZ) | Registro histórico consolidado de auditoría, criticidades (Quánticos/Críticos) y línea de tiempo por SED o ticket. |
| `#llamadasModalOverlay` | Pantalla Completa (*Overlay*) | **Llamadas** | Solo Administrador (PLUZ) | Registro de contactos telefónicos y reclamos de clientes para correlacionar presión comunitaria con órdenes de avería (ODM). |
| `#configAdminModalOverlay` | Pantalla Completa (*Overlay*) | **Configuración (⚙️)** | Solo Administrador (PLUZ con PIN) | Gestión dinámica de usuarios, cambio de contraseñas de contratistas y sincronización con Google Sheets. |
| `#authModalOverlay` | Modal Bloqueante | **Login / Candado** | Público / No autenticado | Autenticación inicial con selección de perfil y validación de contraseña contra backend. |
| `#configPinModalOverlay` | Modal Diálogo | **PIN de Seguridad** | Administrador (PLUZ) | Desbloqueo mediante contraseña maestra para acceder a credenciales y gestión de accesos. |
| `#supervisorModalOverlay` | Modal Diálogo | **Supervisión PLUZ** | Administrador (PLUZ) | Bitácora individual de seguimiento operativo (JC, fin estimado, novedades) y asignación de criticidad (Quántico/Crítico). |
| `#bulkPluzModalOverlay` | Modal Diálogo | **Ejecución Masiva** | Administrador (PLUZ) | Importador inteligente de texto copiado de Excel (Ticket + JC + Fin Estimado) para pase masivo a estado "En Ejecución". |
| `#techDetailModalOverlay` | Modal Diálogo | **Detalle de Técnico** | Todos | Cronología horaria visual de la jornada del técnico, desglose de tickets atendidos y exportación a Excel. |
| `#callDetailOverlay` | Modal Diálogo | **Detalle de Contacto** | Administrador (PLUZ) | Información detallada de llamada recibida por cliente individual. |
| `#criticalSedDrawer` | Drawer Lateral Retráctil | **Panel SED Crítica** | Administrador (PLUZ) | Análisis histórico multianual (1Y, 6M, 3M, 1M, 7D) de fallas por subestación, alimentadores y llaves. |

---

## 3. Matriz de Funcionalidades y Componentes

### 3.1. Navegación Global y Cabecera (`top-navbar`)
- **Branding:** Isotipo Pluz Energía + Título "OMS MAP Control Operativo".
- **Pestañas de Navegación:** Píldoras horizontales (`Mapa`, `Indicadores`, `Productividad`, `Seguimiento`, `Historial Pluz`, `Llamadas`).
- **Estado de Usuario:** Píldora de usuario activo con botón de Configuración (`⚙️`) y botón de Cerrar Sesión (`🚪`).
- **KPIs en Vivo de Cabecera:**
  - Contador de averías pendientes de baja tensión (`Pend. BT`).
  - Marca temporal de última sincronización (`Subida 🕒 DD/MM HH:MM`).
- **Acciones Globales:** Botones de descarga rápida de datasets en bruto: `📥 Pend.` (CSV de pendientes) y `📥 Ejec.` (CSV de ejecutados).

### 3.2. Módulo de Mapa (`10-map.js`, `components/mapManager.js`, `components/markersManager.js`)
- **Renderizado Cartográfico:** Leaflet 1.9.4 con mosaicos vectoriales oscuros/claros de CARTO Basemaps.
- **Clustering:** Agrupación inteligente mediante Leaflet MarkerCluster con insignias numéricas.
- **Iconografía por Tipo de Falla:** Iconos SVG personalizados para Suministro (4h), Red Aérea (8h), Red Subterránea (12h/8h), Fusible (4h) y Poste (8h).
- **Semáforo de Plazo (Borde y Halo):**
  - Verde: `< 75%` del plazo regulatorio transcurrido.
  - Ámbar: `≥ 75%` y `< 100%` del plazo transcurrido (próximo a vencer).
  - Rojo: `≥ 100%` del plazo transcurrido (vencido / fuera de plazo).
- **Perímetros de Subestaciones (SEDs):** Polígonos convexos generados a partir de las coordenadas de las averías asociadas (`sed-geometry.js` y `sedCloudsManager.js`).
- **Barra de Búsqueda y Filtros de Mapa (`#mapSearchToolbar`):**
  - Selector de criterio: Ticket/ODM, SED, Alimentador, o Dirección/Referencia.
  - Geocodificador de direcciones locales con autocompletado y centrado de cámara.
  - Filtros multi-selección desplegables: Día, Estado de avería, Empresa contratista, Tipo de falla.
  - Filtros rápidos tipo checkbox:
    - `📞 ≥7 Llamadas`: Incidencias con alta presión social.
    - `🚨 SED >2`: Subestaciones con reincidencia en los últimos 7 días.
    - `👤 Sum. ≥2`: Clientes/suministros con fallas reiteradas en 7 días.
    - `🚨 Top Críticas`: SEDs marcadas como severidad alta.
  - Botón de reinicio rápido de filtros (`Limpiar`).
- **Leyenda Interactiva (`#mapEmojiLegend`):** Panel desplegable en la esquina inferior derecha con código visual de iconos y tiempos de plazo.
- **Popups de Avería (`mapPopups.js`):** Ficha técnica con ticket, ODM, dirección, tiempo transcurrido, plazo máximo, botón directo para abrir la bitácora de supervisión y botón para abrir el análisis histórico de la SED.

### 3.3. Módulo de Indicadores TD OMS (`20-dashboard.js`, `components/dashboardManager.js`, `components/chartsManager.js`)
- **KPI Cards Ejecutivas:** Total de incidencias, dentro de plazo, próximas a vencer y fuera de plazo (con porcentajes relativos).
- **Barra de Filtros del Dashboard:** Multi-selects paralelos a los del mapa (Día, Intervalo, Empresa, Tipo de Falla, Estado) más checkboxes especializados (`Excedidos de tiempo`, `Quántico / Crítico`).
- **Generador de Reportes a Contratistas (`25-contractor-report.js`):**
  - Se activa reactivamente al aislar una empresa contratista.
  - `📸 Reporte Completo`: Renderiza en un Canvas HTML5 a 2x de resolución una lámina ejecutiva con logo de Pluz, KPIs, 4 gráficos y texto resumen, inyectándolo al portapapeles.
  - `📊 Solo Gráficos` / `📝 Solo Texto`: Variantes optimizadas para despachos rápidos por WhatsApp o Teams.
- **Gráficos Estadísticos:**
  1. Evolución por día / hora de ingreso.
  2. Carga operativa por contratista.
  3. Composición por tipo de falla.
  4. Antigüedad de casos por intervalo de horas.
- **Tabla de Casos Pendientes:**
  - 13 columnas ordenables en ambos sentidos (Ticket, ODM, Inicio, SED, Falla, Llamadas, Estado, Empresa, Intervalo, Alimentador, Afectación, Estado PLUZ, Criticidad PLUZ).
  - Buscador rápido local sobre la tabla.
  - Exportación directa a Excel (.xlsx).
  - Acciones contextuales por fila (abrir supervisión, abrir SED crítica).
  - Botón de acción masiva: `⚡ EJECUCIÓN (PLUZ)`.

### 3.4. Módulo de Productividad y Balance Diario (`22-seguimiento-dia.js`)
- **Propósito:** Análisis del flujo neto de atención de averías (inflow vs. outflow) para evaluar si el backlog crece o se reduce.
- **Control de Vistas:** Modo 7 Días acumulado vs. Modo Diario detallado.
- **Gráficos Avanzados:**
  - Gráfico de Cascada (*Waterfall*): Averías iniciales + Ingresos nuevos - Cierres realizados = Backlog remanente.
  - Comparativa de volumen de cierres por contratista.
- **Monitor de Recurrencia a 7 Días:** Pestañas dedicadas para inspeccionar subestaciones (SEDs) y suministros individuales que han registrado 2 o más interrupciones consecutivas.

### 3.5. Módulo de Seguimiento de Cuadrillas Técnicas (`40-tecnicos.js`)
- **Métricas Clave:** Técnicos activos en jornada, total de trabajos cerrados, tiempo promedio transcurrido desde el último cierre y alertas de técnicos sin producción > 4 horas.
- **Buscador Global Inteligente:** Localiza al instante a un técnico por nombre, ticket o empresa.
- **Filtros Especializados:** Fecha, Contratista, Nombre de técnico, Especialidad/Skill, Zona/SET y Estado.
- **Tabla Maestra de Técnicos:**
  - Registro cronológico detallado de cada operario.
  - Columnas inmutables por regla de negocio: **Primer cierre** y **Último cierre** (imprescindibles para medir la jornada real en campo).
  - Indicador de alerta visual por inactividad.
- **Modal de Detalle y Cronología por Técnico (`#techDetailModalOverlay`):**
  - Gráfico de línea temporal horizontal (*Timeline Track*) que mapea cada cierre del día.
  - Métricas de ritmo (tiempo entre cierres, ventana total de actividad).
  - Tabla de órdenes cerradas con exportación individual a Excel.

### 3.6. Módulo de Historial y Auditoría de Supervisión (`45-historial-pluz.js`)
- **Enfoque:** Trazabilidad integral de decisiones de supervisión y gestión de casos de alto impacto (*Quánticos* y *Críticos*).
- **KPIs Resumen:** Volumen de casos quánticos, críticos y total de SEDs afectadas.
- **Vista de Tarjetas de Acordeón:** Agrupación cronológica por SED y ticket, desplegando el historial completo de cambios de estado, notas operativas, jefes de cuadrilla asignados y horas estimadas de normalización.
- **Exportación:** Descarga del histórico completo de supervisión en formato tabular.

### 3.7. Módulo de Señales y Llamadas (`30-llamadas.js`)
- **Propósito:** Captura temprana de la afectación percibida por los clientes antes de que las averías se reflejen formalmente en los sistemas de telecontrol.
- **KPIs de Llamadas:** Total contactos, órdenes con llamadas asociadas, contactos reiterados y casos de alta presión (≥7 llamadas).
- **Tabla de Llamadas:** Detalle de avisos con suministro, cliente, dirección, hora de registro y nota del call center. Paginación bajo demanda (*infinite scroll / load more*).
- **Detalle de Contacto:** Modal secundario con desglose del reclamo.

### 3.8. Herramientas de Supervisión y Administración
- **Bitácora Individual de Supervisión (`#supervisorModalOverlay`):** Interfaz para registrar en tiempo real el Jefe de Cuadrilla (JC), Fin Estimado, Estado Operativo (Pendiente, En Camino, En Ejecución, Impedido, Derivado, C. Campo) y Criticidad (Normal, Quántico, Crítico, Vencido). Sincroniza atómicamente con Google Sheets.
- **Importador Masivo de Ejecución (`#bulkPluzModalOverlay`):** Parser con detección de patrones tabulares desde el portapapeles. Cruza los tickets pegados con las averías activas y actualiza en masa la supervisión en Google Sheets.
- **Gestión de Accesos y Seguridad (`70-admin.js`):** Panel restringido por PIN para crear, deshabilitar y modificar contraseñas de contratistas directamente en la hoja `ACCESOS` de Google Sheets.

---

## 4. Mapeo de Flujos de Trabajo Principales (Jobs-to-be-Done)

### Flujo 1: Despacho y Mitigación de Emergencias en Vivo (Supervisor PLUZ)
1. El supervisor ingresa a **Mapa** y visualiza la distribución geográfica de averías.
2. Identifica puntos rojos (≥100% plazo vencido) o ámbar (≥75% por vencer), así como clusters con banderas de `≥7 Llamadas` o `Top Críticas`.
3. Hace clic en una avería crítica para inspeccionar el popup (alimentador, SED, clientes afectados).
4. Abre la ventana de **Supervisión PLUZ**, asigna un Jefe de Cuadrilla (JC), fija una hora estimada de reposición y define la criticidad (Quántico/Crítico).
5. Si la cuadrilla ya está en el terreno, abre el importador masivo (`EJECUCION (PLUZ)`) y pega la lista de brigadas reportadas por radio/WhatsApp para pasarlas en lote a "EN EJECUCIÓN".

### Flujo 2: Monitoreo de Productividad y Cumplimiento de Plazos (Jefatura de Operaciones)
1. La jefatura abre **Indicadores** para evaluar el balance global de la jornada: porcentaje de casos dentro de plazo versus vencidos.
2. Filtra por un contratista específico (ej. `DOMINION`).
3. Analiza los gráficos de tipos de falla y tiempos de atención.
4. Presiona el botón dinámico `📸 Reporte Completo [DOMINION]` para copiar al portapapeles la imagen ejecutiva oficial con gráficos y texto, compartiéndola de inmediato en el grupo de control operativo de WhatsApp/Teams.
5. Pasa a la pestaña **Productividad** para revisar el gráfico de cascada (*Waterfall*) y comprobar si el backlog del contratista creció respecto a la mañana.

### Flujo 3: Control y Seguimiento de Cuadrillas en Campo (Coordinador de Contratista)
1. El coordinador del contratista ingresa con su usuario (ej. `COBRA`).
2. La plataforma restringe automáticamente la vista a los datos de su empresa.
3. Ingresa a **Seguimiento** para verificar qué técnicos están activos hoy.
4. Detecta cuadrillas en alerta (*Sin cierre >4 horas*).
5. Abre el **Detalle de Técnico** para revisar la cronología horaria: a qué hora cerró su primer trabajo, a qué hora el último, y qué ritmo de atención mantiene.
6. Exporta la lista de tickets del técnico a Excel para su liquidación interna de jornales.

### Flujo 4: Detección Temprana de Afectaciones Masivas no Reportadas
1. El supervisor monitorea la pestaña **Llamadas**.
2. Filtra por casos con "Contactos reiterados" (≥2) o "Alta presión" (≥7).
3. Identifica una concentración inusual de reclamos en una misma calle o subestación antes de que el sistema SCADA reporte la apertura de un fusible.
4. Cruza los datos con la vista de **Mapa** mediante búsqueda de dirección/SED para despachar una brigada preventiva.

---

## 5. Clasificación Funcional (Jerarquía de Valor Operativo)

| Categoría | Funcionalidades | Justificación Operativa |
| :--- | :--- | :--- |
| **Primarias (Core)** | • Visualización de mapa en tiempo real con semáforo de plazos.<br>• Indicadores ejecutivos y control de plazos.<br>• Seguimiento de cuadrillas y ritmo de cierres de técnicos.<br>• Registro individual y masivo de Supervisión PLUZ. | Constituyen el corazón de la operación 24/7. Sin ellas, el despacho de emergencias se paraliza. |
| **Secundarias (Soporte)** | • Balance diario de productividad y cascada (Waterfall).<br>• Historial cronológico de auditoría PLUZ.<br>• Generador de reportes visuales para WhatsApp.<br>• Registro y búsqueda de llamadas de clientes. | Aportan valor analítico, trazabilidad y comunicación operativa externa, pero no detienen el despacho inmediato. |
| **Complementarias (Utilidades)** | • Drawer de análisis histórico multianual de SEDs Críticas.<br>• Geocodificador de direcciones de texto en el mapa.<br>• Panel de administración de contraseñas de contratistas.<br>• Exportadores ad-hoc a Excel y CSV. | Herramientas de soporte diagnóstico, mantenimiento del sistema o análisis post-operativo. |

---

## 6. Conclusión de la Fase 1

El inventario evidencia una herramienta de altísimo valor funcional y madurez de negocio, pero cuya evolución orgánica ha generado una **fragmentación excesiva en 6 pestañas principales, múltiples modales superpuestos y barras de filtros desconectadas**. 

La siguiente fase auditará la arquitectura de información para identificar fricciones cognitivas, duplicidades y oportunidades de consolidación estructural.
