#!/usr/bin/env bash
# crear_admin.sh — Crea un usuario con rol "admin" en el ABAC microservice
# Uso: ./crear_admin.sh [email] [password] [firstName] [lastName]
# Ejemplo: ./crear_admin.sh admin@eventcorner.com Admin1234! Admin EventCorner

set -euo pipefail

ABAC_URL="http://localhost:3005"

# ── Parámetros (con defaults) ─────────────────────────────────────────────────
EMAIL="${1:-admin@eventcorner.com}"
PASSWORD="${2:-Admin1234!}"
FIRST_NAME="${3:-Admin}"
LAST_NAME="${4:-EventCorner}"
USERNAME="${EMAIL%%@*}"

# ── IDs fijos (del seed) ──────────────────────────────────────────────────────
ADMIN_ROLE_ID="3355ba3c-1fbc-4ea0-8f74-27a8cbd82e05"
APP_ID="df959358-c1c0-477a-8a6d-133451d1cd10"
SUPER_ADMIN_EMAIL="superadmin@abac.com"
SUPER_ADMIN_PASSWORD="superadmin"

# ── Helper: extraer campo JSON con node ───────────────────────────────────────
json_field() {
  node -e "try { const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(String(d.$1 ?? '')); } catch(e) { process.exit(1); }"
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Crear usuario admin — ABAC        ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  ABAC URL  : $ABAC_URL"
echo "  Email     : $EMAIL"
echo "  Nombre    : $FIRST_NAME $LAST_NAME"
echo ""

# ── Paso 1: Login super-admin ─────────────────────────────────────────────────
echo "▶ [1/3] Obteniendo token de super-admin..."

LOGIN_RESPONSE=$(curl -s -X POST "$ABAC_URL/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SUPER_ADMIN_EMAIL\",\"password\":\"$SUPER_ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | json_field accessToken)

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "  ✗ No se pudo obtener el token. ¿Está corriendo el ABAC en $ABAC_URL?"
  echo "  Respuesta: $LOGIN_RESPONSE"
  exit 1
fi

echo "  ✓ Token obtenido"

# ── Paso 2: Crear usuario ─────────────────────────────────────────────────────
echo ""
echo "▶ [2/3] Creando usuario '$EMAIL'..."

CREATE_RESPONSE=$(curl -s -X POST "$ABAC_URL/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"firstName\": \"$FIRST_NAME\",
    \"lastName\": \"$LAST_NAME\",
    \"username\": \"$USERNAME\"
  }")

USER_ID=$(echo "$CREATE_RESPONSE" | json_field id)

if [[ -z "$USER_ID" || "$USER_ID" == "null" ]]; then
  echo "  ✗ No se recibió un ID de usuario. Respuesta:"
  echo "  $CREATE_RESPONSE"
  exit 1
fi

echo "  ✓ Usuario creado — ID: $USER_ID"

# ── Paso 3: Asignar rol admin ─────────────────────────────────────────────────
echo ""
echo "▶ [3/3] Asignando rol 'admin'..."

ROLE_RESPONSE=$(curl -s -X POST "$ABAC_URL/users/$USER_ID/roles" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"roleId\": \"$ADMIN_ROLE_ID\",
    \"applicationId\": \"$APP_ID\"
  }")

# Verificar que no haya error en la respuesta
ROLE_ERROR=$(echo "$ROLE_RESPONSE" | json_field message)
if [[ "$ROLE_ERROR" == "null" || -z "$ROLE_ERROR" ]]; then
  echo "  ✓ Rol 'admin' asignado"
else
  echo "  ✗ Error al asignar rol: $ROLE_ERROR"
  echo "  Respuesta: $ROLE_RESPONSE"
  exit 1
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║             ✓ Usuario creado             ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  ID        : $USER_ID"
echo "  Email     : $EMAIL"
echo "  Password  : $PASSWORD"
echo "  Rol       : admin"
echo "  App       : Event Corner"
echo ""
echo "  Inicia sesión en el Event Corner app con estas credenciales."
echo "  (El usuario debe hacer login una vez para que el monolith lo sincronice)"
echo ""
