# 모바일 앱(오너스 앱) 측정은 웹과 무엇이 다른가

웹사이트 연습(TOYOMO)에서 익힌 GA4 개념을 앱으로 옮길 때 달라지는 점만 정리한 메모. 실제 앱은 만들지 않는다.

## 1. 수집 경로가 다르다

| 항목 | 웹 | 앱 (Android / iOS) |
|---|---|---|
| 태그 설치 | GTM 스니펫 → GA4 태그 | **Firebase SDK**를 앱 코드에 내장 (GA4 for Firebase) |
| 태그 관리 | 웹 GTM 컨테이너 | Firebase 콘솔 + (선택) GTM 앱 컨테이너 |
| 이벤트 전송 | `dataLayer.push()` | `Analytics.logEvent("view_item", params)` (코드에서 직접 호출) |
| 배포 | 사이트 배포 즉시 반영 | 앱 스토어 심사·업데이트 필요 → 이벤트 변경이 느리다 |
| 화면 조회 | `page_view` (URL 기준) | `screen_view` (화면 클래스 이름 기준) |

핵심 차이: 웹은 GTM으로 마케터가 태그를 바꿀 수 있지만, 앱은 **개발자가 빌드해야** 바뀐다. 그래서 앱은 측정 기획서를 훨씬 일찍, 더 꼼꼼하게 확정해야 한다.

## 2. 사용자 식별자가 다르다

| 식별자 | 웹 | 앱 |
|---|---|---|
| 익명 ID | `client_id` (쿠키 `_ga`) → BigQuery `user_pseudo_id` | `app_instance_id` (앱 설치 단위) → BigQuery `user_pseudo_id` |
| 수명 | 쿠키 삭제·브라우저 변경 시 리셋 | 앱 삭제·재설치 시 리셋 |
| 로그인 ID | `user_id` (우리 사이트: customer_id) | `user_id` (로그인 후 setUserId) |

오너스 앱은 대부분 **로그인 필수**라 `user_id`가 거의 항상 있다. 웹은 시승 신청 전까지 익명이다. 그래서 CDP에서는 앱 데이터가 고객 통합의 "앵커" 역할을 하고, 웹은 로그인/리드 시점에 앱 고객과 이어 붙는다.

GA4에서 웹+앱을 한 속성에 넣고 `user_id`가 같으면 **기기 간 사용자(cross-device)** 로 자동 통합된다 (보고 ID 설정: 혼합 → 사용자 ID 우선).

## 3. 우리 퍼널을 앱에 옮기면

| 웹 이벤트 | 앱 이벤트 | 비고 |
|---|---|---|
| `view_item_list` | `view_item_list` | 이름 그대로, Firebase 상수 `Event.VIEW_ITEM_LIST` |
| `view_item` | `view_item` | items 배열 구조 동일 |
| `lead_form_start` | `lead_form_start` (커스텀) | 앱은 25자 이름 제한, 파라미터 25개 제한 동일 |
| `generate_lead` | `generate_lead` | 앱은 푸시 알림 클릭(`notification_open`)도 유입 채널이 된다 |
| UTM | 딥링크/앱 캠페인 파라미터 | 앱 설치 캠페인은 `first_open` + 광고 네트워크 어트리뷰션 |

## 4. 오프라인 데이터와의 연결

앱은 계약 후 차량 등록·정비 예약 같은 **구매 이후 행동**을 담는다. CDP 관점에서 여정이 확장된다:

```
광고 → 웹(리드) → 딜러(시승·계약) → 앱(차량 등록, 정비, 재구매 신호)
```

BigQuery에서는 웹·앱 이벤트가 같은 `events_*` 테이블에 `platform` 컬럼(WEB / ANDROID / IOS)으로 구분되어 들어오므로, 02_customer_journey.sql에 `platform` 조건만 더하면 앱 행동을 같은 고객 행에 붙일 수 있다.

## 5. 앱 측정에서 흔한 실무 이슈

- iOS 14.5+ **ATT(앱 추적 투명성)**: 광고 식별자(IDFA) 수집이 동의 기반이라 광고 기여도 분석 정확도가 떨어진다.
- 앱 버전별로 이벤트 스키마가 다를 수 있다 → `app_info.version`으로 항상 필터·검증.
- 오프라인 상태에서 발생한 이벤트는 재접속 시 한꺼번에 전송돼 `event_timestamp`와 수집 시각이 어긋난다.
- 화면 이름이 개발자 클래스명(`MainActivity`)으로 들어오면 분석이 어렵다 → `screen_name`을 사람이 읽을 수 있게 명시 설정.
