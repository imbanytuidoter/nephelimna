(function () {
  'use strict';

  var COLS = 'ABCDEFGH';
  var WET = 6 * 8 + 6;
  var HEX = { deep: '#061217', sea: '#0b2a33', gold: '#f0c37a', foam: '#bff3ef', teal: '#2fb3b3', bone: '#f4efe6', sand: '#e9dcc0', red: '#d7262e', floorA: '#0f3d42', floorB: '#13494d', water: '#2a9a9c' };
  var KINDS = ['bobber', 'spoon', 'hook', 'worm', 'sinker'];
  var KIND_COUNT = { bobber: 16, spoon: 14, hook: 11, worm: 10, sinker: 12 };
  var FACTS = ['Nobody knows what is in it.'];
  var state = null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { t = clamp(t, 0, 1); return t * t * t; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function listen(s, target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    s.offs.push(function () { target.removeEventListener(type, fn, opts); });
  }
  function all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function coordOf(cell) { return COLS.charAt(cell % 8) + (Math.floor(cell / 8) + 1); }

  function setupNav(s) {
    var header = s.root.querySelector('.tk-header');
    var burger = header.querySelector('.tk-burger');
    var setOpen = function (open) {
      header.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    listen(s, burger, 'click', function () { setOpen(!header.classList.contains('is-open')); });
    listen(s, document, 'keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); burger.focus(); }
    });
    listen(s, document, 'pointerdown', function (e) {
      if (header.classList.contains('is-open') && !header.contains(e.target)) { setOpen(false); }
    });
    listen(s, s.root, 'click', function (e) {
      var trigger = e.target.closest('[data-goto]');
      if (!trigger || !s.root.contains(trigger)) { return; }
      var target = s.root.querySelector('#' + CSS.escape(trigger.getAttribute('data-goto')));
      if (!target) { return; }
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      target.scrollIntoView({ behavior: s.reduced ? 'auto' : 'smooth', block: 'start' });
    });
    listen(s, header.querySelector('.tk-nav-list'), 'click', function (e) { if (e.target.closest('a')) { setOpen(false); } });
  }

  function setupHero(s) {
    var hero = s.root.querySelector('.tk-hero');
    var fit = function () { hero.classList.toggle('is-tall', hero.clientHeight >= hero.clientWidth); };
    fit();
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(fit);
      ro.observe(hero);
      s.offs.push(function () { ro.disconnect(); });
    }
  }

  function setupChart(s) {
    var box = s.root.querySelector('.tk-chart-cells');
    var out = s.root.querySelector('.tk-chart-out');
    var coordEl = out.querySelector('[data-chart-coord]');
    var textEl = out.querySelector('[data-chart-text]');
    var frag = document.createDocumentFragment();
    var cells = [];
    var taps = 0;
    for (var i = 0; i < 64; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tk-cell' + (i === WET ? ' is-wet is-on' : '');
      b.setAttribute('data-cell', String(i));
      b.setAttribute('aria-label', 'Square ' + coordOf(i));
      b.setAttribute('aria-pressed', i === WET ? 'true' : 'false');
      b.textContent = coordOf(i);
      frag.appendChild(b);
      cells.push(b);
    }
    box.appendChild(frag);
    var current = WET;
    s.pick = function (cell, fromScene) {
      cells[current].classList.remove('is-on');
      cells[current].setAttribute('aria-pressed', 'false');
      current = cell;
      cells[cell].classList.add('is-on');
      cells[cell].setAttribute('aria-pressed', 'true');
      coordEl.textContent = coordOf(cell);
      textEl.textContent = FACTS[taps % FACTS.length];
      taps++;
      if (!s.reduced) {
        out.classList.remove('is-pop');
        void out.offsetWidth;
        out.classList.add('is-pop');
      }
      if (s.g) { wobble(s.g, cell); }
      if (fromScene && s.g) { s.g.dirty = true; }
    };
    listen(s, box, 'click', function (e) {
      var b = e.target.closest('[data-cell]');
      if (b) { s.pick(parseInt(b.getAttribute('data-cell'), 10), false); }
    });
  }

  var EASE_OUT = function (t) { return 1 - Math.pow(1 - t, 3); };
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  /** Scroll progress of an element between two edges, measured like "top bottom" to "bottom top": edge 0 is the element top, 1 its bottom, and the viewport fraction says where on screen that edge sits. */
  function track(el, startEdge, startView, endEdge, endView) {
    return {
      get progress() {
        if (!el) { return 0; }
        var r = el.getBoundingClientRect();
        var vh = window.innerHeight;
        var a = r.top + r.height * startEdge - vh * startView;
        var b = r.top + r.height * endEdge - vh * endView;
        return b === a ? 0 : clamp01(a / (a - b));
      }
    };
  }

  function countUp(el, to) {
    var start = performance.now();
    var step = function (now) {
      var t = clamp01((now - start) / 1600);
      el.textContent = String(Math.round(to * EASE_OUT(t)));
      if (t < 1) { requestAnimationFrame(step); }
    };
    requestAnimationFrame(step);
  }

  function setupMotion(s) {
    var root = s.root;
    root.classList.add('tk-motion');
    if (!s.reduced) {
      requestAnimationFrame(function () { root.classList.add('tk-in'); });
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) { return; }
          var el = entry.target;
          seen.unobserve(el);
          el.classList.add('is-in');
          if (el.hasAttribute('data-count')) { countUp(el, parseInt(el.getAttribute('data-count'), 10)); }
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      all(root, '[data-rv]').forEach(function (el, i) { el.style.setProperty('--tk-tilt', (i % 2 ? 1 : -1) + 'deg'); seen.observe(el); });
      all(root, '[data-count]').forEach(function (el) { el.textContent = '0'; seen.observe(el); });
      s.seen = seen;
    } else {
      root.classList.add('tk-in');
      all(root, '[data-rv]').forEach(function (el) { el.classList.add('is-in'); });
    }
    var cast = root.querySelector('.tk-cast');
    s.castST = window.matchMedia('(min-width: 900px)').matches ? track(cast, 0, 0, 1, 1) : track(cast, 0, 0.4, 1, 1);
    s.st = {
      spill: track(root.querySelector('.tk-casts'), 0, 1, 1, 0),
      tray: track(root.querySelector('.tk-sealed'), 0, 0.92, 0, 0.02),
      orbit: track(root.querySelector('.tk-sealed'), 0, 0, 1, 1),
      approach: track(cast, 0, 0.9, 0, 0)
    };
    var steps = all(root, '.tk-step');
    var lastStep = -1;
    s.stepTick = function () {
      var p = s.castST.progress;
      var at = Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999));
      if (at === lastStep) { return; }
      lastStep = at;
      steps.forEach(function (el, n) { el.classList.toggle('is-on', n === at); el.classList.toggle('is-done', n < at); });
    };
    s.stepTick();
    listen(s, window, 'scroll', s.stepTick, { passive: true });
  }

  function mergeGeos(list) {
    var pos = [], nor = [], col = [], idx = [], offset = 0;
    var c = new THREE.Color();
    list.forEach(function (item) {
      var g = item.geo;
      var p = g.attributes.position, n = g.attributes.normal;
      c.set(item.color || '#ffffff');
      for (var i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        col.push(c.r, c.g, c.b);
      }
      if (g.index) {
        for (var j = 0; j < g.index.count; j++) { idx.push(g.index.getX(j) + offset); }
      } else {
        for (var k = 0; k < p.count; k++) { idx.push(k + offset); }
      }
      offset += p.count;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setIndex(idx);
    return out;
  }

  function buildGeos(lite) {
    var seg = lite ? 18 : 28;
    var r = 0.24;
    var top = new THREE.SphereGeometry(r, seg, seg / 2, 0, Math.PI * 2, 0, Math.PI / 2);
    var bot = new THREE.SphereGeometry(r, seg, seg / 2, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    var band = new THREE.TorusGeometry(r * 0.99, 0.022, 6, seg); band.rotateX(Math.PI / 2);
    var stem = new THREE.CylinderGeometry(0.03, 0.036, 0.34, 10); stem.translate(0, r + 0.15, 0);
    var peg = new THREE.CylinderGeometry(0.026, 0.012, 0.16, 8); peg.translate(0, -r - 0.06, 0);
    var bobber = mergeGeos([
      { geo: top, color: HEX.red }, { geo: bot, color: HEX.bone }, { geo: band, color: HEX.deep },
      { geo: stem, color: HEX.red }, { geo: peg, color: HEX.deep }
    ]);

    var shape = new THREE.Shape();
    shape.moveTo(0, -0.4);
    shape.bezierCurveTo(0.27, -0.34, 0.2, 0.22, 0, 0.34);
    shape.bezierCurveTo(-0.2, 0.22, -0.27, -0.34, 0, -0.4);
    var spoonG = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 2, curveSegments: lite ? 16 : 28 });
    var sp = spoonG.attributes.position;
    for (var i = 0; i < sp.count; i++) {
      var x = sp.getX(i), y = sp.getY(i);
      sp.setZ(i, sp.getZ(i) - 0.9 * x * x - 0.18 * y * y);
    }
    spoonG.computeVertexNormals();
    var ring = new THREE.TorusGeometry(0.05, 0.014, 6, 16); ring.translate(0, 0.39, 0);
    var spoon = mergeGeos([{ geo: spoonG }, { geo: ring }]);

    var hookCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.44, 0), new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0, -0.16, 0),
      new THREE.Vector3(0.03, -0.3, 0), new THREE.Vector3(0.14, -0.36, 0), new THREE.Vector3(0.24, -0.27, 0),
      new THREE.Vector3(0.25, -0.1, 0)
    ]);
    var hookTube = new THREE.TubeGeometry(hookCurve, lite ? 28 : 48, 0.03, 8, false);
    var barb = new THREE.ConeGeometry(0.045, 0.12, 8); barb.translate(0.25, -0.04, 0);
    var eye = new THREE.TorusGeometry(0.065, 0.022, 8, 20); eye.rotateY(Math.PI / 2); eye.translate(0, 0.5, 0);
    var hook = mergeGeos([{ geo: hookTube }, { geo: barb }, { geo: eye }]);

    var wormPts = [];
    for (var w = 0; w <= 24; w++) {
      var t = w / 24;
      var a = t * Math.PI * 3.3;
      var rad = 0.34 - 0.24 * t;
      wormPts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(t * Math.PI * 5) * 0.035, Math.sin(a) * rad));
    }
    wormPts.push(new THREE.Vector3(0.2, 0.02, 0.05));
    var wormTube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wormPts), lite ? 60 : 110, 0.058, lite ? 6 : 9, false);
    var cap = new THREE.SphereGeometry(0.058, 10, 8); cap.translate(wormPts[0].x, wormPts[0].y, wormPts[0].z);
    var worm = mergeGeos([{ geo: wormTube }, { geo: cap }]);

    var prof = [[0, -0.2], [0.09, -0.18], [0.15, -0.1], [0.155, 0.0], [0.12, 0.1], [0.07, 0.17], [0.02, 0.21], [0, 0.215]].map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var lathe = new THREE.LatheGeometry(prof, lite ? 14 : 22);
    var sEye = new THREE.TorusGeometry(0.05, 0.018, 6, 16); sEye.translate(0, 0.26, 0);
    var sinker = mergeGeos([{ geo: lathe }, { geo: sEye }]);
    return { bobber: bobber, spoon: spoon, hook: hook, worm: worm, sinker: sinker };
  }

  function buildMaterials() {
    return {
      bobber: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.08 }),
      spoon: new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 1, roughness: 0.16, side: THREE.DoubleSide }),
      hook: new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 1, roughness: 0.28 }),
      worm: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.3 }),
      sinker: new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42 })
    };
  }

  var TINTS = {
    bobber: ['#ffffff'],
    spoon: ['#e2e0da', '#e8c27a', '#e2e0da', '#d6b98a'],
    hook: ['#d9a54c', '#d5d8da'],
    worm: ['#b8665a', '#c97c6c', '#a35a50'],
    sinker: ['#8f979d', '#7d858b']
  };
  var FLAT = { bobber: [0, 0, Math.PI / 2], spoon: [-Math.PI / 2, 0, 0], hook: [-Math.PI / 2, 0, 0], worm: [0, 0, 0], sinker: [0, 0, Math.PI / 2] };
  var LIFT = { bobber: 0.25, spoon: 0.08, hook: 0.05, worm: 0.07, sinker: 0.17 };

  function buildEnv(renderer) {
    var envScene = new THREE.Scene();
    var shell = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: '#0a2229', side: THREE.BackSide }));
    envScene.add(shell);
    var panel = function (w, h, color, k, x, y, z, ry, rx) {
      var m = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
      m.color.multiplyScalar(k);
      var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      p.position.set(x, y, z); p.rotation.set(rx || 0, ry || 0, 0);
      envScene.add(p);
    };
    panel(16, 10, '#ffe6c2', 3.0, 0, 13, 2, 0, Math.PI / 2);
    panel(10, 14, '#f3b878', 1.7, -13, 3, 0, Math.PI / 2);
    panel(10, 12, HEX.teal, 1.3, 13, 4, -2, -Math.PI / 2);
    panel(18, 4, '#ffd9a8', 1.8, 0, 2, -13, 0);
    var pm = new THREE.PMREMGenerator(renderer);
    var rt = pm.fromScene(envScene, 0.035);
    envScene.traverse(function (o) { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    pm.dispose();
    return rt;
  }

  function labelTexture(chars, font) {
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 96;
    var x = c.getContext('2d');
    x.fillStyle = HEX.sand; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = HEX.sea;
    x.font = '700 58px ' + font;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (var i = 0; i < 8; i++) { x.fillText(chars[i], (i + 0.5) * c.width / 8, c.height / 2 + 4); }
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  function lidTexture(font) {
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    var x = c.getContext('2d');
    x.fillStyle = HEX.sea; x.fillRect(0, 0, 1024, 1024);
    x.strokeStyle = HEX.gold; x.lineWidth = 10;
    x.strokeRect(70, 70, 884, 884);
    x.fillStyle = HEX.gold;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '800 96px ' + font;
    x.fillText('Nephelimna', 512, 470);
    x.font = '700 44px ' + font;
    x.fillText('Sealed tackle', 512, 590);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  function buildTray(g, lite) {
    var group = new THREE.Group();
    var plastic = new THREE.MeshPhysicalMaterial({ color: HEX.sand, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6 });
    var unit = new THREE.BoxGeometry(1, 1, 1);
    g.unit = unit;
    var base = new THREE.Mesh(unit, plastic); base.scale.set(8.9, 0.22, 8.9); base.position.y = 0.11; group.add(base);
    var walls = new THREE.InstancedMesh(unit, plastic, 4 + 14);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    var put = function (i, x, y, z, sx, sy, sz) { p.set(x, y, z); sc.set(sx, sy, sz); m.compose(p, q, sc); walls.setMatrixAt(i, m); };
    put(0, 0, 0.42, -4.225, 8.9, 0.64, 0.45);
    put(1, 0, 0.42, 4.225, 8.9, 0.64, 0.45);
    put(2, -4.225, 0.42, 0, 0.45, 0.64, 8.0);
    put(3, 4.225, 0.42, 0, 0.45, 0.64, 8.0);
    for (var k = 1; k < 8; k++) {
      put(3 + k, k - 4, 0.4, 0, 0.07, 0.4, 8.0);
      put(10 + k, 0, 0.4, k - 4, 8.0, 0.4, 0.07);
    }
    group.add(walls);
    var tileMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    var tiles = new THREE.InstancedMesh(unit, tileMat, 64);
    var col = new THREE.Color();
    for (var i = 0; i < 64; i++) {
      var cx = (i % 8) - 3.5, cz = Math.floor(i / 8) - 3.5;
      p.set(cx, 0.235, cz); sc.set(0.93, 0.03, 0.93); m.compose(p, q, sc);
      tiles.setMatrixAt(i, m);
      col.set(((i % 8) + Math.floor(i / 8)) % 2 ? HEX.floorA : HEX.floorB);
      tiles.setColorAt(i, col);
    }
    group.add(tiles);
    g.tiles = tiles; g.tileBase = new THREE.Color(); g.tileHot = new THREE.Color(HEX.gold);
    var font = '"TK Panchang", "Arial Black", sans-serif';
    g.labelMats = [];
    var mkLabel = function (chars, x, z, ry) {
      var mat = new THREE.MeshBasicMaterial({ map: labelTexture(chars, font), toneMapped: false });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.38), mat);
      plane.rotation.set(-Math.PI / 2, 0, ry);
      plane.position.set(x, 0.745, z);
      group.add(plane);
      g.labelMats.push({ mat: mat, chars: chars });
    };
    mkLabel(COLS, 0, 4.225, 0);
    mkLabel('12345678', -4.225, 0, Math.PI / 2);

    var lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.74, -4.45);
    var lidMat = new THREE.MeshPhysicalMaterial({ color: HEX.sea, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    var lid = new THREE.Mesh(unit, lidMat); lid.scale.set(8.9, 0.2, 8.9); lid.position.set(0, 0.1, 4.45);
    lidPivot.add(lid);
    var innerMat = new THREE.MeshBasicMaterial({ map: lidTexture(font), toneMapped: false });
    g.lidInner = innerMat;
    var inner = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6), innerMat);
    inner.rotation.x = Math.PI / 2; inner.position.set(0, -0.005, 4.45);
    lidPivot.add(inner);
    var latch = new THREE.Mesh(unit, new THREE.MeshPhysicalMaterial({ color: HEX.gold, roughness: 0.3, metalness: 1 }));
    latch.scale.set(1.2, 0.36, 0.22); latch.position.set(0, 0.0, 8.95);
    lidPivot.add(latch);
    var hingeGeo = new THREE.CylinderGeometry(0.13, 0.13, 1.4, lite ? 10 : 16); hingeGeo.rotateZ(Math.PI / 2);
    var hingeMat = new THREE.MeshPhysicalMaterial({ color: HEX.gold, metalness: 1, roughness: 0.3 });
    [-2.8, 2.8].forEach(function (hx) { var h = new THREE.Mesh(hingeGeo, hingeMat); h.position.set(hx, 0, 0); lidPivot.add(h); });
    group.add(lidPivot);
    g.lid = lidPivot;

    var waterMat = new THREE.MeshPhysicalMaterial({ color: HEX.water, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0.1 });
    var water = new THREE.Mesh(unit, waterMat);
    water.position.set(2.5, 0.25, 2.5); water.scale.set(0.93, 0.01, 0.93);
    group.add(water);
    g.water = water;
    var ringGeo = new THREE.TorusGeometry(0.3, 0.018, 6, 40); ringGeo.rotateX(Math.PI / 2);
    g.rings = [0, 1].map(function () {
      var rm = new THREE.MeshBasicMaterial({ color: HEX.foam, transparent: true, opacity: 0, toneMapped: false });
      var ring = new THREE.Mesh(ringGeo, rm); ring.position.set(2.5, 0.3, 2.5);
      group.add(ring);
      return ring;
    });
    walls.castShadow = true; tiles.receiveShadow = true; base.receiveShadow = true;
    g.scene.add(group);
    g.tray = group;
  }

  function buildCastFloat(g, geo, mat) {
    var f = new THREE.Group();
    var body = new THREE.Mesh(geo, mat);
    body.scale.setScalar(1.25);
    f.add(body);
    var lineGeo = new THREE.CylinderGeometry(0.01, 0.01, 1, 5); lineGeo.translate(0, 0.5, 0);
    var line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: HEX.foam, toneMapped: false }));
    line.position.y = 0.6; line.scale.y = 14;
    f.add(line);
    f.visible = false;
    g.scene.add(f);
    g.float = f;
  }

  function buildPieces(g, lite) {
    var geos = buildGeos(lite);
    var mats = buildMaterials();
    var r = rng(58);
    var kinds = [];
    KINDS.forEach(function (k) { for (var i = 0; i < KIND_COUNT[k]; i++) { kinds.push(k); } });
    for (var s = kinds.length - 1; s > 0; s--) { var j = Math.floor(r() * (s + 1)); var tmp = kinds[s]; kinds[s] = kinds[j]; kinds[j] = tmp; }
    g.meshes = {};
    var used = {};
    KINDS.forEach(function (k) {
      var im = new THREE.InstancedMesh(geos[k], mats[k], KIND_COUNT[k]);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.frustumCulled = false;
      g.meshes[k] = im; used[k] = 0;
      g.scene.add(im);
    });
    g.pieces = [];
    g.cellPiece = [];
    var e = new THREE.Euler();
    var col = new THREE.Color();
    var cell = 0;
    for (var n = 0; n < kinds.length; n++, cell++) {
      if (cell === WET) { g.cellPiece[cell] = -1; cell++; }
      var k = kinds[n];
      var idx = used[k]++;
      var tint = TINTS[k][Math.floor(r() * TINTS[k].length)];
      g.meshes[k].setColorAt(idx, col.set(tint));
      var f = FLAT[k];
      var qt = new THREE.Quaternion().setFromEuler(e.set(f[0], f[1], f[2]));
      qt.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2));
      g.pieces.push({
        kind: k, idx: idx, cell: cell,
        ux: r() * 2 - 1, uy: r(), uz: r() * 2 - 1,
        tray: new THREE.Vector3((cell % 8) - 3.5, 0.25 + LIFT[k], Math.floor(cell / 8) - 3.5),
        spill: new THREE.Vector3(),
        qs: new THREE.Quaternion().setFromEuler(e.set(r() * 6.28, r() * 6.28, r() * 6.28)),
        qt: qt,
        axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        spin: 0.25 + r() * 0.5, phase: r() * 6.28, delay: r() * 0.42, drop: r() * 0.6,
        o: new THREE.Vector3(), v: new THREE.Vector3(), a: new THREE.Vector3(), av: new THREE.Vector3(),
        scale: k === 'bobber' ? 1 : 1.05
      });
      g.cellPiece[cell] = n;
    }
    if (g.cellPiece[WET] === undefined) { g.cellPiece[WET] = -1; }
    KINDS.forEach(function (k) { if (g.meshes[k].instanceColor) { g.meshes[k].instanceColor.needsUpdate = true; } });
    g.geos = geos; g.mats = mats;
    buildCastFloat(g, geos.bobber, mats.bobber);
  }

  function layoutSpill(g) {
    var wide = g.aspect >= 1;
    var hw = wide ? 8.6 : 3.0;
    for (var i = 0; i < g.pieces.length; i++) {
      var pc = g.pieces[i];
      pc.spill.set(pc.ux * hw, 1.8 + pc.uy * (wide ? 8.2 : 9.5), pc.uz * 2.6);
    }
  }

  function wobble(g, cell) {
    g.tapCell = cell;
    g.tapAt = performance.now();
    var n = g.cellPiece[cell];
    if (n >= 0) {
      var pc = g.pieces[n];
      pc.v.y += 3.2;
      pc.av.set(6 * (Math.random() - 0.5), 9, 6 * (Math.random() - 0.5));
    }
    g.dirty = true;
  }

  function initGL(s) {
    var host = s.root.querySelector('.tk-gl');
    var g = { host: host, scene: new THREE.Scene(), now: performance.now(), running: false, visible: false, dirty: true };
    g.lite = window.matchMedia('(max-width: 899px)').matches;
    g.prevLegacy = THREE.ColorManagement ? THREE.ColorManagement.legacyMode : undefined;
    if (THREE.ColorManagement) { THREE.ColorManagement.legacyMode = false; }
    var renderer = new THREE.WebGLRenderer({ antialias: !g.lite, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.lite ? 1.25 : 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(HEX.deep, 1);
    renderer.shadowMap.enabled = !g.lite;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    g.renderer = renderer;
    g.envRT = buildEnv(renderer);
    g.scene.environment = g.envRT.texture;
    g.scene.fog = new THREE.Fog(HEX.deep, 22, 46);
    var key = new THREE.DirectionalLight('#ffe0b5', 1.75);
    key.position.set(5, 12, 7);
    key.castShadow = !g.lite;
    key.shadow.mapSize.set(1024, 1024);
    var sc = key.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0008;
    g.scene.add(key);
    g.key = key;
    g.scene.add(new THREE.HemisphereLight(HEX.foam, HEX.deep, 0.4));
    g.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
    buildTray(g, g.lite);
    buildPieces(g, g.lite);
    g.ray = new THREE.Raycaster();
    g.ndc = new THREE.Vector2();
    g.ptr = { x: 0, y: 0, sx: 0, sy: 0, active: false };
    g.hit = new THREE.Vector3();
    g.planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    g.planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
    g.t = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), v1: new THREE.Vector3(), v2: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), e: new THREE.Euler(), m: new THREE.Matrix4(), sc: new THREE.Vector3(), c: new THREE.Color() };
    g.k = { spill: 0, tray: 0, orbit: 0, approach: 0, cast: 0 };
    g.intro = s.reduced ? -1 : 0;
    s.g = g;

    var resize = function () {
      var w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      g.w = w; g.h = h; g.aspect = w / h;
      g.camera.aspect = g.aspect;
      layoutSpill(g);
      g.dirty = true;
      if (s.reduced) { frame(s, performance.now()); }
    };
    resize();
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(resize);
      ro.observe(host);
      s.offs.push(function () { ro.disconnect(); });
    }
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 80px "TK Panchang"').then(function () {
        if (s !== state || !s.g) { return; }
        var font = '"TK Panchang", "Arial Black", sans-serif';
        g.labelMats.forEach(function (l) { l.mat.map.dispose(); l.mat.map = labelTexture(l.chars, font); l.mat.needsUpdate = true; });
        g.lidInner.map.dispose(); g.lidInner.map = lidTexture(font); g.lidInner.needsUpdate = true;
        g.dirty = true;
        if (s.reduced) { frame(s, performance.now()); }
      }).catch(function (err) { console.error(err); });
    }
    if (s.reduced) { frame(s, performance.now()); return; }

    var stage = s.root.querySelector('.tk-stage');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        g.visible = entries[0].isIntersecting;
        if (g.visible && g.intro === 0) { g.intro = performance.now(); }
        if (g.visible) { start(s); }
      }, { rootMargin: '100px 0px' });
      io.observe(stage);
      s.offs.push(function () { io.disconnect(); });
    } else { g.visible = true; g.intro = performance.now(); start(s); }
    listen(s, window, 'pointermove', function (e) {
      var r = host.getBoundingClientRect();
      g.ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      g.ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      g.ptr.active = e.clientY >= r.top && e.clientY <= r.bottom;
    }, { passive: true });
    listen(s, document.documentElement, 'pointerleave', function () { g.ptr.active = false; });
    listen(s, stage, 'click', function (e) {
      if (e.target.closest('a, button, .tk-panel, .tk-step, .tk-h2')) { return; }
      if (g.k.tray < 0.7) { return; }
      var r = host.getBoundingClientRect();
      g.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      g.ray.setFromCamera(g.ndc, g.camera);
      var hits = g.ray.intersectObject(g.tiles, false);
      if (hits.length && hits[0].instanceId !== undefined && s.pick) { s.pick(hits[0].instanceId, true); }
    });
    listen(s, document, 'visibilitychange', function () { if (document.hidden) { stop(s); } else { start(s); } });
  }

  function start(s) {
    var g = s.g;
    if (!g || g.running || s.reduced || document.hidden || !g.visible) { return; }
    g.running = true;
    g.now = performance.now();
    g.slow = 0;
    var loop = function (t) {
      if (!g.running) { return; }
      if (!g.visible || document.hidden) { g.running = false; return; }
      var gap = t - g.now;
      frame(s, t);
      adapt(s, g, gap, performance.now() - t);
      g.raf = requestAnimationFrame(loop);
    };
    g.raf = requestAnimationFrame(loop);
  }
  function adapt(s, g, gap, cost) {
    if (gap > 70 || cost > 40) { g.slow++; } else if (g.slow > 0) { g.slow--; }
    if (g.slow < 12 || g.quality >= 3) { return; }
    g.slow = 0;
    g.quality = (g.quality || 0) + 1;
    var base = Math.min(window.devicePixelRatio || 1, g.lite ? 1.25 : 1.75);
    var steps = [1, 0.8, 0.6, 0.45];
    g.renderer.setPixelRatio(base * steps[g.quality]);
    g.renderer.setSize(g.w, g.h, false);
    g.renderer.render(g.scene, g.camera);
  }

  function stop(s) {
    if (!s.g) { return; }
    s.g.running = false;
    cancelAnimationFrame(s.g.raf);
  }

  function readTargets(s, g, dt) {
    var k = g.k;
    if (s.reduced) { k.spill = 0; k.tray = 1; k.orbit = 0.5; k.approach = 0; k.cast = 0.55; return; }
    var st = s.st || {};
    var damp = 1 - Math.exp(-dt * 5.5);
    k.spill += ((st.spill ? st.spill.progress : 0) - k.spill) * damp;
    k.tray += ((st.tray ? st.tray.progress : 0) - k.tray) * damp;
    k.orbit += ((st.orbit ? st.orbit.progress : 0) - k.orbit) * damp;
    k.approach += ((st.approach ? st.approach.progress : 0) - k.approach) * damp;
    k.cast += ((s.castST ? s.castST.progress : 0) - k.cast) * damp;
  }

  function placeCamera(s, g, time) {
    var t = g.t, k = g.k, cam = g.camera;
    var wide = g.aspect >= 1;
    var a = smooth(k.tray), b = smooth(k.approach);
    var tanH = Math.tan(THREE.MathUtils.degToRad(17.5));
    var fitTray = Math.max(19, 5.0 / (tanH * Math.min(g.aspect, 1.2)));
    var yaw = (k.orbit - 0.5) * 0.5;
    var spillY = 6.2 - k.spill * 1.2;
    t.pos.set(0, spillY + 0.6, wide ? 17 : 21);
    t.tgt.set(0, spillY, 0);
    var dy = 0.82 * fitTray, dz = 0.57 * fitTray;
    t.v1.set(Math.sin(yaw) * dz, dy, Math.cos(yaw) * dz);
    t.pos.lerp(t.v1, a);
    t.tgt.lerp(t.v2.set(0, 0, 0.3), a);
    var cd = wide ? 1.35 : 1.5;
    t.v1.set(2.5 - 2.6 * cd, 4.4 * cd, 2.5 + 6.4 * cd);
    t.pos.lerp(t.v1, b);
    t.tgt.lerp(t.v2.set(2.5, 1.3, 2.5), b);
    if (!s.reduced) {
      g.ptr.sx += (g.ptr.x - g.ptr.sx) * 0.06;
      g.ptr.sy += (g.ptr.y - g.ptr.sy) * 0.06;
      t.pos.x += g.ptr.sx * 0.7;
      t.pos.y += g.ptr.sy * 0.45;
    }
    cam.position.copy(t.pos);
    cam.lookAt(t.tgt);
    var shiftX = wide ? lerp(lerp(0, -0.24, a), 0.3, b) : 0;
    var shiftY = wide ? lerp(0, -0.1, b) : lerp(lerp(0, 0.2, a), 0.06, b);
    cam.setViewOffset(g.w, g.h, shiftX * g.w, shiftY * g.h, g.w, g.h);
    cam.updateProjectionMatrix();
  }

  function updatePieces(s, g, now, dt, time) {
    var t = g.t, k = g.k;
    var trayS = k.tray;
    var ptrOn = !s.reduced && g.ptr.active;
    if (ptrOn) {
      g.ndc.set(g.ptr.x, g.ptr.y);
      g.ray.setFromCamera(g.ndc, g.camera);
      ptrOn = !!g.ray.ray.intersectPlane(trayS > 0.5 ? g.planeY : g.planeZ, g.hit);
    }
    var introAge = g.intro > 0 ? (now - g.intro) / 1000 : 9;
    var R = trayS > 0.5 ? 1.3 : 2.4;
    for (var i = 0; i < g.pieces.length; i++) {
      var pc = g.pieces[i];
      var ft = s.reduced ? 1 : smooth((trayS - pc.delay) / 0.55);
      var x = lerp(pc.spill.x, pc.tray.x, smooth(ft));
      var z = lerp(pc.spill.z, pc.tray.z, smooth(ft));
      var y = lerp(pc.spill.y, pc.tray.y, ft * ft) + Math.sin(ft * Math.PI) * 1.4;
      var free = 1 - ft;
      y += Math.sin(time * 0.9 + pc.phase) * 0.18 * free;
      if (g.intro >= 0) { y += 11 * (1 - easeOut((introAge - pc.drop) / 1.3)) * free; }
      if (ptrOn) {
        t.v1.set(x + pc.o.x, y + pc.o.y, z + pc.o.z).sub(g.hit);
        if (trayS <= 0.5) { t.v1.z = 0; }
        var d = t.v1.length();
        if (d < R && d > 0.0001) {
          var push = (1 - d / R) * (trayS > 0.5 ? 14 : 30) * dt;
          t.v1.multiplyScalar(push / d);
          if (trayS > 0.5) { t.v1.y = Math.abs(t.v1.x) + Math.abs(t.v1.z); }
          pc.v.add(t.v1);
          pc.av.x += t.v1.y * 9; pc.av.y += t.v1.x * 9; pc.av.z -= t.v1.x * 7;
        }
      }
      pc.v.x += (-9 * pc.o.x - 3.0 * pc.v.x) * dt;
      pc.v.y += (-9 * pc.o.y - 3.0 * pc.v.y) * dt;
      pc.v.z += (-9 * pc.o.z - 3.0 * pc.v.z) * dt;
      pc.o.addScaledVector(pc.v, dt);
      pc.av.x += (-7 * pc.a.x - 2.4 * pc.av.x) * dt;
      pc.av.y += (-7 * pc.a.y - 2.4 * pc.av.y) * dt;
      pc.av.z += (-7 * pc.a.z - 2.4 * pc.av.z) * dt;
      pc.a.addScaledVector(pc.av, dt);
      if (ft > 0.98 && pc.o.y < 0) { pc.o.y = 0; pc.v.y = Math.abs(pc.v.y) * 0.3; }
      t.pos.set(x + pc.o.x, y + pc.o.y, z + pc.o.z);
      t.q.setFromAxisAngle(pc.axis, (time * pc.spin + pc.phase) * free * (s.reduced ? 0 : 1));
      t.q.premultiply(pc.qs);
      t.q.slerp(pc.qt, ft);
      t.q2.setFromEuler(t.e.set(pc.a.x * 0.35, pc.a.y * 0.35, pc.a.z * 0.35));
      t.q.premultiply(t.q2);
      t.sc.setScalar(pc.scale);
      t.m.compose(t.pos, t.q, t.sc);
      g.meshes[pc.kind].setMatrixAt(pc.idx, t.m);
    }
    for (var kk = 0; kk < KINDS.length; kk++) { g.meshes[KINDS[kk]].instanceMatrix.needsUpdate = true; }
  }

  function updateTray(s, g, now, time) {
    var t = g.t, k = g.k;
    g.lid.rotation.x = -1.95 * easeOut(k.tray / 0.4);
    var tapAge = g.tapCell >= 0 ? (now - g.tapAt) / 1000 : 99;
    for (var i = 0; i < 64; i++) {
      var lift = 0;
      if (i === g.tapCell && tapAge < 1.6) { lift = Math.sin(tapAge * 16) * Math.exp(-tapAge * 4) * 0.1; }
      t.pos.set((i % 8) - 3.5, 0.235 + Math.abs(lift), Math.floor(i / 8) - 3.5);
      t.sc.set(0.93, 0.03, 0.93);
      t.q.identity();
      t.m.compose(t.pos, t.q, t.sc);
      g.tiles.setMatrixAt(i, t.m);
      t.c.set(((i % 8) + Math.floor(i / 8)) % 2 ? HEX.floorA : HEX.floorB);
      if (i === g.tapCell) { t.c.lerp(g.tileHot, clamp(1.4 - tapAge, 0, 1)); }
      g.tiles.setColorAt(i, t.c);
    }
    g.tiles.instanceMatrix.needsUpdate = true;
    g.tiles.instanceColor.needsUpdate = true;

    var b = s.reduced ? 1 : smooth(k.approach);
    var level = 0.25 + 0.36 * b;
    g.water.scale.y = Math.max(0.01, level - 0.22);
    g.water.position.y = 0.22 + g.water.scale.y / 2;
    var f = k.cast;
    var fl = g.float;
    fl.visible = b > 0.02;
    var wl = level + 0.06;
    var fy, tilt = 0;
    if (f < 0.25) { fy = 4.6 + Math.sin(time * 1.6) * 0.08; tilt = Math.sin(time * 1.3) * 0.12; }
    else if (f < 0.45) { fy = lerp(4.6, wl, easeIn((f - 0.25) / 0.2)); }
    else if (f < 0.75) {
      fy = wl + Math.sin(time * 2.6) * 0.035;
      var tw = (f - 0.6) / 0.06;
      if (tw > 0 && tw < 1) { fy -= Math.sin(tw * Math.PI) * 0.12; }
    } else if (f < 0.88) { fy = wl - 0.32 * easeOut((f - 0.75) / 0.13); tilt = 0.4 * easeOut((f - 0.75) / 0.13); }
    else { fy = lerp(wl - 0.32, wl + 1.5, easeOut((f - 0.88) / 0.12)); tilt = 0.4; }
    if (s.reduced) { fy = wl; tilt = 0.08; }
    fl.position.set(2.5 + (f < 0.25 ? Math.sin(time * 1.2) * 0.12 : 0), fy + 0.25 * (1 - b) * 8, 2.5);
    fl.rotation.set(0, 0, tilt);
    fl.scale.setScalar(Math.max(0.001, easeOut(b * 1.6)));
    for (var r = 0; r < g.rings.length; r++) {
      var rp = s.reduced ? 0.35 + r * 0.3 : (f - 0.45 - r * 0.07) / 0.28;
      var ring = g.rings[r];
      var on = rp > 0 && rp < 1 && b > 0.5;
      ring.visible = on;
      if (on) {
        ring.position.y = level + 0.02;
        ring.scale.setScalar(0.4 + rp * 0.95);
        ring.material.opacity = (1 - rp) * 0.9;
      }
    }
  }

  function frame(s, now) {
    var g = s.g;
    var dt = clamp((now - g.now) / 1000, 0, 1 / 20);
    if (s.reduced) { dt = 0; }
    g.now = now;
    var time = s.reduced ? 2.2 : now / 1000;
    if (g.tapCell === undefined) { g.tapCell = -1; }
    readTargets(s, g, dt);
    placeCamera(s, g, time);
    updatePieces(s, g, now, dt, time);
    updateTray(s, g, now, time);
    g.renderer.render(g.scene, g.camera);
    g.dirty = false;
  }

  function disposeGL(s) {
    var g = s.g;
    if (!g) { return; }
    stop(s);
    var seen = [];
    g.scene.traverse(function (o) {
      if (o.geometry && seen.indexOf(o.geometry) === -1) { seen.push(o.geometry); o.geometry.dispose(); }
      if (o.material) {
        if (o.material.map) { o.material.map.dispose(); }
        if (seen.indexOf(o.material) === -1) { seen.push(o.material); o.material.dispose(); }
      }
      if (o.isInstancedMesh && o.dispose) { o.dispose(); }
    });
    if (g.envRT) { g.envRT.dispose(); }
    g.renderer.dispose();
    g.renderer.forceContextLoss();
    if (g.renderer.domElement.parentNode) { g.renderer.domElement.parentNode.removeChild(g.renderer.domElement); }
    if (THREE.ColorManagement && g.prevLegacy !== undefined) { THREE.ColorManagement.legacyMode = g.prevLegacy; }
    s.g = null;
  }

  function mount(root, ctx) {
    if (state) { unmount(); }
    var s = { root: root, reduced: !!(ctx && ctx.reducedMotion), offs: [], g: null, st: null, castST: null };
    state = s;
    setupNav(s);
    setupHero(s);
    setupChart(s);
    try {
      if (!window.THREE) { throw new Error('three.js is not available'); }
      initGL(s);
    } catch (err) {
      console.error(err);
      root.classList.add('tk-nogl');
      if (s.g) { try { disposeGL(s); } catch (e2) { console.error(e2); } }
      s.g = null;
    }
    setupMotion(s);
    if (s.g && !s.reduced) { start(s); }
  }

  function unmount() {
    var s = state;
    if (!s) { return; }
    state = null;
    s.offs.forEach(function (off) { try { off(); } catch (err) { console.error(err); } });
    s.offs = [];
    if (s.seen) { s.seen.disconnect(); }
    disposeGL(s);
  }

  window.UNLab.register('tackle', { mount: mount, unmount: unmount });
})();
