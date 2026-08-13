# 🚀 Despliegue de OMS Map en Vercel

Esta carpeta contiene la **Web App Ejecutiva de OMS Map** optimizada para rendimiento de 60 FPS, diseño Glassmorphism y consumo dinámico de datos en tiempo real.

---

### 📂 Estructura de la Web App:
- `index.html`: Aplicación web interactiva completa (Leaflet.js + MarkerCluster + Chart.js).
- `config.json`: Archivo de configuración donde puedes colocar la URL de tu Google Sheet.
- `data.json`: Datos locales de respaldo generados por `python export_to_web.py`.
- `vercel.json`: Configuración de cabeceras y ruta para Vercel.

---

### 🌐 Cómo publicar en Vercel (Paso a Paso):

#### Opción 1: Vía GitHub (Recomendado)
1. Subes este repositorio a tu cuenta de **GitHub**.
2. Entras a [vercel.com](https://vercel.com) e inicias sesión con GitHub.
3. Haz clic en **Add New** $\rightarrow$ **Project**.
4. Selecciona tu repositorio de GitHub.
5. En la configuración de **Root Directory**, selecciona la carpeta `web`.
6. Haz clic en **Deploy**. ¡Listo! Tendrás una URL pública como `https://oms-map.vercel.app`.

#### Opción 2: Vía Vercel CLI (Desde la consola)
1. Abre tu terminal e instala la herramienta de Vercel:
   ```bash
   npm install -g vercel
   ```
2. Entra a la carpeta `web`:
   ```bash
   cd web
   ```
3. Ejecuta el comando de despliegue:
   ```bash
   vercel --prod
   ```
