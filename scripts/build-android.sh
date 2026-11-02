#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_PLATFORM_JAR:?Defina o caminho ao android.jar API 35}"
: "${ANDROID_BUILD_TOOLS:?Defina a pasta build-tools 35}"
: "${ANDROID_ECJ_JAR:?Defina o caminho ao compilador Eclipse ECJ 3.37.0}"
: "${COPEX_ANDROID_KEYSTORE:?Defina seu keystore de assinatura privado}"
: "${COPEX_ANDROID_KEYSTORE_PASS_FILE:?Defina o arquivo privado com a senha do keystore}"
build_dir=.android-build
rm -rf "$build_dir/classes" "$build_dir/dex"
rm -f "$build_dir/resources.zip" "$build_dir/unsigned.apk" "$build_dir/aligned.apk"
mkdir -p "$build_dir/classes" "$build_dir/dex" releases
"$ANDROID_BUILD_TOOLS/aapt2" compile --dir android/res -o "$build_dir/resources.zip"
"$ANDROID_BUILD_TOOLS/aapt2" link -o "$build_dir/unsigned.apk" -I "$ANDROID_PLATFORM_JAR" --manifest android/AndroidManifest.xml -A android/assets "$build_dir/resources.zip"
mapfile -t java_files < <(find android/src -name '*.java' -type f)
java -jar "$ANDROID_ECJ_JAR" -source 1.8 -target 1.8 -proc:none -classpath "$ANDROID_PLATFORM_JAR" -d "$build_dir/classes" "${java_files[@]}"
mapfile -t class_files < <(find "$build_dir/classes" -name '*.class' -type f)
java -cp "$ANDROID_BUILD_TOOLS/lib/d8.jar" com.android.tools.r8.D8 --lib "$ANDROID_PLATFORM_JAR" --min-api 29 --output "$build_dir/dex" "${class_files[@]}"
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('.android-build/unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:z.write('.android-build/dex/classes.dex','classes.dex')
PY
"$ANDROID_BUILD_TOOLS/zipalign" -f -p 4 "$build_dir/unsigned.apk" "$build_dir/aligned.apk"
java -jar "$ANDROID_BUILD_TOOLS/lib/apksigner.jar" sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --ks "$COPEX_ANDROID_KEYSTORE" --ks-pass "file:$COPEX_ANDROID_KEYSTORE_PASS_FILE" --ks-key-alias copex --out releases/Copex-Android.apk "$build_dir/aligned.apk"
java -jar "$ANDROID_BUILD_TOOLS/lib/apksigner.jar" verify --verbose --min-sdk-version 29 releases/Copex-Android.apk
java -jar "$ANDROID_BUILD_TOOLS/lib/apksigner.jar" verify --verbose --min-sdk-version 36 --max-sdk-version 36 releases/Copex-Android.apk
"$ANDROID_BUILD_TOOLS/zipalign" -c -v 4 releases/Copex-Android.apk
"$ANDROID_BUILD_TOOLS/aapt2" dump badging releases/Copex-Android.apk | head -8
