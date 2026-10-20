# SWISHBY Android (Google Play)

swishby.com을 Trusted Web Activity(TWA)로 감싼 안드로이드 앱. [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)으로 만든다.

- 패키지: `com.minimalkorea.swishby` (애플 App ID와 동일)
- 시작 주소: `https://swishby.com/`, 세로 고정, `standalone` (상태 표시줄은 보이고 주소창은 없음; 게임이 safe-area를 직접 처리)
- target/compile SDK 36 (Android 16): 2026-08-31부터 Play 신규 앱·업데이트의 최소 요건. min SDK 24 (androidbrowserhelper 2.7.4 요건)

저장소에는 입력 파일(`twa-manifest.json`, 이 README)만 둔다. Gradle 프로젝트와 빌드 결과물은 `.gitignore` 대상이고 아래 명령으로 다시 만든다.

## 업로드 키 (저장소 밖)

- 키스토어: `~/swishby-android/upload-keystore.jks` (alias `upload`, RSA 2048, 10000일)
- 비밀번호: `~/swishby-android/keystore-password.txt` (스토어·키 동일)
- 업로드 인증서 SHA-256: `BA:79:B4:CA:15:9C:3B:DD:CD:99:D3:EC:D3:81:AE:F7:84:05:5F:08:4A:BB:E8:B3:88:DA:F0:A4:A0:FE:1B:73`

키스토어와 비밀번호 파일은 함께 안전한 곳(암호 관리자 등)에 백업한다. 잃어버리면 Play Console에서 업로드 키 재설정을 요청해야 한다.

## 빌드

필요: JDK 17 (`brew install openjdk@17`), Android SDK (build-tools 36.1.0, platforms;android-36), `npm i -g @bubblewrap/cli`, `~/.bubblewrap/config.json`의 `jdkPath`·`androidSdkPath`.

```sh
cd android
bubblewrap update --skipVersionUpgrade --manifest=./twa-manifest.json
export BUBBLEWRAP_KEYSTORE_PASSWORD="$(< ~/swishby-android/keystore-password.txt)"
export BUBBLEWRAP_KEY_PASSWORD="$BUBBLEWRAP_KEYSTORE_PASSWORD"
bubblewrap build --skipPwaValidation
```

결과: `android/app-release-bundle.aab` (Play 업로드용), `android/app-release-signed.apk` (기기 설치용).

새 버전을 올릴 때는 `twa-manifest.json`의 `appVersionCode`(정수, 매번 +1)와 `appVersion`을 올린 뒤 위 명령을 다시 실행한다.

## Digital Asset Links (주소창 없애기)

`/.well-known/assetlinks.json`(저장소 루트, GitHub Pages가 `https://swishby.com/.well-known/assetlinks.json`으로 제공)에 앱 서명 인증서 지문이 있어야 앱이 주소창 없이 열린다.

중요: Play App Signing을 쓰면 사용자가 받는 앱은 Google의 앱 서명 키로 다시 서명된다. 첫 업로드 후 Play Console → 앱 무결성(App integrity) → 앱 서명 키 인증서의 SHA-256 지문을 `assetlinks.json`의 `sha256_cert_fingerprints` 배열에 **추가**해야 한다 (업로드 키 지문은 그대로 둔다). 추가하지 않으면 Play에서 설치한 앱 위쪽에 주소창이 보인다. `twa-manifest.json`의 `fingerprints`에도 같이 넣어 두면 기록이 맞는다.

확인: `npm test` (`tests/assetlinks.test.js`), 배포 후 https://developers.google.com/digital-asset-links/tools/generator 에서 swishby.com과 패키지명으로 검사.
