#!/bin/bash
set -e

# ==============================================================================
# Script de Lançamento e Publicação Automática de Atualização OTA no GitHub
# Repositório: leeeopr/chacara-inventario
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# 1. Determinar versão a ser lançada
PKG_VERSION=$(node -p "require('./package.json').version")
TARGET_VERSION="${1:-$PKG_VERSION}"
RELEASE_NOTES="${2:-Atualização automática de melhorias visuais e estabilidade do sistema de inventário.}"

TAG_NAME="v$TARGET_VERSION"
APK_FILE="$PROJECT_DIR/Chacara-Inventario.apk"

echo "============================================================"
echo "🚀 Publicador Automático de Releases OTA - Chácara Inventário"
echo "============================================================"
echo "Versão Alvo: $TARGET_VERSION (Tag: $TAG_NAME)"
echo "Notas: $RELEASE_NOTES"
echo "============================================================"

# 2. Sincronizar package.json e build.gradle com a versão alvo
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$TARGET_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

GRADLE_FILE="$PROJECT_DIR/android/app/build.gradle"
if [ -f "$GRADLE_FILE" ]; then
  # Incrementar versionCode ou manter sincronizado
  CURRENT_CODE=$(grep -o 'versionCode [0-9]*' "$GRADLE_FILE" | awk '{print $2}')
  NEW_CODE=$((CURRENT_CODE + 1))
  sed -i "s/versionCode [0-9]*/versionCode $NEW_CODE/" "$GRADLE_FILE"
  sed -i "s/versionName \".*\"/versionName \"$TARGET_VERSION\"/" "$GRADLE_FILE"
  echo "✅ Gradle atualizado: versionCode $NEW_CODE | versionName \"$TARGET_VERSION\""
fi

# 3. Compilar Web Assets e APK Android
echo "📦 Compilando aplicação e gerando APK..."
npm run build
./build-apk.sh

if [ ! -f "$APK_FILE" ]; then
  echo "❌ Erro: APK não encontrado em $APK_FILE"
  exit 1
fi

APK_SIZE=$(ls -lh "$APK_FILE" | awk '{print $5}')
echo "✅ APK gerado com sucesso ($APK_SIZE) em: $APK_FILE"

# 4. Commit e Push no Git (apenas no repositório chacara-inventario)
echo "📤 Atualizando repositório Git..."
git add -A
git commit -m "chore(release): bump version to $TARGET_VERSION" || echo "Sem mudanças para commitar."
git push origin main

# 5. Criar / Atualizar Release no GitHub via gh CLI
echo "🌐 Publicando release no GitHub..."
if gh release view "$TAG_NAME" >/dev/null 2>&1; then
  echo "⚠️ Release $TAG_NAME já existe. Atualizando anexo APK e notas..."
  gh release upload "$TAG_NAME" "$APK_FILE" --clobber
  gh release edit "$TAG_NAME" --title "$TAG_NAME - Atualização OTA" --notes "$RELEASE_NOTES"
else
  gh release create "$TAG_NAME" "$APK_FILE" \
    --title "$TAG_NAME - Atualização OTA" \
    --notes "$RELEASE_NOTES"
fi

echo "============================================================"
echo "🎉 RELEASE PUBLICADA COM SUCESSO!"
echo "Tag: $TAG_NAME"
echo "URL da Release: https://github.com/leeeopr/chacara-inventario/releases/tag/$TAG_NAME"
echo "O aplicativo instalado nos celulares detectará esta versão automaticamente na inicialização!"
echo "============================================================"
