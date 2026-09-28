-- 01. Web funnel from the GA4 BigQuery export
-- Question: of the users who visited, how many reached each funnel step?
--
-- GA4 export layout: one row per EVENT. Every row carries user_pseudo_id
-- (anonymous browser id), user_id (our customer_id, only after a lead), the
-- event_name and a nested event_params array. Tables are daily shards named
-- events_YYYYMMDD, queried together with the wildcard events_*.
--
-- Replace the date range below as the data grows.

DECLARE start_date STRING DEFAULT '20260928';
DECLARE end_date   STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE());

WITH steps AS (
  SELECT
    user_pseudo_id,
    LOGICAL_OR(event_name = 'page_view')       AS s1_visit,
    LOGICAL_OR(event_name = 'view_item_list')  AS s2_lineup,
    LOGICAL_OR(event_name = 'view_item')       AS s3_model_detail,
    LOGICAL_OR(event_name = 'lead_form_start') AS s4_form_start,
    LOGICAL_OR(event_name = 'generate_lead')   AS s5_lead
  FROM `toyomo-ga4.analytics_556171914.events_*`
  WHERE _TABLE_SUFFIX BETWEEN start_date AND end_date
  GROUP BY user_pseudo_id
)
SELECT step, users,
       ROUND(100 * users / MAX(users) OVER (), 1)                        AS pct_of_visitors,
       ROUND(100 * users / LAG(users) OVER (ORDER BY step_no), 1)        AS pct_of_previous_step
FROM (
  SELECT 1 AS step_no, '1 visit'        AS step, COUNTIF(s1_visit)        AS users FROM steps UNION ALL
  SELECT 2, '2 lineup',       COUNTIF(s2_lineup)       FROM steps UNION ALL
  SELECT 3, '3 model detail', COUNTIF(s3_model_detail) FROM steps UNION ALL
  SELECT 4, '4 form start',   COUNTIF(s4_form_start)   FROM steps UNION ALL
  SELECT 5, '5 lead',         COUNTIF(s5_lead)         FROM steps
)
ORDER BY step_no;
