#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "1. Compilando aplicação web (Vite)..."
npm run build

echo "2. Sincronizando ativos com Capacitor Android..."
npx cap sync android

echo "3. Compilando APK Android (Gradle assembleDebug)..."
export JAVA_HOME="/home/leo/.local/android-build/jdk"
export ANDROID_HOME="/home/leo/.local/android-build/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

./android/gradlew -p android assembleDebug

cp android/app/build/outputs/apk/debug/app-debug.apk "./Chacara-Inventario.apk"

echo "✅ APK gerado com sucesso em: $(pwd)/Chacara-Inventario.apk"
ls -lh "./Chacara-Inventario.apk"
