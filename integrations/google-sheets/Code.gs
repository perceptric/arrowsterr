/**
 * Arrowsterr for Sheets.
 * Adds an Arrowsterr menu that pulls AI visibility, visibility by AI model, competitors and prompts
 * into tabs, and can refresh them every week.
 */

var BASE_URL = 'https://app.arrowsterr.com/api/v1';
var KEY_PROP = 'arrowsterr.key';
var BRAND_PROP = 'arrowsterr.brand';
var DAYS_PROP = 'arrowsterr.days';
var WEEKLY_HANDLER = 'weeklyRefresh';

// ---------- Menu ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Arrowsterr')
    .addItem('Set API key', 'setApiKey')
    .addItem('Choose brand and days', 'chooseBrand')
    .addSeparator()
    .addItem('Refresh visibility', 'refreshVisibility')
    .addItem('Refresh visibility by AI model', 'refreshModels')
    .addItem('Refresh competitors', 'refreshCompetitors')
    .addItem('Refresh prompts', 'refreshPrompts')
    .addItem('Refresh everything', 'refreshAll')
    .addSeparator()
    .addItem('Turn on weekly refresh', 'turnOnWeekly')
    .addItem('Turn off weekly refresh', 'turnOffWeekly')
    .addToUi();
}

function onInstall() {
  onOpen();
}

// ---------- Settings ----------

function setApiKey() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Arrowsterr API key', 'Paste your API key. You can make one in Arrowsterr under Settings, Workspace & members, Integrations, API keys. It starts with aw_live_.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = res.getResponseText().trim();
  if (key.indexOf('aw_live_') !== 0) {
    ui.alert('That does not look like an Arrowsterr API key. It should start with aw_live_.');
    return;
  }
  var check = UrlFetchApp.fetch(BASE_URL + '/me', { headers: { 'X-API-Key': key }, muteHttpExceptions: true });
  if (check.getResponseCode() !== 200) {
    ui.alert('Arrowsterr did not accept that key. Check it and try again.');
    return;
  }
  // Saved for you only. Other people who open this sheet do not see it.
  PropertiesService.getUserProperties().setProperty(KEY_PROP, key);
  var ws = JSON.parse(check.getContentText()).workspace || {};
  ui.alert('Connected to ' + (ws.name || 'your workspace') + '. Next, choose a brand from the Arrowsterr menu.');
}

function chooseBrand() {
  var ui = SpreadsheetApp.getUi();
  var brands = api_('/brands').brands || [];
  if (!brands.length) {
    ui.alert('This workspace has no brands yet. Add one in Arrowsterr first.');
    return;
  }
  var list = brands.map(function (b, i) { return (i + 1) + '. ' + b.name + ' (' + b.domain + ')'; }).join('\n');
  var pick = ui.prompt('Choose a brand', 'Type the number of the brand:\n\n' + list, ui.ButtonSet.OK_CANCEL);
  if (pick.getSelectedButton() !== ui.Button.OK) return;
  var brand = brands[Number(pick.getResponseText()) - 1];
  if (!brand) {
    ui.alert('Type a number from the list.');
    return;
  }
  var daysRes = ui.prompt('How many days?', 'How many days back to look, from 1 to 365. Leave empty for 30.', ui.ButtonSet.OK_CANCEL);
  if (daysRes.getSelectedButton() !== ui.Button.OK) return;
  var days = Math.min(365, Math.max(1, Math.round(Number(daysRes.getResponseText()) || 30)));
  var props = PropertiesService.getDocumentProperties();
  props.setProperty(BRAND_PROP, JSON.stringify({ id: brand.id, name: brand.name }));
  props.setProperty(DAYS_PROP, String(days));
  ui.alert(brand.name + ' is set, looking back ' + days + ' days. Use Refresh everything to fill the tabs.');
}

// ---------- Refresh ----------

function refreshVisibility() {
  run_(fillVisibility_);
}

function fillVisibility_(s) {
  var v = api_('/visibility', { brand_id: s.brand.id, days: s.days });
  var rows = (v.days || []).map(function (d) {
    var top = (d.competitors || [])[0] || {};
    return [d.day, d.visibility, d.answers, (d.engines || []).join(', '), top.name || '', top.visibility === undefined ? '' : top.visibility];
  });
  write_('Visibility', ['Day', 'Visibility (%)', 'AI answers checked', 'AI models checked', 'Top competitor', 'Top competitor visibility (%)'], rows, s);
}

function refreshModels() {
  run_(fillModels_);
}

function fillModels_(s) {
  var m = api_('/visibility/models', { brand_id: s.brand.id, days: s.days });
  var rows = (m.models || []).map(function (x) {
    return [x.model, x.visibility, x.answers, x.mentions, blank_(x.position), blank_(x.sentiment)];
  });
  write_('By AI model', ['AI model', 'Visibility (%)', 'AI answers checked', 'Answers that name you', 'Average position', 'Sentiment (0 to 100)'], rows, s);
}

function refreshCompetitors() {
  run_(fillCompetitors_);
}

function fillCompetitors_(s) {
  var c = api_('/competitors', { brand_id: s.brand.id, days: s.days, limit: 50 });
  var rows = (c.competitors || []).map(function (x) {
    return [x.name, x.you ? 'Yes' : '', x.visibility, x.mentions, blank_(x.position), blank_(x.sentiment)];
  });
  write_('Competitors', ['Brand', 'Your brand', 'Visibility (%)', 'Answers that name it', 'Average position', 'Sentiment (0 to 100)'], rows, s);
}

function refreshPrompts() {
  run_(fillPrompts_);
}

function fillPrompts_(s) {
  var p = api_('/prompts', { brand_id: s.brand.id });
  var rows = (p.rows || []).map(function (r) { return [r.topic, r.prompt]; });
  write_('Prompts', ['Topic', 'Prompt'], rows, s);
}

function refreshAll() {
  run_(function (s) {
    fillVisibility_(s);
    fillModels_(s);
    fillCompetitors_(s);
    fillPrompts_(s);
  });
}

// ---------- Weekly refresh ----------

function turnOnWeekly() {
  turnOffWeekly_();
  ScriptApp.newTrigger(WEEKLY_HANDLER).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  SpreadsheetApp.getUi().alert('Weekly refresh is on. The tabs update every Monday morning.');
}

function turnOffWeekly() {
  turnOffWeekly_();
  SpreadsheetApp.getUi().alert('Weekly refresh is off.');
}

function turnOffWeekly_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === WEEKLY_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

// Runs from the weekly trigger, with no one at the screen.
function weeklyRefresh() {
  refreshAll();
}

// ---------- Helpers ----------

// The saved brand and days. Stops with a clear message when something is missing.
function settings_() {
  if (!PropertiesService.getUserProperties().getProperty(KEY_PROP)) throw new Error('Set your API key first, from the Arrowsterr menu.');
  var brand = PropertiesService.getDocumentProperties().getProperty(BRAND_PROP);
  if (!brand) throw new Error('Choose a brand first, from the Arrowsterr menu.');
  var days = Number(PropertiesService.getDocumentProperties().getProperty(DAYS_PROP)) || 30;
  return { brand: JSON.parse(brand), days: days };
}

// Runs a refresh and shows any error. In the weekly trigger, errors go to the script's log.
function run_(fn) {
  try {
    fn(settings_());
  } catch (e) {
    try {
      SpreadsheetApp.getUi().alert(e.message);
    } catch (noUi) {
      console.error(e.message);
    }
  }
}

function api_(path, params) {
  var key = PropertiesService.getUserProperties().getProperty(KEY_PROP);
  if (!key) throw new Error('Set your API key first, from the Arrowsterr menu.');
  var qs = Object.keys(params || {})
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  var res = UrlFetchApp.fetch(BASE_URL + path + (qs ? '?' + qs : ''), { headers: { 'X-API-Key': key }, muteHttpExceptions: true });
  var body;
  try {
    body = JSON.parse(res.getContentText());
  } catch (e) {
    body = {};
  }
  if (res.getResponseCode() !== 200) throw new Error('Arrowsterr said: ' + (body.error || 'error ' + res.getResponseCode()));
  return body;
}

function blank_(v) {
  return v === null || v === undefined ? '' : v;
}

// Replaces a tab's contents with a header row and data rows.
function write_(name, header, rows, s) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clearContents();
  var data = [header].concat(rows);
  sheet.getRange(1, 1, data.length, header.length).setValues(data);
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1).setNote(s.brand.name + ', last ' + s.days + ' days. Updated ' + new Date().toLocaleString() + '.');
  sheet.autoResizeColumns(1, header.length);
}
