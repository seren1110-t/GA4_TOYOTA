# TOYOMO 측정 기획서 (Measurement Plan)

연습용 자동차 브랜드 사이트 TOYOMO의 GA4 이벤트 설계 문서. 대행사 분석팀에서 "측정 기획서" 또는 "태깅 가이드"라고 부르는 산출물의 연습 버전이다.

| 항목 | 값 |
|---|---|
| GA4 계정 / 속성 | TOYOMO Practice (a409697680) / TOYOMO 웹사이트 (p556171914) |
| 데이터 스트림 | TOYOMO 웹 (15857159864), 측정 ID `G-G6Q8S0SC89` |
| GTM 컨테이너 | toyomo-web, `GTM-54K728DZ` (설정 원본: `gtm/container.json`) |
| 사이트 코드 | `site/assets/app.js` (dataLayer push), `site/assets/config.js` (GTM ID) |
| 최종 목표 (전환) | `generate_lead` — 시승 신청 완료 |

## 1. 데이터 흐름

```
사이트 코드 ──dataLayer.push()──▶ GTM 컨테이너 ──GA4 이벤트 태그──▶ GA4 속성 ──일일 내보내기──▶ BigQuery
                                   (트리거가 이벤트 이름을 보고 태그 실행)
```

- 사이트는 GA4를 직접 모른다. `window.dataLayer`에 `{event, ...params}`만 밀어 넣는다.
- GTM은 dataLayer의 `event` 값을 트리거 조건으로 읽고, 변수(`DL - *`)로 파라미터를 꺼내 GA4 태그에 실어 보낸다.
- 따라서 GA4에 보낼 파라미터를 바꾸고 싶으면 GTM만 수정하면 되고, 사이트 코드는 건드리지 않는다.

## 2. 퍼널 정의

| 단계 | 페이지 | 이벤트 | 의미 |
|---|---|---|---|
| 1 | index.html | `page_view` (자동) | 방문 |
| 2 | index.html / models.html | `view_item_list` | 라인업 노출 |
| 3 | model.html | `view_item` | 모델 상세 조회 |
| 4 | test-drive.html | `lead_form_start` | 시승 신청 폼 첫 입력 |
| 5 | thanks.html | `generate_lead` | 시승 신청 완료 (전환) |

GA4 탐색 분석 → 유입경로 탐색에서 위 5개 이벤트를 순서대로 단계로 넣으면 퍼널 보고서가 된다.

## 3. 이벤트 명세

### 3.1 전자상거래형 이벤트 (GA4 표준 이름, `ecommerce.items` 사용)

| 이벤트 | 발생 시점 | 파라미터 | GTM 태그 |
|---|---|---|---|
| `view_item_list` | 홈 라인업 또는 전체 모델 목록이 렌더링될 때 | `item_list_id` (home_teaser / lineup), `ecommerce.items[]` | GA4 - Ecommerce events |
| `select_item` | 목록에서 모델 카드를 클릭할 때 | `item_list_id`, `ecommerce.items[]` (클릭한 1개) | GA4 - Ecommerce events |
| `view_item` | 모델 상세 페이지 로드 | `ecommerce.currency` = KRW, `ecommerce.value` = 가격, `ecommerce.items[]` | GA4 - Ecommerce events |

`items[]` 원소 구조: `item_id` (ceres/ravon/prima/vento), `item_name`, `item_category` (세단/SUV/하이브리드/미니밴), `price`, `index`, `item_list_name`.

### 3.2 사이트 상호작용 이벤트 (커스텀)

| 이벤트 | 발생 시점 | 파라미터 |
|---|---|---|
| `cta_click` | 주요 버튼 클릭 | `cta` (hero_test_drive, header_test_drive, detail_test_drive, dealer_result_test_drive, thanks_view_models …), `model`, `region`, `page_type` |
| `nav_click` | 상단 메뉴 클릭 | `nav` (logo / models / dealers), `page_type` |
| `click_call` | 전화번호 링크 클릭 | `location` (header / footer), `page_type` |
| `catalog_download` | 카탈로그 버튼 클릭 | `model`, `file_name` |
| `dealer_search` | 전시장 찾기 실행 | `region`, `dealer_name` |
| `lead_form_start` | 폼 필드에 처음 포커스 | `form_id` = test_drive, `model_id`, `region` |
| `lead_form_select` | 폼에서 모델/지역 선택 변경 | `form_id`, `field` (model / region), `field_value` |
| `lead_form_error` | 제출했지만 검증 실패 | `form_id`, `invalid_fields` (쉼표 구분) |
| `lead_form_submit` | 검증 통과, 제출 직전 | `form_id`, `lead_id`, `model_id`, `region` |

GTM 태그: GA4 - Site interaction events (이벤트 이름은 `{{Event}}` 그대로 전달, 위 파라미터 전부 매핑. 값이 없는 파라미터는 GA4가 자동으로 생략).

### 3.3 전환 이벤트

| 이벤트 | 발생 시점 | 파라미터 | 사용자 속성 |
|---|---|---|---|
| `generate_lead` | thanks.html 로드 시 1회 (sessionStorage의 대기 리드가 있을 때만) | `lead_id`, `model_id`, `region`, `dealer_name`, `currency` = KRW, `value` = 모델가 × 2% (리드 가치 가정), `first_touch_source / medium / campaign` | `interest_model`, `home_region` |

GTM 태그: GA4 - generate_lead (전환). GA4 관리 → 이벤트에서 별표를 눌러 **주요 이벤트**로 지정해야 전환 보고서와 광고 연동에 잡힌다 (첫 수집 후 최대 24시간 뒤 목록에 나타남).

## 4. 고객 식별 (CDP 연결 고리)

| 항목 | 규칙 |
|---|---|
| `customer_id` | 시승 신청 시 `SHA-256("toyomo:" + 휴대폰 숫자)` 앞 12자리 + 접두어 `C`. 같은 번호 → 항상 같은 ID |
| 저장 위치 | 브라우저 localStorage `toyomo_customer` (연습용. 실제 서비스는 서버 DB) |
| GA4 전송 | 모든 페이지 로드 시 dataLayer에 `user_id` push → GTM "GA4 - Google 태그 (config)"의 `user_id` 필드 → GA4 `user_id` |
| 오프라인 조인 키 | 딜러 시승 기록·계약 기록 CSV에도 같은 규칙으로 `customer_id`를 부여해 BigQuery에서 조인 |

주의: 원본 전화번호·이름·이메일은 GA4로 절대 보내지 않는다 (GA4 약관상 PII 금지). 해시된 ID만 보낸다.

## 5. 유입 채널 (UTM) 규칙

| 파라미터 | 값 규칙 | 예 |
|---|---|---|
| `utm_source` | 매체사 소문자 | youtube, google, naver, instagram, kakao |
| `utm_medium` | 채널 유형 | video, cpc, display, social, email |
| `utm_campaign` | `{모델}_{목적}` | ravon_launch, prima_search, brand_always_on |
| `utm_content` | 소재 구분 (선택) | 15s_a, banner_300x250 |

- GA4는 UTM을 자동으로 세션 소스/매체로 기록한다 (마지막 터치 기준 기본 보고서).
- 사이트는 별도로 **첫 방문 시 UTM**을 localStorage에 저장했다가 `generate_lead`에 `first_touch_*`로 실어 보낸다 → "처음 어떤 광고로 들어온 사람이 결국 리드가 됐나"를 이벤트 단위로 볼 수 있다.

## 6. GTM 구성 요약

| 종류 | 이름 | 역할 |
|---|---|---|
| 태그 | GA4 - Google 태그 (config) | 모든 페이지 초기화 시 GA4 로드, `user_id` 설정 |
| 태그 | GA4 - Ecommerce events | 트리거 CE - Ecommerce events, `ecommerce` 객체 전송 |
| 태그 | GA4 - Site interaction events | 트리거 CE - Site interaction events |
| 태그 | GA4 - generate_lead (전환) | 트리거 CE - generate_lead, 사용자 속성 설정 |
| 트리거 | CE - Ecommerce events | 맞춤 이벤트 정규식 `^(view_item_list\|select_item\|view_item)$` |
| 트리거 | CE - Site interaction events | 맞춤 이벤트 정규식 (3.2의 9개 이름) |
| 트리거 | CE - generate_lead | 맞춤 이벤트 = `generate_lead` |
| 변수 | DL - * (21개) | dataLayer 버전 2 변수, 파라미터 이름과 동일 |

## 7. 검증 체크리스트

- [x] 로컬에서 dataLayer 패널에 5단계 이벤트가 순서대로 찍힌다
- [x] GTM 미리보기에서 config 태그와 view_item_list 태그가 실행된다
- [x] GTM 버전 2 게시 후 GA4 실시간 개요에 page_view / view_item_list / catalog_download / cta_click이 보인다
- [ ] GA4 이벤트 목록에 generate_lead가 나타나면 별표로 주요 이벤트 지정 (수집 후 최대 24시간)
- [ ] DebugView에서 generate_lead의 파라미터(lead_id, first_touch_source…)가 보인다
- [ ] BigQuery 연동 후 `events_*` 테이블에서 `user_id`가 채워진 행이 있다

## 8. 알려진 한계 (연습용 단순화)

- 고객 ID가 브라우저 저장소에만 있어 브라우저를 바꾸면 새 고객으로 잡힌다.
- 동의 모드(Consent Mode)를 넣지 않았다. 실무(특히 EU 트래픽)에서는 쿠키 동의 배너와 GTM 동의 설정이 선행된다.
- `value`는 임의 가정(모델가의 2%)이다. 실무에서는 리드 → 계약 전환율 × 평균 마진으로 정한다.
