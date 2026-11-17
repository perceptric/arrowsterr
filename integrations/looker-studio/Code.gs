/**
 * Arrowsterr community connector for Looker Studio.
 * Reads AI visibility, visibility by AI model, competitors and prompts from the Arrowsterr API.
 */

var cc = DataStudioApp.createCommunityConnector();
var BASE_URL = 'https://app.arrowsterr.com/api/v1';
var KEY_PROP = 'arrowsterr.key';
var HELP_URL = 'https://app.arrowsterr.com/settings/integrations';

// ---------- Auth: the Arrowsterr API key ----------

function getAuthType() {
  return cc.newAuthTypeResponse().setAuthType(cc.AuthType.KEY).setHelpUrl(HELP_URL).build();
}

function isAuthValid() {
  var key = PropertiesService.getUserProperties().getProperty(KEY_PROP);
  return !!key && checkKey_(key);
}

function setCredentials(request) {
  var key = (request.key || '').trim();
  if (!checkKey_(key)) return { errorCode: 'INVALID_CREDENTIALS' };
  PropertiesService.getUserProperties().setProperty(KEY_PROP, key);
  return { errorCode: 'NONE' };
}

function resetAuth() {
  PropertiesService.getUserProperties().deleteProperty(KEY_PROP);
}

function isAdminUser() {
  return false;
}

// True when the key opens the API.
function checkKey_(key) {
  if (!key || key.indexOf('aw_live_') !== 0) return false;
  var res = UrlFetchApp.fetch(BASE_URL + '/me', { headers: { 'X-API-Key': key }, muteHttpExceptions: true });
  return res.getResponseCode() === 200;
}

// ---------- API calls ----------

// GET a path and return the JSON. Replies are cached for 10 minutes.
function api_(path, params) {
  var key = PropertiesService.getUserProperties().getProperty(KEY_PROP);
  var qs = Object.keys(params || {})
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  var url = BASE_URL + path + (qs ? '?' + qs : '');
  var cache = CacheService.getUserCache();
  var cacheKey = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, url + key));
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch(url, { headers: { 'X-API-Key': key }, muteHttpExceptions: true });
  var text = res.getContentText();
  var body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    body = {};
  }
  if (res.getResponseCode() !== 200) {
    cc.newUserError()
      .setText('Arrowsterr said: ' + (body.error || 'error ' + res.getResponseCode()))
      .setDebugText(url + ' returned ' + res.getResponseCode() + ': ' + text.slice(0, 500))
      .throwException();
  }
  // The cache holds values up to 100 KB.
  if (text.length < 100000) cache.put(cacheKey, text, 600);
  return body;
}

// ---------- Config: brand, report and days ----------

var REPORTS = {
  visibility: 'Visibility over time',
  models: 'Visibility by AI model',
  competitors: 'Competitors',
  prompts: 'Prompts'
};

function getConfig(request) {
  var config = cc.getConfig();
  config.newInfo().setId('intro').setText('Pick a brand and the report you want. Make one data source for each report.');

  var brand = config.newSelectSingle().setId('brand_id').setName('Brand').setHelpText('The brand to report on.').setAllowOverride(true);
  var brands = api_('/brands').brands || [];
  brands.forEach(function (b) {
    brand.addOption(config.newOptionBuilder().setLabel(b.name + ' (' + b.domain + ')').setValue(b.id));
  });

  var report = config.newSelectSingle().setId('report').setName('Report').setHelpText('What the data source shows.');
  Object.keys(REPORTS).forEach(function (id) {
    report.addOption(config.newOptionBuilder().setLabel(REPORTS[id]).setValue(id));
  });

  config
    .newTextInput()
    .setId('days')
    .setName('Days')
    .setHelpText('How many days back to look, from 1 to 365. Leave empty for 30. Prompts ignore this.')
    .setPlaceholder('30')
    .setAllowOverride(true);

  return config.build();
}

// Checks the config and returns it with defaults filled in.
function params_(request) {
  var p = request.configParams || {};
  if (!p.brand_id) cc.newUserError().setText('Pick a brand in the data source settings.').throwException();
  var days = Math.round(Number(p.days) || 30);
  return { brand_id: p.brand_id, report: p.report || 'visibility', days: Math.min(365, Math.max(1, days)) };
}

// ---------- Schema ----------

function getFields_(report) {
  var fields = cc.getFields();
  var t = cc.FieldType;
  var agg = cc.AggregationType;
  var dim = function (id, name, type) { fields.newDimension().setId(id).setName(name).setType(type); };
  var met = function (id, name, type, how) { fields.newMetric().setId(id).setName(name).setType(type).setAggregation(how); };

  dim('brand', 'Brand', t.TEXT);
  if (report === 'visibility') {
    dim('day', 'Day', t.YEAR_MONTH_DAY);
    dim('models_checked', 'AI models checked', t.TEXT);
    dim('top_competitor', 'Top competitor', t.TEXT);
    met('visibility', 'Visibility', t.PERCENT, agg.AVG);
    met('answers', 'AI answers checked', t.NUMBER, agg.SUM);
    met('top_competitor_visibility', 'Top competitor visibility', t.PERCENT, agg.AVG);
  } else if (report === 'models') {
    dim('day', 'Day', t.YEAR_MONTH_DAY);
    dim('model', 'AI model', t.TEXT);
    met('visibility', 'Visibility', t.PERCENT, agg.AVG);
    met('answers', 'AI answers checked', t.NUMBER, agg.SUM);
    met('mentions', 'Answers that name the brand', t.NUMBER, agg.SUM);
    met('position', 'Average position', t.NUMBER, agg.AVG);
    met('sentiment', 'Sentiment', t.NUMBER, agg.AVG);
  } else if (report === 'competitors') {
    dim('name', 'Named brand', t.TEXT);
    dim('is_you', 'Is your brand', t.BOOLEAN);
    met('visibility', 'Visibility', t.PERCENT, agg.AVG);
    met('mentions', 'Answers that name it', t.NUMBER, agg.SUM);
    met('position', 'Average position', t.NUMBER, agg.AVG);
    met('sentiment', 'Sentiment', t.NUMBER, agg.AVG);
  } else {
    dim('topic', 'Topic', t.TEXT);
    dim('prompt', 'Prompt', t.TEXT);
    met('prompt_count', 'Prompts', t.NUMBER, agg.SUM);
  }
  if (report === 'visibility' || report === 'models') fields.setDefaultDimension('day');
  fields.setDefaultMetric(report === 'prompts' ? 'prompt_count' : 'visibility');
  return fields;
}

function getSchema(request) {
  return { schema: getFields_(params_(request).report).build() };
}

// ---------- Data ----------

// "2026-10-10" to "20261010", the date format Looker Studio wants.
function ymd_(day) {
  return String(day || '').slice(0, 10).replace(/-/g, '');
}

// Percent 0 to 100 from the API, as a 0 to 1 share for PERCENT fields.
function share_(n) {
  return n === null || n === undefined ? null : Number(n) / 100;
}

// Rows from the API as plain objects keyed by field id.
function rows_(p) {
  if (p.report === 'visibility') {
    var v = api_('/visibility', { brand_id: p.brand_id, days: p.days });
    return (v.days || []).map(function (d) {
      var top = (d.competitors || [])[0] || {};
      return {
        brand: v.brand.name,
        day: ymd_(d.day),
        models_checked: (d.engines || []).join(', '),
        top_competitor: top.name || null,
        visibility: share_(d.visibility),
        answers: d.answers,
        top_competitor_visibility: share_(top.visibility)
      };
    });
  }
  if (p.report === 'models') {
    var m = api_('/visibility/models', { brand_id: p.brand_id, days: p.days });
    return (m.days || []).map(function (d) {
      return { brand: m.brand.name, day: ymd_(d.day), model: d.model, visibility: share_(d.visibility), answers: d.answers, mentions: d.mentions, position: d.position, sentiment: d.sentiment };
    });
  }
  if (p.report === 'competitors') {
    var c = api_('/competitors', { brand_id: p.brand_id, days: p.days, limit: 50 });
    return (c.competitors || []).map(function (x) {
      return { brand: c.brand.name, name: x.name, is_you: !!x.you, visibility: share_(x.visibility), mentions: x.mentions, position: x.position, sentiment: x.sentiment };
    });
  }
  var pr = api_('/prompts', { brand_id: p.brand_id });
  return (pr.rows || []).map(function (r) {
    return { brand: pr.brand.name, topic: r.topic, prompt: r.prompt, prompt_count: 1 };
  });
}

function getData(request) {
  var p = params_(request);
  var ids = request.fields.map(function (f) { return f.name; });
  var schema = getFields_(p.report).forIds(ids);
  var rows = rows_(p).map(function (r) {
    return { values: ids.map(function (id) { return r[id] === undefined ? null : r[id]; }) };
  });
  return { schema: schema.build(), rows: rows };
}
