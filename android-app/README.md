# 안드로이드 앱 (일정 알림)

웹 일정표와 같은 `data/trip.js`를 읽는 Capacitor 7 앱. 일정마다 로컬 알림을 예약한다.
계획과 Codex 검토 기록은 [`../docs/안드로이드-앱-계획.md`](../docs/안드로이드-앱-계획.md).

## 알림 규칙

- 이동 시간(`move.min`)이 있는 일정: **출발할 시각** = 시작 − 이동 − 여유(기본 10분). 제목 「출발할 시간 · 장소」.
- 이동이 없는 일정: 시작 − 여유. 제목 「10분 뒤 시작 · 장소」.
- 시각은 KST(+09:00) 고정. 계산은 `src/alarms.js`(순수 함수), 시험은 `test/alarms.test.mjs`.
- 앱을 열 때, 앱으로 돌아올 때, 설정·토글을 바꿀 때 전체를 지우고 다시 예약한다(시험 알림 id 9999는 남김).

## 일정을 고쳤을 때

1. 저장소 루트 `data/trip.js`를 고친다(새 일자에는 `date: "YYYY-MM-DD"` 필수).
2. `cd android-app && npm test` — 데이터에 날짜가 빠지면 여기서 실패한다.
3. `main`에 push하면 GitHub Actions `android-apk`가 APK를 만든다(약 4분).
4. 받기: `gh run download -R saltlake00/seoul-trip -n seoul-trip-apk -D android-app/dist`
5. 폰에 옮겨 덮어 설치한다. 앱을 한 번 열어야 새 일정으로 다시 예약된다.

## 서명 키

- CI는 저장소 비밀값 `TRIP_KEYSTORE_B64`·`TRIP_KEYSTORE_PASSWORD`가 있으면 그 고정 키로 서명한다. 없으면 실행마다 새 디버그 키라 **앱을 지우고 새로 설치**해야 한다(알림 설정·예약도 지워짐).
- 키 원본: `android-app/keystore/trip.p12`, 비밀번호 `keystore/trip.pw` (gitignore, 이 PC에만 있음). node-forge로 만든 PKCS12, 별칭 `trip`.
- 비밀값 등록(한 번):

```bash
cd /e/GitHub/seoul-trip && base64 -w0 android-app/keystore/trip.p12 | gh secret set TRIP_KEYSTORE_B64 && gh secret set TRIP_KEYSTORE_PASSWORD < android-app/keystore/trip.pw
```

## 로컬에서 화면 보기

`node scripts/build.mjs`로 `www/`를 채운 뒤, 저장소 루트를 서버로 띄워 `/android-app/www/`를 연다.
`?now=2026-11-14T14:50`을 붙이면 그 시각(KST)으로 「지금/다음」과 지난 일정 표시를 본다.
브라우저에서는 알림을 예약하지 않는다(설정 화면에 「미리보기」로 표시).

## 지도 타일

OSM 타일 서버는 앱(`https://localhost`) 요청을 막을 수 있어 Esri World Street Map을 쓴다.
CARTO basemaps는 2026-11-14 확인 때 키 없이 「API KEY REQUIRED」 타일을 돌려줘서 뺐다.
