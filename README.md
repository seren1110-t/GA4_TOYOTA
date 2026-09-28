# GA4 × GTM × BigQuery 연습 프로젝트 — TOYOMO

가상 자동차 브랜드 사이트를 만들고, 광고 클릭 → 웹 탐색 → 시승 신청 → 딜러 시승 → 계약까지의 고객 여정을 GA4와 BigQuery로 분석해 보는 연습 저장소.

- 라이브 사이트: https://seren1110-t.github.io/GA4_TOYOTA/
- GA4 측정 ID `G-G6Q8S0SC89` · GTM `GTM-54K728DZ` · BigQuery 프로젝트 `toyomo-ga4`

## 구조

| 경로 | 내용 |
|---|---|
| `site/` | 정적 사이트 (HTML/CSS/JS). `assets/app.js`가 dataLayer 이벤트와 고객 ID를 만든다 |
| `gtm/container.json` | GTM 컨테이너 설정 (관리자 → 컨테이너 가져오기로 복원 가능) |
| `docs/measurement-plan.md` | 측정 기획서: 이벤트·파라미터·퍼널·UTM·고객 식별 규칙 |
| `docs/mobile-app-notes.md` | 웹과 앱(Firebase) 측정의 차이 메모 |
| `scripts/simulate.py` | Playwright로 가상 방문자 트래픽 생성 → `data/sim_visits.csv`, `data/web_leads.csv` |
| `scripts/gen_offline.py` | 리드에서 딜러 시승·계약 CSV 생성 → `data/customers.csv` 외 |
| `sql/` | BigQuery 쿼리 4종: 웹 퍼널, 고객 여정 조인, 채널 기여도, BQML 리드 스코어링 |
| `.github/workflows/pages.yml` | `site/`를 GitHub Pages로 배포 |

## 실행

```bash
# 로컬 서버
python -m http.server 8080 -d site

# 가상 트래픽 (Playwright 필요: pip install playwright && playwright install chromium)
python scripts/simulate.py --users 40
python scripts/gen_offline.py
```

BigQuery에서는 `data/customers.csv`, `dealer_test_drives.csv`, `contracts.csv`를 `crm` 데이터세트로 업로드한 뒤 `sql/` 파일을 순서대로 실행한다.
