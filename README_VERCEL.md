# 🚀 Despliegue de OMS Map en Vercel — Arquitectura Segura

Esta carpeta contiene la **Web App Ejecutiva de OMS Map** con backend Serverless seguro en Vercel para protección de credenciales, gestión de contraseñas dinámicas en Google Sheets y control de accesos con PIN maestro.

---

### 🛡️ Novedades de Seguridad:
1. **Contraseñas 100% Ocultas:** El navegador ya no descarga archivos con contraseñas. El login se procesa en el backend (`/api/login`).
2. **Gestión Directa en Google Sheets:** Puedes cambiar contraseñas o agregar contratistas editando una celda en Google Sheets en tiempo real.
3. **PIN Maestro para Configuración:** En el perfil `PLUZ` (Admin), el botón de configuración `⚙️ Config` requiere una contraseña de seguridad para acceder a los datos sensibles.
4. **Protección de API Key de CARTO:** Solo los usuarios logueados reciben la clave para cargar los mapas.

---

### 📊 Paso 1: Configurar la pestaña "ACCESOS" en tu Google Sheet

En tu archivo de Google Sheets, crea una nueva pestaña llamada **ACCESOS** con las siguientes columnas en la fila 1:

| Usuario | Password | Contratista | Rol | Estado |
| :--- | :--- | :--- | :--- | :--- |
| COBRA | TuClaveCobra2026 | COBRA | contractor | activo |
| DOMINION | TuClaveDomi2026 | DOMINION | contractor | activo |
| INMEL | TuClaveInmel2026 | INMEL | contractor | activo |
| LARI | TuClaveLari2026 | LARI | contractor | activo |
| PA | TuClavePa2026 | PA | contractor | activo |
| PLUZ | TuClavePluz2026 | * | admin | activo |

**Cómo publicar solo esta pestaña como CSV:**
1. En Google Sheets ve a: **Archivo** > **Compartir** > **Publicar en la Web**.
2. En la primera lista selecciona únicamente la hoja **ACCESOS**.
3. En la segunda lista selecciona **Valores separados por comas (.csv)**.
4. Haz clic en **Publicar** y copia el enlace generado (ej: `https://docs.google.com/spreadsheets/d/e/.../pub?output=csv&gid=...`).

---

### ⚙️ Paso 2: Variables de Entorno en Vercel

En el panel de tu proyecto en [vercel.com](https://vercel.com) (pestaña **Settings** > **Environment Variables**), agrega las siguientes variables:

| Variable | Valor / Descripción |
| :--- | :--- |
| `SHEETS_URL_USERS` | Enlace CSV publicado de la pestaña **ACCESOS**. |
| `CONFIG_MASTER_PASSWORD` | Contraseña / PIN para desbloquear el menú `⚙️ Config` (defínela solo en Vercel). |
| `CARTO_API_KEY` | Clave API de Carto Basemaps (`cb1_27lw_1_...`). |
| `SHEETS_URL_BASE` | URL CSV de la base de pendientes. |
| `SHEETS_URL_EJECUTADOS` | URL CSV de la base de ejecutados. |
| `SHEETS_URL_LLAMADAS` | URL CSV de la base de llamadas. |
| `SHEETS_URL_TECNICOS` | URL CSV de la base de técnicos. |

---

### 💻 Ejecución Local:
Para probar en tu computadora:
```bash
node server.js
```
Abre en tu navegador `http://localhost:3000`.
