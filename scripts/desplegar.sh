#!/usr/bin/env bash
#
# Despliega una revision concreta en el servidor. Lo ejecuta el flujo de GitHub
# por SSH, pero sirve igual a mano:
#
#   ./scripts/desplegar.sh <sha-o-rama>
#
# Construye la release nueva en su propio directorio mientras la vieja sigue
# sirviendo, y solo cuando esta lista mueve el symlink `current` y reinicia. La
# aplicacion deja de responder un segundo, no los cuarenta que costaba hacer
# `npm ci` sobre el directorio vivo.
#
# Si la verificacion falla, devuelve el symlink a la release anterior y reinicia:
# se vuelve al estado que funcionaba sin esperar a que alguien lo note.
#
# AVISO sobre las migraciones: se aplican antes del cambio de symlink, y volver
# atras NO las deshace. Una migracion que rompa el codigo viejo deja la reversion
# inservible. Para esos casos, migracion y despliegue van por separado.
set -euo pipefail

REVISION="${1:-main}"
REPO="https://github.com/aquinatoa/Viajes-Velero.git"

RAIZ="/opt/oravia"
RELEASES="$RAIZ/releases"
COMPARTIDO="$RAIZ/shared"
ACTUAL="$RAIZ/current"

# Cuantas releases se conservan para poder volver atras.
CONSERVAR=5

paso() { printf '\n\033[36m▸ %s\033[0m\n' "$1"; }

anterior=""
if [ -L "$ACTUAL" ]; then
  anterior="$(readlink -f "$ACTUAL")"
fi

nueva="$RELEASES/$(date +%Y%m%d-%H%M%S)"

# Si algo falla a partir de aqui, no dejamos una release a medias tirada.
limpiar_si_falla() {
  local codigo=$?
  if [ "$codigo" -ne 0 ] && [ -d "$nueva" ]; then
    printf '\n\033[31mFallo el despliegue. Se descarta %s\033[0m\n' "$nueva"
    rm -rf "$nueva"
  fi
  exit "$codigo"
}
trap limpiar_si_falla EXIT

paso "Trayendo $REVISION"
mkdir -p "$nueva"
git -C "$nueva" init -q
git -C "$nueva" remote add origin "$REPO"
# Por SHA exacto: si `main` avanza mientras desplegamos, sale lo que se pidio.
git -C "$nueva" fetch -q --depth 1 origin "$REVISION"
git -C "$nueva" checkout -q FETCH_HEAD
printf '  %s\n' "$(git -C "$nueva" log --oneline -1)"

paso "Enlazando configuracion compartida"
# El .env vive fuera de las releases: es lo unico que no viene del repositorio y
# tiene que sobrevivir a cada despliegue.
ln -sfn "$COMPARTIDO/.env" "$nueva/.env"

paso "Instalando dependencias"
# Sin --omit=dev a proposito: la aplicacion arranca con `node --import tsx` y
# tsx es devDependency. Con una instalacion de solo produccion no levanta.
( cd "$nueva" && npm ci --no-audit --no-fund )

paso "Cliente Prisma"
# Antes del build: sin el, los tipos de las consultas quedan en `any` y `tsc`
# falla con errores que no tienen nada que ver con el cambio que se despliega.
( cd "$nueva" && npm run prisma:generate )

paso "Migraciones pendientes"
( cd "$nueva" && npm run prisma:migrate )

paso "Compilando"
( cd "$nueva" && npm run build )

paso "Activando la release"
ln -sfn "$nueva" "$ACTUAL"
sudo systemctl restart oravia-api

paso "Verificando"
# Contra 127.0.0.1 pasa por nginx, asi que comprueba la cadena entera. El script
# espera a que la API arranque, no hace falta dormir aqui.
if "$nueva/scripts/verificar-despliegue.sh" http://127.0.0.1; then
  paso "Desplegado"
else
  printf '\n\033[31mLa verificacion fallo.\033[0m\n'
  if [ -n "$anterior" ] && [ -d "$anterior" ]; then
    printf 'Volviendo a %s\n' "$anterior"
    ln -sfn "$anterior" "$ACTUAL"
    sudo systemctl restart oravia-api
    "$anterior/scripts/verificar-despliegue.sh" http://127.0.0.1 || true
    printf '\n\033[31mRevertido. Revisa que trajo %s antes de reintentar.\033[0m\n' "$REVISION"
  else
    printf '\033[31mNo hay release anterior a la que volver.\033[0m\n'
  fi
  exit 1
fi

paso "Limpiando releases antiguas"
# Se conservan las ultimas, y nunca la que esta activa.
activa="$(readlink -f "$ACTUAL")"
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((CONSERVAR + 1)) | while read -r vieja; do
  vieja="${vieja%/}"
  [ "$(readlink -f "$vieja")" = "$activa" ] && continue
  printf '  descartando %s\n' "$(basename "$vieja")"
  rm -rf "$vieja"
done

trap - EXIT
