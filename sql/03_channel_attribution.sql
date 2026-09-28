-- 03. Channel performance all the way to purchase
-- Question: which first-touch channel produces users, leads, test drives and
-- contracts, and what is the revenue per lead by channel?
--
-- Two different notions of "source" are compared on purpose:
--   * GA4's own traffic_source.source  = source of the user's FIRST session (GA4 first-touch)
--   * first_touch_source event param   = what the SITE stored in localStorage
-- They should match; differences are a good debugging exercise.

DECLARE start_date STRING DEFAULT '20260928';
DECLARE end_date   STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE());

WITH users AS (
  SELECT
    user_pseudo_id,
    ANY_VALUE(user_id)                                    AS customer_id,
    ANY_VALUE(traffic_source.source)                      AS ga4_first_source,
    ANY_VALUE(traffic_source.medium)                      AS ga4_first_medium,
    LOGICAL_OR(event_name = 'generate_lead')              AS is_lead
  FROM `toyomo-ga4.analytics_556171914.events_*`
  WHERE _TABLE_SUFFIX BETWEEN start_date AND end_date
  GROUP BY user_pseudo_id
)
SELECT
  COALESCE(u.ga4_first_source, '(direct)')                AS first_source,
  COALESCE(u.ga4_first_medium, '(none)')                  AS first_medium,
  COUNT(*)                                                AS users,
  COUNTIF(u.is_lead)                                      AS leads,
  COUNT(DISTINCT td.customer_id)                          AS test_drives,
  COUNT(DISTINCT ct.customer_id)                          AS contracts,
  SUM(ct.price)                                           AS revenue,
  ROUND(100 * COUNTIF(u.is_lead) / COUNT(*), 1)           AS lead_rate_pct,
  ROUND(100 * COUNT(DISTINCT ct.customer_id)
        / NULLIF(COUNTIF(u.is_lead), 0), 1)               AS lead_to_contract_pct,
  ROUND(SUM(ct.price) / NULLIF(COUNTIF(u.is_lead), 0))    AS revenue_per_lead
FROM users u
LEFT JOIN `toyomo-ga4.crm.dealer_test_drives` td ON td.customer_id = u.customer_id
LEFT JOIN `toyomo-ga4.crm.contracts`          ct ON ct.customer_id = u.customer_id
GROUP BY first_source, first_medium
ORDER BY users DESC;
