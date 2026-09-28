"""
Synthetic traffic generator for the TOYOMO practice site.

Each simulated visitor gets a brand-new browser context (no cookies, no
localStorage), so GA4 sees them as distinct users. Visitors arrive from a
random marketing channel (UTM parameters) and walk the funnel to a random
depth before leaving:

    home -> lineup -> model detail -> test-drive form -> submitted (lead)

Leads are written to data/web_leads.csv with the same customer_id the site
computes (SHA-256 of "toyomo:" + phone digits), so step 6 can generate dealer
and contract records that join back to the web data.

Usage:
    python scripts/simulate.py --users 40
    python scripts/simulate.py --users 3 --headed      # watch it run
    python scripts/simulate.py --base http://127.0.0.1:8080/
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import random
import time
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = "https://seren1110-t.github.io/GA4_TOYOTA/"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Marketing channels the visitor can arrive from. Weights ~ typical mix.
CHANNELS = [
    # (utm_source, utm_medium, utm_campaign, weight)
    ("youtube", "video", "ravon_launch", 25),
    ("google", "cpc", "prima_search", 20),
    ("naver", "cpc", "brand_search", 20),
    ("instagram", "social", "ceres_lifestyle", 15),
    ("kakao", "display", "vento_family", 8),
    (None, None, None, 12),  # direct visit, no UTM
]

MODELS = ["ceres", "ravon", "prima", "vento"]
REGIONS = ["seoul", "gyeonggi", "incheon", "busan", "daegu", "daejeon", "gwangju"]
SURNAMES = "김이박최정강조윤장임한오서신권황안송류전홍"
GIVEN = ["민준", "서연", "지호", "수아", "도윤", "하은", "예준", "지우", "시우", "하린"]

# Funnel depth distribution (must sum to 100).
DEPTHS = [
    ("home_only", 30),
    ("lineup", 20),
    ("model_detail", 22),
    ("form_start", 13),
    ("lead", 15),
]

# A realistic desktop/mobile UA mix so GA4 does not classify the traffic as a bot.
USER_AGENTS = [
    ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", (1440, 900)),
    ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", (1536, 864)),
    ("Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36", (412, 915)),
    ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", (390, 844)),
]


def weighted_choice(items):
    """Pick one entry from [(value..., weight), ...] proportionally to weight.
    Returns the single value, or a list of values when the entry holds several."""
    total = sum(entry[-1] for entry in items)
    r = random.uniform(0, total)
    chosen = items[-1]
    for entry in items:
        r -= entry[-1]
        if r <= 0:
            chosen = entry
            break
    vals = list(chosen[:-1])
    return vals if len(vals) > 1 else vals[0]


def customer_id(phone_digits: str) -> str:
    """Same rule as site/assets/app.js so web and offline data join."""
    h = hashlib.sha256(f"toyomo:{phone_digits}".encode()).hexdigest()
    return "C" + h[:12].upper()


def pause(lo=0.8, hi=2.2):
    time.sleep(random.uniform(lo, hi))


def run_visitor(browser, idx: int, base: str, log):
    source, medium, campaign = weighted_choice(CHANNELS)
    depth = weighted_choice(DEPTHS)
    ua, (w, h) = random.choice(USER_AGENTS)
    model = random.choice(MODELS)
    region = random.choice(REGIONS)

    landing = base + "index.html"
    if source:
        landing += f"?utm_source={source}&utm_medium={medium}&utm_campaign={campaign}"

    ctx = browser.new_context(user_agent=ua, viewport={"width": w, "height": h}, locale="ko-KR")
    page = ctx.new_page()
    row = {
        "visitor": idx, "source": source or "(direct)", "medium": medium or "(none)",
        "campaign": campaign or "(not set)", "depth": depth, "model": "", "region": "",
        "customer_id": "", "phone": "", "name": "", "lead_id": "",
    }
    try:
        page.goto(landing, wait_until="load")
        pause(1.5, 3.0)
        # Some visitors scroll; GA4 enhanced measurement records scroll at 90%.
        if random.random() < 0.6:
            page.mouse.wheel(0, 2500)
            pause(0.5, 1.2)

        if depth == "home_only":
            if random.random() < 0.25:  # a few use the dealer finder and leave
                page.select_option("#region-select", region)
                page.click("#find-dealer")
                pause()
            return row

        # lineup: either the models page or a card straight from home
        if random.random() < 0.5:
            page.click('a[data-nav="models"]')
            page.wait_for_load_state("load")
            pause()
        if depth == "lineup":
            return row

        page.click(f'.card[data-id="{model}"]')
        page.wait_for_load_state("load")
        row["model"] = model
        pause(2.0, 4.0)
        if random.random() < 0.4:
            page.click('[data-track="catalog_download"]')
            pause(0.5, 1.0)
        if depth == "model_detail":
            return row

        page.click("#btn-test-drive")
        page.wait_for_load_state("load")
        pause()
        name = random.choice(SURNAMES) + random.choice(GIVEN)
        page.click("#f-name")  # triggers lead_form_start
        page.fill("#f-name", name)
        row["name"] = name
        pause(0.5, 1.0)
        page.select_option("#f-region", region)
        row["region"] = region
        if depth == "form_start":
            pause()
            return row

        phone_digits = "010" + f"{random.randint(2000, 9999)}{random.randint(1000, 9999)}"
        phone = f"{phone_digits[:3]}-{phone_digits[3:7]}-{phone_digits[7:]}"
        page.fill("#f-phone", phone)
        page.fill("#f-email", f"user{idx}@example.com")
        page.fill("#f-date", (date.today() + timedelta(days=random.randint(2, 14))).isoformat())
        page.check("#f-consent")
        pause(0.5, 1.0)
        page.click('#lead-form button[type=submit]')
        page.wait_for_url("**/thanks.html", timeout=15000)
        pause(2.0, 3.5)  # give generate_lead time to leave the browser
        lead = page.evaluate("JSON.parse(localStorage.getItem('toyomo_leads') || '[]').slice(-1)[0] || {}")
        row.update({
            "customer_id": lead.get("customer_id") or customer_id(phone_digits),
            "phone": phone,
            "lead_id": lead.get("lead_id", ""),
        })
        return row
    except Exception as exc:  # keep going; one broken visitor should not stop the batch
        row["depth"] = f"error:{type(exc).__name__}"
        log(f"  visitor {idx}: {exc}")
        return row
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--users", type=int, default=40)
    ap.add_argument("--base", default=BASE_URL)
    ap.add_argument("--headed", action="store_true", help="show the browser window")
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()
    if args.seed is not None:
        random.seed(args.seed)

    DATA_DIR.mkdir(exist_ok=True)
    out_visits = DATA_DIR / "sim_visits.csv"
    out_leads = DATA_DIR / "web_leads.csv"
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        for i in range(1, args.users + 1):
            row = run_visitor(browser, i, args.base, print)
            rows.append(row)
            print(f"visitor {i:>3}/{args.users}  {row['source']:<10} {row['depth']:<13} {row['model'] or '-':<6} {row['customer_id'] or ''}")
        browser.close()

    fields = list(rows[0].keys())
    with out_visits.open("w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=fields)
        wr.writeheader()
        wr.writerows(rows)
    leads = [r for r in rows if r["customer_id"]]
    # Append so repeated runs accumulate a growing lead list.
    new_file = not out_leads.exists()
    with out_leads.open("a", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=["visitor", "customer_id", "lead_id", "phone", "model", "region", "source", "medium", "campaign", "run_date"])
        if new_file:
            wr.writeheader()
        for r in leads:
            wr.writerow({k: r.get(k, "") for k in ["visitor", "customer_id", "lead_id", "phone", "model", "region", "source", "medium", "campaign"]} | {"run_date": date.today().isoformat()})

    depths = {}
    for r in rows:
        depths[r["depth"]] = depths.get(r["depth"], 0) + 1
    print("\nfunnel depth summary:", depths)
    print(f"leads this run: {len(leads)}  ->  {out_leads}")
    print(f"all visits    ->  {out_visits}")


if __name__ == "__main__":
    main()
