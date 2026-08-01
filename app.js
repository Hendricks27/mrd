(function() {
  'use strict';

  // ==================== CONFIG ====================
  var CONFIG = {
    appName: 'Hello Display',
    storageKey: 'mdg_hello_display',
  };

  // ==================== STATE ====================
  var state = {
    currentScreen: 'home',
    screenHistory: [],
    data: { waves: 0 },
  };

  // Per-screen runtime handles (timers/rAF) — always stopped on screen leave
  // per the performance guidelines (no loops running when not visible).
  var clockTimer = null;
  var animFrame = null;
  var animRunning = false;

  // ==================== DOM REFS ====================
  var screens = {};

  function collectScreens() {
    document.querySelectorAll('.screen').forEach(function(s) {
      if (s.id) screens[s.id] = s;
    });
  }

  // ==================== NAVIGATION ====================
  function navigateTo(screenId, options) {
    options = options || {};
    var addToHistory = options.addToHistory !== false;

    if (state.currentScreen && state.currentScreen !== screenId) {
      onScreenLeave(state.currentScreen);
      if (addToHistory) state.screenHistory.push(state.currentScreen);
    }

    Object.values(screens).forEach(function(s) { s.classList.add('hidden'); });
    if (screens[screenId]) {
      screens[screenId].classList.remove('hidden');
      state.currentScreen = screenId;
      onScreenEnter(screenId);
      focusFirst(screens[screenId]);
    }
  }

  function navigateBack() {
    if (state.screenHistory.length > 0) {
      navigateTo(state.screenHistory.pop(), { addToHistory: false });
    }
  }

  // ==================== FOCUS MANAGEMENT ====================
  function focusFirst(container) {
    var el = container.querySelector('.focusable:not([disabled]):not(.hidden)');
    if (el) el.focus();
  }

  function moveFocus(direction) {
    var container = screens[state.currentScreen];
    if (!container) return;

    var focusables = Array.from(
      container.querySelectorAll('.focusable:not([disabled]):not(.hidden)')
    );
    if (focusables.length === 0) return;

    var current = document.activeElement;
    var idx = focusables.indexOf(current);

    if (idx === -1) {
      focusFirst(container);
      return;
    }

    var nextIdx;
    if (direction === 'up' || direction === 'left') {
      nextIdx = idx > 0 ? idx - 1 : focusables.length - 1;
    } else {
      nextIdx = idx < focusables.length - 1 ? idx + 1 : 0;
    }
    focusables[nextIdx].focus();

    var scrollParent = focusables[nextIdx].closest('.content, .list-container');
    if (scrollParent) {
      focusables[nextIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ==================== UI HELPERS ====================
  function showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.offsetHeight; // reflow so the transition replays
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.classList.remove('visible'); }, 2500);
  }

  // ==================== DATA PERSISTENCE ====================
  function loadData() {
    try {
      var saved = localStorage.getItem(CONFIG.storageKey);
      if (saved) Object.assign(state.data, JSON.parse(saved));
    } catch (e) {
      console.error('[Storage] Load error:', e);
    }
  }

  function saveData() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.data));
    } catch (e) {
      console.error('[Storage] Save error:', e);
    }
  }

  // ==================== HOME: live clock ====================
  function renderClock() {
    var el = document.getElementById('clock');
    if (!el) return;
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    el.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  function renderWaves() {
    var el = document.getElementById('wave-count');
    if (el) el.textContent = state.data.waves;
  }

  function startClock() {
    renderClock();
    clockTimer = setInterval(renderClock, 1000);
  }

  function stopClock() {
    clearInterval(clockTimer);
    clockTimer = null;
  }

  // ==================== RENDER SCREEN: canvas demo ====================
  function drawFrame(t) {
    var canvas = document.getElementById('demo-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h / 2;

    // Repaint the panel color — never pure black, so it stays visible
    // as a surface on the additive display.
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // Pulsing concentric rings
    var seconds = t / 1000;
    for (var i = 0; i < 4; i++) {
      var phase = (seconds * 0.5 + i / 4) % 1;
      var radius = 30 + phase * 150;
      var alpha = (1 - phase) * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 212, 255, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Orbiting dot
    var angle = seconds * 1.2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * 120, cy + Math.sin(angle) * 120, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();

    // Center label
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HELLO', cx, cy);

    if (animRunning) animFrame = requestAnimationFrame(drawFrame);
  }

  function startAnim() {
    if (animRunning) return;
    animRunning = true;
    animFrame = requestAnimationFrame(drawFrame);
    var btn = document.getElementById('anim-toggle');
    if (btn) btn.innerHTML = '&#9208; Pause';
  }

  function stopAnim() {
    animRunning = false;
    cancelAnimationFrame(animFrame);
    animFrame = null;
    var btn = document.getElementById('anim-toggle');
    if (btn) btn.innerHTML = '&#9654; Play';
  }

  // ==================== ACTION HANDLING ====================
  function handleAction(action, element) {
    switch (action) {
      case 'back':
        navigateBack();
        break;
      case 'wave':
        state.data.waves += 1;
        saveData();
        renderWaves();
        showToast('Wave #' + state.data.waves + ' 👋');
        break;
      case 'go-render':
        navigateTo('render');
        break;
      case 'go-about':
        navigateTo('about');
        break;
      case 'toggle-anim':
        if (animRunning) stopAnim(); else startAnim();
        break;
      default:
        console.log('[Action]', action);
        break;
    }
  }

  // ==================== SCREEN LIFECYCLE ====================
  function onScreenEnter(screenId) {
    if (screenId === 'home') {
      renderWaves();
      startClock();
    } else if (screenId === 'render') {
      startAnim();
    }
  }

  function onScreenLeave(screenId) {
    if (screenId === 'home') {
      stopClock();
    } else if (screenId === 'render') {
      stopAnim();
    }
  }

  // ==================== EVENT LISTENERS ====================
  function setupEvents() {
    document.addEventListener('click', function(e) {
      var actionEl = e.target.closest('[data-action]');
      if (actionEl) handleAction(actionEl.dataset.action, actionEl);
    });

    // Neural Band swipes arrive as arrow keys; index pinch = Enter,
    // middle pinch = Escape. Same keys work in a desktop browser.
    document.addEventListener('keydown', function(e) {
      switch (e.key) {
        case 'ArrowUp':
          moveFocus('up');
          e.preventDefault();
          break;
        case 'ArrowDown':
          moveFocus('down');
          e.preventDefault();
          break;
        case 'ArrowLeft':
          moveFocus('left');
          e.preventDefault();
          break;
        case 'ArrowRight':
          moveFocus('right');
          e.preventDefault();
          break;
        case 'Enter':
          if (document.activeElement &&
              document.activeElement.classList.contains('focusable')) {
            document.activeElement.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
          navigateBack();
          e.preventDefault();
          break;
      }
    });
  }

  // ==================== INITIALIZATION ====================
  function init() {
    collectScreens();
    setupEvents();
    loadData();

    setTimeout(function() {
      navigateTo('home', { addToHistory: false });
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
