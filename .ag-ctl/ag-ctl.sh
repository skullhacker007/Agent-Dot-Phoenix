#!/usr/bin/env bash
# Helper: talk to the running Antigravity language server's agent API.
# Reads the CSRF token + LS address from the live process command line at
# runtime so no credential is ever written into a transcript or file.
set -uo pipefail

LS_BIN="/c/Users/NAVEEN/AppData/Local/Programs/Antigravity IDE/resources/app/extensions/antigravity/bin/language_server_windows_x64.exe"

# Pull "--csrf_token <value>" and the listening ports out of the live process.
PS_OUT="$(powershell -NoProfile -Command "
  \$p = Get-CimInstance Win32_Process -Filter \"Name='language_server_windows_x64.exe'\" |
       Select-Object -First 1
  \$cl = \$p.CommandLine
  if (\$cl -match '--csrf_token\s+(\S+)') { Write-Output \$Matches[1] }
  Get-NetTCPConnection -State Listen -OwningProcess \$p.ProcessId |
    Where-Object { \$_.LocalAddress -eq '127.0.0.1' } |
    Select-Object -ExpandProperty LocalPort
" 2>/dev/null | tr -d '\r')"

CSRF="$(printf '%s\n' "$PS_OUT" | head -1)"
# Remaining lines are candidate ports.
HTTP_PORT="$(printf '%s\n' "$PS_OUT" | tail -n +2 | tr '\n' ' ')"
LS_ADDR=""

for p in $HTTP_PORT; do
  probe=$(ANTIGRAVITY_LS_ADDRESS="127.0.0.1:$p" ANTIGRAVITY_CSRF_TOKEN="$CSRF" \
    "$LS_BIN" agentapi get-conversation-metadata 00000000-0000-0000-0000-000000000000 2>&1)
  # A reachable, authenticated port answers the RPC. It must NOT be a
  # transport-level failure ("connection error" / "missing CSRF token").
  if printf '%s' "$probe" | grep -q '"response"' \
     && ! printf '%s' "$probe" | grep -q "connection error" \
     && ! printf '%s' "$probe" | grep -q "missing CSRF token"; then
    LS_ADDR="127.0.0.1:$p"
    break
  fi
done

if [ -z "$LS_ADDR" ]; then
  echo "ERROR: could not establish authenticated channel to language server" >&2
  exit 1
fi

export ANTIGRAVITY_LS_ADDRESS="$LS_ADDR"
export ANTIGRAVITY_CSRF_TOKEN="$CSRF"

exec "$LS_BIN" agentapi "$@"
