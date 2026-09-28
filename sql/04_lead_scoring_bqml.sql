-- 04. Lead scoring with BigQuery ML
-- Question: given what a lead did on the website, how likely is a contract?
--
-- Three statements, run one at a time:
--   A) build a feature table (one row per lead, label = bought or not)
--   B) train a logistic regression model on it
--   C) score every lead and rank them for the dealer to call first
--
-- With ~50 leads this is a toy; the point is the workflow, not the accuracy.
-- BigQuery ML logistic regression is free-tier friendly (no extra service).

DECLARE start_date STRING DEFAULT '20260928';
DECLARE end_date   STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE());

-- A) feature table --------------------------------------------------------
CREATE OR REPLACE TABLE `toyomo-ga4.crm.lead_features` AS
WITH web AS (
  SELECT
    user_id AS customer_id,
    ANY_VALUE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'first_touch_source')) AS first_touch_source,
    ANY_VALUE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'model_id' AND event_name = 'generate_lead')) AS lead_model,
    ANY_VALUE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'region'   AND event_name = 'generate_lead')) AS region,
    ANY_VALUE(device.category)                    AS device_category,
    COUNTIF(event_name = 'page_view')             AS page_views,
    COUNTIF(event_name = 'view_item')             AS models_viewed,
    COUNTIF(event_name = 'catalog_download')      AS catalogs,
    COUNTIF(event_name = 'dealer_search')         AS dealer_searches,
    COUNT(DISTINCT (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id')) AS sessions
  FROM `toyomo-ga4.analytics_556171914.events_*`
  WHERE _TABLE_SUFFIX BETWEEN start_date AND end_date AND user_id IS NOT NULL
  GROUP BY user_id
)
SELECT
  w.*,
  c.age_band,
  td.satisfaction                              AS test_drive_satisfaction,
  IF(ct.contract_id IS NULL, 0, 1)             AS label_purchased
FROM web w
JOIN `toyomo-ga4.crm.customers` c USING (customer_id)
LEFT JOIN `toyomo-ga4.crm.dealer_test_drives` td USING (customer_id)
LEFT JOIN `toyomo-ga4.crm.contracts` ct USING (customer_id);

-- B) train -----------------------------------------------------------------
CREATE OR REPLACE MODEL `toyomo-ga4.crm.lead_score_model`
OPTIONS (model_type = 'LOGISTIC_REG', input_label_cols = ['label_purchased'], auto_class_weights = TRUE) AS
SELECT first_touch_source, lead_model, region, device_category, age_band,
       page_views, models_viewed, catalogs, dealer_searches, sessions, label_purchased
FROM `toyomo-ga4.crm.lead_features`;

-- how good is it?  (AUC, precision, recall)
SELECT * FROM ML.EVALUATE(MODEL `toyomo-ga4.crm.lead_score_model`);

-- C) score and rank leads ----------------------------------------------------
SELECT customer_id, first_touch_source, lead_model, region,
       ROUND(p.prob, 3) AS purchase_probability, label_purchased
FROM ML.PREDICT(MODEL `toyomo-ga4.crm.lead_score_model`,
                (SELECT * FROM `toyomo-ga4.crm.lead_features`)),
UNNEST(predicted_label_purchased_probs) AS p
WHERE p.label = 1
ORDER BY purchase_probability DESC;
