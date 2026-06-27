/* ============================================================
   E³ HQ — ENGINE v2
   Tunnel corridor · Door transitions · Textured image panels
   ============================================================ */

(function () {
  'use strict';

  /* ── ROOM REGISTRY ── */
  const ROOMS = [
    { id: 'index',        icon: '🏛️', label: 'Entrance',      file: 'index.html',        accentHex: '#c9a84c', accentInt: 0xc9a84c, wallHex: 0x0c0d0a, floorHex: 0x080906 },
    { id: 'about',        icon: '◆',  label: 'About E³',      file: 'about.html',        accentHex: '#c9a84c', accentInt: 0xc9a84c, wallHex: 0x0a0b10, floorHex: 0x07080c },
    { id: 'solutions',    icon: '⚙️', label: 'Solutions',     file: 'solutions.html',    accentHex: '#00c2ff', accentInt: 0x00c2ff, wallHex: 0x060c14, floorHex: 0x04080f },
    { id: 'industries',   icon: '🌍', label: 'Industries',    file: 'industries.html',   accentHex: '#64c864', accentInt: 0x64c864, wallHex: 0x060e08, floorHex: 0x040a06 },
    { id: 'case-studies', icon: '📁', label: 'Case Studies',  file: 'case-studies.html', accentHex: '#ff9f43', accentInt: 0xff9f43, wallHex: 0x130c06, floorHex: 0x0e0804 },
    { id: 'insights',     icon: '📖', label: 'Insights',      file: 'insights.html',     accentHex: '#a78bfa', accentInt: 0xa78bfa, wallHex: 0x0d0814, floorHex: 0x09050f },
    { id: 'contact',      icon: '✉️', label: 'Contact',       file: 'contact.html',      accentHex: '#c9a84c', accentInt: 0xc9a84c, wallHex: 0x0e0a08, floorHex: 0x080604 },
  ];

  const CFG = window.ROOM_CONFIG || {};
  const currentRoom = ROOMS.find(r => r.id === (CFG.id || 'index')) || ROOMS[0];

  /* ── ACCENT CSS ── */
  function setAccent(hexStr) {
    const r = document.documentElement;
    r.style.setProperty('--accent', hexStr);
    const rgb = parseInt(hexStr.replace('#',''), 16);
    const rv = (rgb >> 16) & 255, gv = (rgb >> 8) & 255, bv = rgb & 255;
    r.style.setProperty('--accent-dim',    `rgba(${rv},${gv},${bv},0.12)`);
    r.style.setProperty('--accent-border', `rgba(${rv},${gv},${bv},0.28)`);
  }
  setAccent(currentRoom.accentHex);

  /* ── THREE GLOBALS ── */
  let scene, camera, renderer, clock;
  let roomGroup = null;
  let hallMeshes = [];
  let dustMesh = null;
  let targetCamX = 0;
  let camLookX = 0;
  let currentState = 'loading';
  let isTransitioning = false;
  const mouse = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let lastClickTime = 0;
  let touchNav = null;

  /* ── RENDERER ── */
  function initRenderer() {
    const wrap = document.getElementById('canvas-wrap');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputEncoding = THREE.sRGBEncoding;
    wrap.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    // Thick fog so the tunnel feels long and deep
    scene.fog = new THREE.FogExp2(0x04050a, 0.055);
    scene.background = new THREE.Color(0x04050a);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 80);
    camera.position.set(0, 1.72, 7);

    clock = new THREE.Clock();
    window.addEventListener('resize', onResize);
  }

  /* ── HELPERS ── */
  function box(w, h, d, col, rough = 0.94, metal = 0.0) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: metal })
    );
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /* ── TUNNEL CORRIDOR ── */
  // Much narrower & taller than before — feels like walking down a hallway
  // Panels are ON the side walls, staggered so you walk past them
  function buildTunnel() {
    const g = new THREE.Group();
    const W = 5.2;   // narrow
    const H = 4.0;
    const D = 60;    // very deep tunnel

    // Floor with subtle tile lines via vertex groups
    const floorMat = new THREE.MeshStandardMaterial({
      color: currentRoom.floorHex,
      roughness: 0.98,
      metalness: 0.0
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 1, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -D / 2 + 7);
    floor.receiveShadow = true;
    g.add(floor);

    // Ceiling
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 1 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, H, -D / 2 + 7);
    g.add(ceil);

    // Left wall
    const leftMat = new THREE.MeshStandardMaterial({ color: currentRoom.wallHex, roughness: 0.96 });
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), leftMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-W / 2, H / 2, -D / 2 + 7);
    leftWall.receiveShadow = true;
    g.add(leftWall);

    // Right wall
    const rightMat = new THREE.MeshStandardMaterial({ color: currentRoom.wallHex, roughness: 0.96 });
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), rightMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(W / 2, H / 2, -D / 2 + 7);
    rightWall.receiveShadow = true;
    g.add(rightWall);

    // Back wall (end of tunnel)
    const backMat = new THREE.MeshStandardMaterial({ color: currentRoom.wallHex, roughness: 0.98 });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), backMat);
    backWall.position.set(0, H / 2, -D + 7);
    backWall.receiveShadow = true;
    g.add(backWall);

    // Skirting (floor trim)
    [-W/2 + 0.05, W/2 - 0.05].forEach(x => {
      const sk = box(0.06, 0.12, D, 0x1a1610, 0.9, 0.05);
      sk.position.set(x, 0.06, -D/2 + 7);
      g.add(sk);
    });

    // Ceiling trim strip (central light channel)
    const lightChannel = box(0.28, 0.06, D, 0x1a1a20, 0.8, 0.12);
    lightChannel.position.set(0, H - 0.03, -D/2 + 7);
    g.add(lightChannel);

    // Floor runner strip
    const runner = box(0.55, 0.01, D, 0x181510, 0.99, 0);
    runner.position.set(0, 0.005, -D/2 + 7);
    g.add(runner);

    return g;
  }

  /* ── TUNNEL LIGHTING ── */
  function buildTunnelLighting(parent) {
    parent.add(new THREE.AmbientLight(0x12100e, 0.25));

    // Recessed ceiling lights down the tunnel
    const LIGHT_COUNT = 10;
    const LIGHT_SPACING = 5.5;
    for (let i = 0; i < LIGHT_COUNT; i++) {
      const z = 4 - i * LIGHT_SPACING;
      const spot = new THREE.SpotLight(0xfff6e0, 1.4, 12, Math.PI / 7, 0.38, 2.0);
      spot.position.set(0, 3.8, z);
      spot.target.position.set(0, 0, z - 1);
      spot.castShadow = (i < 4);
      if (i < 4) spot.shadow.mapSize.set(256, 256);
      parent.add(spot);
      parent.add(spot.target);
    }

    // Warm fill from behind camera
    const fill = new THREE.DirectionalLight(0x3a2e1a, 0.18);
    fill.position.set(0, 3, 10);
    parent.add(fill);
  }

  /* ── DUST ── */
  function buildDust(parent) {
    const COUNT = 900;
    const pos = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i*3]   = (Math.random()-0.5) * 4.8;
      pos[i*3+1] = Math.random() * 3.8 + 0.2;
      pos[i*3+2] = (Math.random()-0.5) * 52 - 18;
      vel[i*3]   = (Math.random()-0.5) * 0.0004;
      vel[i*3+1] = (Math.random()-0.5) * 0.0002;
      vel[i*3+2] = (Math.random()-0.5) * 0.0003;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('velocity', new THREE.BufferAttribute(vel, 3));
    dustMesh = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffe8cc, size: 0.018, transparent: true, opacity: 0.09,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    dustMesh.renderOrder = 999;
    parent.add(dustMesh);
  }

  function updateDust(t) {
    if (!dustMesh) return;
    const p = dustMesh.geometry.attributes.position.array;
    const v = dustMesh.geometry.attributes.velocity.array;
    for (let i = 0; i < p.length/3; i++) {
      p[i*3]   += v[i*3]   + Math.sin(t*0.3 + i*0.4) * 0.00006;
      p[i*3+1] += v[i*3+1] + Math.sin(t*0.2 + i*0.6) * 0.00003;
      p[i*3+2] += v[i*3+2];
      if (p[i*3] >  2.4) p[i*3] = -2.4;
      if (p[i*3] < -2.4) p[i*3] =  2.4;
      if (p[i*3+1] > 4.0) p[i*3+1] = 0.2;
      if (p[i*3+1] < 0.2) p[i*3+1] = 4.0;
      if (p[i*3+2] > 7)   p[i*3+2] = -48;
      if (p[i*3+2] < -48) p[i*3+2] = 7;
    }
    dustMesh.geometry.attributes.position.needsUpdate = true;
  }

  /* ── TEXTURE LOADER ── */
  const txLoader = new THREE.TextureLoader();
  txLoader.crossOrigin = 'anonymous';

  function loadTex(url) {
    return new Promise(resolve => {
      txLoader.load(url,
        t => { t.encoding = THREE.sRGBEncoding; resolve(t); },
        undefined,
        () => resolve(null)
      );
    });
  }

  /* ── IMAGE PANEL ON WALL ── */
  // Panels mounted ON the side walls, alternating left/right
  // Each panel is a framed picture with accent glow trim
  async function makePanelOnWall(item, index, totalItems) {
    const g = new THREE.Group();
    const side   = index % 2 === 0 ? 'left' : 'right';
    const W_room = 5.2;
    const PANEL_W = 2.2;
    const PANEL_H = 1.55;
    const WALL_X  = side === 'left' ? -(W_room/2) + 0.04 : (W_room/2) - 0.04;
    const Z_START = 1.5;
    const Z_STEP  = 6.0;
    const panelZ  = Z_START - index * Z_STEP;
    const panelY  = 1.8;

    // Load image
    let tex = null;
    if (item.img) tex = await loadTex(item.img);

    // Image plane
    const imgMat = tex
      ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 })
      : new THREE.MeshStandardMaterial({ color: 0x12100e, roughness: 0.9 });
    const imgPlane = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), imgMat);

    // Frame border
    const BORDER = 0.06;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1810, roughness: 0.5, metalness: 0.5 });
    // top/bottom bars
    [[PANEL_W + BORDER*2, BORDER, 0,  PANEL_H/2 + BORDER/2],
     [PANEL_W + BORDER*2, BORDER, 0, -PANEL_H/2 - BORDER/2],
     [BORDER, PANEL_H, -PANEL_W/2 - BORDER/2, 0],
     [BORDER, PANEL_H,  PANEL_W/2 + BORDER/2, 0]
    ].forEach(([fw, fh, fx, fy]) => {
      const fb = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.025), frameMat);
      fb.position.set(fx, fy, -0.014);
      g.add(fb);
    });

    // Accent glow edge (thin strip matching room accent color)
    const glowMat = new THREE.MeshStandardMaterial({
      color: currentRoom.accentInt,
      emissive: currentRoom.accentInt,
      emissiveIntensity: 0.4,
      roughness: 0.3, metalness: 0.7
    });
    const glowEdge = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W + BORDER*2 + 0.02, PANEL_H + BORDER*2 + 0.02, 0.008), glowMat);
    glowEdge.position.z = -0.02;
    g.add(glowEdge);

    g.add(imgPlane);
    imgPlane.userData = { item, index };

    // Small label plate below frame
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x18150a, roughness: 0.6, metalness: 0.4 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.022), plateMat);
    plate.position.set(0, -PANEL_H/2 - BORDER - 0.13, 0);
    g.add(plate);

    // Position the group on the wall
    if (side === 'left') {
      g.rotation.y = Math.PI / 2;
      g.position.set(WALL_X + 0.02, panelY, panelZ);
    } else {
      g.rotation.y = -Math.PI / 2;
      g.position.set(WALL_X - 0.02, panelY, panelZ);
    }

    // Accent spotlight on this panel
    const spotCol = currentRoom.accentInt;
    const sp = new THREE.SpotLight(spotCol, 0.7, 8, Math.PI/8, 0.4, 2.2);
    sp.position.set(side === 'left' ? -1.2 : 1.2, 3.6, panelZ + 0.4);
    sp.target.position.set(WALL_X, panelY, panelZ);

    return { group: g, imgPlane, spotLight: sp, spotTarget: sp.target, item, index };
  }

  /* ── BUILD ROOM ── */
  async function buildCurrentRoom() {
    roomGroup = new THREE.Group();
    scene.add(roomGroup);

    const tunnel = buildTunnel();
    roomGroup.add(tunnel);
    buildTunnelLighting(roomGroup);
    buildDust(roomGroup);

    hallMeshes = [];
    const items = CFG.items || [];

    for (let i = 0; i < items.length; i++) {
      setLoadProgress(0.2 + (i / items.length) * 0.65);
      const result = await makePanelOnWall(items[i], i, items.length);
      roomGroup.add(result.group);
      roomGroup.add(result.spotLight);
      roomGroup.add(result.spotTarget);
      hallMeshes.push({ mesh: result.imgPlane, item: result.item, index: result.index });
    }
  }

  /* ── DOOR TRANSITION ── */
  // Two door panels that swing outward on hinge (pivot at outer edge)
  let doorGroup = null;
  let leftDoor = null;
  let rightDoor = null;

  function buildDoor() {
    doorGroup = new THREE.Group();
    const DW = 1.3, DH = 3.2, DD = 0.06;
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1510,
      roughness: 0.5, metalness: 0.3
    });

    // Left panel — hinge on its left edge (pivot left)
    const leftGeom = new THREE.BoxGeometry(DW, DH, DD);
    leftDoor = new THREE.Group();
    const leftMesh = new THREE.Mesh(leftGeom, doorMat);
    leftMesh.position.x = DW / 2; // offset so rotation pivots from left edge
    leftDoor.add(leftMesh);

    // Right panel — hinge on its right edge
    const rightMesh = new THREE.Mesh(leftGeom, doorMat);
    rightDoor = new THREE.Group();
    rightMesh.position.x = -DW / 2;
    rightDoor.add(rightMesh);

    // Hinges (decorative)
    [0.7, -0.7].forEach(hy => {
      const hm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8),
        new THREE.MeshStandardMaterial({ color: currentRoom.accentInt, roughness: 0.3, metalness: 0.8 })
      );
      hm.rotation.z = Math.PI / 2;
      hm.position.set(0, hy, 0);
      leftDoor.add(hm.clone());
      rightDoor.add(hm.clone());
    });

    // Gold accent strip on door face
    const stripMat = new THREE.MeshStandardMaterial({
      color: currentRoom.accentInt,
      emissive: currentRoom.accentInt, emissiveIntensity: 0.25,
      roughness: 0.3, metalness: 0.8
    });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, DH * 0.7, DD + 0.01), stripMat);
    strip.position.set(DW * 0.3, 0, 0);
    leftMesh.add(strip.clone());
    strip.position.x = -DW * 0.3;
    rightMesh.add(strip.clone());

    leftDoor.position.set(-DW, DH / 2, 8.2);
    rightDoor.position.set(DW, DH / 2, 8.2);

    doorGroup.add(leftDoor);
    doorGroup.add(rightDoor);
    scene.add(doorGroup);
  }

  function openDoor(onComplete) {
    if (!leftDoor || !rightDoor) { if (onComplete) onComplete(); return; }
    // Left door swings left (negative Y rotation)
    // Right door swings right (positive Y rotation)
    gsap.to(leftDoor.rotation,  { y: -Math.PI * 0.62, duration: 1.4, ease: 'power2.inOut' });
    gsap.to(rightDoor.rotation, { y:  Math.PI * 0.62, duration: 1.4, ease: 'power2.inOut',
      onComplete: () => { if (onComplete) onComplete(); }
    });
  }

  function closeDoor(onComplete) {
    if (!leftDoor || !rightDoor) { if (onComplete) onComplete(); return; }
    gsap.to(leftDoor.rotation,  { y: 0, duration: 0.9, ease: 'power2.inOut' });
    gsap.to(rightDoor.rotation, { y: 0, duration: 0.9, ease: 'power2.inOut',
      onComplete: () => { if (onComplete) onComplete(); }
    });
  }

  /* ── NAVIGATION ── */
  function navigateTo(file) {
    if (isTransitioning) return;
    if (!file) return;
    isTransitioning = true;

    closeInfoPanel();
    closeNavDrawer();
    currentState = 'transitioning';

    // Camera walks toward door
    gsap.to(camera.position, { z: 8.8, y: 1.72, duration: 1.0, ease: 'power2.in',
      onComplete: () => {
        // Door closes in front of camera
        buildDoor();
        closeDoor(() => {
          // Then fade to black and navigate
          const ov = document.getElementById('room-transition');
          if (ov) {
            ov.style.transition = 'opacity 0.4s ease';
            ov.style.opacity = '1';
            ov.style.pointerEvents = 'all';
          }
          setTimeout(() => { window.location.href = file; }, 350);
        });
      }
    });
  }

  /* ── LOAD PROGRESS ── */
  function setLoadProgress(pct) {
    const bar = document.getElementById('load-bar');
    const el  = document.getElementById('load-pct');
    if (bar) bar.style.width = (pct * 100).toFixed(0) + '%';
    if (el)  el.textContent  = Math.floor(pct * 100) + '%';
  }

  function hideLoader() {
    const el = document.getElementById('loader');
    if (!el) return;
    el.style.transition = 'opacity 0.8s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 850);
  }

  /* ── DRAWER ── */
  function buildNavDrawer() {
    const list = document.getElementById('nav-room-list');
    if (!list) return;
    list.innerHTML = '';
    ROOMS.forEach(r => {
      const a = document.createElement('a');
      a.className = 'nav-room-link' + (r.id === currentRoom.id ? ' active' : '');
      a.innerHTML = `<span class="nav-room-icon">${r.icon}</span><span class="nav-room-title">${r.label}</span>`;
      a.addEventListener('click', e => { e.preventDefault(); navigateTo(r.file); });
      list.appendChild(a);
    });
  }

  function buildMiniNav() {
    const inner = document.getElementById('mini-nav-inner');
    if (!inner) return;
    inner.innerHTML = '';
    ROOMS.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'mini-nav-item' + (r.id === currentRoom.id ? ' active' : '');
      btn.innerHTML = `<span class="mini-nav-icon">${r.icon}</span><span class="mini-nav-label">${r.label}</span>`;
      btn.addEventListener('click', () => navigateTo(r.file));
      inner.appendChild(btn);
    });
  }

  function openNavDrawer()  { document.getElementById('nav-drawer')?.classList.add('open'); document.querySelector('.hq-hamburger')?.classList.add('open'); }
  function closeNavDrawer() { document.getElementById('nav-drawer')?.classList.remove('open'); document.querySelector('.hq-hamburger')?.classList.remove('open'); }
  function toggleNavDrawer() { document.getElementById('nav-drawer')?.classList.contains('open') ? closeNavDrawer() : openNavDrawer(); }

  /* ── INFO PANEL ── */
  function openInfoPanel(item) {
    const panel = document.getElementById('info-panel');
    if (!panel) return;

    document.getElementById('panel-tag').textContent      = item.tag || currentRoom.label;
    document.getElementById('panel-title').textContent    = item.title || '';
    document.getElementById('panel-subtitle').textContent = item.subtitle || '';
    document.getElementById('panel-body').innerHTML       = item.body || '';

    const tagsEl = document.getElementById('panel-tags');
    if (tagsEl) {
      tagsEl.innerHTML = '';
      (item.tags || []).forEach(t => {
        const pill = document.createElement('span');
        pill.className = 'panel-tag-pill';
        pill.textContent = t;
        tagsEl.appendChild(pill);
      });
    }

    const itemsEl = document.getElementById('panel-items');
    if (itemsEl) {
      itemsEl.innerHTML = '';
      (item.listItems || []).forEach(li => {
        const row = document.createElement('div');
        row.className = 'panel-item';
        row.innerHTML = `<span class="panel-item-icon">◆</span><span class="panel-item-label">${li.label}</span><span class="panel-item-arrow">→</span>`;
        if (li.href) row.addEventListener('click', () => navigateTo(li.href));
        itemsEl.appendChild(row);
      });
    }

    const ctaEl = document.getElementById('panel-cta');
    if (ctaEl) {
      if (item.cta) {
        ctaEl.textContent = item.cta.label;
        ctaEl.style.display = 'block';
        const href = item.cta.href || 'contact.html';
        ctaEl.onclick = () => {
          if (href.startsWith('http')) { window.open(href, '_blank'); }
          else { navigateTo(href); }
        };
      } else { ctaEl.style.display = 'none'; }
    }

    panel.classList.add('open');
    currentState = 'panel';
  }

  function closeInfoPanel() {
    document.getElementById('info-panel')?.classList.remove('open');
    if (currentState === 'panel') currentState = 'exploring';
  }

  /* ── TOUCH ── */
  class TouchNav {
    constructor() {
      this.startX = 0; this.lastX = 0; this.vel = 0;
      this.dragging = false; this.momentum = false;
      this.startTime = 0; this.moved = false;
      const el = document.getElementById('canvas-wrap');
      el.addEventListener('touchstart', e => this._start(e), { passive: true });
      el.addEventListener('touchmove',  e => this._move(e),  { passive: true });
      el.addEventListener('touchend',   e => this._end(e),   { passive: true });
    }
    _start(e) {
      const t = e.touches[0]; if (!t) return;
      this.startX = t.clientX; this.lastX = t.clientX;
      this.vel = 0; this.dragging = true; this.momentum = false;
      this.startTime = Date.now(); this.moved = false;
    }
    _move(e) {
      if (!this.dragging) return;
      const t = e.touches[0]; if (!t) return;
      const dx = t.clientX - this.lastX;
      if (Math.abs(t.clientX - this.startX) > 8) this.moved = true;
      this.vel = dx * 0.007;
      if (currentState === 'exploring') {
        targetCamX -= dx * 0.016;
        targetCamX = Math.max(-1.8, Math.min(1.8, targetCamX));
      }
      this.lastX = t.clientX;
    }
    _end(e) {
      this.dragging = false; this.momentum = true;
      // Tap (no drag) → treat as click for raycasting
      if (!this.moved && Date.now() - this.startTime < 300) {
        const t = e.changedTouches[0]; if (!t) return;
        mouse.x = (t.clientX / window.innerWidth)  * 2 - 1;
        mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
        handleTap();
      }
    }
    update() {
      if (this.momentum && !this.dragging) {
        if (Math.abs(this.vel) < 0.0001) { this.momentum = false; return; }
        if (currentState === 'exploring') {
          targetCamX -= this.vel * 8;
          targetCamX = Math.max(-1.8, Math.min(1.8, targetCamX));
        }
        this.vel *= 0.88;
      }
    }
  }

  function handleTap() {
    if (currentState !== 'exploring' && currentState !== 'panel') return;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(hallMeshes.map(h => h.mesh));
    if (hits.length) {
      const h = hallMeshes.find(h => h.mesh === hits[0].object);
      if (h) { openInfoPanel(h.item); return; }
    }
    if (currentState === 'panel') closeInfoPanel();
  }

  /* ── TOOLTIP ── */
  const tip = {
    el: null,
    show(txt, x, y) { if (!this.el) return; this.el.textContent = txt; this.el.style.left = (x+18)+'px'; this.el.style.top = (y-6)+'px'; this.el.style.opacity = '1'; },
    hide() { if (this.el) this.el.style.opacity = '0'; }
  };

  /* ── INPUT ── */
  function initInput() {
    tip.el = document.getElementById('tooltip');

    document.querySelector('.hq-hamburger')?.addEventListener('click', toggleNavDrawer);
    document.querySelector('.hq-logo')?.addEventListener('click', () => navigateTo('index.html'));
    document.getElementById('back-btn')?.addEventListener('click', closeInfoPanel);

    // Close drawer on canvas click
    document.getElementById('canvas-wrap')?.addEventListener('click', () => {
      if (document.getElementById('nav-drawer')?.classList.contains('open')) closeNavDrawer();
    });

    // Mouse move → hover raycasting
    let throttle = 0;
    window.addEventListener('mousemove', e => {
      const now = Date.now();
      if (now - throttle < 45) return;
      throttle = now;
      mouse.x = (e.clientX / window.innerWidth)  * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      if (currentState !== 'exploring') return;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(hallMeshes.map(h => h.mesh));
      if (hits.length) {
        const h = hallMeshes.find(h => h.mesh === hits[0].object);
        if (h) { tip.show(h.item.title || '', e.clientX, e.clientY); renderer.domElement.style.cursor = 'pointer'; return; }
      }
      tip.hide(); renderer.domElement.style.cursor = 'default';
    });

    // Click
    window.addEventListener('click', e => {
      if (Date.now() - lastClickTime < 250) return;
      lastClickTime = Date.now();
      if (currentState !== 'exploring' && currentState !== 'panel') return;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(hallMeshes.map(h => h.mesh));
      if (hits.length) {
        const h = hallMeshes.find(h => h.mesh === hits[0].object);
        if (h) { openInfoPanel(h.item); return; }
      }
      if (currentState === 'panel') closeInfoPanel();
    });

    // Keyboard
    const keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup',   e => { keys[e.key] = false; });
    window._hqKeys = keys;
  }

  /* ── RESIZE ── */
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ── RENDER LOOP ── */
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t  = clock.getElapsedTime();

    updateDust(t);
    if (touchNav) touchNav.update();

    if (currentState === 'exploring') {
      const keys = window._hqKeys || {};
      // Forward/back in tunnel
      if (keys['ArrowUp']   || keys['w'] || keys['W']) camera.position.z -= dt * 3.8;
      if (keys['ArrowDown'] || keys['s'] || keys['S']) camera.position.z += dt * 3.8;
      camera.position.z = Math.max(-36, Math.min(7.5, camera.position.z));

      // Subtle side lean
      if (keys['ArrowLeft']  || keys['a'] || keys['A']) targetCamX -= dt * 0.9;
      if (keys['ArrowRight'] || keys['d'] || keys['D']) targetCamX += dt * 0.9;
      targetCamX = Math.max(-1.8, Math.min(1.8, targetCamX));

      camera.position.x += (targetCamX - camera.position.x) * 0.06;
      camLookX += (targetCamX - camLookX) * 0.05;

      // Mouse look
      const px = mouse.x * 0.18;
      const py = mouse.y * 0.06;
      camera.lookAt(camLookX + px, 1.72 + py, camera.position.z - 8);

      // Subtle breathe
      camera.position.y = 1.72 + Math.sin(t * 0.42) * 0.009;
    }

    renderer.render(scene, camera);
  }

  /* ── ROOM ENTER ANIMATIONS ── */
  function enterWorld() {
    // Title screen out
    const ts = document.getElementById('title-screen');
    if (ts) { ts.classList.add('out'); setTimeout(() => ts.style.display = 'none', 1500); }

    if (roomGroup) roomGroup.visible = true;

    // Start far back, door opens, camera walks in
    camera.position.set(0, 1.72, 14);
    buildDoor();

    // Open door first
    openDoor(() => {
      // Then walk through
      gsap.to(camera.position, {
        z: 5.5, duration: 2.8, ease: 'power3.out',
        onComplete: () => {
          // Remove door (we're inside now)
          if (doorGroup) { scene.remove(doorGroup); doorGroup = null; }
          currentState = 'exploring';
          document.getElementById('hud')?.classList.add('visible');
          document.getElementById('mini-nav')?.classList.add('visible');
        }
      });
    });

    document.getElementById('topbar')?.classList.add('visible');
    document.getElementById('back-btn')?.classList.add('visible');
  }

  function enterRoom() {
    if (roomGroup) roomGroup.visible = true;

    // Fade transition overlay out
    const ov = document.getElementById('room-transition');
    if (ov) {
      ov.style.opacity = '1';
      setTimeout(() => {
        ov.style.transition = 'opacity 0.6s ease';
        ov.style.opacity = '0';
        setTimeout(() => { ov.style.pointerEvents = 'none'; }, 650);
      }, 80);
    }

    // Start from outside (past door), build door, open it, walk in
    camera.position.set(0, 1.72, 14);
    buildDoor();

    openDoor(() => {
      gsap.to(camera.position, {
        z: 5.5, duration: 2.2, ease: 'power3.out',
        onComplete: () => {
          if (doorGroup) { scene.remove(doorGroup); doorGroup = null; }
          currentState = 'exploring';
          document.getElementById('hud')?.classList.add('visible');
          document.getElementById('mini-nav')?.classList.add('visible');
        }
      });
    });

    document.getElementById('topbar')?.classList.add('visible');
    document.getElementById('back-btn')?.classList.add('visible');
  }

  /* ── INIT ── */
  async function init() {
    initRenderer();
    setLoadProgress(0.08);

    await buildCurrentRoom();
    if (roomGroup) roomGroup.visible = false;
    setLoadProgress(0.95);

    touchNav = new TouchNav();
    initInput();
    buildNavDrawer();
    buildMiniNav();

    setLoadProgress(1.0);
    await new Promise(r => setTimeout(r, 400));
    hideLoader();
    animate();

    if (CFG.id === 'index') {
      const btn = document.getElementById('enter-btn');
      if (btn) btn.addEventListener('click', enterWorld);
    } else {
      setTimeout(enterRoom, 100);
    }
  }

  function waitAndInit() {
    if (typeof THREE !== 'undefined' && typeof gsap !== 'undefined') init();
    else setTimeout(waitAndInit, 60);
  }
  waitAndInit();

})();
