# 인계 — 안드로이드 일정 알림 앱 (2026-11-14 03시 기준)

## 목표

`data/trip.js` 일정표를 휴대폰에서 보기 좋은 안드로이드 앱(Capacitor 7)으로 만들고, 일정마다 알림을 띄운다.
여행은 2026-11-14(토) 10:17 광주송정 KTX부터 11-15(일) 16:08 용산 KTX까지다.

## 현재 상태

- 앱: `android-app/` (화면 `src/main.js`, 알림 계산 `src/alarms.js`, 시험 `test/alarms.test.mjs` 19개, 세 시간대 통과).
- 빌드: GitHub Actions `android-apk`가 `main` push마다 APK를 만든다. 최신 커밋은 df6f01c이고, 받은 APK는 `android-app/dist/`(gitignore)에 있다.
- 계획과 Codex 검토 1~3차(계획, 코드, 화면 문구·배치)의 반영 기록은 `docs/안드로이드-앱-계획.md` 9절에 있다.
- 사용 설명과 알림 규칙은 `android-app/README.md`에 있다.

### 들어간 기능

- 알림 시간: 시작 시각 기준이고 여러 개를 고를 수 있다(기본 30·10분 전, 직접 입력 가능). 출발할 때 알림을 따로 켤 수 있고, 기차는 출발 1시간 전 알림이 더해진다.
- 알림 방식: 소리·진동·팝업을 조합마다 채널로 나눈다. 일정별 켜고 끄기는 카드 스위치와 설정의 접힌 목록 두 곳에서 한다.
- 팀 기차는 `trip.departures`에 있고, 화면에 「광주 : 광주→용산 / 출발 10:17」로 나온다.
- 「중요」 표시는 예약한 일정과 기차 출발에만 붙는다.
- 그 밖에 출발 시각 지남 경고, 준비물 체크와 첫 일정 3시간 전 알림, 급할 때 연락 카드, 지도 「내 위치」가 있다.

## 사용자가 할 것 (내가 못 한 것)

1. ~~서명 키 비밀값 등록~~ — 11-14 등록 완료(`TRIP_KEYSTORE_B64`·`TRIP_KEYSTORE_PASSWORD`). Claude가 알아서 실행하면 자동 모드 분류기가 「Secret-Store Writes」로 막고, 사용자가 채팅에 명령을 직접 붙여 넣으면 통과했다. 등록 뒤 빌드부터 고정 키라, 그 전에 설치한 앱은 한 번 지우고 다시 설치한다.
   - 배포: 카카오톡은 APK 전송을 막는다. GitHub 릴리스에 `seoul-trip.apk` 이름으로 올리면 `https://github.com/saltlake00/seoul-trip/releases/latest/download/seoul-trip.apk`가 늘 최신을 가리킨다(11-14 `app-e06d6a6` 첫 릴리스). 새 빌드는 `gh release create app-<sha> <apk> --target main`(sha를 target으로 주면 422).
2. 폰에 설치하고 `docs/안드로이드-앱-계획.md` 10절 목록을 확인한다(권한, 시험 알림, 예약 개수, 알림 눌러 이동). **실기기 알림은 아직 아무도 확인하지 못했다.** 이 PC에는 adb(Android SDK platform-tools)가 없어서 Claude가 폰을 대신 볼 수 없다(11-14 확인). 화면을 끈 채 울리는지 같은 항목은 어차피 폰에서 사람이 봐야 한다.

## 다음 액션 후보

- 미룬 기능: 정산 계산기, 일정별 개인 메모(예약번호, 폰에만 저장), 날씨.
- 천안아산팀 기차 시각이 정해지면 `departures`에 한 줄 추가한다.
- 웹 일정표(`index.html`)에도 기차 일정을 보여 줄지 정한다(지금은 앱에서만 보인다).

## 주의

- `data/trip.js`를 바꾸면 앱 APK도 다시 빌드된다. 새 일자에는 `date` 필드가 필수다.
- 지도 타일은 Esri를 쓴다. CARTO는 키를 요구하고, OSM은 앱 출처를 막을 수 있다.
