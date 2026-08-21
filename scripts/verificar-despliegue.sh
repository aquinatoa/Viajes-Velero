#!/usr/bin/env bash
#
# Comprueba que un despliegue esta entero y respondiendo.
#
#   ./scripts/verificar-despliegue.sh https://midominio.com
#
# Sin argumento asume http://localhost:5173 (el entorno de desarrollo, que
# tambien sirve API y front en el mismo origen y por tanto pasa las mismas
# comprobaciones).
#
# Para incluir las pruebas que necesitan sesion, exporta antes:
#
#   export VERIFY_EMAIL=admin@midominio.com
#   export VERIFY_PASSWORD='...'
#
# Sin esas variables las pruebas con sesion se marcan OMITIDA, no fallan: el
# script no guarda credenciales ni las pide por teclado.
#
# Salida 0 si todo pasa, 1 si algo falla. Pensado para poder colgarlo de un cron
# o de un pipeline sin tocarlo.

set -uo pipefail

BASE="${1:-http://localhost:5173}"
BASE="${BASE%/}"

ok=0
fallos=0
omitidas=0

verde()  { printf '\033[32m%s\033[0m' "$1"; }
rojo()   { printf '\033[31m%s\033[0m' "$1"; }
gris()   { printf '\033[90m%s\033[0m' "$1"; }

pasa()   { ok=$((ok + 1));             printf '  %s %s\n' "$(verde '✓')" "$1"; }
falla()  { fallos=$((fallos + 1));     printf '  %s %s\n' "$(rojo '✗')" "$1"; [ $# -gt 1 ] && printf '      %s\n' "$2"; }
omite()  { omitidas=$((omitidas + 1)); printf '  %s %s\n' "$(gris '−')" "$(gris "$1")"; }

titulo() { printf '\n%s\n' "$1"; }

# Codigo HTTP de una URL.
codigo() { curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$1" 2>/dev/null; }

printf 'Verificando %s\n' "$BASE"

# ── 1. La API responde ────────────────────────────────────────────────────────
titulo "API"

salud="$(curl -sS --max-time 30 "$BASE/api/health" 2>/dev/null)"
if [ "$salud" = '{"ok":true}' ]; then
  pasa "/api/health responde ok"
else
  falla "/api/health no responde como se espera" "recibido: ${salud:-<vacio>}"
fi

# ── 2. El front y sus rutas ───────────────────────────────────────────────────
titulo "Frontend"

raiz="$(codigo "$BASE/")"
if [ "$raiz" = "200" ]; then
  pasa "la raiz sirve la aplicacion"
else
  falla "la raiz devuelve $raiz"
fi

# El router es de cliente: sin el try_files de nginx, entrar directo da 404.
for ruta in /tarifas /viajes /propuestas; do
  c="$(codigo "$BASE$ruta")"
  if [ "$c" = "200" ]; then
    pasa "$ruta resuelve (SPA fallback)"
  else
    falla "$ruta devuelve $c" "falta 'try_files \$uri \$uri/ /index.html' en nginx"
  fi
done

# ── 3. El bundle no apunta a localhost ────────────────────────────────────────
titulo "Bundle"

indice="$(curl -sS --max-time 30 "$BASE/" 2>/dev/null)"
bundle="$(printf '%s' "$indice" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)"

if printf "%s" "$indice" | grep -q "/src/main.tsx"; then
  # Servidor de desarrollo de Vite: sirve los modulos sin compilar, no hay
  # bundle que revisar. La comprobacion solo tiene sentido sobre un dist/.
  omite "bundle (servidor de desarrollo, no hay dist/)"
elif [ -z "$bundle" ]; then
  falla "no se encuentra el bundle en el HTML" "revisa que nginx sirva dist/"
else
  js="$(curl -sS --max-time 60 "$BASE$bundle" 2>/dev/null)"
  if printf '%s' "$js" | grep -q 'localhost:8787'; then
    falla "el bundle apunta a localhost:8787" "se ha desplegado un dist/ viejo: reconstruye con 'npm run build'"
  else
    pasa "el bundle no apunta a localhost"
  fi

  if [ "$(codigo "$BASE$bundle")" = "200" ]; then
    pasa "los estaticos se sirven"
  else
    falla "el bundle no se descarga"
  fi
fi

# ── 4. Nadie entra sin sesion ─────────────────────────────────────────────────
titulo "Control de acceso"

for ruta in /api/inventory/documents /api/commercial/clients /api/crm/opportunities; do
  c="$(codigo "$BASE$ruta")"
  if [ "$c" = "401" ] || [ "$c" = "403" ]; then
    pasa "$ruta exige sesion ($c)"
  elif [ "$c" = "404" ]; then
    omite "$ruta no existe en esta version"
  else
    falla "$ruta responde $c sin sesion" "deberia ser 401 o 403"
  fi
done

# ── 5. Con sesion: la base contesta ───────────────────────────────────────────
titulo "Sesion y base de datos"

if [ -z "${VERIFY_EMAIL:-}" ] || [ -z "${VERIFY_PASSWORD:-}" ]; then
  omite "login (define VERIFY_EMAIL y VERIFY_PASSWORD para incluirlo)"
  omite "lectura autenticada"
else
  respuesta="$(curl -sS --max-time 30 -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$VERIFY_EMAIL\",\"password\":\"$VERIFY_PASSWORD\"}" 2>/dev/null)"
  token="$(printf '%s' "$respuesta" | grep -oE '"token":"[^"]+"' | head -1 | cut -d'"' -f4)"

  if [ -n "$token" ]; then
    pasa "login devuelve sesion"

    # Que responda 200 significa que la consulta llego a PostgreSQL y volvio.
    c="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 \
      -H "Authorization: Bearer $token" "$BASE/api/inventory/documents" 2>/dev/null)"
    if [ "$c" = "200" ]; then
      pasa "lectura autenticada contra la base"
    else
      falla "lectura autenticada devuelve $c"
    fi
  else
    falla "el login no devuelve token" "revisa credenciales, o que la base responda"
  fi
fi

# ── 6. Transporte ─────────────────────────────────────────────────────────────
titulo "Transporte"

case "$BASE" in
  https://*)
    pasa "se sirve por HTTPS"
    dominio="${BASE#https://}"
    redir="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "http://$dominio/" 2>/dev/null)"
    if [ "$redir" = "301" ] || [ "$redir" = "302" ] || [ "$redir" = "308" ]; then
      pasa "HTTP redirige a HTTPS ($redir)"
    else
      falla "HTTP no redirige (devuelve $redir)" "la sesion viaja en un token Bearer: sin TLS va en claro"
    fi
    ;;
  http://localhost*|http://127.0.0.1*)
    omite "HTTPS (entorno local)"
    ;;
  *)
    falla "se sirve por HTTP sin cifrar" "la sesion viaja en un token Bearer: hace falta TLS"
    ;;
esac

# ── Resumen ───────────────────────────────────────────────────────────────────
printf '\n%s OK · %s fallo(s) · %s omitida(s)\n' "$ok" "$fallos" "$omitidas"

if [ "$fallos" -gt 0 ]; then
  exit 1
fi
exit 0
