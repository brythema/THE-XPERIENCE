/* ============================================================
   E³ HQ — ENGINE v3
   Free-look + auto-face · Portrait card · Door handle ·
   Enhanced lighting · Stair transitions · Ambient sound ·
   Living details (flicker, clock, panel pulse)
   ============================================================ */
(function () {
  'use strict';

  /* ─────────────────────────────────────────
     ROOM REGISTRY
  ───────────────────────────────────────── */
  const ROOMS = [
    { id:'index',        icon:'🏛️', label:'Entrance',     file:'index.html',        accentHex:'#c9a84c', accentInt:0xc9a84c, wallHex:0x0c0d0a, floorHex:0x080906, transition:'walk',   fogDensity:0.052 },
    { id:'about',        icon:'◆',  label:'About E³',     file:'about.html',        accentHex:'#c9a84c', accentInt:0xc9a84c, wallHex:0x0a0b10, floorHex:0x07080c, transition:'walk',   fogDensity:0.050 },
    { id:'solutions',    icon:'⚙️', label:'Solutions',    file:'solutions.html',    accentHex:'#00c2ff', accentInt:0x00c2ff, wallHex:0x060c14, floorHex:0x04080f, transition:'walk',   fogDensity:0.048 },
    { id:'industries',   icon:'🌍', label:'Industries',   file:'industries.html',   accentHex:'#64c864', accentInt:0x64c864, wallHex:0x060e08, floorHex:0x040a06, transition:'walk',   fogDensity:0.050 },
    { id:'case-studies', icon:'📁', label:'Case Studies', file:'case-studies.html', accentHex:'#ff9f43', accentInt:0xff9f43, wallHex:0x130c06, floorHex:0x0e0804, transition:'walk',   fogDensity:0.052 },
    { id:'insights',     icon:'📖', label:'Insights',     file:'insights.html',     accentHex:'#a78bfa', accentInt:0xa78bfa, wallHex:0x0d0814, floorHex:0x09050f, transition:'stairs', fogDensity:0.045 },
    { id:'contact',      icon:'✉️', label:'Contact',      file:'contact.html',      accentHex:'#c9a84c', accentInt:0xc9a84c, wallHex:0x0e0a08, floorHex:0x080604, transition:'stairs', fogDensity:0.048 },
  ];

  const CFG = window.ROOM_CONFIG || {};
  const R   = ROOMS.find(r => r.id === (CFG.id || 'index')) || ROOMS[0];

  /* ─────────────────────────────────────────
     ACCENT CSS
  ───────────────────────────────────────── */
  function setAccent(h) {
    const d = document.documentElement;
    d.style.setProperty('--accent', h);
    const n = parseInt(h.replace('#',''), 16);
    const rv = (n>>16)&255, gv = (n>>8)&255, bv = n&255;
    d.style.setProperty('--accent-dim',    `rgba(${rv},${gv},${bv},0.12)`);
    d.style.setProperty('--accent-border', `rgba(${rv},${gv},${bv},0.28)`);
  }
  setAccent(R.accentHex);

  /* ─────────────────────────────────────────
     THREE GLOBALS
  ───────────────────────────────────────── */
  let scene, camera, renderer, clock;
  let roomGroup = null;
  let hallMeshes = [];
  let dustMesh   = null;
  let flickerLights = [];
  let panelMeshData = [];  // { mesh, item, worldPos, normalDir }

  /* Camera state */
  let camYaw   = 0;   // horizontal look (radians)
  let camPitch = 0;   // vertical look
  let camTargetYaw   = 0;
  let camTargetPitch = 0;
  let camZ   = 6.5;
  let camTargetZ = 6.5;
  let camY   = 1.72;
  let camTargetY = 1.72;
  let walkBob = 0;
  let walkBobSpeed = 0;

  /* Auto-face */
  let autoFaceActive   = false;
  let autoFacePanel    = null;
  let autoFaceYaw      = 0;
  let autoFaceStrength = 0;

  /* State machine */
  let state = 'loading'; // loading | entering | exploring | card | transitioning
  let isTransitioning = false;

  /* Input */
  const keys = {};
  let isDragging = false;
  let dragLastX = 0, dragLastY = 0;
  let touchNav = null;

  /* Door */
  let doorGroup = null, leftDoor = null, rightDoor = null, handleL = null, handleR = null;

  /* Sound */
  let audioCtx = null, masterGain = null, ambientOsc = null, ambientGain = null;
  let soundEnabled = false, soundInitialized = false;
  const ROOM_FREQ = { index:55, about:61.7, solutions:73.4, industries:65.4, 'case-studies':82.4, insights:98, contact:110 };

  const txLoader = new THREE.TextureLoader();
  txLoader.crossOrigin = 'anonymous';

  /* ─────────────────────────────────────────
     RENDERER
  ───────────────────────────────────────── */
  function initRenderer() {
    const wrap = document.getElementById('canvas-wrap');
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputEncoding = THREE.sRGBEncoding;
    wrap.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03040a, R.fogDensity);
    scene.background = new THREE.Color(0x03040a);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth/window.innerHeight, 0.05, 80);
    camera.position.set(0, camY, camZ);

    clock = new THREE.Clock();
    window.addEventListener('resize', onResize);
  }

  /* ─────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────── */
  function mkBox(w,h,d,col,rough=0.94,metal=0) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w,h,d),
      new THREE.MeshStandardMaterial({color:col,roughness:rough,metalness:metal})
    );
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function loadTex(url) {
    return new Promise(res => {
      txLoader.load(url, t => { t.encoding = THREE.sRGBEncoding; res(t); }, undefined, () => res(null));
    });
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ─────────────────────────────────────────
     TUNNEL
  ───────────────────────────────────────── */
  const TW = 5.0, TH = 4.2, TD = 65;

  function buildTunnel() {
    const g = new THREE.Group();

    // Floor
    const floorGeo = new THREE.PlaneGeometry(TW, TD, 1, 60);
    const floorMat = new THREE.MeshStandardMaterial({ color:R.floorHex, roughness:0.98, metalness:0 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.position.set(0, 0, -TD/2+8);
    floor.receiveShadow = true;
    g.add(floor);

    // Ceiling
    const ceilMat = new THREE.MeshStandardMaterial({ color:0x040508, roughness:1 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(TW, TD), ceilMat);
    ceil.rotation.x = Math.PI/2;
    ceil.position.set(0, TH, -TD/2+8);
    g.add(ceil);

    // Left wall
    const wMat = new THREE.MeshStandardMaterial({ color:R.wallHex, roughness:0.96 });
    const leftW = new THREE.Mesh(new THREE.PlaneGeometry(TD, TH), wMat.clone());
    leftW.rotation.y = Math.PI/2;
    leftW.position.set(-TW/2, TH/2, -TD/2+8);
    leftW.receiveShadow = true;
    g.add(leftW);

    // Right wall
    const rightW = new THREE.Mesh(new THREE.PlaneGeometry(TD, TH), wMat.clone());
    rightW.rotation.y = -Math.PI/2;
    rightW.position.set(TW/2, TH/2, -TD/2+8);
    rightW.receiveShadow = true;
    g.add(rightW);

    // Back wall
    const backW = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), wMat.clone());
    backW.position.set(0, TH/2, -TD+8);
    g.add(backW);

    // Skirting boards
    [-TW/2+0.04, TW/2-0.04].forEach(x => {
      const sk = mkBox(0.055, 0.11, TD, 0x1a1610, 0.9, 0.05);
      sk.position.set(x, 0.055, -TD/2+8);
      g.add(sk);
    });

    // Ceiling light channel (glows accent color)
    const chanMat = new THREE.MeshStandardMaterial({
      color: R.accentInt,
      emissive: R.accentInt,
      emissiveIntensity: 0.08,
      roughness: 0.4, metalness: 0.6
    });
    const chan = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, TD), chanMat);
    chan.position.set(0, TH-0.025, -TD/2+8);
    g.add(chan);

    // Floor runner
    const runner = mkBox(0.48, 0.008, TD, 0x161310, 0.99, 0);
    runner.position.set(0, 0.004, -TD/2+8);
    g.add(runner);

    // Accent bounce — colored plane on opposite wall (very subtle)
    const bounceL = new THREE.Mesh(new THREE.PlaneGeometry(TD*0.4, TH*0.5),
      new THREE.MeshStandardMaterial({ color:R.accentInt, transparent:true, opacity:0.018, side:THREE.FrontSide }));
    bounceL.rotation.y = -Math.PI/2;
    bounceL.position.set(TW/2-0.01, TH*0.4, -TD/4);
    g.add(bounceL);

    // Real wall clock on back wall
    buildClock(g, 0, TH*0.62, -TD+8.1);

    return g;
  }

  /* ─────────────────────────────────────────
     WALL CLOCK
  ───────────────────────────────────────── */
  function buildClock(parent, x, y, z) {
    const g = new THREE.Group();
    // Face
    const face = mkBox(0.7, 0.7, 0.04, 0x0e0c0a, 0.6, 0.2);
    g.add(face);
    // Ring
    const ringGeo = new THREE.TorusGeometry(0.36, 0.025, 8, 32);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({
      color: R.accentInt, emissive: R.accentInt, emissiveIntensity:0.3, roughness:0.3, metalness:0.8
    }));
    ring.position.z = 0.025;
    g.add(ring);
    // Hour hand
    const hourHand = mkBox(0.04, 0.2, 0.015, R.accentInt, 0.4, 0.6);
    hourHand.position.set(0, 0.06, 0.04);
    hourHand.name = 'hourHand';
    g.add(hourHand);
    // Minute hand
    const minHand = mkBox(0.025, 0.28, 0.015, 0xe8e0cc, 0.5, 0.3);
    minHand.position.set(0, 0.09, 0.05);
    minHand.name = 'minHand';
    g.add(minHand);
    // Centre pin
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.06,8),
      new THREE.MeshStandardMaterial({color:R.accentInt,metalness:0.9,roughness:0.2}));
    pin.rotation.x = Math.PI/2; pin.position.z = 0.06;
    g.add(pin);

    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  function updateClock() {
    if (!roomGroup) return;
    const now = new Date();
    const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
    const hourAngle = -(h/12 + m/720) * Math.PI*2;
    const minAngle  = -(m/60 + s/3600) * Math.PI*2;
    roomGroup.traverse(obj => {
      if (obj.name === 'hourHand') obj.rotation.z = hourAngle;
      if (obj.name === 'minHand')  obj.rotation.z = minAngle;
    });
  }

  /* ─────────────────────────────────────────
     LIGHTING
  ───────────────────────────────────────── */
  function buildLighting(parent) {
    flickerLights = [];
    parent.add(new THREE.AmbientLight(0x100e0c, 0.22));

    // Recessed ceiling spots — tighter, warmer, stronger
    const COUNT = 12, SPACING = 5.2;
    for (let i = 0; i < COUNT; i++) {
      const z = 5 - i * SPACING;
      const intensity = i < 3 ? 2.2 : (i < 7 ? 1.8 : 1.2);
      const spot = new THREE.SpotLight(0xfff3d8, intensity, 14, Math.PI/8, 0.28, 2.2);
      spot.position.set(0, TH-0.1, z);
      spot.target.position.set(0, 0, z-0.5);
      spot.castShadow = (i < 5);
      if (i < 5) spot.shadow.mapSize.set(512, 512);
      parent.add(spot); parent.add(spot.target);
      // 2 flicker lights deeper in the tunnel
      if (i === 7 || i === 9) flickerLights.push(spot);
    }

    // Accent color fill from ceiling channel
    const accentFill = new THREE.PointLight(R.accentInt, 0.35, 22);
    accentFill.position.set(0, TH-0.1, 0);
    parent.add(accentFill);

    // Warm fill from camera end
    const fill = new THREE.DirectionalLight(0x3a2e1a, 0.14);
    fill.position.set(0, 3, 12);
    parent.add(fill);
  }

  /* ─────────────────────────────────────────
     DUST
  ───────────────────────────────────────── */
  function buildDust(parent) {
    const N = 1100;
    const pos = new Float32Array(N*3);
    const vel = new Float32Array(N*3);
    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random()-0.5)*4.4;
      pos[i*3+1] = Math.random()*3.9 + 0.15;
      pos[i*3+2] = (Math.random()-0.5)*58 - 20;
      vel[i*3]   = (Math.random()-0.5)*0.00035;
      vel[i*3+1] = (Math.random()-0.5)*0.00015;
      vel[i*3+2] = (Math.random()-0.5)*0.00025;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('velocity', new THREE.BufferAttribute(vel, 3));
    dustMesh = new THREE.Points(geo, new THREE.PointsMaterial({
      color:0xffe8cc, size:0.016, transparent:true, opacity:0.11,
      blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true
    }));
    dustMesh.renderOrder = 999;
    parent.add(dustMesh);
  }

  function updateDust(t) {
    if (!dustMesh) return;
    const p = dustMesh.geometry.attributes.position.array;
    const v = dustMesh.geometry.attributes.velocity.array;
    for (let i = 0; i < p.length/3; i++) {
      p[i*3]   += v[i*3]   + Math.sin(t*0.28+i*0.4)*0.000055;
      p[i*3+1] += v[i*3+1] + Math.sin(t*0.19+i*0.6)*0.000028;
      p[i*3+2] += v[i*3+2];
      if (p[i*3]   >  2.2) p[i*3]   = -2.2;
      if (p[i*3]   < -2.2) p[i*3]   =  2.2;
      if (p[i*3+1] > 4.1)  p[i*3+1] = 0.15;
      if (p[i*3+1] < 0.15) p[i*3+1] = 4.1;
      if (p[i*3+2] > 8)    p[i*3+2] = -50;
      if (p[i*3+2] < -50)  p[i*3+2] = 8;
    }
    dustMesh.geometry.attributes.position.needsUpdate = true;
  }

  /* ─────────────────────────────────────────
     PANEL MESHES ON WALLS (alternating L/R)
  ───────────────────────────────────────── */
  const PW = 2.1, PH = 1.48;
  const PANEL_SCALE_BASE = 1.0;

  async function makePanelMesh(item, index) {
    const g  = new THREE.Group();
    const side = index % 2 === 0 ? 'left' : 'right';
    const zPos = 2.2 - index * 5.8;
    const yPos = 1.82;
    const WX   = side === 'left' ? -TW/2 : TW/2;

    // Load image
    let tex = null;
    if (item.img) tex = await loadTex(item.img);

    // Image plane
    const imgMat = tex
      ? new THREE.MeshStandardMaterial({ map:tex, roughness:0.82, metalness:0 })
      : new THREE.MeshStandardMaterial({ color:0x12100e, roughness:0.9 });
    const imgPlane = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), imgMat);
    imgPlane.userData = { item, index };

    // Frame
    const B = 0.055;
    const fMat = new THREE.MeshStandardMaterial({ color:0x1c1810, roughness:0.45, metalness:0.55 });
    [[PW+B*2, B, 0, PH/2+B/2],[PW+B*2, B, 0,-PH/2-B/2],
     [B, PH,-PW/2-B/2, 0],[B, PH, PW/2+B/2, 0]].forEach(([fw,fh,fx,fy]) => {
      const fb = new THREE.Mesh(new THREE.BoxGeometry(fw,fh,0.022), fMat);
      fb.position.set(fx, fy, -0.012); g.add(fb);
    });

    // Accent glow trim
    const glowMat = new THREE.MeshStandardMaterial({
      color:R.accentInt, emissive:R.accentInt, emissiveIntensity:0.5,
      roughness:0.25, metalness:0.75
    });
    const glow = new THREE.Mesh(new THREE.BoxGeometry(PW+B*2+0.015, PH+B*2+0.015, 0.007), glowMat);
    glow.position.z = -0.018; g.add(glow);

    g.add(imgPlane);

    // Label plate — museum-style nameplate with CanvasTexture
    const plaqueText = (item.plaque || item.title || '').toUpperCase();
    const pc = document.createElement('canvas');
    pc.width = 512; pc.height = 80;
    const px = pc.getContext('2d');
    px.clearRect(0, 0, pc.width, pc.height);
    // Plate background
    px.fillStyle = '#18150a';
    px.fillRect(0, 0, pc.width, pc.height);
    // Thin accent border top
    px.fillStyle = '#' + R.accentHex.replace('#','');
    px.fillRect(0, 0, pc.width, 2);
    // Text
    px.textAlign = 'center';
    px.textBaseline = 'middle';
    // Letter-spaced serif label
    px.font = '600 22px Georgia, "Times New Roman", serif';
    px.fillStyle = '#' + R.accentHex.replace('#','');
    px.letterSpacing = '0.22em';
    // Manual letter-spacing fallback for older canvas engines
    const letters = plaqueText.split('');
    const spacing = 6;
    const totalW = px.measureText(plaqueText).width + spacing * Math.max(0, letters.length - 1);
    let cx2 = (pc.width - totalW) / 2;
    letters.forEach(ch => {
      px.fillText(ch, cx2 + px.measureText(ch).width / 2, pc.height / 2 + 1);
      cx2 += px.measureText(ch).width + spacing;
    });
    const plateTex = new THREE.CanvasTexture(pc);
    plateTex.needsUpdate = true;
    const plateMat = new THREE.MeshStandardMaterial({
      map: plateTex,
      roughness: 0.55, metalness: 0.45,
      emissiveMap: plateTex, emissive: new THREE.Color(R.accentHex), emissiveIntensity: 0.08
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.018), plateMat);
    plate.position.set(0, -PH/2-B-0.1, 0);
    g.add(plate);

    // Spotlight per panel — stronger and tighter
    const spColor = R.accentInt;
    const sp = new THREE.SpotLight(0xfff8e8, 1.6, 9, Math.PI/9, 0.32, 2.4);

    // Position group on wall
    let normalDir; // direction the panel faces (into the room)
    if (side === 'left') {
      g.rotation.y = Math.PI/2;
      g.position.set(WX + 0.018, yPos, zPos);
      sp.position.set(-1.5, 3.8, zPos+0.3);
      sp.target.position.set(WX, yPos, zPos);
      normalDir = new THREE.Vector3(1, 0, 0);
    } else {
      g.rotation.y = -Math.PI/2;
      g.position.set(WX - 0.018, yPos, zPos);
      sp.position.set(1.5, 3.8, zPos+0.3);
      sp.target.position.set(WX, yPos, zPos);
      normalDir = new THREE.Vector3(-1, 0, 0);
    }

    return {
      group: g, mesh: imgPlane, spotLight: sp, spotTarget: sp.target,
      item, index, side,
      worldPos: new THREE.Vector3(WX, yPos, zPos),
      normalDir
    };
  }

  /* ─────────────────────────────────────────
     BUILD ROOM
  ───────────────────────────────────────── */
  async function buildRoom() {
    roomGroup = new THREE.Group();
    scene.add(roomGroup);

    roomGroup.add(buildTunnel());
    buildLighting(roomGroup);
    buildDust(roomGroup);

    hallMeshes = [];
    panelMeshData = [];
    const items = CFG.items || [];

    for (let i = 0; i < items.length; i++) {
      setLoadProgress(0.2 + (i/items.length)*0.65);
      const pd = await makePanelMesh(items[i], i);
      roomGroup.add(pd.group);
      roomGroup.add(pd.spotLight);
      roomGroup.add(pd.spotTarget);
      hallMeshes.push({ mesh:pd.mesh, item:pd.item, index:pd.index });
      panelMeshData.push(pd);
    }
  }

  /* ─────────────────────────────────────────
     DOOR WITH HANDLE
  ───────────────────────────────────────── */
  function buildDoor() {
    if (doorGroup) { scene.remove(doorGroup); doorGroup = null; }
    doorGroup = new THREE.Group();

    const DW=1.28, DH=3.0, DD=0.055;
    const doorMat = new THREE.MeshStandardMaterial({ color:0x1a1510, roughness:0.48, metalness:0.32 });
    const glowMat = new THREE.MeshStandardMaterial({
      color:R.accentInt, emissive:R.accentInt, emissiveIntensity:0.28, roughness:0.25, metalness:0.8
    });

    function makeDoorPanel(side) {
      const dg = new THREE.Group();

      const panel = new THREE.Mesh(new THREE.BoxGeometry(DW,DH,DD), doorMat);
      panel.position.x = side==='left' ? DW/2 : -DW/2;
      panel.castShadow = true; panel.receiveShadow = true;
      dg.add(panel);

      // Gold vertical strip
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.038, DH*0.72, DD+0.008), glowMat);
      strip.position.set(side==='left' ? DW*0.32 : -DW*0.32, 0, 0);
      panel.add(strip);

      // Handle shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022,0.022,0.32,12),
        new THREE.MeshStandardMaterial({color:R.accentInt,metalness:0.92,roughness:0.15})
      );
      shaft.rotation.z = Math.PI/2;
      shaft.position.set(side==='left' ? DW*0.46 : -DW*0.46, -0.04, DD/2+0.02);
      panel.add(shaft);

      // Handle lever (the part that rotates)
      const leverGroup = new THREE.Group();
      leverGroup.name = side==='left' ? 'handleL' : 'handleR';
      const lever = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018,0.016,0.18,10),
        new THREE.MeshStandardMaterial({color:R.accentInt,metalness:0.95,roughness:0.1})
      );
      lever.position.y = -0.08;
      leverGroup.add(lever);
      // Lever tip ball
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.028,10,10),
        new THREE.MeshStandardMaterial({color:R.accentInt,metalness:0.98,roughness:0.08})
      );
      ball.position.y = -0.18;
      leverGroup.add(ball);
      leverGroup.position.set(side==='left' ? DW*0.46 : -DW*0.46, -0.04, DD/2+0.04);
      panel.add(leverGroup);
      if (side==='left') handleL = leverGroup;
      else               handleR = leverGroup;

      // Hinges
      [-0.88, 0.88].forEach(hy => {
        const h = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03,0.03,0.09,8),
          new THREE.MeshStandardMaterial({color:R.accentInt,metalness:0.9,roughness:0.2})
        );
        h.rotation.z = Math.PI/2;
        h.position.set(side==='left' ? 0.02 : -0.02, hy, 0);
        dg.add(h);
      });

      return dg;
    }

    leftDoor  = makeDoorPanel('left');
    rightDoor = makeDoorPanel('right');

    leftDoor.position.set(-DW,  DH/2, 8.4);
    rightDoor.position.set(DW, DH/2, 8.4);

    // Door frame
    const frameMat = new THREE.MeshStandardMaterial({ color:0x1c1810, roughness:0.55, metalness:0.35 });
    [[0, DH+0.1, 0.04, DW*2+0.12, 0.12, 0.06],
     [-DW-0.06, DH/2, 0, 0.1, DH+0.1, 0.06],
     [ DW+0.06, DH/2, 0, 0.1, DH+0.1, 0.06]
    ].forEach(([x,y,z,w,h,d]) => {
      const fb = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), frameMat);
      fb.position.set(x,y,z+8.4); doorGroup.add(fb);
    });

    // Light above door
    const doorLight = new THREE.SpotLight(0xfff3d8, 1.8, 10, Math.PI/7, 0.35, 2);
    doorLight.position.set(0, TH-0.05, 8.0);
    doorLight.target.position.set(0, 1.6, 8.4);
    doorGroup.add(doorLight); doorGroup.add(doorLight.target);

    doorGroup.add(leftDoor);
    doorGroup.add(rightDoor);
    scene.add(doorGroup);
  }

  function animateHandleThenOpen(onDone) {
    // 1. Handle rotates down
    if (handleL) gsap.to(handleL.rotation, { z:-0.55, duration:0.38, ease:'power2.in' });
    if (handleR) gsap.to(handleR.rotation, { z: 0.55, duration:0.38, ease:'power2.in',
      onComplete: () => {
        // 2. Door swings open
        gsap.to(leftDoor.rotation,  { y:-Math.PI*0.62, duration:1.3, ease:'power2.inOut' });
        gsap.to(rightDoor.rotation, { y: Math.PI*0.62, duration:1.3, ease:'power2.inOut',
          onComplete: () => { if (onDone) onDone(); }
        });
      }
    });
  }

  function animateDoorClose(onDone) {
    if (handleL) gsap.to(handleL.rotation, { z:-0.55, duration:0.3, ease:'power2.in' });
    if (handleR) gsap.to(handleR.rotation, { z: 0.55, duration:0.3, ease:'power2.in' });
    setTimeout(() => {
      gsap.to(leftDoor.rotation,  { y:0, duration:0.85, ease:'power2.inOut' });
      gsap.to(rightDoor.rotation, { y:0, duration:0.85, ease:'power2.inOut',
        onComplete: () => { if (onDone) onDone(); }
      });
    }, 320);
  }

  /* ─────────────────────────────────────────
     AUTO-FACE DETECTION
  ───────────────────────────────────────── */
  const _camDir = new THREE.Vector3();
  const _toPanel = new THREE.Vector3();

  function checkAutoFace() {
    if (state !== 'exploring') return;
    let bestPanel = null, bestScore = 0;

    for (const pd of panelMeshData) {
      const dist = camera.position.distanceTo(pd.worldPos);
      if (dist > 3.8) continue;

      // Direction camera is looking
      camera.getWorldDirection(_camDir);
      // Direction from camera to panel
      _toPanel.copy(pd.worldPos).sub(camera.position).normalize();

      const dot = _camDir.dot(_toPanel); // 1 = facing directly
      const proximity = 1 - clamp(dist/3.8, 0, 1);
      const score = dot * 0.6 + proximity * 0.4;

      if (dot > 0.2 && score > bestScore) {
        bestScore = score;
        bestPanel = pd;
      }
    }

    if (bestPanel && bestScore > 0.45) {
      // Compute target yaw to face the panel
      const toPanel = new THREE.Vector3().copy(bestPanel.worldPos).sub(camera.position);
      const targetY = Math.atan2(toPanel.x, toPanel.z) + Math.PI;
      autoFaceYaw      = targetY;
      autoFacePanel    = bestPanel;
      autoFaceActive   = true;
      autoFaceStrength = clamp((bestScore - 0.45) / 0.55, 0, 1);
    } else {
      autoFaceActive   = false;
      autoFacePanel    = null;
      autoFaceStrength = 0;
    }
  }

  /* ─────────────────────────────────────────
     FULL-SCREEN CARD (replaces side panel)
  ───────────────────────────────────────── */
  let cardOpen = false;

  function openCard(item) {
    const el = document.getElementById('card-overlay');
    if (!el) return;

    // Populate
    const img = document.getElementById('card-img');
    if (img) { img.src = item.img || ''; img.style.display = item.img ? 'block' : 'none'; }
    document.getElementById('card-tag').textContent      = item.tag || R.label;
    document.getElementById('card-title').textContent    = item.title || '';
    document.getElementById('card-subtitle').textContent = item.subtitle || '';

    const bodyEl = document.getElementById('card-body');
    const tagsEl = document.getElementById('card-tags');
    const listEl = document.getElementById('card-list');
    const ctaEl  = document.getElementById('card-cta');

    if (item.formHTML) {
      // Embedded form variant: body text holds the form, hide list/tags/cta.
      if (bodyEl) bodyEl.innerHTML = item.formHTML;
      if (tagsEl) tagsEl.innerHTML = '';
      if (listEl) listEl.innerHTML = '';
      if (ctaEl)  { ctaEl.style.display = 'none'; ctaEl.onclick = null; }
      if (item.onFormMount) item.onFormMount(bodyEl);
    } else {
      if (bodyEl) {
        bodyEl.innerHTML = item.body || '';
        // WhatsApp bold button injected below body text if flagged
        if (item.whatsappBtn) {
          const wa = document.createElement('a');
          wa.href = 'https://wa.me/2347042776167';
          wa.target = '_blank';
          wa.rel = 'noopener';
          wa.className = 'card-wa-btn';
          wa.innerHTML = '<span class="card-wa-icon">&#9679;</span> Chat on WhatsApp';
          bodyEl.appendChild(wa);
        }
      }

      if (tagsEl) {
        tagsEl.innerHTML = '';
        (item.tags||[]).forEach(t => {
          const p = document.createElement('span');
          p.className = 'card-tag-pill'; p.textContent = t;
          tagsEl.appendChild(p);
        });
      }

      if (listEl) {
        listEl.innerHTML = '';
        (item.listItems||[]).forEach(li => {
          const row = document.createElement('div');
          row.className = 'card-list-item';
          row.innerHTML = `<span class="card-list-dot">◆</span><span>${li.label}</span>`;
          listEl.appendChild(row);
        });
      }

      if (ctaEl) {
        if (item.cta) {
          ctaEl.textContent = item.cta.label;
          ctaEl.style.display = 'block';
          ctaEl.onclick = () => {
            closeCard();
            const href = item.cta.href||'contact.html';
            setTimeout(() => {
              if (href.startsWith('http')) window.open(href,'_blank');
              else navigateTo(href);
            }, 400);
          };
        } else { ctaEl.style.display = 'none'; ctaEl.onclick = null; }
      }
    }

    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    cardOpen = true;
    state = 'card';
  }

  function closeCard() {
    const el = document.getElementById('card-overlay');
    if (el) el.classList.remove('open');
    document.body.style.overflow = '';
    cardOpen = false;
    state = 'exploring';
  }

  /* ─────────────────────────────────────────
     SOUND (Web Audio API — no files)
  ───────────────────────────────────────── */
  function initSound() {
    if (soundInitialized) return;
    soundInitialized = true;
    try {
      audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = soundEnabled ? 0.04 : 0;
      masterGain.connect(audioCtx.destination);

      // Base drone
      ambientOsc = audioCtx.createOscillator();
      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = ROOM_FREQ[R.id] || 55;
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 1.0;
      ambientOsc.connect(ambientGain);
      ambientGain.connect(masterGain);
      ambientOsc.start();

      // Subtle harmonic
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = (ROOM_FREQ[R.id]||55) * 1.5;
      const g2 = audioCtx.createGain(); g2.gain.value = 0.22;
      osc2.connect(g2); g2.connect(masterGain); osc2.start();

      // Slow LFO tremolo
      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain); lfoGain.connect(masterGain.gain); lfo.start();

    } catch(e) { /* audio not available */ }
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    if (!soundInitialized && soundEnabled) initSound();
    if (masterGain) {
      masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(soundEnabled ? 0.04 : 0, audioCtx.currentTime+0.8);
    }
    const btn = document.getElementById('sound-btn');
    if (btn) btn.textContent = soundEnabled ? '♪' : '♩';
  }

  /* ─────────────────────────────────────────
     NAVIGATION
  ───────────────────────────────────────── */
  function navigateTo(file) {
    if (isTransitioning || !file) return;
    isTransitioning = true;
    state = 'transitioning';
    closeCard();
    closeNavDrawer();

    // Camera walks toward door
    gsap.to(camera.position, { z:8.6, duration:0.95, ease:'power2.in',
      onComplete: () => {
        buildDoor();
        animateDoorClose(() => {
          const ov = document.getElementById('room-transition');
          if (ov) { ov.style.transition='opacity 0.35s ease'; ov.style.opacity='1'; ov.style.pointerEvents='all'; }
          setTimeout(() => { window.location.href = file; }, 320);
        });
      }
    });
  }

  /* ─────────────────────────────────────────
     ENTER ANIMATIONS
  ───────────────────────────────────────── */
  function doEnter(isEntrance) {
    if (roomGroup) roomGroup.visible = true;

    const ov = document.getElementById('room-transition');
    if (ov && !isEntrance) {
      ov.style.opacity = '1';
      setTimeout(() => { ov.style.transition='opacity 0.55s ease'; ov.style.opacity='0'; setTimeout(()=>{ov.style.pointerEvents='none';},600); }, 80);
    }

    const isStairs = R.transition === 'stairs';
    camera.position.set(0, isStairs ? 0.2 : 1.72, 14);
    camTargetZ = 5.5;
    camTargetY = 1.72;

    buildDoor();
    state = 'entering';

    animateHandleThenOpen(() => {
      // Walk through — with stair rise if needed
      const dur = isStairs ? 2.6 : 2.1;
      gsap.to(camera.position, {
        z: 5.5, y: 1.72, duration: dur, ease: isStairs ? 'power2.inOut' : 'power3.out',
        onUpdate: () => {
          if (isStairs) {
            // Stair step effect: Y oscillates up during walk-in
            const progress = 1 - clamp((camera.position.z - 5.5)/(14-5.5),0,1);
            const stepY = Math.abs(Math.sin(progress * Math.PI * 3)) * 0.22;
            camera.position.y = lerp(0.2, 1.72, progress) + stepY;
          }
        },
        onComplete: () => {
          if (doorGroup) { scene.remove(doorGroup); doorGroup=null; leftDoor=null; rightDoor=null; handleL=null; handleR=null; }
          camZ = 5.5; camTargetZ = 5.5;
          camY = 1.72; camTargetY = 1.72;
          state = 'exploring';
          document.getElementById('hud')?.classList.add('visible');
          document.getElementById('mini-nav')?.classList.add('visible');
          showGestureHint();
          if (soundEnabled || (isEntrance && false)) initSound();
        }
      });
    });

    document.getElementById('topbar')?.classList.add('visible');
    document.getElementById('back-btn')?.classList.add('visible');
  }

  function enterWorld() {
    const ts = document.getElementById('title-screen');
    if (ts) { ts.classList.add('out'); setTimeout(()=>{ts.style.display='none';},1500); }
    doEnter(true);
    initSound();
  }

  /* ─────────────────────────────────────────
     LOAD HELPERS
  ───────────────────────────────────────── */
  function setLoadProgress(p) {
    const bar = document.getElementById('load-bar');
    const pct = document.getElementById('load-pct');
    if (bar) bar.style.width = (p*100).toFixed(0)+'%';
    if (pct) pct.textContent = Math.floor(p*100)+'%';
  }
  function hideLoader() {
    const el = document.getElementById('loader');
    if (!el) return;
    el.style.transition = 'opacity 0.75s ease';
    el.style.opacity = '0';
    setTimeout(()=>{el.style.display='none';},800);
  }

  /* ─────────────────────────────────────────
     DRAWERS
  ───────────────────────────────────────── */
  function buildNavDrawer() {
    const list = document.getElementById('nav-room-list');
    if (!list) return;
    list.innerHTML = '';
    ROOMS.forEach(r => {
      const a = document.createElement('a');
      a.className = 'nav-room-link'+(r.id===R.id?' active':'');
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
      btn.className = 'mini-nav-item'+(r.id===R.id?' active':'');
      btn.innerHTML = `<span class="mini-nav-icon">${r.icon}</span><span class="mini-nav-label">${r.label}</span>`;
      btn.addEventListener('click', ()=>navigateTo(r.file));
      inner.appendChild(btn);
    });
  }
  function openNavDrawer()  { document.getElementById('nav-drawer')?.classList.add('open'); document.querySelector('.hq-hamburger')?.classList.add('open'); }
  function closeNavDrawer() { document.getElementById('nav-drawer')?.classList.remove('open'); document.querySelector('.hq-hamburger')?.classList.remove('open'); }
  function toggleNavDrawer(){ document.getElementById('nav-drawer')?.classList.contains('open')?closeNavDrawer():openNavDrawer(); }

  /* ─────────────────────────────────────────
     GESTURE HINT (mobile, first-visit only)
  ───────────────────────────────────────── */
  const GESTURE_HINT_KEY = 'e3hq_pinch_hint_seen';
  let gestureHintTimer = null;
  let gestureHintShown = false;

  function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  function buildGestureHint() {
    if (document.getElementById('gesture-hint')) return;
    const el = document.createElement('div');
    el.id = 'gesture-hint';
    el.innerHTML =
      '<div class="gesture-hint-card">' +
        '<span class="gesture-hint-icon gesture-hint-pinch-out">' +
          '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M8 8L4 4M4 4H7M4 4V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M16 8L20 4M20 4H17M20 4V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M8 16L4 20M4 20H7M4 20V17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M16 16L20 20M20 20H17M20 20V17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>' +
        '</span>' +
        '<span class="gesture-hint-text">' +
          '<span class="gesture-hint-label">Pinch to Walk</span>' +
          '<span class="gesture-hint-sub">Spread fingers forward · Pinch in to step back</span>' +
        '</span>' +
      '</div>';
    document.body.appendChild(el);
  }

  function showGestureHint() {
    if (gestureHintShown) return;
    if (!isTouchDevice()) return;
    if (window.innerWidth > 768) return;
    let seen = false;
    try { seen = !!localStorage.getItem(GESTURE_HINT_KEY); } catch(e) {}
    if (seen) return;

    gestureHintShown = true;
    buildGestureHint();
    const el = document.getElementById('gesture-hint');
    if (!el) return;
    requestAnimationFrame(() => el.classList.add('visible'));
    gestureHintTimer = setTimeout(dismissGestureHint, 4200);
  }

  function dismissGestureHint() {
    if (gestureHintTimer) { clearTimeout(gestureHintTimer); gestureHintTimer = null; }
    const el = document.getElementById('gesture-hint');
    if (!el || !el.classList.contains('visible')) return;
    el.classList.add('fading');
    el.classList.remove('visible');
    try { localStorage.setItem(GESTURE_HINT_KEY, '1'); } catch(e) {}
    setTimeout(() => { el.remove(); }, 650);
  }

  /* ─────────────────────────────────────────
     INPUT
  ───────────────────────────────────────── */
  class TouchNavCtrl {
    constructor() {
      this.lastX=0; this.lastY=0; this.vel=0; this.dragging=false;
      this.startX=0; this.startY=0; this.moved=false; this.startTime=0;
      this.pinching=false; this.lastPinchDist=0;
      const el = document.getElementById('canvas-wrap');
      el.addEventListener('touchstart', e=>this._s(e), {passive:true});
      el.addEventListener('touchmove',  e=>this._m(e), {passive:true});
      el.addEventListener('touchend',   e=>this._e(e), {passive:true});
      el.addEventListener('touchcancel',e=>this._e(e), {passive:true});
    }
    _dist(t0, t1) { return Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY); }
    _s(e) {
      if (e.touches.length >= 2) {
        // Entering (or staying in) pinch mode — stop single-finger look-drag.
        this.dragging = false;
        this.pinching = true;
        this.lastPinchDist = this._dist(e.touches[0], e.touches[1]);
        return;
      }
      const t=e.touches[0]; if(!t)return;
      this.pinching=false;
      this.startX=this.lastX=t.clientX; this.startY=this.lastY=t.clientY;
      this.vel=0; this.dragging=true; this.moved=false; this.startTime=Date.now();
    }
    _m(e) {
      if (e.touches.length >= 2) {
        if (state!=='exploring' || cardOpen) return;
        this.dragging = false;
        this.pinching = true;
        const d = this._dist(e.touches[0], e.touches[1]);
        const delta = d - this.lastPinchDist; // >0 = fingers spreading (pinch-out) = move forward
        camTargetZ = clamp(camTargetZ - delta*0.018, -42, 7.2);
        this.lastPinchDist = d;
        this.moved = true;
        if (Math.abs(delta) > 2) dismissGestureHint();
        return;
      }
      if(!this.dragging || this.pinching)return;
      const t=e.touches[0]; if(!t)return;
      const dx=t.clientX-this.lastX, dy=t.clientY-this.lastY;
      if(Math.hypot(t.clientX-this.startX,t.clientY-this.startY)>9) this.moved=true;
      if(state==='exploring' && !cardOpen) {
        camTargetYaw   += dx*0.0038;
        camTargetPitch  = clamp(camTargetPitch - dy*0.003, -0.55, 0.55);
        this.vel = dx*0.006;
      }
      this.lastX=t.clientX; this.lastY=t.clientY;
    }
    _e(e) {
      this.dragging=false;
      // If any fingers remain after a pinch (e.g. lifted one of two), keep pinch state clean.
      if (e.touches && e.touches.length >= 2) {
        this.pinching = true;
        this.lastPinchDist = this._dist(e.touches[0], e.touches[1]);
        return;
      }
      const wasPinching = this.pinching;
      this.pinching = false;
      if (e.touches && e.touches.length === 1) {
        // Transitioned from pinch down to one finger — re-anchor drag without treating it as a tap.
        const t=e.touches[0];
        this.startX=this.lastX=t.clientX; this.startY=this.lastY=t.clientY;
        this.dragging=true; this.moved=true; this.startTime=0;
        return;
      }
      if(!wasPinching && !this.moved && Date.now()-this.startTime<300) {
        const t=e.changedTouches[0]; if(!t)return;
        handleClick(t.clientX, t.clientY);
      }
    }
    update() {}
  }

  function handleClick(cx, cy) {
    if (state==='card') { closeCard(); return; }
    if (state!=='exploring') return;
    const mouse2 = new THREE.Vector2(
      (cx/window.innerWidth)*2-1,
      -(cy/window.innerHeight)*2+1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse2, camera);
    const hits = ray.intersectObjects(hallMeshes.map(h=>h.mesh));
    if (hits.length) {
      const h = hallMeshes.find(h=>h.mesh===hits[0].object);
      if (h) { openCard(h.item); return; }
    }
  }

  function initInput() {
    // Sound toggle button
    const sBtn = document.getElementById('sound-btn');
    if (sBtn) sBtn.addEventListener('click', ()=>{ toggleSound(); });

    document.querySelector('.hq-hamburger')?.addEventListener('click', toggleNavDrawer);
    document.querySelector('.hq-logo')?.addEventListener('click', ()=>navigateTo('index.html'));
    document.getElementById('back-btn')?.addEventListener('click', ()=>{ if(cardOpen)closeCard(); });
    document.getElementById('card-close')?.addEventListener('click', closeCard);
    document.getElementById('card-backdrop')?.addEventListener('click', closeCard);

    // Desktop mouse drag look
    const cvs = renderer.domElement;
    cvs.addEventListener('mousedown', e => { if(e.button===0){isDragging=true; dragLastX=e.clientX; dragLastY=e.clientY; cvs.style.cursor='grabbing'; } });
    window.addEventListener('mouseup', () => { isDragging=false; cvs.style.cursor='default'; });
    window.addEventListener('mousemove', e => {
      if(isDragging && state==='exploring' && !cardOpen) {
        camTargetYaw   += (e.clientX-dragLastX)*0.004;
        camTargetPitch  = clamp(camTargetPitch-(e.clientY-dragLastY)*0.003,-0.55,0.55);
        dragLastX=e.clientX; dragLastY=e.clientY;
        // disable auto-face while dragging
        autoFaceActive=false;
      }
    });

    // Click (desktop)
    window.addEventListener('click', e => {
      if(isDragging) return;
      handleClick(e.clientX, e.clientY);
    });

    // Keyboard
    window.addEventListener('keydown', e => {
      keys[e.key]=true;
      if(e.key==='Escape') closeCard();
    });
    window.addEventListener('keyup', e => { keys[e.key]=false; });

    touchNav = new TouchNavCtrl();
  }

  /* ─────────────────────────────────────────
     RESIZE
  ───────────────────────────────────────── */
  function onResize() {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ─────────────────────────────────────────
     RENDER LOOP
  ───────────────────────────────────────── */
  let clockTickAcc = 0;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t  = clock.getElapsedTime();

    updateDust(t);

    // Flicker
    flickerLights.forEach((l,i) => {
      l.intensity = 1.1 + Math.sin(t*7.3+i*2.1)*0.25 + Math.sin(t*19.7+i)*0.12;
    });

    // Clock update every second
    clockTickAcc += dt;
    if (clockTickAcc > 1.0) { updateClock(); clockTickAcc=0; }

    if (state === 'exploring') {
      // Keyboard movement
      const spd = 4.2;
      if (keys['ArrowUp']   || keys['w']||keys['W']) camTargetZ -= dt*spd;
      if (keys['ArrowDown'] || keys['s']||keys['S']) camTargetZ += dt*spd;
      if (keys['ArrowLeft'] || keys['a']||keys['A']) camTargetYaw += dt*1.1;
      if (keys['ArrowRight']|| keys['d']||keys['D']) camTargetYaw -= dt*1.1;
      camTargetZ = clamp(camTargetZ, -42, 7.2);

      // Auto-face blend
      checkAutoFace();
      let effectiveYaw = camTargetYaw;
      if (autoFaceActive && !isDragging) {
        effectiveYaw = lerp(camTargetYaw, autoFaceYaw, autoFaceStrength * 0.6);
      }

      camYaw   += (effectiveYaw - camYaw)   * 0.07;
      camPitch += (camTargetPitch - camPitch)* 0.07;
      camZ     += (camTargetZ - camZ)        * 0.085;

      // Walk bob
      const moving = Math.abs(camTargetZ - camZ) > 0.01;
      walkBobSpeed = lerp(walkBobSpeed, moving ? 1.0 : 0.0, 0.08);
      walkBob = Math.sin(t*6.5) * walkBobSpeed * 0.012;

      camY += (camTargetY - camY) * 0.08;
      camera.position.set(0, camY+walkBob, camZ);

      // Apply yaw + pitch
      camera.rotation.order = 'YXZ';
      camera.rotation.y = camYaw;
      camera.rotation.x = camPitch;
    }

    renderer.render(scene, camera);
  }

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  async function init() {
    initRenderer();
    setLoadProgress(0.06);
    await buildRoom();
    if (roomGroup) roomGroup.visible = false;
    setLoadProgress(0.96);

    initInput();
    buildNavDrawer();
    buildMiniNav();

    setLoadProgress(1.0);
    await new Promise(r=>setTimeout(r,380));
    hideLoader();
    animate();

    if (CFG.id==='index') {
      const btn = document.getElementById('enter-btn');
      if (btn) btn.addEventListener('click', ()=>{ enterWorld(); initSound(); });
    } else {
      setTimeout(()=>doEnter(false), 80);
    }
  }

  function waitAndInit() {
    if (typeof THREE!=='undefined' && typeof gsap!=='undefined') init();
    else setTimeout(waitAndInit, 60);
  }
  waitAndInit();

})();
