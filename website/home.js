// Home page behaviour: the "start from your industry" picker, the project record that fills as the four steps scroll
// by, the copy buttons and the nav bar. Pack facts come from industry-packs.json (scripts/gen-website-packs.mts writes
// it from the pack registry); nothing about a pack is written by hand here.
(function () {
  'use strict';

  // The same mapping the Compass Console uses when a project starts from a pack (src/console/assets/a4Pack.js).
  var RISK_TIER = { critical: "critical", "very-high": "high", high: "high", elevated: "med" };
  var RISK_WORD = { critical: 'Critical', high: 'High', med: 'Medium' };
  var RULES_SHOWN = 4;
  var RISKS_SHOWN = 3;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function listOf(items, shown, moreLabel) {
    var wrap = document.createDocumentFragment();
    var ul = el('ul');
    items.slice(0, shown).forEach(function (item) { ul.appendChild(el('li', item)); });
    wrap.appendChild(ul);
    if (items.length > shown) wrap.appendChild(el('p', 'and ' + (items.length - shown) + ' more ' + moreLabel, 'sheet-more'));
    return wrap;
  }

  function initPicker() {
    // Without JavaScript, or when the list cannot be read, the page keeps its static state: the chips are links to each
    // industry's own page and the sheet says what a first draft holds.
    var chips = document.getElementById('stationChips');
    var select = document.getElementById('packSelect');
    var sheet = document.getElementById('packSheet');
    if (!chips || !select || !sheet || !window.fetch) return;
    var field = select.closest('.picker-field');
    var title = document.getElementById('sheetTitle');
    var summary = document.getElementById('sheetSummary');
    var risk = document.getElementById('sheetRisk');
    var rules = document.getElementById('sheetRules');
    var risks = document.getElementById('sheetRisks');
    var stations = [];
    var current = null;

    function fill(pack) {
      var level = RISK_TIER[pack.riskTier] || '';
      title.textContent = pack.name;
      summary.textContent = pack.summary;
      risk.textContent = '';
      var badge = el('span', RISK_WORD[level] || 'Not set', 'risk');
      badge.setAttribute('data-level', level);
      risk.appendChild(badge);
      risk.appendChild(el('span', level === 'med' ? 'Standard rules for approvals' : 'Regulated: someone other than you approves each step', 'risk-note'));
      rules.textContent = '';
      rules.appendChild(listOf(pack.rules, RULES_SHOWN, 'in the pack'));
      risks.textContent = '';
      risks.appendChild(listOf(pack.risks, RISKS_SHOWN, 'in the pack'));
      sheet.setAttribute('aria-busy', 'false');
    }

    function show(pack) {
      if (reduced || sheet.getAttribute('aria-busy') === 'true') { fill(pack); return; }
      sheet.classList.add('is-swapping');
      window.setTimeout(function () { fill(pack); sheet.classList.remove('is-swapping'); }, 160);
    }

    function choose(station) {
      current = station;
      [].forEach.call(chips.children, function (chip) { chip.setAttribute('aria-pressed', chip.dataset.id === station.id ? 'true' : 'false'); });
      select.textContent = '';
      station.packs.forEach(function (pack) {
        var option = el('option', pack.name);
        option.value = pack.id;
        select.appendChild(option);
      });
      select.disabled = false;
      show(station.packs[0]);
    }

    select.addEventListener('change', function () {
      var pack = current && current.packs.filter(function (item) { return item.id === select.value; })[0];
      if (pack) show(pack);
    });

    sheet.setAttribute('aria-busy', 'true');
    fetch('industry-packs.json').then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      stations = data.stations.filter(function (station) { return station.packs.length > 0; });
      if (!stations.length) throw new Error('no packs');
      chips.textContent = '';
      if (field) field.hidden = false;
      stations.forEach(function (station) {
        var chip = el('button', station.name, 'chip');
        chip.type = 'button';
        chip.dataset.id = station.id;
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', function () { choose(station); });
        chips.appendChild(chip);
      });
      choose(stations[0]);
    }).catch(function () {
      // The list could not be read: keep the static links to each industry's page and say what happened.
      sheet.setAttribute('aria-busy', 'false');
      summary.textContent = 'The pack list did not load here. Choose an industry above to open its page, which lists every pack with its questions.';
    });
  }

  function initRecord() {
    var steps = [].slice.call(document.querySelectorAll('.step'));
    var lines = [].slice.call(document.querySelectorAll('.record-lines li'));
    if (!steps.length || !lines.length || reduced || !window.matchMedia) return;
    var wide = window.matchMedia('(min-width: 1021px)');
    var root = document.documentElement;
    var active = -1;
    var queued = false;

    // Lines of one step print one after another.
    var seen = {};
    lines.forEach(function (line) {
      var step = line.dataset.step;
      seen[step] = (seen[step] || 0) + 1;
      line.style.transitionDelay = ((seen[step] - 1) * 110) + 'ms';
    });

    function update() {
      queued = false;
      if (!wide.matches) { root.classList.remove('js-record'); return; }
      root.classList.add('js-record');
      var mark = window.innerHeight * 0.62;
      var next = 0;
      steps.forEach(function (step, index) { if (step.getBoundingClientRect().top < mark) next = index + 1; });
      if (next === active) return;
      active = next;
      steps.forEach(function (step, index) { step.classList.toggle('is-active', index + 1 === Math.max(active, 1)); });
      lines.forEach(function (line) {
        var step = Number(line.dataset.step);
        line.classList.toggle('is-on', step <= active);
        line.classList.toggle('is-current', step === active);
      });
    }

    function queue() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
  }

  function initCopy() {
    [].forEach.call(document.querySelectorAll('.copy[data-copy]'), function (button) {
      var label = button.textContent;
      button.addEventListener('click', function () {
        var done = function (text) {
          button.textContent = text;
          button.classList.add('is-done');
          window.setTimeout(function () { button.textContent = label; button.classList.remove('is-done'); }, 2200);
        };
        if (!navigator.clipboard) { done('Select the text above to copy it'); return; }
        navigator.clipboard.writeText(button.dataset.copy).then(function () { done('Copied'); }, function () { done('Select the text above to copy it'); });
      });
    });
  }

  function initNav() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var set = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', set, { passive: true });
    set();
  }

  function init() {
    initNav();
    initPicker();
    initRecord();
    initCopy();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
