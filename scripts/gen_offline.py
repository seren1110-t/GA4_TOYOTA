"""
Generate fake dealer (offline) data that joins to the web leads by customer_id.

Reads  data/web_leads.csv   (written by scripts/simulate.py)
Writes data/customers.csv          one row per known customer (web lead or walk-in)
       data/dealer_test_drives.csv test drives that actually happened at a dealer
       data/contracts.csv          signed purchase contracts

The join key everywhere is customer_id = "C" + SHA-256("toyomo:" + phone digits)[:12],
the same rule the website uses when it mints the id at form submit.

Probabilities are deliberately skewed by channel and model so the later
BigQuery analysis has something to find (e.g. youtube leads convert better,
Vento buyers are older families in the suburbs).

Usage:
    python scripts/gen_offline.py            # uses data/web_leads.csv
    python scripts/gen_offline.py --seed 7   # reproducible
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import random
from datetime import date, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

DEALERS = {
    "seoul": "서울 강남 전시장", "gyeonggi": "분당 판교 전시장", "incheon": "인천 송도 전시장",
    "busan": "부산 해운대 전시장", "daegu": "대구 수성 전시장", "daejeon": "대전 둔산 전시장",
    "gwangju": "광주 상무 전시장",
}
PRICES = {"ceres": 32_900_000, "ravon": 41_500_000, "prima": 36_800_000, "vento": 45_200_000}
TRIMS = ["Standard", "Premium", "Signature"]
SALES_REPS = ["김대리", "이과장", "박주임", "최팀장", "정사원", "강대리"]

# Chance that a web lead shows up for the test drive, by first-touch source.
SHOW_RATE = {"youtube": 0.80, "google": 0.70, "naver": 0.72, "instagram": 0.55, "kakao": 0.60, "(direct)": 0.75}
# Chance that a completed test drive turns into a contract, by source.
CLOSE_RATE = {"youtube": 0.45, "google": 0.40, "naver": 0.35, "instagram": 0.22, "kakao": 0.28, "(direct)": 0.42}


def customer_id(phone_digits: str) -> str:
    return "C" + hashlib.sha256(f"toyomo:{phone_digits}".encode()).hexdigest()[:12].upper()


def rand_date(start: date, max_days: int) -> date:
    return start + timedelta(days=random.randint(0, max_days))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--walkins", type=int, default=12, help="offline-only customers with no web lead")
    args = ap.parse_args()
    random.seed(args.seed)

    leads_path = DATA_DIR / "web_leads.csv"
    if not leads_path.exists():
        raise SystemExit(f"{leads_path} not found - run scripts/simulate.py first")
    with leads_path.open(encoding="utf-8") as f:
        leads = list(csv.DictReader(f))

    customers, test_drives, contracts = {}, [], []
    today = date.today()

    # 1) customers who came through the website
    for lead in leads:
        cid = lead["customer_id"]
        lead_date = date.fromisoformat(lead["run_date"])
        customers[cid] = {
            "customer_id": cid, "region": lead["region"], "home_dealer": DEALERS[lead["region"]],
            "age_band": random.choice(["20s", "30s", "30s", "40s", "40s", "50s", "60s+"]),
            "gender": random.choice(["F", "M"]), "acquired_via": "web_lead",
            "first_seen": lead_date.isoformat(), "web_lead_id": lead["lead_id"],
            "first_touch_source": lead["source"],
        }
        if random.random() < SHOW_RATE.get(lead["source"], 0.7):
            td_date = rand_date(lead_date + timedelta(days=1), 10)
            rep = random.choice(SALES_REPS)
            test_drives.append({
                "test_drive_id": f"TD{len(test_drives) + 1:05d}", "customer_id": cid,
                "dealer": DEALERS[lead["region"]], "model": lead["model"], "test_drive_date": td_date.isoformat(),
                "sales_rep": rep, "satisfaction": random.choices([3, 4, 5], [1, 3, 4])[0],
                "web_lead_id": lead["lead_id"],
            })
            if random.random() < CLOSE_RATE.get(lead["source"], 0.35):
                model = lead["model"] if random.random() < 0.85 else random.choice(list(PRICES))
                trim = random.choices(TRIMS, [4, 4, 2])[0]
                price = PRICES[model] + TRIMS.index(trim) * 2_400_000
                contracts.append({
                    "contract_id": f"CT{len(contracts) + 1:05d}", "customer_id": cid,
                    "contract_date": rand_date(td_date + timedelta(days=1), 21).isoformat(),
                    "dealer": DEALERS[lead["region"]], "model": model, "trim": trim, "price": price,
                    "sales_rep": rep, "financing": random.choice(["cash", "loan", "lease"]),
                })

    # 2) walk-in customers the website never saw (offline-only rows to reason about)
    for i in range(args.walkins):
        phone = "010" + f"{random.randint(2000, 9999)}{random.randint(1000, 9999)}"
        cid = customer_id(phone)
        region = random.choice(list(DEALERS))
        seen = rand_date(today - timedelta(days=20), 15)
        customers[cid] = {
            "customer_id": cid, "region": region, "home_dealer": DEALERS[region],
            "age_band": random.choice(["30s", "40s", "50s", "60s+"]), "gender": random.choice(["F", "M"]),
            "acquired_via": "walk_in", "first_seen": seen.isoformat(), "web_lead_id": "", "first_touch_source": "",
        }
        model = random.choice(list(PRICES))
        test_drives.append({
            "test_drive_id": f"TD{len(test_drives) + 1:05d}", "customer_id": cid, "dealer": DEALERS[region],
            "model": model, "test_drive_date": seen.isoformat(), "sales_rep": random.choice(SALES_REPS),
            "satisfaction": random.choices([3, 4, 5], [1, 3, 4])[0], "web_lead_id": "",
        })
        if random.random() < 0.5:
            trim = random.choice(TRIMS)
            contracts.append({
                "contract_id": f"CT{len(contracts) + 1:05d}", "customer_id": cid,
                "contract_date": rand_date(seen + timedelta(days=1), 14).isoformat(), "dealer": DEALERS[region],
                "model": model, "trim": trim, "price": PRICES[model] + TRIMS.index(trim) * 2_400_000,
                "sales_rep": random.choice(SALES_REPS), "financing": random.choice(["cash", "loan", "lease"]),
            })

    def write(name, rows):
        path = DATA_DIR / name
        with path.open("w", newline="", encoding="utf-8") as f:
            wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)
        print(f"{name:<25} {len(rows):>4} rows")

    write("customers.csv", list(customers.values()))
    write("dealer_test_drives.csv", test_drives)
    write("contracts.csv", contracts)
    web = sum(1 for c in customers.values() if c["acquired_via"] == "web_lead")
    print(f"\nweb leads {web} -> test drives {sum(1 for t in test_drives if t['web_lead_id'])} -> contracts {sum(1 for c in contracts if customers[c['customer_id']]['acquired_via'] == 'web_lead')}")


if __name__ == "__main__":
    main()
