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
