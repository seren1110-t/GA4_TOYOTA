/*
 * TOYOMO practice site — shared behaviour.
 *
 * Responsibilities
 *  1. Load Google Tag Manager (GTM) using the container ID in config.js.
 *  2. Provide a tiny `track(event, params)` helper that pushes to the dataLayer.
 *     The site never talks to GA4 directly; GTM reads the dataLayer and
 *     forwards events. This keeps tagging decisions out of site code.
 *  3. Persist marketing touch points (utm_* / gclid) so the lead can carry
 *     first-touch attribution — needed for the online-to-offline join later.
 *  4. Manage the customer identity: a customer_id is minted when the
 *     test-drive form is submitted and re-sent as user_id on every later page.
 *  5. Render per-page content (lineup, model detail, form, thanks page).
 *  6. Show a small on-page debug panel listing every dataLayer push, so the
 *     funnel can be verified before GTM/GA4 exist.
 */
(function () {
  'use strict';

  var CFG = window.SITE_CONFIG || {};
  var MODELS = window.MODELS || [];
  var REGIONS = window.REGIONS || [];

  // ---------- storage keys ----------
  var KEY_CUSTOMER = 'toyomo_customer';     // localStorage: {customer_id, region, interest_model, created_at}
  var KEY_FIRST_TOUCH = 'toyomo_first_touch'; // localStorage: {source, medium, campaign, content, gclid, ts}
  var KEY_LAST_TOUCH = 'toyomo_last_touch';   // sessionStorage
  var KEY_PENDING_LEAD = 'toyomo_pending_lead'; // sessionStorage: lead handed from form -> thanks page
  var KEY_LEADS = 'toyomo_leads';             // localStorage: array of submitted leads (practice bookkeeping)

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function readJSON(store, key, fallback) {
    try { var v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* storage may be blocked; ignore */ }
  }
  function fmtPrice(n) { return n.toLocaleString('ko-KR') + '원'; }
  function param(name) { return new URLSearchParams(location.search).get(name); }
  function findModel(id) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].item_id === id) return MODELS[i];
    return null;
  }
  function findRegion(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return null;
  }
  function itemOf(m, extra) {
    var it = { item_id: m.item_id, item_name: m.item_name, item_category: m.item_category, price: m.price };
    if (extra) for (var k in extra) it[k] = extra[k];
    return it;
  }

  // SHA-256 when available (https / localhost / file), djb2 fallback otherwise.
  function hashString(str) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      }).catch(function () { return Promise.resolve(djb2(str)); });
    }
    return Promise.resolve(djb2(str));
  }
  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return ('00000000' + h.toString(16)).slice(-8) + ('00000000' + (h ^ 0x9e3779b9).toString(16)).slice(-8);
  }

  // ---------- dataLayer / GTM ----------
  window.dataLayer = window.dataLayer || [];

  function track(event, params) {
    var payload = { event: event };
    if (params) for (var k in params) payload[k] = params[k];
    // GA4 ecommerce convention: clear the previous ecommerce object first so
    // items from an earlier event never leak into this one.
    if (payload.ecommerce) window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push(payload);
    debugLog(payload);
  }
  window.track = track;

  function loadGTM(id) {
    if (!id || /X{4,}/.test(id)) {
      debugLog({ notice: 'GTM_ID not set yet (assets/config.js) — events stay in dataLayer only' });
      return;
    }
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  // ---------- marketing touch points ----------
  function captureTouch() {
    var q = new URLSearchParams(location.search);
    var touch = {
      source: q.get('utm_source'), medium: q.get('utm_medium'), campaign: q.get('utm_campaign'),
      content: q.get('utm_content'), term: q.get('utm_term'), gclid: q.get('gclid'), ts: new Date().toISOString(),
      landing_page: location.pathname.split('/').pop() || 'index.html'
    };
    var hasAny = touch.source || touch.medium || touch.campaign || touch.gclid;
    if (!hasAny) {
      // Direct / internal navigation: only seed first-touch if nothing exists yet.
      if (!readJSON(localStorage, KEY_FIRST_TOUCH, null)) {
        touch.source = '(direct)'; touch.medium = '(none)';
        writeJSON(localStorage, KEY_FIRST_TOUCH, touch);
      }
      if (!readJSON(sessionStorage, KEY_LAST_TOUCH, null)) writeJSON(sessionStorage, KEY_LAST_TOUCH, touch);
      return;
    }
    if (!readJSON(localStorage, KEY_FIRST_TOUCH, null)) writeJSON(localStorage, KEY_FIRST_TOUCH, touch);
    writeJSON(sessionStorage, KEY_LAST_TOUCH, touch);
  }
  function touchParams(prefix, t) {
    var out = {};
    if (!t) return out;
    out[prefix + '_source'] = t.source || '(direct)';
    out[prefix + '_medium'] = t.medium || '(none)';
    out[prefix + '_campaign'] = t.campaign || '(not set)';
    return out;
  }

  // ---------- customer identity ----------
  function getCustomer() { return readJSON(localStorage, KEY_CUSTOMER, null); }
  function pushIdentity() {
    var c = getCustomer();
    if (!c) return;
    // Pushed before any event so GTM's GA4 config tag can read user_id and
    // user properties from dataLayer variables on every page.
    window.dataLayer.push({ user_id: c.customer_id, region: c.region, interest_model: c.interest_model });
    debugLog({ identity: c.customer_id, region: c.region, interest_model: c.interest_model });
  }

  // ---------- generic click tracking: <a data-track="event" data-foo="bar"> ----------
  function bindDataTrack(root) {
    $all('[data-track]', root).forEach(function (el) {
      if (el.__bound) return;
      el.__bound = true;
      el.addEventListener('click', function () {
        var ev = el.getAttribute('data-track');
        var params = {};
        Array.prototype.forEach.call(el.attributes, function (a) {
          if (a.name.indexOf('data-') === 0 && a.name !== 'data-track') params[a.name.slice(5).replace(/-/g, '_')] = a.value;
        });
        params.page_type = document.body.getAttribute('data-page');
        track(ev, params);
      });
    });
  }

  // ---------- shared chrome ----------
  function renderChrome() {
    var header = $('#site-header');
    if (header) {
      header.innerHTML =
        '<div class="wrap nav">' +
        '<a class="logo" href="index.html" data-track="nav_click" data-nav="logo">' + CFG.BRAND + '</a>' +
        '<nav>' +
        '<a href="models.html" data-track="nav_click" data-nav="models">모델</a>' +
        '<a class="hide-m" href="index.html#dealers" data-track="nav_click" data-nav="dealers">전시장 찾기</a>' +
        '<a class="hide-m" href="tel:' + CFG.PHONE + '" data-track="click_call" data-location="header">' + CFG.PHONE + '</a>' +
        '<a class="btn btn-primary btn-sm" href="test-drive.html" data-track="cta_click" data-cta="header_test_drive">시승 신청</a>' +
        '</nav></div>';
    }
    var footer = $('#site-footer');
    if (footer) {
      footer.innerHTML =
        '<div class="wrap"><div>© ' + new Date().getFullYear() + ' ' + CFG.BRAND + ' — GA4 · GTM · BigQuery 연습용 가상 브랜드 사이트</div>' +
        '<div>고객센터 <a href="tel:' + CFG.PHONE + '" data-track="click_call" data-location="footer">' + CFG.PHONE + '</a></div></div>';
    }
  }

  // ---------- debug panel ----------
  var debugBuffer = [];
  function debugLog(obj) {
    debugBuffer.push(obj);
    var box = $('#dl-debug .list');
    if (!box) return;
    var div = document.createElement('div');
    div.className = 'ev';
    var label = obj.event || (obj.identity ? 'identity' : 'info');
    var copy = {}; for (var k in obj) if (k !== 'event') copy[k] = obj[k];
    div.innerHTML = '<b>' + label + '</b> ' + JSON.stringify(copy);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
  function renderDebug() {
    if ($('#dl-debug')) return;
    var panel = document.createElement('div');
    panel.id = 'dl-debug';
    panel.innerHTML = '<h4><span>dataLayer (연습용 표시)</span><button type="button" aria-label="close">✕</button></h4><div class="list"></div>';
    document.body.appendChild(panel);
    $('button', panel).addEventListener('click', function () { panel.style.display = 'none'; });
    debugBuffer.forEach(function (o) { var b = debugBuffer; debugBuffer = []; debugLog(o); debugBuffer = b; });
  }

  // ---------- pages ----------
  var pages = {};

  pages.home = function () {
    // Teaser cards for the lineup on the home page.
    var grid = $('#home-lineup');
    if (grid) {
      grid.innerHTML = MODELS.map(cardHTML).join('');
      bindCardClicks(grid, 'home_teaser');
      track('view_item_list', { item_list_id: 'home_teaser', item_list_name: '홈 라인업', ecommerce: { items: MODELS.map(function (m, i) { return itemOf(m, { index: i, item_list_name: '홈 라인업' }); }) } });
    }
    // Dealer finder.
    var sel = $('#region-select');
    if (sel) {
      sel.innerHTML = '<option value="">지역을 선택하세요</option>' + REGIONS.map(function (r) { return '<option value="' + r.id + '">' + r.name + '</option>'; }).join('');
      $('#find-dealer').addEventListener('click', function () {
        var r = findRegion(sel.value);
        var out = $('#dealer-result');
        if (!r) { out.style.display = 'block'; out.textContent = '지역을 먼저 선택해 주세요.'; return; }
        out.style.display = 'block';
        out.innerHTML = '<strong>' + r.dealer + '</strong><br>운영시간 09:00 – 19:00 · <a href="test-drive.html?region=' + r.id + '" data-track="cta_click" data-cta="dealer_result_test_drive" data-region="' + r.id + '">이 전시장에서 시승 신청 →</a>';
        bindDataTrack(out);
        track('dealer_search', { region: r.id, dealer_name: r.dealer });
      });
    }
  };

  pages.models = function () {
    var grid = $('#lineup');
    grid.innerHTML = MODELS.map(cardHTML).join('');
    bindCardClicks(grid, 'lineup');
    track('view_item_list', { item_list_id: 'lineup', item_list_name: '전체 모델', ecommerce: { items: MODELS.map(function (m, i) { return itemOf(m, { index: i, item_list_name: '전체 모델' }); }) } });
  };

  pages.model = function () {
    var m = findModel(param('id')) || MODELS[0];
    document.title = m.item_name + ' | ' + CFG.BRAND;
    var hero = $('#detail-hero');
    hero.style.background = m.color;
    $('#model-name').textContent = m.item_name;
    $('#model-tagline').textContent = m.tagline;
    $('#model-cat').textContent = m.item_category;
    $('#model-price').textContent = fmtPrice(m.price) + '부터';
    $('#model-fuel').textContent = m.fuel;
    $('#model-eff').textContent = m.efficiency;
    $('#model-seats').textContent = m.seats + '인승';
    $('#btn-test-drive').href = 'test-drive.html?model=' + m.item_id;
    $all('[data-model]', document).forEach(function (el) { el.setAttribute('data-model', m.item_id); });
    track('view_item', { ecommerce: { currency: 'KRW', value: m.price, items: [itemOf(m)] } });
  };

  pages.testDrive = function () {
    var form = $('#lead-form');
    var modelSel = $('#f-model');
    var regionSel = $('#f-region');
    modelSel.innerHTML = '<option value="">관심 모델 선택</option>' + MODELS.map(function (m) { return '<option value="' + m.item_id + '">' + m.item_name + ' (' + m.item_category + ')</option>'; }).join('');
    regionSel.innerHTML = '<option value="">지역 선택</option>' + REGIONS.map(function (r) { return '<option value="' + r.id + '">' + r.name + ' — ' + r.dealer + '</option>'; }).join('');
    if (findModel(param('model'))) modelSel.value = param('model');
    if (findRegion(param('region'))) regionSel.value = param('region');
    var today = new Date(); today.setDate(today.getDate() + 1);
    $('#f-date').min = today.toISOString().slice(0, 10);

    // form_start: first interaction with any field, once.
    var started = false;
    form.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      track('lead_form_start', { form_id: 'test_drive', model_id: modelSel.value || '(none)', region: regionSel.value || '(none)' });
    });
    // Track choices as they happen (useful for "dropped after choosing a model" analysis).
    modelSel.addEventListener('change', function () { track('lead_form_select', { form_id: 'test_drive', field: 'model', field_value: modelSel.value }); });
    regionSel.addEventListener('change', function () { track('lead_form_select', { form_id: 'test_drive', field: 'region', field_value: regionSel.value }); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      var fields = { name: $('#f-name'), phone: $('#f-phone'), email: $('#f-email'), model: modelSel, region: regionSel, date: $('#f-date'), consent: $('#f-consent') };
      function mark(el, bad) { el.closest('.row').classList.toggle('invalid', bad); if (bad) ok = false; }
      mark(fields.name, fields.name.value.trim().length < 2);
      var phoneDigits = fields.phone.value.replace(/\D/g, '');
      mark(fields.phone, !/^01[016789]\d{7,8}$/.test(phoneDigits));
      mark(fields.email, !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email.value.trim()));
      mark(fields.model, !fields.model.value);
      mark(fields.region, !fields.region.value);
      mark(fields.date, !fields.date.value);
      mark(fields.consent, !fields.consent.checked);
      if (!ok) {
        track('lead_form_error', { form_id: 'test_drive', invalid_fields: $all('.row.invalid').map(function (r) { return r.getAttribute('data-field'); }).join(',') });
        return;
      }
      var btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = '신청 중…';
      // customer_id = stable hash of the phone number. The same person always
      // gets the same id, which is what lets dealer/contract records join back.
      hashString('toyomo:' + phoneDigits).then(function (h) {
        var customerId = 'C' + h.slice(0, 12).toUpperCase();
        var region = findRegion(fields.region.value);
        var model = findModel(fields.model.value);
        var lead = {
          lead_id: 'L' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
          customer_id: customerId,
          model_id: model.item_id, model_name: model.item_name, model_price: model.price,
          region: region.id, dealer_name: region.dealer,
          preferred_date: fields.date.value,
          first_touch: readJSON(localStorage, KEY_FIRST_TOUCH, null),
          last_touch: readJSON(sessionStorage, KEY_LAST_TOUCH, null),
          submitted_at: new Date().toISOString()
        };
        writeJSON(localStorage, KEY_CUSTOMER, { customer_id: customerId, region: region.id, interest_model: model.item_id, created_at: lead.submitted_at });
        var leads = readJSON(localStorage, KEY_LEADS, []); leads.push(lead); writeJSON(localStorage, KEY_LEADS, leads);
        writeJSON(sessionStorage, KEY_PENDING_LEAD, lead);
        track('lead_form_submit', { form_id: 'test_drive', lead_id: lead.lead_id, model_id: lead.model_id, region: lead.region });
        // Small delay so the submit event has time to leave before navigation.
        setTimeout(function () { location.href = 'thanks.html'; }, 250);
      });
    });
  };

  pages.thanks = function () {
    var lead = readJSON(sessionStorage, KEY_PENDING_LEAD, null);
    var box = $('#lead-summary');
    if (!lead) {
      box.innerHTML = '<p>신청 내역이 없어요. <a href="test-drive.html">시승 신청 페이지</a>로 이동해 주세요.</p>';
      return;
    }
    box.innerHTML =
      '<span class="badge">접수 완료</span>' +
      '<dl style="margin-top:14px">' +
      '<dt>접수 번호</dt><dd>' + lead.lead_id + '</dd>' +
      '<dt>고객 ID</dt><dd>' + lead.customer_id + '</dd>' +
      '<dt>관심 모델</dt><dd>' + lead.model_name + '</dd>' +
      '<dt>전시장</dt><dd>' + lead.dealer_name + '</dd>' +
      '<dt>희망 시승일</dt><dd>' + lead.preferred_date + '</dd>' +
      '</dl>';
    // The conversion event fires on the thank-you page (a page GA4 can only
    // reach after a successful submit), and only once per lead.
    var p = { lead_id: lead.lead_id, model_id: lead.model_id, region: lead.region, dealer_name: lead.dealer_name, currency: 'KRW', value: Math.round(lead.model_price * 0.02) };
    var ft = touchParams('first_touch', lead.first_touch); for (var k in ft) p[k] = ft[k];
    track('generate_lead', p);
    sessionStorage.removeItem(KEY_PENDING_LEAD);
  };

  // ---------- card helpers ----------
  function cardHTML(m) {
    return '<a class="card" href="model.html?id=' + m.item_id + '" data-id="' + m.item_id + '">' +
      '<div class="art" style="background:' + m.color + '">' + m.item_name + '</div>' +
      '<div class="body"><div class="cat">' + m.item_category + '</div><div class="name">' + m.item_name + '</div>' +
      '<div class="price">' + fmtPrice(m.price) + '~</div><p class="tag">' + m.tagline + '</p></div></a>';
  }
  function bindCardClicks(grid, listName) {
    $all('.card', grid).forEach(function (card, i) {
      card.addEventListener('click', function () {
        var m = findModel(card.getAttribute('data-id'));
        track('select_item', { item_list_id: listName, ecommerce: { items: [itemOf(m, { index: i, item_list_name: listName })] } });
      });
    });
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', function () {
    captureTouch();
    pushIdentity();
    loadGTM(CFG.GTM_ID);
    renderChrome();
    renderDebug();
    var page = document.body.getAttribute('data-page');
    if (pages[page]) pages[page]();
    bindDataTrack(document);
  });
})();
