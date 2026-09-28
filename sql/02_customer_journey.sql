-- 02. One row per customer: ad click -> web behaviour -> test drive -> contract
-- Question: for each lead, what happened online AND offline, joined by customer_id?
--
-- Prerequisite: upload data/customers.csv, data/dealer_test_drives.csv and
-- data/contracts.csv into a dataset named `crm` in project toyomo-ga4
-- (BigQuery console -> dataset crm -> Create table -> Upload -> auto-detect schema).
--
-- The join key is user_id in GA4 (set on the thank-you page) = customer_id in CRM.

DECLARE start_date STRING DEFAULT '20260928';
DECLARE end_date   STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE());

WITH web AS (
  SELECT
    user_id                                                        AS customer_id,
    MIN(TIMESTAMP_MICROS(event_timestamp))                         AS first_web_event,
    MIN(IF(event_name = 'generate_lead',
           TIMESTAMP_MICROS(event_timestamp), NULL))               AS lead_time,
    -- first-touch attribution captured by the site and sent with generate_lead
    ANY_VALUE((SELECT value.string_value FROM UNNEST(event_params)
               WHERE key = 'first_touch_source'))                  AS first_touch_source,
    ANY_VALUE((SELECT value.string_value FROM UNNEST(event_params)
               WHERE key = 'first_touch_campaign'))                AS first_touch_campaign,
    ANY_VALUE((SELECT value.string_value FROM UNNEST(event_params)
               WHERE key = 'model_id' AND event_name = 'generate_lead')) AS lead_model,
    COUNTIF(event_name = 'view_item')                              AS models_viewed,
    COUNTIF(event_name = 'catalog_download')                       AS catalogs,
    COUNT(DISTINCT (SELECT value.int_value FROM UNNEST(event_params)
                    WHERE key = 'ga_session_id'))                  AS sessions
  FROM `toyomo-ga4.analytics_556171914.events_*`
  WHERE _TABLE_SUFFIX BETWEEN start_date AND end_date
    AND user_id IS NOT NULL
  GROUP BY user_id
)
SELECT
  c.customer_id, c.acquired_via, c.region, c.age_band,
  w.first_touch_source, w.first_touch_campaign, w.lead_model,
  w.sessions, w.models_viewed, w.catalogs,
  DATE(w.lead_time)                                                AS lead_date,
  td.test_drive_date, td.satisfaction,
  ct.contract_date, ct.model AS bought_model, ct.price,
  CASE
    WHEN ct.contract_id IS NOT NULL THEN '4 purchased'
    WHEN td.test_drive_id IS NOT NULL THEN '3 test drove'
    WHEN w.lead_time IS NOT NULL THEN '2 lead'
    ELSE '1 offline only'
  END                                                              AS journey_stage,
  DATE_DIFF(ct.contract_date, DATE(w.lead_time), DAY)              AS days_lead_to_contract
FROM `toyomo-ga4.crm.customers` c
LEFT JOIN web w  ON w.customer_id  = c.customer_id
LEFT JOIN `toyomo-ga4.crm.dealer_test_drives` td ON td.customer_id = c.customer_id
LEFT JOIN `toyomo-ga4.crm.contracts`          ct ON ct.customer_id = c.customer_id
ORDER BY journey_stage DESC, lead_date;
