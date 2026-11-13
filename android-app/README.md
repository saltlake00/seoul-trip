# 안드로이드 앱 (일정 알림)

웹 일정표와 같은 `data/trip.js`를 읽는 Capacitor 7 앱. 일정마다 로컬 알림을 예약한다.
계획과 Codex 검토 기록은 [`../docs/안드로이드-앱-계획.md`](../docs/안드로이드-앱-계획.md).

## 알림 규칙

- 시점은 여러 개(기본 30·10분 전, 직접 입력, 최대 9개), **시작 시각 기준**. 제목 「웨스틴 조선 서울 아리아 (뷔페) · 예약 17:30」, 본문 첫 줄 「30분 전 · 16:50 출발 (택시 40분)」. 알림이 출발 시각보다 늦으면 「출발 시각 16:50 지남! 바로 이동」.
- 이동(`move.min`)이 있으면 출발 시각에 「지금 출발 · 장소」를 하나 더(설정에서 끔, id 칸 9). 시점 중 이동 시간과 같은 것이 있으면 겹쳐서 뺀다.
- 일정별 켜고 끄기: 카드 스위치, 설정의 「일정별 알림」 목록(일자별 모두 켜기/끄기). 끈 항목 키는 `날짜|시각|이름`으로 저장.
- 9분 안에 몰린 알림은 하나로 묶는다(절전 중 앱당 9분 제한).
- 방식(소리·진동·팝업) 조합마다 채널 `trip-<0|1><0|1><0|1>`. 안드로이드 채널은 만든 뒤 바뀌지 않아서다. 소리 끔은 무음 파일 `android/app/src/main/res/raw/silence.wav`.
- 준비물 확인 알림: 첫 일정 3시간 전, 덜 챙긴 것이 있을 때만(id 2). 시험 알림 id 1.
- 시각은 KST(+09:00) 고정. 계산은 `src/alarms.js`(순수 함수), 시험은 `test/alarms.test.mjs`.
- 앱을 열 때, 앱으로 돌아올 때, 설정·토글을 바꿀 때 다시 예약한다. 새 목록에 없는 것만 지우고, 시각이 30분 안쪽으로 지났는데 대기 중인(늦게 울릴) 알림은 남긴다.

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
