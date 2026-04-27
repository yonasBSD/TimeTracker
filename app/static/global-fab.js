/**
 * Global FAB: quick Start Timer, Log Time, New Task.
 */
(function () {
  'use strict';

  function getRoot() {
    return document.getElementById('globalTimeFab');
  }

  function setOpen(open) {
    var root = getRoot();
    var btn = document.getElementById('globalTimeFabBtn');
    var menu = document.getElementById('globalTimeFabMenu');
    if (!root || !btn) return;
    root.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (menu) menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function close() {
    setOpen(false);
  }

  function open() {
    setOpen(true);
  }

  function toggle() {
    var root = getRoot();
    if (!root) return;
    setOpen(!root.classList.contains('is-open'));
  }

  function dashboardUrl() {
    var root = getRoot();
    var init = window.__BASE_INIT__ || {};
    return (root && root.getAttribute('data-dashboard-url')) || init.dashboard || '/';
  }

  function manualUrl() {
    var root = getRoot();
    var init = window.__BASE_INIT__ || {};
    return (root && root.getAttribute('data-manual-entry-url')) || init.manualEntry || '/timer/manual';
  }

  function newTaskUrl() {
    var root = getRoot();
    var init = window.__BASE_INIT__ || {};
    return (root && root.getAttribute('data-new-task-url')) || init.newTask || '/tasks/create';
  }

  function onStartTimer() {
    close();
    var openBtn = document.querySelector('#openStartTimer');
    if (openBtn) {
      openBtn.click();
      return;
    }
    var dash = dashboardUrl();
    var base = dash.split('#')[0];
    window.location.href = base + '#start-timer';
  }

  function onLogTime() {
    close();
    window.location.href = manualUrl();
  }

  function onNewTask() {
    close();
    window.location.href = newTaskUrl();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = getRoot();
    var btn = document.getElementById('globalTimeFabBtn');
    if (!root || !btn) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    root.querySelectorAll('[data-fab-action]').forEach(function (el) {
      el.addEventListener('click', function () {
        var act = el.getAttribute('data-fab-action');
        if (act === 'start') onStartTimer();
        else if (act === 'log') onLogTime();
        else if (act === 'task') onNewTask();
      });
    });

    document.addEventListener('click', function (e) {
      if (!root.classList.contains('is-open')) return;
      if (root.contains(e.target)) return;
      close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('is-open')) {
        close();
        btn.focus();
      }
    });
  });
})();
