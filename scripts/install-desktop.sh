#!/usr/bin/env bash
# dsh-thinking-level-override — one-shot installer for DeepSeek Harness Desktop
#
# Fetch from GitHub -> (whitelist patch) -> deps -> install into desktop profile
# -> register bundle -> (optional) restart. Idempotent.
#
# Run in a NORMAL terminal (not a sandboxed harness shell; the app bundle and
# app-data dir are read-only there, especially on macOS):
#   bash <(curl -Ls https://raw.githubusercontent.com/my-dsh-plugin/thinking-level-override/main/scripts/install-desktop.sh) --restart
#
# Overrides: DSH_SKILL_SOURCE_DIR, DSH_DESKTOP_APP, DSH_DESKTOP_HOME, GITHUB_MIRROR
set -u

# ---- per-plugin config ------------------------------------------------------
REPO="my-dsh-plugin/thinking-level-override"
BRANCH="main"
PLUGIN_NAME="dsh-thinking-level-override"
WHITELIST_NS="thinking-level-override"   # settings namespace; empty => skip allowlist patch

RESTART="${1:-}"
die() { echo "x $*" >&2; exit 1; }

# ---- resolve platform / app / home -----------------------------------------
OS="$(uname -s)"
case "$OS" in
  Darwin)
    APP="${DSH_DESKTOP_APP:-/Applications/DeepSeek Harness Desktop.app}"
    HOME_DIR="${DSH_DESKTOP_HOME:-$HOME/Library/Application Support/dsh-desktop/dsh-home}"
    NPM_FALLBACK="$APP/Contents/Resources/runtime/node/bin/npm"
    ;;
  Linux)
    APP="${DSH_DESKTOP_APP:-/opt/DeepSeek Harness Desktop}"
    HOME_DIR="${DSH_DESKTOP_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/dsh-desktop/dsh-home}"
    NPM_FALLBACK=""
    ;;
  MINGW*|MSYS*|CYGWIN*)
    APP="${DSH_DESKTOP_APP:-$LOCALAPPDATA/Programs/DeepSeek Harness Desktop}"
    HOME_DIR="${DSH_DESKTOP_HOME:-$APPDATA/dsh-desktop/dsh-home}"
    NPM_FALLBACK="$APP/Resources/runtime/node/npm.cmd"
    ;;
  *) die "unsupported system: $OS" ;;
esac

[ -d "$APP" ] || die "desktop app not found: $APP (set DSH_DESKTOP_APP)"
PROFILE_DIR="$HOME_DIR/profiles/web"
[ -d "$PROFILE_DIR" ] || die "desktop profile not found: $PROFILE_DIR (set DSH_DESKTOP_HOME)"

echo "==> OS        : $OS"
echo "==> App       : $APP"
echo "==> profile   : $PROFILE_DIR"

# ---- 0. get the plugin source ----------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [ -n "${DSH_SKILL_SOURCE_DIR:-}" ]; then
  echo "==> using local source: $DSH_SKILL_SOURCE_DIR"
  SRC="$DSH_SKILL_SOURCE_DIR"
  [ -f "$SRC/lib/index.js" ] || die "local source has no lib/index.js"
else
  echo "==> fetching $REPO ($BRANCH) from GitHub ..."
  GIT_BASE="${GITHUB_MIRROR:-https://github.com}"
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 --branch "$BRANCH" "$GIT_BASE/$REPO.git" "$TMP/plugin" >/dev/null 2>&1 \
      || { git clone --depth 1 "$GIT_BASE/$REPO.git" "$TMP/plugin" >/dev/null 2>&1; }
  fi
  if [ ! -f "$TMP/plugin/lib/index.js" ]; then
    CURL_BASE="${GITHUB_MIRROR:-https://codeload.github.com}"
    mkdir -p "$TMP/tgz"
    curl -fsSL "$CURL_BASE/$REPO/tar.gz/refs/heads/$BRANCH" -o "$TMP/plugin.tgz" \
      || die "GitHub fetch failed, check network/proxy"
    tar -xzf "$TMP/plugin.tgz" -C "$TMP/tgz" --strip-components=1
    mv "$TMP/tgz" "$TMP/plugin"
  fi
  [ -f "$TMP/plugin/lib/index.js" ] || die "fetched plugin has no lib/index.js"
  SRC="$TMP/plugin"
fi

# ---- 1. whitelist patch (optional, idempotent) ------------------------------
if [ -n "$WHITELIST_NS" ]; then
  VERSION="$(python3 -c "import json,os; print(json.load(open(os.path.expanduser('$APP/Contents/Resources/runtime/harness/current.json')))['version'])" 2>/dev/null)"
  APIF="$APP/Contents/Resources/runtime/harness/versions/$VERSION/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js"
  if [ ! -f "$APIF" ]; then
    VERSION="$(python3 -c "import json,os; print(json.load(open(os.path.expanduser('$APP/Resources/runtime/harness/current.json')))['version'])" 2>/dev/null)"
    APIF="$APP/Resources/runtime/harness/versions/$VERSION/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js"
  fi
  if [ -f "$APIF" ]; then
    python3 - "$APIF" "$WHITELIST_NS" <<'PY'
import re, sys
p, ns = sys.argv[1], sys.argv[2]
s = open(p).read()
m = re.search(r'(WEB_SETTINGS_NAMESPACES = \[)(.*?)(\];)', s, re.S)
if not m:
    raise SystemExit('cannot locate WEB_SETTINGS_NAMESPACES in ' + p)
body = m.group(2)
if '"' + ns + '"' in body:
    print('==> whitelist: already has ' + ns + ', skip')
else:
    body2 = body.rstrip() + ',\n\t"' + ns + '"\n'
    open(p, 'w').write(s[:m.start(2)] + body2 + s[m.end(2):])
    print('==> whitelist: added ' + ns)
PY
  else
    echo "==> warn: embedded apiproxy not found; skipped whitelist patch"
  fi
else
  echo "==> whitelist: none required for this plugin, skip"
fi

# ---- 2. third-party runtime deps (optional) ---------------------------------
HAVE_3P="$(python3 -c "import json; d=json.load(open('$SRC/package.json')); print(1 if any(not k.startswith('@deepseek-ai/') for k in d.get('dependencies',{})) else 0)" 2>/dev/null || echo 0)"
if [ "$HAVE_3P" = "1" ]; then
  NPM="$(command -v npm 2>/dev/null || true)"
  [ -z "$NPM" ] && [ -n "$NPM_FALLBACK" ] && [ -x "$NPM_FALLBACK" ] && NPM="$NPM_FALLBACK"
  if [ -n "$NPM" ]; then
    echo "==> installing third-party runtime deps (npm) ..."
    ( cd "$SRC" && "$NPM" install --omit=dev --no-save --no-audit --no-fund --no-package-lock --cache "$TMP/.npm-cache" ) \
      || echo "==> warn: npm install failed"
  else
    echo "==> warn: npm not found; third-party deps may be unresolvable"
  fi
else
  echo "==> deps: no third-party runtime deps, skip npm"
fi

# ---- 3. install plugin into desktop profile --------------------------------
TGT="$PROFILE_DIR/node_modules/$PLUGIN_NAME"
mkdir -p "$PROFILE_DIR/node_modules"
[ -d "$TGT" ] && { echo "==> plugin: exists, updating"; rm -rf "$TGT"; }
cp -R "$SRC" "$TGT"
rm -rf "$TGT/.git"
echo "==> plugin: installed to $TGT"

# ---- 4. register bundle (idempotent) ---------------------------------------
if [ ! -f "$PROFILE_DIR/package.json" ]; then
  cat > "$PROFILE_DIR/package.json" <<JSON
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]
    }
  }
}
JSON
  echo "==> profile: created package.json skeleton"
fi
python3 - "$PROFILE_DIR/package.json" "$PLUGIN_NAME" <<'PY'
import json, sys
p, name = sys.argv[1], sys.argv[2]
d = json.load(open(p))
bl = d.setdefault('dsh', {}).setdefault('profile', {}).setdefault('bundles', [])
if name not in bl:
    bl.append(name)
    print('==> bundle: registered ' + name)
else:
    print('==> bundle: already present, skip')
with open(p, 'w') as f:
    json.dump(d, f, indent=2)
PY

# ---- 5. restart (optional) --------------------------------------------------
if [ "$RESTART" = "--restart" ]; then
  echo "==> restarting desktop app ..."
  case "$OS" in
    Darwin) osascript -e 'quit app "DeepSeek Harness Desktop"' 2>/dev/null; sleep 2; open "$APP" ;;
    Linux)  pkill -f 'DeepSeek Harness Desktop' 2>/dev/null; sleep 1; nohup "$APP" >/dev/null 2>&1 & ;;
    *)      echo "==> restart the desktop app manually" ;;
  esac
  echo "==> done. check Settings for the plugin section"
else
  echo "==> done. restart the desktop app (or re-run with --restart)"
fi