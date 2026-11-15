// Tabs for the pages built on the home design system. A tab list starts hidden in the HTML, so without this
// script every panel stays visible under its own heading. No animation: a panel is shown or it is not.
(function () {
  'use strict';
  [].forEach.call(document.querySelectorAll('[role="tablist"]'), function (list) {
    var tabs = [].slice.call(list.querySelectorAll('[role="tab"]'));
    function select(index, focus) {
      tabs.forEach(function (tab, i) {
        var on = i === index;
        var panel = document.getElementById(tab.getAttribute('aria-controls'));
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('tabindex', on ? '0' : '-1');
        if (panel) panel.hidden = !on;
      });
      if (focus) tabs[index].focus();
    }
    list.addEventListener('click', function (event) {
      var index = tabs.indexOf(event.target.closest('[role="tab"]'));
      if (index >= 0) select(index, false);
    });
    list.addEventListener('keydown', function (event) {
      var index = tabs.indexOf(event.target.closest('[role="tab"]'));
      var last = tabs.length - 1;
      var next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index === last ? 0 : index + 1)
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
      if (index < 0 || next < 0) return;
      event.preventDefault();
      select(next, true);
    });
    list.hidden = false;
    select(0, false);
  });
})();

// Reading pages (docs-pages.css): the side menu starts folded on a narrow screen, and each code block gets a Copy
// button. Without this script the menu stays open and the code can still be selected by hand.
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(max-width: 1020px)').matches) {
    [].forEach.call(document.querySelectorAll('.doc-side details[open]'), function (d) { d.open = false; });
  }
  if (!navigator.clipboard) return;
  [].forEach.call(document.querySelectorAll('.doc pre'), function (pre) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code') || pre;
      navigator.clipboard.writeText(code.textContent.trim()).then(function () { btn.textContent = 'Copied'; }, function () { btn.textContent = 'Copy failed'; });
      setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
    });
    pre.appendChild(btn);
  });
})();
