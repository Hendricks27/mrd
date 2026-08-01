(function() {
  'use strict';

  // ==================== CONFIG ====================
  var CONFIG = {
    storageKey: 'mrd_prompter',
    speechesDir: 'speeches/', // one .txt file per speech
    wordsPerMinute: 140,
  };

  // Every setting is a cycle of options — Left/Right (wrist swipes) or Enter
  // steps through them. Add options here to customize further.
  var SETTING_DEFS = [
    { key: 'fontSize',   label: 'Text size',    options: [24, 28, 32, 38, 44],            fmt: function(v) { return v + 'px'; } },
    { key: 'scrollStep', label: 'Scroll step',  options: ['row1', 'rows3', 'page'],       fmt: function(v) { return { row1: '1 row', rows3: '3 rows', page: 'Full page' }[v]; } },
    { key: 'lineHeight', label: 'Line spacing', options: [1.3, 1.5, 1.7],                 fmt: function(v) { return { 1.3: 'Compact', 1.5: 'Normal', 1.7: 'Relaxed' }[v]; } },
    { key: 'bold',       label: 'Bold text',    options: [true, false],                   fmt: function(v) { return v ? 'On' : 'Off'; } },
    { key: 'invert',     label: 'Swipe scroll', options: ['natural', 'inverted'],         fmt: function(v) { return v === 'natural' ? 'Natural' : 'Inverted'; } },
  ];

  // ==================== STATE ====================
  var state = {
    currentScreen: 'home',
    screenHistory: [],
    speeches: [],        // [{ key, title, body, hash, words }]
    activeKey: null,
    renderedKey: null,   // which speech the prompter DOM currently holds
    data: {
      settings: { fontSize: 32, scrollStep: 'rows3', lineHeight: 1.5, bold: true, invert: 'natural' },
      speechData: {},     // filename -> { progress: 0..1, hash } — position per speech
      activeKey: null,    // last opened speech, restored on relaunch
      cachedSpeeches: [], // [{file, text}] last successful fetch (offline fallback)
    },
  };

  var saveTimer = null;
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
      return true;
    }
    return false; // at root — let the platform handle the gesture
  }

  // ==================== FOCUS MANAGEMENT ====================
  function focusFirst(container) {
    var el = container.querySelector('.initial-focus') ||
             container.querySelector('.focusable:not([disabled]):not(.hidden)');
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
    focusables[nextIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    toast.offsetHeight;
    toast.classList.add('visible');
    // Platform spec: 3.5s + 300ms per word over 2, capped at 8s.
    var words = (message.trim().match(/\S+/g) || []).length;
    var ms = Math.min(3500 + Math.max(words - 2, 0) * 300, 8000);
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.classList.remove('visible'); }, ms);
  }

  // ==================== PERSISTENCE ====================
  function loadData() {
    try {
      var saved = localStorage.getItem(CONFIG.storageKey);
      if (saved) {
        var parsed = JSON.parse(saved);
        Object.assign(state.data.settings, parsed.settings || {});
        state.data.speechData = parsed.speechData || {};
        state.data.activeKey = parsed.activeKey || null;
        state.data.cachedSpeeches = parsed.cachedSpeeches || [];
      }
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

  function saveDataDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveData, 400);
  }

  // ==================== SPEECH PARSING ====================
  function hashString(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h;
  }

  function countWords(s) {
    return (s.trim().match(/\S+/g) || []).length;
  }

  function prettifyFilename(file) {
    return file.replace(/\.txt$/i, '').replace(/[-_]+/g, ' ').trim();
  }

  // One file = one speech. Title comes from a "# Title" first line when
  // present, otherwise from the filename.
  function parseSpeechFile(file, text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var title = null;
    var bodyStart = 0;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var m = lines[i].match(/^#\s+(.+?)\s*$/);
      if (m) { title = m[1]; bodyStart = i + 1; }
      break;
    }
    var body = lines.slice(bodyStart).join('\n').trim();
    return {
      key: file,
      title: title || prettifyFilename(file),
      body: body,
      hash: hashString(body),
      words: countWords(body),
    };
  }

  function speechesFromFetched(fetched) {
    return fetched
      .map(function(r) { return parseSpeechFile(r.file, r.text); })
      .filter(function(s) { return s.body.length > 0; });
  }

  // Reconcile freshly parsed speeches with saved per-speech positions:
  // keep progress where the text is unchanged, reset it where it changed,
  // drop entries for speeches that no longer exist. Returns #changed.
  function syncSpeechData() {
    var changed = 0;
    var next = {};
    state.speeches.forEach(function(s) {
      var old = state.data.speechData[s.key];
      if (old && old.hash === s.hash) {
        next[s.key] = old;
      } else {
        next[s.key] = { progress: 0, hash: s.hash };
        if (old) changed++;
      }
    });
    state.data.speechData = next;
    if (!findSpeech(state.activeKey)) state.activeKey = null;
    if (!findSpeech(state.data.activeKey)) state.data.activeKey = null;
    return changed;
  }

  function findSpeech(key) {
    if (key === null || key === undefined) return null;
    return state.speeches.find(function(s) { return s.key === key; }) || null;
  }

  function activeSpeech() { return findSpeech(state.activeKey); }

  function activeProgress() {
    var sd = state.data.speechData[state.activeKey];
    return sd ? sd.progress : 0;
  }

  function setActiveProgress(ratio) {
    var sd = state.data.speechData[state.activeKey];
    if (sd) sd.progress = ratio;
  }

  // ==================== SPEECH LOADING ====================
  // Find the .txt files in speeches/. On GitHub Pages, Jekyll generates
  // speeches/index.json at deploy time. On a plain local server (python
  // http.server) that file is served as the raw Liquid template — JSON.parse
  // fails — so fall back to scraping the server's directory listing.
  function discoverSpeechFiles() {
    return fetch(CONFIG.speechesDir + 'index.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function(text) {
        var list = JSON.parse(text);
        if (!Array.isArray(list)) throw new Error('bad manifest');
        return list;
      })
      .catch(function() {
        return fetch(CONFIG.speechesDir + '?t=' + Date.now(), { cache: 'no-store' })
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
          })
          .then(function(html) {
            var files = [];
            var re = /href="([^"]+\.txt)"/gi;
            var m;
            while ((m = re.exec(html)) !== null) {
              var name = decodeURIComponent(m[1].split('/').pop());
              if (files.indexOf(name) === -1) files.push(name);
            }
            return files;
          });
      });
  }

  function loadSpeeches(isReload) {
    var status = document.getElementById('script-status');
    if (status) status.textContent = 'Loading…';

    return discoverSpeechFiles()
      .then(function(files) {
        files.sort(function(a, b) { return a.localeCompare(b); });
        return Promise.all(files.map(function(file) {
          return fetch(CONFIG.speechesDir + encodeURIComponent(file) + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function(res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.text();
            })
            .then(function(text) { return { file: file, text: text }; })
            .catch(function() { return null; }); // skip files that fail; the rest still load
        }));
      })
      .then(function(results) {
        var fetched = results.filter(Boolean);
        if (fetched.length === 0 && results.length > 0) throw new Error('all speech fetches failed');
        var fingerprint = function(arr) {
          return arr.map(function(r) { return r.file + ':' + hashString(r.text); }).join('|');
        };
        var anythingChanged = fingerprint(fetched) !== fingerprint(state.data.cachedSpeeches);
        state.data.cachedSpeeches = fetched;
        state.speeches = speechesFromFetched(fetched);
        var editedCount = syncSpeechData();
        saveData();
        afterSpeechesLoaded();
        if (status) status.textContent = speechCountLabel();
        if (isReload) {
          showToast(!anythingChanged ? 'No changes'
            : 'Reloaded ✓ ' + state.speeches.length + ' speech' + (state.speeches.length === 1 ? '' : 'es') +
              (editedCount ? ', ' + editedCount + ' updated' : ''));
        }
      })
      .catch(function(err) {
        console.error('[Speeches] Load failed:', err);
        if (state.data.cachedSpeeches.length) {
          state.speeches = speechesFromFetched(state.data.cachedSpeeches);
          syncSpeechData();
          afterSpeechesLoaded();
          if (status) status.textContent = 'Offline copy';
          if (isReload) showToast('Fetch failed — using saved copy');
        } else {
          state.speeches = [];
          afterSpeechesLoaded();
          if (status) status.textContent = 'No speeches';
        }
      });
  }

  function speechCountLabel() {
    var n = state.speeches.length;
    return n === 1 ? '1 speech' : n + ' speeches';
  }

  function afterSpeechesLoaded() {
    state.renderedKey = null; // force prompter re-render for fresh content
    if (state.currentScreen === 'home') renderSpeechList();
    if (state.currentScreen === 'speech') renderSpeechDetail();
    if (state.currentScreen === 'prompter') {
      if (activeSpeech()) syncPrompter();
      else navigateTo('home', { addToHistory: false });
    }
  }

  // ==================== RENDERING ====================
  function renderSpeechList() {
    var list = document.getElementById('speech-list');
    if (!list) return;
    list.innerHTML = '';

    if (state.speeches.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No speeches found. Add lines starting with "# Title" to speech.txt.';
      list.appendChild(empty);
      return;
    }

    state.speeches.forEach(function(s, i) {
      var row = document.createElement('button');
      row.className = 'menu-item focusable' + (i === 0 ? ' initial-focus' : '');
      row.dataset.action = 'open-speech';
      row.dataset.key = s.key;

      var icon = document.createElement('span');
      icon.className = 'menu-icon';
      icon.textContent = '📄';

      var wrap = document.createElement('span');
      wrap.className = 'menu-label';
      var title = document.createElement('span');
      title.className = 'menu-title';
      title.textContent = s.title;
      var meta = document.createElement('span');
      meta.className = 'menu-meta';
      var sd = state.data.speechData[s.key];
      var pct = sd && sd.progress > 0.01 ? ' · ' + Math.round(sd.progress * 100) + '%' : '';
      meta.textContent = s.words + ' words · ~' + Math.max(1, Math.round(s.words / CONFIG.wordsPerMinute)) + ' min' + pct;
      wrap.appendChild(title);
      wrap.appendChild(meta);

      row.appendChild(icon);
      row.appendChild(wrap);
      list.appendChild(row);
    });
  }

  function renderSpeechDetail() {
    var s = activeSpeech();
    if (!s) return;
    var el;
    if ((el = document.getElementById('speech-title'))) el.textContent = s.title;
    if ((el = document.getElementById('stat-words'))) el.textContent = s.words;
    if ((el = document.getElementById('stat-minutes'))) {
      var minutes = s.words / CONFIG.wordsPerMinute;
      el.textContent = minutes < 1 ? '<1' : Math.round(minutes);
    }
    var progress = activeProgress();
    if ((el = document.getElementById('stat-progress'))) el.textContent = Math.round(progress * 100) + '%';
    if ((el = document.getElementById('start-label'))) {
      el.textContent = progress > 0.01 ? 'Resume prompting' : 'Start prompting';
    }
  }

  function renderScript() {
    var s = activeSpeech();
    var container = document.getElementById('prompter-text');
    if (!container || !s) return;
    container.innerHTML = '';
    s.body.split(/\n\s*\n/).forEach(function(para) {
      if (!para.trim()) return;
      var p = document.createElement('p');
      para.split('\n').forEach(function(line, i) {
        if (i > 0) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(line));
      });
      container.appendChild(p);
    });
    state.renderedKey = s.key;
  }

  // ==================== SETTINGS ====================
  function applySettings() {
    var s = state.data.settings;
    var text = document.getElementById('prompter-text');
    if (!text) return;
    text.style.fontSize = s.fontSize + 'px';
    text.style.lineHeight = s.lineHeight;
    text.style.fontWeight = s.bold ? '700' : '400';
  }

  function renderSettings() {
    var list = document.getElementById('settings-list');
    if (!list) return;
    list.innerHTML = '';
    SETTING_DEFS.forEach(function(def, i) {
      var row = document.createElement('button');
      row.className = 'setting-row focusable' + (i === 0 ? ' initial-focus' : '');
      row.dataset.action = 'cycle-setting';
      row.dataset.setting = def.key;

      var label = document.createElement('span');
      label.className = 'setting-label';
      label.textContent = def.label;

      var value = document.createElement('span');
      value.className = 'setting-value';
      value.id = 'setting-value-' + def.key;
      value.textContent = def.fmt(state.data.settings[def.key]);

      row.appendChild(label);
      row.appendChild(value);
      list.appendChild(row);
    });
  }

  // Index of the current value, mapping unknown persisted values (e.g. after
  // the options array was customized) to the nearest/first option.
  function optionIndex(def, value) {
    var idx = def.options.indexOf(value);
    if (idx !== -1) return idx;
    if (typeof value === 'number') {
      idx = 0;
      def.options.forEach(function(o, i) {
        if (Math.abs(o - value) < Math.abs(def.options[idx] - value)) idx = i;
      });
      return idx;
    }
    return 0;
  }

  function cycleSetting(key, dir) {
    var def = SETTING_DEFS.find(function(d) { return d.key === key; });
    if (!def) return;
    var opts = def.options;
    var idx = optionIndex(def, state.data.settings[key]);
    var next = (idx + dir + opts.length) % opts.length;
    state.data.settings[key] = opts[next];
    saveData();
    var valueEl = document.getElementById('setting-value-' + key);
    if (valueEl) valueEl.textContent = def.fmt(opts[next]);
    applySettings();
  }

  function cycleSettingNoWrap(key, dir) {
    var def = SETTING_DEFS.find(function(d) { return d.key === key; });
    var opts = def.options;
    var idx = optionIndex(def, state.data.settings[key]);
    var next = Math.min(Math.max(idx + dir, 0), opts.length - 1);
    if (next === idx) return;
    state.data.settings[key] = opts[next];
    saveData();
    applySettings();
    var valueEl = document.getElementById('setting-value-' + key);
    if (valueEl) valueEl.textContent = def.fmt(opts[next]);
  }

  // ==================== PROMPTER ====================
  function viewport() { return document.getElementById('prompter-viewport'); }

  function rowHeightPx() {
    var s = state.data.settings;
    return s.fontSize * s.lineHeight;
  }

  function stepPx() {
    var vp = viewport();
    switch (state.data.settings.scrollStep) {
      case 'row1':  return rowHeightPx();
      case 'rows3': return rowHeightPx() * 3;
      case 'page':  return Math.max(vp.clientHeight - rowHeightPx(), rowHeightPx());
      default:      return rowHeightPx();
    }
  }

  // Where the current smooth scroll is headed. Successive swipes accumulate
  // from this target, not from the mid-animation scrollTop, so N swipes
  // always advance exactly N steps.
  var pendingTarget = null;

  function scrollStep(dir) {
    var vp = viewport();
    if (state.data.settings.invert === 'inverted') dir = -dir;
    var max = Math.max(vp.scrollHeight - vp.clientHeight, 0);
    var base = pendingTarget !== null ? pendingTarget : vp.scrollTop;
    pendingTarget = Math.min(Math.max(base + dir * stepPx(), 0), max);
    vp.scrollTo({ top: pendingTarget, behavior: 'smooth' });
  }

  function updateProgress() {
    var vp = viewport();
    var max = vp.scrollHeight - vp.clientHeight;
    var fill = document.getElementById('progress-fill');
    if (max <= 0) {
      // Script not rendered yet (or shorter than the viewport) — don't
      // clobber the saved resume position with a bogus 0.
      if (fill) fill.style.width = '0%';
      return;
    }
    if (pendingTarget !== null && Math.abs(vp.scrollTop - pendingTarget) < 1) {
      pendingTarget = null; // smooth scroll settled ('scrollend' fallback)
    }
    var ratio = Math.min(Math.max(vp.scrollTop / max, 0), 1);
    setActiveProgress(ratio);
    if (fill) fill.style.width = (ratio * 100).toFixed(1) + '%';
    saveDataDebounced();
  }

  function restoreScrollPosition() {
    var vp = viewport();
    // If the user has already started scrolling, never yank them away.
    if (pendingTarget !== null) return;
    var max = Math.max(vp.scrollHeight - vp.clientHeight, 0);
    vp.scrollTo({ top: activeProgress() * max, behavior: 'instant' });
    updateProgress();
  }

  // Bring the prompter DOM in line with the active speech + settings and
  // jump to its saved position. Synchronous on purpose: deferring to rAF
  // can fire arbitrarily late in a throttled WebView and stomp on a scroll
  // the user has already started.
  function syncPrompter() {
    if (state.renderedKey !== state.activeKey) renderScript();
    applySettings();
    restoreScrollPosition();
  }

  function adjustFontLive(dir) {
    var vp = viewport();
    var max = vp.scrollHeight - vp.clientHeight;
    // Hold the reading position through the reflow. If a smooth scroll is
    // in flight, measure from its destination rather than mid-animation.
    var top = pendingTarget !== null ? pendingTarget : vp.scrollTop;
    var ratio = max > 0 ? top / max : 0;
    cycleSettingNoWrap('fontSize', dir); // applies the new style
    // Reading scrollHeight after the style change forces a synchronous
    // reflow, so the corrected position is exact — no deferred callback.
    var newMax = Math.max(vp.scrollHeight - vp.clientHeight, 0);
    pendingTarget = null;
    vp.scrollTo({ top: ratio * newMax, behavior: 'instant' });
    updateProgress();
    showToast('Text size: ' + state.data.settings.fontSize + 'px');
  }

  // ==================== ACTIONS ====================
  function handleAction(action, element) {
    switch (action) {
      case 'back':
        navigateBack();
        break;
      case 'open-speech':
        if (element && element.dataset.key && findSpeech(element.dataset.key)) {
          state.activeKey = element.dataset.key;
          state.data.activeKey = element.dataset.key;
          saveData();
          navigateTo('speech');
        }
        break;
      case 'start':
        navigateTo('prompter');
        break;
      case 'restart':
        setActiveProgress(0);
        saveData();
        navigateTo('prompter');
        break;
      case 'go-settings':
        navigateTo('settings');
        break;
      case 'reload-script':
        loadSpeeches(true);
        break;
      case 'cycle-setting':
        if (element && element.dataset.setting) cycleSetting(element.dataset.setting, 1);
        break;
      default:
        console.log('[Action]', action);
        break;
    }
  }

  // ==================== SCREEN LIFECYCLE ====================
  function onScreenEnter(screenId) {
    if (screenId === 'prompter') {
      pendingTarget = null;
      syncPrompter();
    } else if (screenId === 'settings') {
      renderSettings();
    } else if (screenId === 'speech') {
      renderSpeechDetail();
    } else if (screenId === 'home') {
      renderSpeechList();
      var status = document.getElementById('script-status');
      if (status && state.speeches.length) status.textContent = speechCountLabel();
    }
  }

  function onScreenLeave(screenId) {
    if (screenId === 'prompter') {
      clearTimeout(saveTimer);
      saveData(); // persist exact position immediately
    }
  }

  // ==================== KEY HANDLING ====================
  // Neural Band: swipes -> arrow keys, index pinch -> Enter, middle pinch -> Escape.
  function handlePrompterKey(e) {
    switch (e.key) {
      case 'ArrowDown':  scrollStep(1); break;
      case 'ArrowUp':    scrollStep(-1); break;
      case 'ArrowRight': adjustFontLive(1); break;
      case 'ArrowLeft':  adjustFontLive(-1); break;
      case 'Enter':      navigateTo('settings'); break;
      case 'Escape':
        if (navigateBack()) e.preventDefault();
        return;
      default: return;
    }
    e.preventDefault();
  }

  function setupEvents() {
    document.addEventListener('click', function(e) {
      var actionEl = e.target.closest('[data-action]');
      if (actionEl) handleAction(actionEl.dataset.action, actionEl);
    });

    document.addEventListener('keydown', function(e) {
      if (state.currentScreen === 'prompter') {
        handlePrompterKey(e);
        return;
      }

      // In settings, Left/Right adjusts the focused row instead of moving focus.
      if (state.currentScreen === 'settings' &&
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        var row = document.activeElement;
        if (row && row.dataset && row.dataset.setting) {
          cycleSetting(row.dataset.setting, e.key === 'ArrowRight' ? 1 : -1);
          var def = SETTING_DEFS.find(function(d) { return d.key === row.dataset.setting; });
          if (def) showToast(def.label + ': ' + def.fmt(state.data.settings[def.key]));
        } else {
          moveFocus(e.key === 'ArrowRight' ? 'down' : 'up'); // e.g. on the back button
        }
        e.preventDefault();
        return;
      }

      switch (e.key) {
        case 'ArrowUp':    moveFocus('up');    e.preventDefault(); break;
        case 'ArrowDown':  moveFocus('down');  e.preventDefault(); break;
        case 'ArrowLeft':  moveFocus('left');  e.preventDefault(); break;
        case 'ArrowRight': moveFocus('right'); e.preventDefault(); break;
        case 'Enter':
          if (document.activeElement &&
              document.activeElement.classList.contains('focusable')) {
            document.activeElement.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
          if (navigateBack()) e.preventDefault();
          break;
      }
    });

    var vp = viewport();
    if (vp) {
      vp.addEventListener('scroll', updateProgress, { passive: true });
      if ('onscrollend' in window) {
        vp.addEventListener('scrollend', function() { pendingTarget = null; });
      }
    }
  }

  // ==================== INIT ====================
  function init() {
    collectScreens();
    setupEvents();
    loadData();
    state.activeKey = state.data.activeKey; // restored fully once speeches load
    loadSpeeches(false);

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
