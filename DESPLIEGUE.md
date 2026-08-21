# Despliegue vía SSH

Arquitectura: **mismo origen**. nginx sirve el frontend estático y hace de proxy
inverso de `/api` al proceso Node. Un solo dominio, un solo certificado, sin CORS.

```
navegador ──► nginx :443 ──┬──► /            → /opt/oravia/current/dist (estático)
                           └──► /api         → 127.0.0.1:8787 (Node)
```

Sustituye a lo largo del documento:

| Marcador | Significado |
|---|---|
| `midominio.com` | dominio o subdominio del cliente |
| `deploy` | usuario de sistema sin privilegios que ejecuta la app |
| `/opt/oravia` | raíz de la instalación |

---

## 0. Requisitos en el servidor

- **Node.js 20 o superior.** El proyecto arranca con `node --import tsx`, que
  necesita 20.6+. En local se probó con 24.14.1.
- **nginx**
- **PostgreSQL 14 o superior**
- Acceso `sudo`
- El dominio apuntando ya a la IP del servidor (si no, certbot falla)

```bash
node -v && nginx -v && psql --version && echo OK
```

## 1. Usuario y directorios

La app no debe correr como root ni escribir dentro del directorio de código: los
documentos subidos tienen que sobrevivir a cada despliegue.

```bash
sudo useradd --system --create-home --shell /bin/bash deploy
sudo mkdir -p /opt/oravia/{releases,datos,storage}
sudo chown -R deploy:deploy /opt/oravia
```

- `/opt/oravia/datos` → volcados de `pg_dump` (la base la gestiona PostgreSQL)
- `/opt/oravia/storage` → documentos de tarifas subidos
- `/opt/oravia/current` → enlace simbólico a la release activa

## 2. Traer el código

```bash
sudo -iu deploy
git clone https://github.com/aquinatoa/Viajes-Velero.git /opt/oravia/releases/v1
ln -sfn /opt/oravia/releases/v1 /opt/oravia/current
cd /opt/oravia/current
npm ci
```

## 2b. La base de datos

Un rol y una base propios; nunca el superusuario `postgres`.

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE oravia WITH LOGIN PASSWORD 'una-clave-larga';
CREATE DATABASE oravia OWNER oravia;
SQL
```

Si PostgreSQL corre en el mismo servidor, no lo expongas a la red: que escuche
solo en `localhost`. La app se conecta por ahí.

## 3. El `.env` de producción

**No copies el `.env` de desarrollo.** Cambia la contraseña de admin y revisa las
rutas, que en el de desarrollo apuntan a máquinas ajenas.

```bash
nano /opt/oravia/current/.env
chmod 600 /opt/oravia/current/.env
```

```ini
DATABASE_URL="postgresql://oravia:una-clave-larga@localhost:5432/oravia?schema=public"

# Ruta absoluta y fuera del directorio de código, para que el despliegue no la pise
ORAVIA_STORAGE_DIR="/opt/oravia/storage"

API_PORT=8787
# CORS_ORIGINS y VITE_API_BASE_URL se dejan sin definir: mismo origen.

# Enlaces públicos de las propuestas. Sin esto, los correos salen sin enlace.
PUBLIC_BASE_URL="https://midominio.com"

# Correo (imprescindible para enviar propuestas)
MAIL_HOST="smtp.zoho.eu"
MAIL_PORT=465
MAIL_SECURE=true
MAIL_GROUPS_ADDRESS="grupos@midominio.com"
MAIL_GROUPS_NAME="Oravia Travel Group"
MAIL_GROUPS_APP_PASSWORD="..."
MAIL_SPORTS_ADDRESS="deportes@midominio.com"
MAIL_SPORTS_NAME="Oravia Sports"
MAIL_SPORTS_APP_PASSWORD="..."
MAIL_PER_TRIP_DOMAIN="midominio.com"

# IA
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="..."
AI_MODEL="..."

# Zoho CRM
ZOHO_REGION="eu"
ZOHO_API_DOMAIN="https://www.zohoapis.eu"
ZOHO_ACCOUNTS_DOMAIN="https://accounts.zoho.eu"
ZOHO_CLIENT_ID="..."
ZOHO_CLIENT_SECRET="..."
ZOHO_REFRESH_TOKEN="..."
# ZOHO_CA_BUNDLE solo en redes con proxy TLS corporativo

# Admin inicial: cámbiala, la de desarrollo es pública
ADMIN_EMAIL="admin@midominio.com"
ADMIN_PASSWORD="<contraseña larga y única>"
```

Los secretos no viajan por el repo. Pásalos por un gestor de contraseñas, o
edítalos a mano en el servidor por SSH. Nunca por correo ni chat.

## 4. Base de datos y build

```bash
cd /opt/oravia/current
npm run prisma:generate
npm run prisma:migrate   # aplica prisma/migrations/ (nunca db push en producción)
npm run build            # genera dist/
```

Para cargar el catálogo de tarifas, sube los dos Excel al servidor y apunta
`ACCOMMODATION_RATES_XLSX` y `ACTIVITY_RATES_XLSX` a sus rutas absolutas antes de:

```bash
npm run prisma:import-rates
```

## 5. Servicio systemd

`/etc/systemd/system/oravia-api.service`:

```ini
[Unit]
Description=Oravia API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/oravia/current
ExecStart=/usr/bin/node --import tsx server/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Endurecimiento: solo puede escribir donde necesita
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/oravia/storage /opt/oravia/datos

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oravia-api
sudo systemctl status oravia-api
curl -s localhost:8787/api/health     # {"ok":true}
```

## 6. nginx

`/etc/nginx/sites-available/oravia`:

```nginx
server {
    listen 80;
    server_name midominio.com;

    root /opt/oravia/current/dist;
    index index.html;

    # La API, al mismo origen que el front
    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Los documentos de tarifas pesan; 50 MB de margen
        client_max_body_size 50M;
        proxy_read_timeout   300s;
    }

    # SPA: /viajes, /tarifas, /p/{token}… los resuelve el router del cliente
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/oravia /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

El `try_files ... /index.html` no es opcional: sin él, entrar directamente a
`/tarifas` o abrir un enlace público `/p/{token}` devuelve 404.

El `client_max_body_size` tampoco: el valor por defecto de nginx es 1 MB y la
subida de documentos moriría con 413.

## 7. HTTPS

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d midominio.com
```

Certbot reescribe el bloque y deja la renovación automática. **Obligatorio**: la
sesión viaja en un token `Bearer`; sin TLS va en claro por la red.

## 8. Actualizar

```bash
sudo -iu deploy
cd /opt/oravia/releases/v1 && git pull
npm ci && npm run prisma:generate && npm run build
exit
sudo systemctl restart oravia-api
```

Si el esquema cambió, `npm run prisma:migrate` antes de reiniciar: aplica solo
las migraciones pendientes y no destruye datos.

## 9. Comprobación

No lo compruebes a mano: hay un script que pasa todas las comprobaciones de
aceptación y devuelve 0 o 1, así que sirve igual en el terminal que en un cron
o un pipeline.

```bash
./scripts/verificar-despliegue.sh https://midominio.com
```

Comprueba que la API responde, que las rutas del router resuelven (el fallo más
típico: falta el `try_files` y `/tarifas` da 404), que el bundle desplegado no
apunta a `localhost` (el segundo más típico: se subió un `dist/` viejo), que los
endpoints privados exigen sesión, y que HTTP redirige a HTTPS.

Para incluir además el login y una lectura real contra PostgreSQL:

```bash
export VERIFY_EMAIL=admin@midominio.com
export VERIFY_PASSWORD='...'
./scripts/verificar-despliegue.sh https://midominio.com
```

Sin esas dos variables esas comprobaciones salen como omitidas, no como fallo:
el script no guarda credenciales.

Antes de dar por bueno el despliegue puedes ensayarlo en local, que sirve el
mismo `dist/` que ira al servidor:

```bash
npm run build && npm run preview   # http://localhost:4173
./scripts/verificar-despliegue.sh http://localhost:4173
```

En el navegador, con las herramientas de desarrollo abiertas: ninguna petición
debe ir a `localhost`, y no debe haber preflight `OPTIONS`.

```bash
sudo journalctl -u oravia-api -f
```

---

## Pendientes antes de considerarlo productivo

1. **Falta `OK TARIFAS Costes.xlsx`** — sin él, `prisma:import-rates` aborta y el
   catálogo de alojamientos queda vacío.
2. **Copias de seguridad.** Nadie respalda la base ni `/opt/oravia/storage`. Un
   `cron` diario, con rotación:

   ```bash
   pg_dump -Fc -U oravia oravia > /opt/oravia/datos/oravia-$(date +%F).dump
   tar czf /opt/oravia/datos/storage-$(date +%F).tgz -C /opt/oravia storage
   ```
4. **Tres vulnerabilidades en la ruta de subida de documentos:** `pdfjs-dist`
   (ejecución de JS al abrir un PDF malicioso) y `multer` (DoS) tienen arreglo
   actualizando; `xlsx` 0.18.5 no lo tiene en npm porque SheetJS salió del
   registro — habría que migrar a su distribución propia o cambiar de librería.
   Importa porque el módulo documental acepta ficheros de terceros.
