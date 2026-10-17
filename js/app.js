/* P0KEM0N — main application */
(function () {
  'use strict';

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    sget: function (k, d) { try { var v = sessionStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersReduced = reduceQuery.matches;

  var state = {
    soundOn: store.get('p0kemon_sound', '0') === '1',
    motion: store.get('p0kemon_motion', prefersReduced ? 'reduced' : 'full'),
    introRunning: false
  };

  var root = document.documentElement;
  root.setAttribute('data-motion', state.motion);

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- AUDIO ---------- */
  var Sound = {
    ctx: null, master: null, engineNodes: null, ready: false,
    init: function () {
      if (this.ctx) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
        this.ready = true;
        return true;
      } catch (e) { return false; }
    },
    resume: function () { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(function(){}); },
    setEnabled: function (on) {
      if (on && !this.init()) return;
      if (!this.ctx) return;
      this.resume();
      var now = this.ctx.currentTime, g = this.master.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(on ? 0.55 : 0, now + 0.35);
      if (on) this.startAmbience(); else this.stopAmbience();
    },
    tone: function (freq, dur, type, vol, slideTo) {
      if (!this.ready || !this.ctx) return;
      var t = this.ctx.currentTime;
      var osc = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.05);
    },
    noise: function (dur, vol, ff, sweepTo) {
      if (!this.ready || !this.ctx) return;
      var t = this.ctx.currentTime;
      var len = Math.floor(this.ctx.sampleRate * dur);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = this.ctx.createBufferSource(); src.buffer = buf;
      var filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(ff || 1200, t);
      if (sweepTo) filt.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur);
    },
    click: function () { this.tone(880, 0.06, 'square', 0.045, 620); },
    engineStart: function () {
      this.noise(0.55, 0.10, 400, 2200);
      this.tone(48, 0.75, 'sawtooth', 0.11, 96);
      var self = this;
      setTimeout(function () { self.tone(96, 0.35, 'sawtooth', 0.06, 130); }, 240);
    },
    accelerate: function () { this.noise(0.9, 0.11, 700, 3400); this.tone(90, 0.9, 'sawtooth', 0.07, 220); },
    startAmbience: function () {
      if (!this.ready || this.engineNodes) return;
      var c = this.ctx;
      var o1 = c.createOscillator(), o2 = c.createOscillator();
      var filt = c.createBiquadFilter(), g = c.createGain();
      o1.type = 'sawtooth'; o1.frequency.value = 52;
      o2.type = 'sawtooth'; o2.frequency.value = 52.7;
      filt.type = 'lowpass'; filt.frequency.value = 240;
      g.gain.value = 0.035;
      o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      var lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.frequency.value = 0.18; lfoG.gain.value = 22;
      lfo.connect(lfoG); lfoG.connect(filt.frequency); lfo.start();
      this.engineNodes = { osc1: o1, osc2: o2, g: g, lfo: lfo };
    },
    stopAmbience: function () {
      if (!this.engineNodes) return;
      try { this.engineNodes.osc1.stop(); this.engineNodes.osc2.stop(); this.engineNodes.lfo.stop(); } catch (e) {}
      this.engineNodes = null;
    }
  };

  var soundBtn = $('#soundBtn'), mobileSound = $('#mobileSound'), introSound = $('#introSound');
  function paintSoundUI() {
    if (soundBtn) { soundBtn.classList.toggle('is-on', state.soundOn); soundBtn.setAttribute('aria-pressed', state.soundOn ? 'true' : 'false'); }
    if (introSound) { introSound.classList.toggle('is-on', state.soundOn); introSound.setAttribute('aria-pressed', state.soundOn ? 'true' : 'false'); }
    if (mobileSound) mobileSound.textContent = 'Sound: ' + (state.soundOn ? 'On' : 'Off');
  }
  function toggleSound() {
    state.soundOn = !state.soundOn;
    store.set('p0kemon_sound', state.soundOn ? '1' : '0');
    if (state.soundOn) { Sound.setEnabled(true); Sound.click(); }
    else { Sound.setEnabled(false); }
    paintSoundUI();
  }
  [soundBtn, mobileSound, introSound].forEach(function (b) { if (b) b.addEventListener('click', toggleSound); });
  paintSoundUI();

  var motionBtn = $('#motionBtn'), mobileMotion = $('#mobileMotion');
  function paintMotionUI() {
    var r = state.motion === 'reduced';
    if (motionBtn) { motionBtn.classList.toggle('is-on', r); motionBtn.setAttribute('aria-pressed', r ? 'true' : 'false'); motionBtn.title = r ? 'Motion: Reduced' : 'Motion: Full'; }
    if (mobileMotion) mobileMotion.textContent = 'Motion: ' + (r ? 'Reduced' : 'Full');
  }
  function toggleMotion() {
    state.motion = state.motion === 'reduced' ? 'full' : 'reduced';
    store.set('p0kemon_motion', state.motion);
    root.setAttribute('data-motion', state.motion);
    paintMotionUI(); Sound.click();
  }
  [motionBtn, mobileMotion].forEach(function (b) { if (b) b.addEventListener('click', toggleMotion); });
  paintMotionUI();

  /* ---------- INTRO ---------- */
  var intro = $('#intro'), introTimers = [], introEnded = false;
  function clearIntroTimers() { introTimers.forEach(clearTimeout); introTimers = []; }
  var bootHud = document.getElementById('bootHud');
  function setStage(n) {
    for (var i = 1; i <= 6; i++) intro.classList.remove('stage-' + i);
    if (n) intro.classList.add('stage-' + n);
    
    if (bootHud) {
      if (n === 1) { bootHud.style.opacity = '1'; bootHud.textContent = 'INITIALIZING CORE...'; }
      if (n === 2) { bootHud.textContent = 'LOADING ASSETS...'; }
      if (n === 3) { bootHud.textContent = 'ESTABLISHING CONNECTION...'; }
      if (n === 4) { bootHud.textContent = 'SYSTEM SECURE.'; }
      if (n === 5) { bootHud.textContent = 'WELCOME.'; }
    }
  }
  function endIntro(skipped) {
    if (introEnded) return;
    introEnded = true; state.introRunning = false; clearIntroTimers();
    if (intro) {
      intro.classList.add('done');
      setTimeout(function () { intro.classList.remove('intro--on', 'done'); setStage(0); }, 820);
    }
    document.body.style.overflow = '';
    store.sset('p0kemon_intro_seen', '1');
    if (Sound.ready) Sound.setEnabled(state.soundOn);
  }
  function runIntro() {
    if (!intro) return;
    introEnded = false; state.introRunning = true;
    intro.classList.add('intro--on'); intro.classList.remove('done');
    document.body.style.overflow = 'hidden';
    setStage(0);
    var tl = [
      [80, function () { setStage(1); }],
      [1150, function () { setStage(2); }],
      [2700, function () { setStage(3); }],
      [3350, function () { setStage(4); if (state.soundOn) { Sound.setEnabled(true); Sound.tone(200, 0.5, 'sine', 0.1, 800); } }],
      [4700, function () { setStage(5); if (state.soundOn) Sound.tone(800, 1, 'sine', 0.15, 200); }],
      [5900, function () { endIntro(false); }]
    ];
    tl.forEach(function (s) { introTimers.push(setTimeout(s[1], s[0])); });
    introTimers.push(setTimeout(function () { endIntro(false); }, 9000));
  }
  var skipBtn = $('#skipIntro');
  if (skipBtn) skipBtn.addEventListener('click', function () { endIntro(true); });
  document.addEventListener('keydown', function (e) {
    if (state.introRunning && (e.key === 'Escape' || e.key === 'Enter')) endIntro(true);
  });
  if (intro && intro.classList.contains('intro--on')) runIntro();
  else introEnded = true;

  function replayIntro() {
    store.sset('p0kemon_intro_seen', '0');
    closeMobileNav();
    window.scrollTo({ top: 0, behavior: 'auto' });
    setTimeout(runIntro, 120);
  }
  var replayBtn = $('#replayIntro'), mobileReplay = $('#mobileReplay');
  if (replayBtn) replayBtn.addEventListener('click', replayIntro);
  if (mobileReplay) mobileReplay.addEventListener('click', replayIntro);

  /* ---------- NAV ---------- */
  var nav = $('#nav'), navAnchors = $$('#navLinks a');
  var mobileNav = $('#mobileNav'), burger = $('#burger'), closeNavBtn = $('#closeNav');
  function onScrollNav() { if (window.scrollY > 24) nav.classList.add('is-stuck'); else nav.classList.remove('is-stuck'); }
  onScrollNav();
  function openMobileNav() { mobileNav.classList.add('is-open'); mobileNav.setAttribute('aria-hidden', 'false'); burger.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; }
  function closeMobileNav() { mobileNav.classList.remove('is-open'); mobileNav.setAttribute('aria-hidden', 'true'); if (burger) burger.setAttribute('aria-expanded', 'false'); if (!state.introRunning) document.body.style.overflow = ''; }
  if (burger) burger.addEventListener('click', openMobileNav);
  if (closeNavBtn) closeNavBtn.addEventListener('click', closeMobileNav);
  $$('#mobileNav a').forEach(function (a) { a.addEventListener('click', closeMobileNav); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) closeMobileNav(); });

  var sections = ['home','about','skills','projects','experience','contact'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if ('IntersectionObserver' in window) {
    var navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.id;
          navAnchors.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + id); });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { navObs.observe(s); });
  }

  /* ---------- REVEAL ---------- */
  var revealEls = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); revObs.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function (el) { revObs.observe(el); });
  } else { revealEls.forEach(function (el) { el.classList.add('in'); }); }

  var skillEls = $$('.skill');
  if ('IntersectionObserver' in window) {
    var skillObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); skillObs.unobserve(en.target); } });
    }, { threshold: 0.2 });
    skillEls.forEach(function (el) { skillObs.observe(el); });
  } else { skillEls.forEach(function (el) { el.classList.add('in'); }); }

  /* ---------- COUNTERS ---------- */
  var counters = $$('[data-count]');
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (target === 0) { el.textContent = '0'; return; }
    var t0 = performance.now(), dur = 1400;
    (function tick(t) {
      var p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }
  if ('IntersectionObserver' in window && state.motion !== 'reduced') {
    var cntObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { animateCount(en.target); cntObs.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { cntObs.observe(c); });
  }

  /* ---------- SKILL FILTERS ---------- */
  var filters = $$('.filter');
  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cat = btn.getAttribute('data-filter');
      filters.forEach(function (b) { var a = b === btn; b.classList.toggle('is-active', a); b.setAttribute('aria-selected', a ? 'true' : 'false'); });
      skillEls.forEach(function (card) {
        var m = cat === 'all' || card.getAttribute('data-cat') === cat;
        card.classList.toggle('is-hidden', !m);
      });
      Sound.click();
    });
  });

  /* ---------- PROJECT MODAL ---------- */
  var modal = $('#projectModal');
  var modalTitle = $('#modalTitle'), modalCat = $('#modalCat'), modalDesc = $('#modalDesc');
  var modalTags = $('#modalTags'), modalActions = $('#modalActions'), lastFocused = null;
  function openProject(card) {
    lastFocused = document.activeElement;
    modalTitle.textContent = card.getAttribute('data-title') || 'Project';
    modalCat.textContent = card.getAttribute('data-cat') || '';
    modalDesc.textContent = card.getAttribute('data-desc') || '';
    modalTags.innerHTML = '';
    (card.getAttribute('data-tags') || '').split(',').forEach(function (t) {
      t = t.trim(); if (!t) return;
      var s = document.createElement('span'); s.className = 'tag'; s.textContent = t; modalTags.appendChild(s);
    });
    modalActions.innerHTML = '';
    var demo = card.getAttribute('data-demo') || '', code = card.getAttribute('data-code') || '';
    if (demo) { var a = document.createElement('a'); a.className = 'btn btn--primary'; a.href = demo; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Live Demo'; modalActions.appendChild(a); }
    if (code) { var b = document.createElement('a'); b.className = 'btn btn--ghost'; b.href = code; b.target = '_blank'; b.rel = 'noopener noreferrer'; b.textContent = 'Source Code'; modalActions.appendChild(b); }
    if (!demo && !code) { var n = document.createElement('p'); n.style.cssText = 'font-size:12px;color:var(--gray);margin:0;'; n.textContent = 'Links for this project are not configured yet.'; modalActions.appendChild(n); }
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#modalClose').focus(); }, 60);
    Sound.click();
  }
  function closeProject() {
    modal.classList.remove('is-open');
    if (!state.introRunning && !mobileNav.classList.contains('is-open')) document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  $$('.project').forEach(function (card) {
    card.addEventListener('click', function () { openProject(card); });
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(card); } });
  });
  $('#modalClose').addEventListener('click', closeProject);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeProject(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeProject(); });

  /* ---------- FORM ---------- */
  var form = $('#contactForm');
  if (form) {
    var F = {
      name: { input: $('#cf-name'), err: $('#err-name'), wrap: $('#cf-name').closest('.field') },
      email: { input: $('#cf-email'), err: $('#err-email'), wrap: $('#cf-email').closest('.field') },
      message: { input: $('#cf-message'), err: $('#err-message'), wrap: $('#cf-message').closest('.field') }
    };
    function setErr(k, m) { var f = F[k]; f.wrap.classList.toggle('has-error', !!m); f.err.textContent = m || ''; f.input.setAttribute('aria-invalid', m ? 'true' : 'false'); }
    function validate() {
      var ok = true;
      var n = F.name.input.value.trim(), e = F.email.input.value.trim(), m = F.message.input.value.trim();
      if (n.length < 2) { setErr('name', 'Please enter your name (at least 2 characters).'); ok = false; } else setErr('name', '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setErr('email', 'Please enter a valid email address.'); ok = false; } else setErr('email', '');
      if (m.length < 10) { setErr('message', 'Please write at least 10 characters.'); ok = false; } else setErr('message', '');
      return ok;
    }
    Object.keys(F).forEach(function (k) {
      F[k].input.addEventListener('input', function () { if (F[k].wrap.classList.contains('has-error')) setErr(k, ''); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) { var f = form.querySelector('.has-error input, .has-error textarea'); if (f) f.focus(); return; }
      var btn = $('#cf-submit'), status = $('#cf-status'), orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Sending…'; status.classList.remove('show');
      setTimeout(function () {
        btn.disabled = false; btn.textContent = orig;
        status.textContent = 'Demo form — nothing was sent. Connect a backend endpoint, or email hello@p0kem0n.dev directly.';
        status.classList.add('show'); Sound.click();
      }, 900);
    });
  }

  /* ---------- SHOWCASE PARALLAX ---------- */
  var stage = $('#showcaseStage'), scene = $('#showcaseScene');
  if (stage && scene) {
    var raf = null;
    stage.addEventListener('pointermove', function (e) {
      if (state.motion === 'reduced' || raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var r = stage.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        scene.style.transform = 'rotateY(' + (px * 7).toFixed(2) + 'deg) rotateX(' + (-py * 5).toFixed(2) + 'deg)';
      });
    });
    stage.addEventListener('pointerleave', function () { scene.style.transform = ''; });
  }

  /* ---------- ENV CANVAS ---------- */
  var canvas = $('#bg');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var env = { W: 0, H: 0, DPR: 1, horizon: 0, layers: [], particles: [], roadShift: 0, scrollY: 0, prevScrollY: 0, speed: 0, t: 0, running: true, raf: null };
  function isLightMode() { return state.motion === 'reduced'; }
  function makeLayer(fn) {
    var c = document.createElement('canvas');
    var w = env.W + 400, h = env.H;
    c.width = Math.floor(w * env.DPR); c.height = Math.floor(h * env.DPR);
    var cx = c.getContext('2d'); cx.scale(env.DPR, env.DPR); fn(cx, w, h);
    return { canvas: c, w: w, h: h };
  }
  function buildEnv() {
    if (!ctx) return;
    env.DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    env.W = window.innerWidth; env.H = window.innerHeight; env.horizon = env.H * 0.58;
    canvas.width = Math.floor(env.W * env.DPR); canvas.height = Math.floor(env.H * env.DPR);
    canvas.style.width = env.W + 'px'; canvas.style.height = env.H + 'px';
    ctx.setTransform(env.DPR, 0, 0, env.DPR, 0, 0);
    var W = env.W, H = env.H, horizon = env.horizon;
    var specs = [
      { count: 30, minH: 0.05, maxH: 0.14, w: 44, col: '#050907', win: 'rgba(255,215,0,0.30)', alpha: 0.9, stars: true },
      { count: 22, minH: 0.09, maxH: 0.24, w: 62, col: '#070d0a', win: 'rgba(255,215,0,0.42)', alpha: 0.95 },
      { count: 16, minH: 0.14, maxH: 0.36, w: 86, col: '#0a120e', win: 'rgba(255,234,0,0.45)', alpha: 1 }
    ];
    env.layers = specs.map(function (spec, idx) {
      return makeLayer(function (cx, w, h) {
        if (spec.stars) {
          cx.fillStyle = 'rgba(200,230,210,0.55)';
          for (var s = 0; s < 110; s++) {
            cx.globalAlpha = Math.random() * 0.6 + 0.2;
            cx.beginPath(); cx.arc(Math.random()*w, Math.random()*horizon*0.75, Math.random()*1.2 + 0.3, 0, Math.PI*2); cx.fill();
          }
          cx.globalAlpha = 1;
        }
        var glow = cx.createRadialGradient(w/2, horizon, 10, w/2, horizon, w*0.7);
        glow.addColorStop(0, 'rgba(255,215,0,' + (0.075 - idx*0.02) + ')');
        glow.addColorStop(0.5, 'rgba(255,215,0,0.02)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = glow; cx.fillRect(0, 0, w, h);
        var x = -120, count = 0;
        while (x < w + 120 && count < spec.count * 2) {
          count++;
          var bw = spec.w * (0.6 + Math.random() * 0.85);
          var bh = Math.min(horizon * (spec.minH / 0.14) * (0.6 + Math.random() * 1.1), horizon * 0.9);
          var top = horizon - bh;
          cx.fillStyle = spec.col; cx.globalAlpha = spec.alpha;
          cx.fillRect(x, top, bw, bh + 4);
          if (Math.random() < 0.22) { cx.fillStyle = 'rgba(255,215,0,0.28)'; cx.fillRect(x + bw/2 - 0.5, top - 10 - Math.random()*14, 1, 18); }
          cx.fillStyle = spec.win;
          for (var wy = top + 8; wy < horizon - 6; wy += 13) {
            for (var wx = x + 6; wx < x + bw - 6; wx += 11) {
              if (Math.random() < 0.20) { cx.globalAlpha = Math.random()*0.7 + 0.15; cx.fillRect(wx, wy, 2.5, 3.5); }
            }
          }
          cx.globalAlpha = 1;
          x += bw + 6 + Math.random() * 18;
        }
      });
    });
    var pcount = env.W < 700 ? 26 : 54;
    env.particles = [];
    for (var i = 0; i < pcount; i++) {
      env.particles.push({ x: Math.random()*W, y: Math.random()*H, r: Math.random()*1.6 + 0.4, vy: -(Math.random()*0.22 + 0.05), vx: (Math.random()-0.5)*0.12, a: Math.random()*0.5 + 0.12 });
    }
  }
  function drawRoad() {
    var W = env.W, H = env.H, horizon = env.horizon;
    var topHalf = W * 0.045, botHalf = W * 0.92;
    ctx.beginPath();
    ctx.moveTo(W/2 - topHalf, horizon); ctx.lineTo(W/2 + topHalf, horizon);
    ctx.lineTo(W/2 + botHalf, H); ctx.lineTo(W/2 - botHalf, H); ctx.closePath();
    var rg = ctx.createLinearGradient(0, horizon, 0, H);
    rg.addColorStop(0, 'rgba(8,14,10,0.55)');
    rg.addColorStop(0.5, 'rgba(5,9,6,0.75)');
    rg.addColorStop(1, 'rgba(3,6,4,0.92)');
    ctx.fillStyle = rg; ctx.fill();
    [-1,1].forEach(function (side) {
      ctx.beginPath();
      ctx.moveTo(W/2 + side*topHalf, horizon); ctx.lineTo(W/2 + side*botHalf, H);
      ctx.strokeStyle = 'rgba(255,215,0,0.30)'; ctx.lineWidth = 1.2;
      ctx.shadowColor = 'rgba(255,215,0,0.55)'; ctx.shadowBlur = 14;
      ctx.stroke(); ctx.shadowBlur = 0;
    });
    var segs = 16, shift = env.roadShift % 1;
    for (var i = 0; i < segs; i++) {
      var t0 = (i/segs + shift) % 1, t1 = t0 + (1/segs) * 0.55;
      if (t1 > 1) continue;
      var e0 = Math.pow(t0, 3), e1 = Math.pow(t1, 3);
      var y0 = horizon + (H - horizon) * e0, y1 = horizon + (H - horizon) * e1;
      var x0 = W/2;
      var w0 = (topHalf + (botHalf - topHalf) * e0) * 0.012;
      var w1 = (topHalf + (botHalf - topHalf) * e1) * 0.012;
      ctx.beginPath();
      ctx.moveTo(x0 - w0, y0); ctx.lineTo(x0 + w0, y0);
      ctx.lineTo(x0 + w1, y1); ctx.lineTo(x0 - w1, y1); ctx.closePath();
      ctx.fillStyle = 'rgba(255,215,0,' + (0.06 + e1 * 0.42) + ')'; ctx.fill();
    }
    var fog = ctx.createLinearGradient(0, horizon - 70, 0, horizon + 130);
    fog.addColorStop(0, 'rgba(3,5,4,0)');
    fog.addColorStop(0.42, 'rgba(12,26,17,0.55)');
    fog.addColorStop(1, 'rgba(3,5,4,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, horizon - 70, W, 200);
  }
  function draw(t) {
    if (!ctx) return;
    var W = env.W, H = env.H;
    var dt = Math.min(60, t - (env.t || t)); env.t = t;
    ctx.clearRect(0, 0, W, H);
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#010201'); sky.addColorStop(0.5, '#030705'); sky.addColorStop(1, '#020403');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    var sp = env.scrollY / Math.max(1, document.body.scrollHeight - H);
    sp = Math.max(0, Math.min(1, sp));
    env.layers.forEach(function (layer, i) {
      var par = i === 0 ? 0.012 : i === 1 ? 0.030 : 0.058;
      ctx.drawImage(layer.canvas, 0, 0, layer.w, layer.h, -200 + (-sp * par * 2200), 0, layer.w, layer.h);
    });
    drawRoad();
    for (var i = 0; i < env.particles.length; i++) {
      var p = env.particles[i];
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,215,0,' + p.a * 0.5 + ')'; ctx.fill();
      if (!isLightMode()) {
        p.y += p.vy * (dt/16.6) * 1.4; p.x += p.vx * (dt/16.6);
        if (p.y < -10) { p.y = H + 10; p.x = Math.random()*W; }
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
      }
    }
    if (!isLightMode()) {
      var time = t * 0.00012;
      for (var k = 0; k < 5; k++) {
        var lx = ((time * (0.4 + k*0.13) + k*0.21) % 1) * W;
        var ly = env.horizon + 6 + k*5;
        ctx.beginPath(); ctx.arc(lx, ly, 1.6, 0, Math.PI*2);
        ctx.fillStyle = k % 2 ? 'rgba(255,234,0,0.55)' : 'rgba(255,215,0,0.55)'; ctx.fill();
      }
    }
    var delta = Math.abs(env.scrollY - env.prevScrollY); env.prevScrollY = env.scrollY;
    env.speed += (Math.min(delta, 90) - env.speed) * 0.12;
    if (!isLightMode()) env.roadShift += (0.0018 + env.speed * 0.00022) * (dt/16.6);
    updateSpeedo();
  }
  var speedVal = $('#speedVal'), speedBar = $('#speedBar'), speedoShown = 0;
  function updateSpeedo() {
    if (!speedVal) return;
    var target = 42 + Math.min(180, env.speed * 2.4) + Math.sin(env.t * 0.0013) * 6;
    speedoShown += (target - speedoShown) * 0.08;
    var v = Math.round(speedoShown);
    speedVal.textContent = String(v).padStart(3, '0');
    if (speedBar) speedBar.style.width = Math.min(100, (v / 320) * 100) + '%';
  }
  function loop(t) { env.raf = requestAnimationFrame(loop); if (!env.running) return; draw(t); }
  function startLoop() { if (!env.raf) env.raf = requestAnimationFrame(loop); }
  function onScroll() { env.scrollY = window.pageYOffset || document.documentElement.scrollTop; onScrollNav(); }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    clearTimeout(window.__resizeT);
    window.__resizeT = setTimeout(function () { buildEnv(); onScroll(); }, 180);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { env.running = false; if (state.soundOn) Sound.setEnabled(false); }
    else { env.running = true; if (state.soundOn) Sound.setEnabled(true); }
  });
  if (ctx) { buildEnv(); onScroll(); startLoop(); }

  /* ---------- MISC ---------- */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: state.motion === 'reduced' ? 'auto' : 'smooth', block: 'start' });
      Sound.click();
    });
  });

  window.addEventListener('error', function () { if (state.introRunning) endIntro(true); });
  setTimeout(function () { if (state.introRunning) endIntro(true); }, 12000);
})();
