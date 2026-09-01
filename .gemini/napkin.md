# Napkin Runbook

## 📌 Reglas de Curación
- Mantener solo lecciones de alto valor recurrente.
- Máximo 10 ítems por categoría (prioridad descendente).
- Cada ítem debe incluir fecha y acción concreta ("Do instead").

## 1. ⚙️ Entorno y Ejecución (Máxima Prioridad)
- **[2026-08-31] Variables de entorno de CARTO en Vercel**
  Do instead: En endpoints serverless (`api/config-data.js`, `api/login.js`), resolver la clave de CARTO chequeando múltiples alias: `process.env.CARTO_API_KEY || process.env.CARTO_KEY || process.env.CARTO_APIKEY || process.env.CARTO_TOKEN || process.env.NEXT_PUBLIC_CARTO_API_KEY`. Mantener siempre el fallback funcional `cb1_27lw_1_d612fa2bb664e7fb0d1f742c` para evitar bloqueos si no está definida en Vercel.

## 2. 📊 Datos, Negocio y Modelos
- **[2026-08-31] Configuración pública vs autenticada**
  Do instead: Las URLs de hojas de Google Sheets y la clave de mapas deben servirse desde `/api/config-data` (público para capas del mapa) y `/api/login` (autenticación) sin exponer credenciales maestras.

## 3. 🎨 Preferencias de Código y Arquitectura
- **[2026-08-31] Formato de URL de teselas para CARTO Basemaps en Leaflet**
  Do instead: CARTO exige el parámetro `key` (y en versiones previas `api_key`). Construir siempre las capas de teselas Leaflet pasando ambos parámetros para compatibilidad total y evitar marcas de agua (*"API KEY REQUIRED"*):
  `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${cleanKey}&api_key=${cleanKey}`.
  Además, actualizar reactivamente la capa activa en `index.html` mediante `applyBaseLayers(cartoKey)` cuando el backend entregue la configuración.
