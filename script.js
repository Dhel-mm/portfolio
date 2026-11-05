/* =========================================================
   Margie A. Marquez — Portfolio scripts

   0. Intro            10-second building scene, once per visit
   1. Project data     add or edit projects here only
   2. Landscape        live WebGL sky, clouds, trees, grass
   2b. Pixels          voxel meadow (three.js), same day cycle
   3. Time of day      sunrise/midday/sunset/midnight, light/dark,
                       background picker (plain / landscape / pixels)
   4. Navigation       clean URLs (/about, /projects/<id>), header,
                       mobile menu, active link
   5. Projects         cards, search and filters
   6. Project dialog   details at /projects/<id>
   7. Contact form     validation, spam protection, delivery
   8. Photo card       3D tilt, flip to the tagline
   9. Analytics        anonymous visit counts (Vercel functions in api/)
   10. Start-up        reveal on scroll, run everything
   ========================================================= */
(function () {
  "use strict";

  document.documentElement.classList.remove("no-js");

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Small safe DOM builder (uses textContent, never innerHTML, to avoid XSS)
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child == null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(child));
    }
    return node;
  }
  const icon = (cls) => el("i", { class: cls, "aria-hidden": "true" });

  const storage = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } }
  };

  /* =======================================================
     0. INTRO — a 10-second building scene, shown once per visit.
        A blocky builder (styled after Margie: long black hair,
        white shirt, black blazer) builds a little house on a
        floating island, waves, then the camera drifts up into the
        sky and the portfolio fades in. Uses three.js, loaded only
        for the intro and Pixels. Skippable; never shown with reduced motion.
     ======================================================= */
  const INTRO_SECONDS = 10;
  const INTRO_FADE_AT = 8.6;
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js";

  function introWanted() {
    try {
      return !sessionStorage.getItem("introSeen") &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function loadScript(src, timeout) {
    return new Promise((resolve, reject) => {
      const s = el("script", { src });
      const timer = setTimeout(() => reject(new Error("timed out")), timeout);
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error("failed to load " + src)); };
      document.head.append(s);
    });
  }

  // Build order: walls side by side (bottom row up), then the roof, door and lantern.
  // Returns the blocks with the time each is placed, and the builder's walking path.
  function introBuildPlan() {
    const blocks = [], path = [];
    const sides = [
      { stop: [0, 3.7], cells: [[-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2]] },
      { stop: [3.7, 0], cells: [[2, 1], [2, 0], [2, -1], [2, -2]], via: [3.7, 3.7] },
      { stop: [0, -3.7], cells: [[1, -2], [0, -2], [-1, -2], [-2, -2]], via: [3.7, -3.7] },
      { stop: [-3.7, 0], cells: [[-2, -1], [-2, 0], [-2, 1]], via: [-3.7, -3.7] }
    ];
    const windows = { "-1,2": 1, "1,2": 1, "2,0": 1, "0,-2": 1, "-2,0": 1 };
    let t = 0.7;
    path.push({ t: 0, p: [-4.6, 5.2] }, { t, p: sides[0].stop });
    sides.forEach((side, i) => {
      if (i > 0) {
        path.push({ t: t + 0.25, p: side.via }, { t: t + 0.5, p: side.stop });
        t += 0.5;
      }
      for (let y = 1; y <= 3; y++) {
        side.cells.forEach(([x, z]) => {
          if (x === 0 && z === 2 && y <= 2) return;                       // doorway
          const corner = Math.abs(x) === 2 && Math.abs(z) === 2;
          const type = corner ? "log" : y === 2 && windows[x + "," + z] ? "glass" : "plank";
          blocks.push({ x, y, z, type, t, side: i });
          t += 0.082;
        });
      }
    });
    // back round to the front to put the roof on
    path.push({ t: t + 0.25, p: [-3.7, 3.7] }, { t: t + 0.5, p: [0, 4.6] });
    t += 0.5;
    const roofAt = t;
    [[4, 3], [5, 2], [6, 1], [7, 0]].forEach(([y, r]) => {
      for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
        blocks.push({ x, y, z, type: "roof", t });
        t += 0.013;
      }
    });
    t += 0.1;
    blocks.push({ x: 0, y: 1, z: 2, type: "door", t }, { x: 0, y: 2, z: 2, type: "door", t: t + 0.1 });
    blocks.push({ x: 1, y: 2.25, z: 2.62, type: "lantern", t: t + 0.3 });
    return { blocks, path, doneAt: t + 0.35, roofAt };
  }

  // onEnd runs as the intro starts fading out (or right away when skipped)
  function runIntro(onEnd) {
    const root = document.documentElement;
    const page = $$("body > header, body > main, body > footer, .sky-control");
    page.forEach((n) => n.setAttribute("inert", ""));

    // colours of the current time of day, so the intro sky leads into the site's sky
    const pos = sky.position || 1;
    const from = Math.floor(pos) % 4, to = (from + 1) % 4, f = pos - Math.floor(pos);
    const lerp3 = (k) => SKY_LOOKS[from][k].map((v, i) => v + (SKY_LOOKS[to][k][i] - v) * f);
    const zenith = lerp3("zenith"), horizon = lerp3("horizon"), sunCol = lerp3("sunCol");
    const LIGHT = [0.85, 1, 0.75, 0.28];
    const daylight = LIGHT[from] * (1 - f) + LIGHT[to] * f;
    const css = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;

    const status = el("p", { class: "intro-title", "aria-live": "polite", text: "Loading..." });
    const fill = el("span", { class: "intro-bar-fill" });
    const skip = el("button", { class: "intro-skip", type: "button" }, ["Skip intro ", icon("fa-solid fa-forward")]);
    const overlay = el("div", {
      class: "intro", role: "dialog", "aria-modal": "true", "aria-label": "Intro animation",
      style: `background:linear-gradient(${css(zenith)},${css(horizon)})`
    }, [
      el("div", { class: "intro-ui" }, [
        status,
        el("div", { class: "intro-bar", "aria-hidden": "true" }, [fill]),
        el("p", { class: "intro-hint", text: "Click anywhere or press Esc to skip" })
      ]),
      skip
    ]);
    document.body.append(overlay);
    skip.focus();

    let finished = false, raf = 0, renderer = null, landscapeBack = false;
    function bringLandscapeBack() {
      if (landscapeBack) return;
      landscapeBack = true;
      root.classList.remove("intro-pending");
      if (root.dataset.bg !== "plain" && sky.living) sky.living.resume();
      onEnd();   // the page slides in while the intro fades away
    }
    function finish() {
      if (finished) return;
      finished = true;
      bringLandscapeBack();
      overlay.classList.add("intro-out");
      try { sessionStorage.setItem("introSeen", "1"); } catch (e) { /* private mode */ }
      setTimeout(() => {
        cancelAnimationFrame(raf);
        if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
        overlay.remove();
        page.forEach((n) => n.removeAttribute("inert"));
        document.removeEventListener("keydown", onKey);
      }, 650);
    }
    function onKey(e) { if (e.key === "Escape" || e.key === "Enter") finish(); }
    overlay.addEventListener("click", finish);
    document.addEventListener("keydown", onKey);

    // the live landscape rests while the intro plays
    if (sky.living) sky.living.pause();

    loadThree()
      .then((T) => { if (!finished) start(T); })
      .catch((err) => { console.warn("Intro skipped:", err); finish(); });

    function start(THREE) {
      const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || window.matchMedia("(max-width: 700px)").matches;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: !lowEnd });
      } catch (err) {
        console.warn("Intro skipped:", err);
        finish();
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1 : 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      overlay.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      // sky gradient + fog in the same colours
      const bg = document.createElement("canvas");
      bg.width = 2; bg.height = 256;
      const bgx = bg.getContext("2d");
      const grad = bgx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, css(zenith));
      grad.addColorStop(1, css(horizon));
      bgx.fillStyle = grad;
      bgx.fillRect(0, 0, 2, 256);
      const bgTex = new THREE.CanvasTexture(bg);
      bgTex.encoding = THREE.sRGBEncoding;
      scene.background = bgTex;
      scene.fog = new THREE.Fog(new THREE.Color().setRGB(...horizon).convertSRGBToLinear(), 34, 80);

      // light
      const sunColor = new THREE.Color().setRGB(...sunCol).convertSRGBToLinear();
      scene.add(new THREE.HemisphereLight(new THREE.Color().setRGB(...zenith).convertSRGBToLinear(), 0x3a5a2a, 0.35 + 0.45 * daylight));
      const sun = new THREE.DirectionalLight(sunColor, 0.25 + 0.85 * daylight);
      sun.position.set(9, 16, 7);
      sun.castShadow = true;
      sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
      Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
      scene.add(sun);

      // --- little pixel-art textures, drawn in code ---
      let seed = 2006;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const pick = (pal) => pal[Math.floor(rnd() * pal.length)];
      function pixels(size, paint) {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const g = c.getContext("2d");
        const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
        paint(px, size, g);
        const tex = new THREE.CanvasTexture(c);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.encoding = THREE.sRGBEncoding;
        return tex;
      }
      const GREEN = ["#5e9e3b", "#6aad43", "#518c32", "#79b94f"];
      const DIRT = ["#8a5a3b", "#7a4f33", "#996644", "#6e4730"];
      const STONE = ["#8c8c8c", "#7b7b7b", "#9a9a9a", "#6f6f6f"];
      const speckle = (pal) => (px, s) => { for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) px(x, y, pick(pal)); };
      const tex = {
        grassTop: pixels(16, speckle(GREEN)),
        dirt: pixels(16, speckle(DIRT)),
        stone: pixels(16, speckle(STONE)),
        grassSide: pixels(16, (px, s) => {
          speckle(DIRT)(px, s);
          for (let x = 0; x < s; x++) { const h = 3 + (rnd() < 0.45 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0); for (let y = 0; y < h; y++) px(x, y, pick(GREEN)); }
        }),
        plank: pixels(16, (px, s) => {
          for (let y = 0; y < s; y++) {
            const row = Math.floor(y / 4), seam = (row * 5 + 3) % 16;
            for (let x = 0; x < s; x++) {
              let c = pick(["#b89158", "#ad8650", "#c09a60"]);
              if (y % 4 === 3 || x === seam) c = "#7d5a33";
              px(x, y, c);
            }
          }
        }),
        logSide: pixels(16, (px, s) => {
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) px(x, y, x % 4 === 0 ? "#4f3a22" : pick(["#6b4f2e", "#5e4528", "#76573a"]));
        }),
        logTop: pixels(16, (px, s) => {
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
            px(x, y, d > 6.5 ? "#5e4528" : Math.floor(d) % 2 ? "#b08a55" : "#9c7646");
          }
        }),
        leaves: pixels(16, (px, s) => { for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (rnd() > 0.12) px(x, y, pick(["#3f8a2c", "#4c9a35", "#357524", "#5aa83e"])); }),
        glass: pixels(16, (px, s) => {
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const edge = x === 0 || y === 0 || x === s - 1 || y === s - 1;
            px(x, y, edge ? "rgba(232,246,255,0.95)" : "rgba(190,228,250,0.28)");
          }
          for (let i = 3; i < 8; i++) px(i, i - 1, "rgba(255,255,255,0.9)");
        }),
        roof: pixels(16, (px, s) => {
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const row = Math.floor(y / 4), mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
            px(x, y, mortar ? "#4a2620" : pick(["#8c4535", "#7a3b2e", "#9a4d3b"]));
          }
        }),
        door: pixels(16, (px, s) => {
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            let c = pick(["#8a6238", "#7d5731"]);
            if (x === 0 || x === s - 1 || y % 8 === 0) c = "#5a3d20";
            px(x, y, c);
          }
          for (let y = 3; y < 7; y++) for (let x = 3; x < 13; x++) if (x !== 8) px(x, y, "#bfe3f5");
          px(12, 11, "#2b2b2b");
        })
      };

      const lambert = (map, extra) => new THREE.MeshLambertMaterial(Object.assign({ map }, extra));
      // three.js box faces: +x, -x, +y, -y, +z, -z
      const MAT = {
        grass: [lambert(tex.grassSide), lambert(tex.grassSide), lambert(tex.grassTop), lambert(tex.dirt), lambert(tex.grassSide), lambert(tex.grassSide)],
        dirt: lambert(tex.dirt),
        stone: lambert(tex.stone),
        plank: lambert(tex.plank),
        log: [lambert(tex.logSide), lambert(tex.logSide), lambert(tex.logTop), lambert(tex.logTop), lambert(tex.logSide), lambert(tex.logSide)],
        leaves: lambert(tex.leaves, { alphaTest: 0.5 }),
        glass: lambert(tex.glass, { transparent: true }),
        roof: lambert(tex.roof),
        door: lambert(tex.door),
        lantern: new THREE.MeshBasicMaterial({ color: 0xffc46b })
      };
      const BOX = new THREE.BoxGeometry(1, 1, 1);

      // --- floating island, trees, flowers (static, drawn as instances) ---
      const cells = { grass: [], dirt: [], stone: [], log: [], leaves: [] };
      const noise2 = (x, z) => Math.sin(x * 1.7 + z * 0.9) * 0.35 + Math.cos(x * 0.8 - z * 1.3) * 0.3;
      for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) {
        const d = Math.hypot(x, z) + noise2(x, z);
        if (d > 8) continue;
        cells.grass.push([x, 0, z]);
        const depth = Math.floor((8 - d) * 0.8) + 1;
        for (let y = 1; y <= depth; y++) cells[y <= 2 ? "dirt" : "stone"].push([x, -y, z]);
      }
      // trees sit between the spots the camera stops at, so they never block the builder
      [1.35, 2.9, 4.5].map((ang) => [Math.round(Math.sin(ang) * 6.3), Math.round(Math.cos(ang) * 6.3)]).forEach(([x, z], i) => {
        const h = 4 + (i % 2);
        for (let y = 1; y <= h; y++) cells.log.push([x, y, z]);
        for (let y = h - 1; y <= h + 1; y++) {
          const r = y === h + 1 ? 1 : 2;
          for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r && r === 2) continue;
            if (dx === 0 && dz === 0 && y < h + 1) continue;
            cells.leaves.push([x + dx, y, z + dz]);
          }
        }
        cells.leaves.push([x, h + 2, z]);
      });
      const m4 = new THREE.Matrix4();
      Object.entries(cells).forEach(([type, list]) => {
        const mesh = new THREE.InstancedMesh(BOX, MAT[type], list.length);
        list.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m4.makeTranslation(x, y, z)));
        mesh.castShadow = type !== "stone" && type !== "dirt";
        mesh.receiveShadow = true;
        scene.add(mesh);
      });
      const flowerSpots = cells.grass.filter(([x, , z]) => Math.hypot(x, z) > 4.6 && rnd() < 0.18);
      const flowers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshLambertMaterial(), flowerSpots.length);
      const FLOWER = [0xe8544e, 0xf3d03e, 0xffffff, 0xb57ce3];
      flowerSpots.forEach(([x, , z], i) => {
        flowers.setMatrixAt(i, m4.makeTranslation(x + (rnd() - 0.5) * 0.6, 0.61, z + (rnd() - 0.5) * 0.6));
        flowers.setColorAt(i, new THREE.Color(pick(FLOWER)));
      });
      scene.add(flowers);

      // blocky clouds drifting by
      const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
      const clouds = [[-24, 24, -14, 8, 4], [16, 27, -24, 10, 5], [26, 23, 8, 7, 4], [-27, 28, 14, 9, 4], [4, 31, -32, 12, 6], [-8, 26, 28, 8, 4]].map(([x, y, z, w, d]) => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), cloudMat));
        const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 1, d * 0.6), cloudMat);
        top.position.set(w * 0.1, 0.8, 0);
        g.add(top);
        g.position.set(x, y, z);
        scene.add(g);
        return g;
      });

      // --- the builder ---
      const SKIN = "#f1c7a5", HAIR = "#1b1717", BLAZER = "#1f1f25", SHIRT = "#f4f4f2", PANTS = "#2d2f3a";
      const solid = (c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c).convertSRGBToLinear() });
      const face = pixels(8, (px) => {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(x, y, SKIN);
        for (let x = 0; x < 8; x++) { px(x, 0, HAIR); px(x, 1, HAIR); }
        [0, 1, 2, 5, 6, 7].forEach((x) => px(x, 2, HAIR));   // fringe
        for (let y = 2; y < 8; y++) { px(0, y, HAIR); px(7, y, HAIR); }
        px(1, 4, "#ffffff"); px(2, 4, "#3a2418"); px(5, 4, "#3a2418"); px(6, 4, "#ffffff");
        px(1, 5, "#f0a3a0"); px(6, 5, "#f0a3a0");
        px(3, 6, "#b8615c"); px(4, 6, "#b8615c");
      });
      const chest = pixels(8, (px) => {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(x, y, BLAZER);
        for (let y = 0; y < 6; y++) { px(3, y, SHIRT); px(4, y, SHIRT); }
        px(2, 0, SHIRT); px(5, 0, SHIRT); px(4, 6, "#555555");
      });
      const part = (w, h, d, mats) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
        m.castShadow = true;
        return m;
      };
      const builder = new THREE.Group();
      const hairM = solid(HAIR), skinM = solid(SKIN), blazerM = solid(BLAZER), pantsM = solid(PANTS);
      const head = part(0.5, 0.5, 0.5, [hairM, hairM, hairM, skinM, new THREE.MeshLambertMaterial({ map: face }), hairM]);
      head.position.y = 1.75;
      const torso = part(0.5, 0.75, 0.25, [blazerM, blazerM, blazerM, blazerM, new THREE.MeshLambertMaterial({ map: chest }), blazerM]);
      torso.position.y = 1.125;
      const hairBack = part(0.5, 0.62, 0.07, hairM);
      hairBack.position.set(0, 1.2, -0.16);
      builder.add(head, torso, hairBack);
      const limb = (x, y, mat, handMat) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, 0);
        const m = part(0.25, 0.75, 0.25, mat);
        m.position.y = -0.375;
        pivot.add(m);
        if (handMat) {
          const hand = part(0.24, 0.16, 0.24, handMat);
          hand.position.y = -0.68;
          pivot.add(hand);
        }
        builder.add(pivot);
        return pivot;
      };
      const armL = limb(-0.375, 1.5, blazerM, skinM), armR = limb(0.375, 1.5, blazerM, skinM);
      const legL = limb(-0.125, 0.75, pantsM, solid("#121212")), legR = limb(0.125, 0.75, pantsM, solid("#121212"));
      builder.scale.setScalar(0.92);
      builder.position.y = 0.5;
      scene.add(builder);

      // --- the house, placed block by block ---
      const plan = introBuildPlan();
      let lanternLight = null;
      plan.blocks.forEach((b) => {
        const mesh = new THREE.Mesh(BOX, MAT[b.type]);
        if (b.type === "door") { mesh.scale.set(1, 1, 0.18); b.z += 0.41; }
        if (b.type === "lantern") {
          mesh.geometry = new THREE.BoxGeometry(0.28, 0.36, 0.28);
          lanternLight = new THREE.PointLight(0xffb060, 0, 7);
          lanternLight.position.set(b.x, b.y, b.z + 0.3);
          scene.add(lanternLight);
        }
        mesh.position.set(b.x, b.y, b.z);
        mesh.castShadow = b.type !== "glass";
        mesh.receiveShadow = true;
        mesh.visible = false;
        b.mesh = mesh;
        b.full = mesh.scale.clone();
        scene.add(mesh);
      });

      // --- animation ---
      const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
      const easeBack = (x) => { const c = 1.7; x = Math.min(Math.max(x, 0), 1) - 1; return 1 + x * x * ((c + 1) * x + c); };
      function where(t) {
        const P = plan.path;
        if (t <= P[0].t) return { p: P[0].p, moving: false, dir: [0, -1] };
        for (let i = 0; i < P.length - 1; i++) {
          const A = P[i], B = P[i + 1];
          if (t >= A.t && t <= B.t) {
            const k = (t - A.t) / (B.t - A.t);
            return { p: [A.p[0] + (B.p[0] - A.p[0]) * k, A.p[1] + (B.p[1] - A.p[1]) * k], moving: true, dir: [B.p[0] - A.p[0], B.p[1] - A.p[1]] };
          }
        }
        return { p: P[P.length - 1].p, moving: false, dir: [0, -1] };
      }
      const turnTo = (cur, target) => {
        let d = target - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return cur + d * 0.22;
      };

      const t0 = performance.now();
      let last = t0, walk = 0, lastPlace = -9;
      let camAng = null, aroundHouse = 0, prevAround = null;
      status.textContent = "Building Margie's portfolio...";

      function frame(now) {
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // blocks pop into place with a little bounce
        plan.blocks.forEach((b) => {
          if (t < b.t) return;
          lastPlace = Math.max(lastPlace, b.t);
          const k = easeBack((t - b.t) / 0.2);
          b.mesh.visible = true;
          b.mesh.scale.copy(b.full).multiplyScalar(Math.max(k, 0.001));
          b.mesh.position.y = b.y + (1 - Math.min(k, 1)) * 0.35;
        });
        if (lanternLight) lanternLight.intensity = t > plan.doneAt ? 0.6 + (1 - daylight) * 1.6 : 0;

        // builder: walk the path, face the house while building, wave at the end
        const w = where(t);
        builder.position.x = w.p[0];
        builder.position.z = w.p[1];
        const waving = t > plan.doneAt;
        let yaw;
        if (waving) yaw = Math.atan2(camera.position.x - w.p[0], camera.position.z - w.p[1]);
        else if (w.moving) yaw = Math.atan2(w.dir[0], w.dir[1]);
        else yaw = Math.atan2(-w.p[0], -w.p[1]);
        builder.rotation.y = turnTo(builder.rotation.y, yaw);
        walk += dt * (w.moving ? 13 : 0);
        const swing = w.moving ? Math.sin(walk) * 0.75 : 0;
        legL.rotation.x = swing;
        legR.rotation.x = -swing;
        armL.rotation.x = -swing * 0.8;
        const hit = Math.exp(-(t - lastPlace) * 12);
        if (waving) {
          armR.rotation.x = 0;
          armR.rotation.z = -2.6 + Math.sin(t * 13) * 0.35;
        } else {
          armR.rotation.z = 0;
          armR.rotation.x = w.moving ? swing * 0.8 : -0.5 - 1.0 * hit;
        }
        head.rotation.x = waving ? 0 : w.moving ? 0 : -0.25;
        builder.position.y = 0.5 + (waving ? Math.abs(Math.sin(t * 6)) * 0.08 : 0);

        clouds.forEach((c, i) => { c.position.x += dt * (0.25 + i * 0.07); });

        // camera: follows the builder around the house (a little ahead of her,
        // so she's never hidden behind the walls), then drifts up into the sky
        const around = Math.atan2(w.p[0], w.p[1]);
        if (prevAround === null) { prevAround = around; aroundHouse = around; }
        let turn = around - prevAround;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        aroundHouse += turn;
        prevAround = around;
        if (camAng === null) camAng = aroundHouse + 0.55;
        camAng += (aroundHouse + 0.55 - camAng) * (1 - Math.exp(-dt * 1.6));
        const k = ease(t / INTRO_FADE_AT), up = ease((t - INTRO_FADE_AT) / (INTRO_SECONDS - INTRO_FADE_AT));
        // high enough (about 40 degrees down) that the trees never block the view
        // tall phone screens see less from side to side, so step back a little
        const back = camera.aspect < 1 ? Math.pow(camera.aspect, -0.65) : 1;
        const r = (17 - 2.5 * k) * back;
        camera.position.set(Math.sin(camAng) * r, (15.5 - 2 * k) * back + 9 * up, Math.cos(camAng) * r);
        camera.lookAt(0, 2.2 + 22 * up, 0);

        // progress
        const pct = Math.round(Math.min(t / plan.doneAt, 1) * 100);
        fill.style.width = pct + "%";
        const text = waving ? "Welcome to Margie's portfolio!" : t < 2.4 ? "Laying the first blocks..." : t < plan.roofAt ? "Raising the walls..." : "Putting on the roof...";
        if (status.textContent !== text) status.textContent = text;

        // fade into the portfolio
        if (t >= INTRO_FADE_AT) {
          bringLandscapeBack();
          overlay.style.opacity = String(1 - up);
        }
        if (t >= INTRO_SECONDS) finish();

        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(frame);
    }
  }

  /* =======================================================
     1. PROJECT DATA — add or edit projects here only
     ======================================================= */
  const projects = [
    {
      id: "kopi-calamba",
      name: "Kopi; Calamba",
      category: "Software Engineering",
      type: "Thesis Web System",
      description: "This project is for a thesis we started in the 2nd semester of 1st year and continued in the 1st semester of 2nd year. We are still continuing the project until now.",
      date: "2026-02-20",
      technologies: ["VS Code", "Codex", "Canva", "dribbble.com"],
      image: "assets/images/projects/kopi-calamba.webp",
      alt: "Kopi; Calamba website home page with the headline Not just coffee, it's happiness over a photo of the coffee bar",
      role: "Full stack",
      status: "Not complete",
      url: "https://kopi-ssm6.onrender.com/",
      github: "",
      demo: "",
      overview: "Kopi; Calamba is our thesis project: a web system for Kopi, a coffee shop in Calamba. Its welcoming home page, \"Not just coffee, it's happiness,\" leads into the system behind it.",
      problem: "The coffee shop needed one web system for its work instead of doing everything by hand.",
      solution: "As the full-stack developer, I built both the pages people see and the system behind them, planning the design with Canva and dribbble.com and coding it in VS Code with help from Codex.",
      features: [
        "Branded home page with the shop's logo and photo",
        "Front end and back end built by me as full-stack developer",
        "Designs planned in Canva with ideas from dribbble.com",
        "Live online and still being improved"
      ]
    },
    {
      id: "booksheaven",
      name: "BooksHeaven",
      category: "Web Design and Programming",
      type: "Bookstore Website",
      description: "This is our final group project for the IT 221 course in the 2nd year.",
      date: "2025-12-06",
      technologies: ["VS Code"],
      image: "assets/images/projects/booksheaven.webp",
      alt: "BooksHeaven log-in page with a frosted log-in box over a pastel sky full of clouds",
      role: "Front-end",
      status: "Complete",
      url: "https://dhel-mm.github.io/bookstore/Finals/login_book_heaven.html",
      github: "",
      demo: "",
      overview: "BooksHeaven is an online bookstore website made as our group's final project for IT 221. It opens on a calm, sky-themed log-in page.",
      problem: "Build a complete, working website as a group for the course finals.",
      solution: "As the front-end developer, I worked on the pages users see, giving the site a soft sky look with a frosted log-in box and clear blue buttons.",
      features: [
        "Sky-themed log-in page with a frosted glass box",
        "Simple email and password log-in",
        "Consistent blue BooksHeaven branding",
        "Published online with GitHub Pages"
      ]
    },
    {
      id: "miniso",
      name: "MINISO",
      category: "Graphic Design",
      type: "Typography Poster",
      description: "This is our Lesson 7, Activity 5. The task was to design a brand identity poster for a fictional or real company using typography.",
      date: "2026-09-18",
      technologies: ["Photoshop"],
      image: "assets/images/projects/miniso.webp",
      alt: "MINISO logo in glossy pastel bubble letters with the tagline Life Is For Fun",
      role: "Graphic Designer",
      status: "Complete",
      url: "",
      github: "",
      demo: "",
      overview: "A brand identity poster for MINISO that uses typography as the main visual. The bubbly, glossy letters and the hand-lettered tagline \"Life is for fun\" capture the brand's playful and friendly personality.",
      problem: "Communicate a brand's identity using mostly lettering, without relying on photos or product images.",
      solution: "I hand-styled each letter of the name in a different soft color with outlines and shine highlights, then paired it with a brush-style tagline in pink and orange to make the poster feel cheerful and fun.",
      features: [
        "Custom bubble lettering with glossy highlights",
        "Pastel color palette that matches the brand's playful tone",
        "Brush-style tagline for contrast and personality",
        "Clean layout that keeps the focus on typography"
      ]
    },
    {
      id: "ash-brew",
      name: "Ash Brew",
      category: "Graphic Design",
      type: "Promotional Illustration",
      description: "This is our Lesson 6, Activity 4. The task was to choose a business option that doesn't have a logo yet, and I chose Option 1: Coffee Shop – “Brew Haven.”",
      date: "2026-09-08",
      technologies: ["Photoshop"],
      image: "assets/images/projects/ash-brew.webp",
      alt: "Illustrated pumpkin spice latte in a Brew Haven mug next to a pumpkin and a spoon",
      role: "Graphic Designer",
      status: "Complete",
      url: "",
      github: "",
      demo: "",
      overview: "A hand-drawn promotional artwork for the coffee shop “Brew Haven,” introducing its new Pumpkin Spice Latte. The cup carries the shop's name, giving the brand a warm and cozy look.",
      problem: "Brew Haven had no logo or visual identity yet, so it needed artwork that could introduce the shop and its products in an inviting way.",
      solution: "I illustrated a latte cup with the Brew Haven name, a pumpkin and a spoon, and added playful lettering in warm autumn colors to announce the new drink.",
      features: [
        "Hand-drawn latte, pumpkin and spoon illustrations",
        "Brew Haven branding placed on the cup",
        "Playful, bold lettering for the drink's name",
        "Warm autumn color palette"
      ]
    },
    {
      id: "paw-mm",
      name: "PAW MM",
      category: "Graphic Design",
      type: "Logo Design",
      description: "This is our Lesson 3, Activity 3. The task was to create visuals that represent me, including logo variations.",
      date: "2026-08-29",
      technologies: ["Photoshop"],
      image: "assets/images/projects/paw-mm.webp",
      alt: "PAW MM cat logo in three variations: primary, horizontal and circular badge, with the tagline Play, Game, Meaw",
      role: "Graphic Designer",
      status: "Complete",
      url: "",
      github: "",
      demo: "",
      overview: "A personal brand called PAW MM. A cat character with my initials \"MM\" as its face represents me, and the tagline \"Play • Game • Meaw\" reflects my love of video games.",
      problem: "Create a set of visuals that represent my personality and can be used in different sizes and layouts.",
      solution: "I designed a cute cat mascot built from my initials, surrounded it with small gaming doodles, and produced three logo variations so the brand works in different places.",
      features: [
        "Primary logo with the cat mascot and gaming doodles",
        "Horizontal logo for wide spaces like banners",
        "Circular badge logo with a paw print",
        "Consistent pink and brown color palette"
      ]
    }
  ];

  // Suggested categories from the project guidelines
  const CATEGORIES = [
    "Web Development", "Mobile Application", "Information System", "Networking",
    "Research", "Database", "Graphic Design", "Automation"
  ];
  const CATEGORY_ICONS = {
    "Graphic Design": "fa-solid fa-palette",
    "Web Design and Programming": "fa-solid fa-code",
    "Software Engineering": "fa-solid fa-gears"
  };

  const formatDate = (iso) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const yearOf = (p) => p.date.slice(0, 4);

  /* =======================================================
     2. LANDSCAPE (WebGL) — a calm countryside view, drawn
         entirely in code so sky, clouds, hills, trees and grass
         share one palette for each time of day:
           - sky gradient, drifting clouds lit by the sun or moon,
             a sun that rises on the left and sets on the right,
             stars, a crescent moon and the odd shooting star
           - far hills and a tree line fading into the haze
           - a big tree and a few smaller ones, leaves swaying
           - a 3D field of grass blades with wildflowers, rolling
             gusts that part around the mouse pointer (grass based
             on the "Grass Field" component by Originkit)
           - fireflies drifting over the grass at night
         Falls back to a plain CSS sky if WebGL isn't available.
     ======================================================= */

  // One palette per time of day. Positions are on screen: x is centred
  // (1 = one screen height), y is height above the horizon.
  const SKY_LOOKS = [
    { // sunrise
      zenith: [0.42, 0.52, 0.78], horizon: [1.0, 0.8, 0.64], haze: [0.97, 0.82, 0.7],
      sun: [-0.3, 0.05], sunAmt: 1, sunCol: [1.0, 0.78, 0.5], moonAmt: 0,
      cloudLit: [1.0, 0.86, 0.78], cloudShade: [0.66, 0.56, 0.68], cover: 0.53,
      hills: [0.66, 0.6, 0.7], treeline: [0.3, 0.32, 0.33], tree: [0.2, 0.24, 0.17],
      base: [0.06, 0.08, 0.035], tip: [0.62, 0.66, 0.26], flower: [1.0, 0.86, 0.8],
      focus: -0.35, wind: 0.75, night: 0, clouds: 0.8
    },
    { // midday
      zenith: [0.2, 0.46, 0.86], horizon: [0.74, 0.86, 0.96], haze: [0.76, 0.85, 0.93],
      sun: [0.08, 0.42], sunAmt: 1, sunCol: [1.0, 0.97, 0.86], moonAmt: 0,
      cloudLit: [1.0, 1.0, 1.0], cloudShade: [0.68, 0.75, 0.86], cover: 0.52,
      hills: [0.48, 0.62, 0.66], treeline: [0.17, 0.32, 0.17], tree: [0.14, 0.3, 0.11],
      base: [0.043, 0.114, 0.031], tip: [0.24, 0.64, 0.09], flower: [0.98, 0.95, 0.78],
      focus: 0, wind: 1.0, night: 0, clouds: 1.0
    },
    { // sunset
      zenith: [0.28, 0.24, 0.5], horizon: [1.0, 0.6, 0.33], haze: [0.96, 0.64, 0.42],
      sun: [0.24, 0.035], sunAmt: 1, sunCol: [1.0, 0.62, 0.3], moonAmt: 0,
      cloudLit: [1.0, 0.68, 0.48], cloudShade: [0.42, 0.28, 0.42], cover: 0.52,
      hills: [0.55, 0.38, 0.45], treeline: [0.19, 0.13, 0.16], tree: [0.13, 0.09, 0.09],
      base: [0.07, 0.05, 0.025], tip: [0.72, 0.56, 0.17], flower: [1.0, 0.8, 0.55],
      focus: 0.35, wind: 0.85, night: 0, clouds: 0.85
    },
    { // midnight
      zenith: [0.02, 0.03, 0.09], horizon: [0.13, 0.17, 0.3], haze: [0.13, 0.16, 0.27],
      sun: [0.75, -0.2], sunAmt: 0, sunCol: [1.0, 0.6, 0.3], moonAmt: 1,
      cloudLit: [0.3, 0.34, 0.46], cloudShade: [0.05, 0.06, 0.11], cover: 0.56,
      hills: [0.08, 0.1, 0.17], treeline: [0.035, 0.045, 0.07], tree: [0.03, 0.045, 0.055],
      base: [0.015, 0.03, 0.045], tip: [0.13, 0.27, 0.32], flower: [0.55, 0.6, 0.72],
      focus: 0.2, wind: 0.55, night: 1, clouds: 0.55
    }
  ];
  const MOON = [0.3, 0.3];

  // Grass field camera (from the Grass Field component)
  const FIELD_EYE_Y = 1.35;
  const FIELD_PITCH = 0.06;   // a little lower than the original so more sky shows
  const FIELD_FOCAL = 1.55;
  const FIELD_TERRAIN = 0.4;  // gentle rolling ground
  const FIELD_HORIZON = 0.5 - 0.5 * FIELD_FOCAL * Math.tan(FIELD_PITCH);  // horizon height on screen (from top)
  const BLADE_VERTS = 9;
  const FIREFLIES = 70;

  const QUAD_VS = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const NOISE_GLSL = `
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
      return v;
    }
    float fbm3(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 3; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
      return v;
    }
  `;

  // Sky, clouds, far hills, tree line and trees — everything above the field
  const BACKDROP_FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform vec2 uRes;
    uniform float uTime, uCloudT, uHorizon, uFocus, uNight, uWind, uCover;
    uniform vec3 uZenith, uHorizonCol, uHaze, uSunCol, uCloudLit, uCloudShade, uHills, uTreeline, uTree;
    uniform vec2 uSun, uMoon, uLight;
    uniform float uSunAmt, uMoonAmt;
    ${NOISE_GLSL}

    // Cloud density: warped noise gives rounded, billowing shapes
    float cloudField(vec2 c) {
      vec2 w = vec2(fbm3(c * 0.45 + vec2(1.7, uTime * 0.008)), fbm3(c * 0.45 + vec2(8.3, 2.8)));
      return fbm(c + w * 0.3);
    }

    // One tree: trunk plus a canopy of overlapping leafy blobs.
    // Returns x = coverage, y = light on the leaves, z = 1 for trunk.
    vec3 tree(vec2 p, vec2 base, float size, float seed) {
      vec2 q = (p - base) / size;
      if (q.x < -0.75 || q.x > 0.75 || q.y < -0.05 || q.y > 1.25) return vec3(0.0);
      // the crown sways a little; more at the top
      float sway = (sin(uTime * 0.7 + seed * 5.0) * 0.6 + sin(uTime * 1.3 + seed * 2.0) * 0.4) * 0.03 * uWind;
      q.x -= sway * q.y * q.y;
      float trunkW = 0.05 * (1.25 - q.y * 0.6);
      float trunk = step(abs(q.x + 0.03 * sin(q.y * 6.0 + seed)), trunkW) * step(0.0, q.y) * step(q.y, 0.62);
      float d = length(q - vec2(0.0, 0.66)) - 0.34;
      d = min(d, length(q - vec2(-0.3, 0.55)) - 0.26);
      d = min(d, length(q - vec2(0.31, 0.57)) - 0.27);
      d = min(d, length(q - vec2(-0.14, 0.86)) - 0.25);
      d = min(d, length(q - vec2(0.17, 0.84)) - 0.24);
      d = min(d, length(q - vec2(0.02, 1.0)) - 0.16);
      // leafy fringe that rustles in the wind
      float leaves = fbm3(q * 9.0 + vec2(seed * 7.0, uTime * 0.6 * uWind));
      d += (leaves - 0.5) * 0.12;
      float aa = 1.5 / (uRes.y * size);
      float crown = smoothstep(aa, -aa, d);
      // light: brighter on the side facing the sun, darker underneath, leaf clumps
      vec2 n = normalize(q - vec2(0.0, 0.62) + 1e-4);
      float lit = 0.45 + 0.35 * dot(n, normalize(vec2(uLight.x, 0.6))) + (leaves - 0.5) * 0.7 + (q.y - 0.7) * 0.4;
      float cover = max(crown, trunk);
      return vec3(cover, clamp(lit, 0.0, 1.0), trunk * (1.0 - crown));
    }

    void main() {
      float asp = uRes.x / uRes.y;
      vec2 st = gl_FragCoord.xy / uRes;
      vec2 p = vec2((st.x - 0.5) * asp + uFocus, st.y - (1.0 - uHorizon));   // y = height above horizon
      float y = p.y;
      float t = uTime;

      // --- sky gradient ---------------------------------------------------
      float g = clamp(y / uHorizon, 0.0, 1.0);
      vec3 col = mix(uHorizonCol, uZenith, pow(g, 0.55));

      // --- sun and moon ---------------------------------------------------
      float ds = length(p - uSun);
      col += uSunCol * (exp(-ds * 6.0) * 0.32 + exp(-ds * 24.0) * 0.45) * uSunAmt;
      col = mix(col, mix(uSunCol, vec3(1.0), 0.7), smoothstep(0.034, 0.028, ds) * uSunAmt);
      float dm = length(p - uMoon);
      col += vec3(0.6, 0.68, 0.85) * exp(-dm * 9.0) * 0.18 * uMoonAmt;
      float moon = smoothstep(0.03, 0.026, dm) * (1.0 - smoothstep(0.026, 0.022, length(p - uMoon - vec2(0.013, 0.008))));
      col = mix(col, vec3(0.96, 0.95, 0.88), moon * uMoonAmt);

      // --- soft, puffy clouds ----------------------------------------------
      // Lower clouds are farther away, so they look smaller and flatter.
      float cloudA = 0.0;
      if (y > 0.01) {
        float persp = 1.0 / (y * 1.6 + 0.32);
        vec2 c = vec2(p.x * persp * 1.6 - uCloudT, 1.6 / (y + 0.25)) * 3.0;
        float d = cloudField(c);
        float a = smoothstep(uCover, uCover + 0.13, d) * smoothstep(0.02, 0.13, y);
        if (a > 0.002) {
          // bright, sunlit tops; soft grey undersides; brighter on the side facing the light
          vec2 toL = normalize(uLight - p + 1e-4);
          float dUp = cloudField(c + vec2(0.0, -0.2));
          float dL = cloudField(c + toL * 0.2);
          float shade = clamp(0.55 + (d - dUp) * 4.5 + (d - dL) * 2.5, 0.0, 1.0);
          float core = smoothstep(uCover, uCover + 0.4, d);
          vec3 cc = mix(uCloudShade, uCloudLit, shade) * (0.92 + 0.12 * (1.0 - core));
          float dl = length(p - uLight);
          cc += uSunCol * exp(-dl * 5.0) * 0.4 * uSunAmt;                    // glow near the sun
          cc += vec3(0.5, 0.56, 0.7) * exp(-dl * 7.0) * 0.25 * uMoonAmt;     // silver near the moon
          cc += uSunCol * (1.0 - core) * exp(-dl * 3.0) * 0.35 * uSunAmt;    // bright rims towards the sun
          a *= 0.97 - 0.5 * exp(-dl * 20.0);
          col = mix(col, cc, a);
          cloudA = a;
        }
      }

      // --- night: stars and the odd shooting star ------------------------
      if (uNight > 0.01 && y > 0.0) {
        vec2 gp = p * 170.0;
        vec2 id = floor(gp);
        float hs = hash(id);
        if (hs > 0.972) {
          vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) * 0.6 + 0.2;
          float tw = 0.55 + 0.45 * sin(t * (1.5 + hs * 4.0) + hs * 80.0);
          float s = smoothstep(0.14, 0.0, length(fract(gp) - off)) * tw * (1.0 - cloudA) * smoothstep(0.03, 0.15, y);
          col += vec3(0.9, 0.95, 1.0) * s * 0.8 * uNight;
        }
        float k = fract(t / 19.0), idx = floor(t / 19.0);
        if (k < 0.06) {
          float pr = k / 0.06;
          vec2 A = vec2((hash(vec2(idx, 1.0)) - 0.5) * asp * 0.8 + uFocus, uHorizon * (0.55 + 0.35 * hash(vec2(idx, 2.0))));
          vec2 B = A + vec2(hash(vec2(idx, 3.0)) > 0.5 ? 0.22 : -0.22, -0.1);
          vec2 head = mix(A, B, pr), tail = mix(A, B, max(pr - 0.35, 0.0));
          vec2 pa = p - tail, ba = head - tail + 1e-5;
          float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          col += vec3(1.0) * smoothstep(0.0022, 0.0, length(pa - ba * hh)) * hh * sin(pr * 3.1416) * uNight * (1.0 - cloudA);
        }
      }

      // --- hazier air towards the horizon ---------------------------------
      col = mix(col, uHaze, smoothstep(0.16, 0.0, y) * 0.7);

      // --- far hills -------------------------------------------------------
      float px = 1.5 / uRes.y;
      float hFar = 0.03 + 0.016 * sin(p.x * 2.3 + 1.1) + 0.009 * sin(p.x * 5.7 + 0.4) + 0.006 * fbm3(vec2(p.x * 9.0, 0.0));
      float mFar = smoothstep(hFar + px, hFar - px, y);
      vec3 hillCol = mix(uHills, uHaze, 0.45 + 0.25 * smoothstep(hFar, 0.0, y));
      col = mix(col, hillCol, mFar);

      // --- tree line -------------------------------------------------------
      float hLine = 0.007 + 0.013 * fbm3(vec2(p.x * 11.0, 3.0)) + 0.004 * fbm3(vec2(p.x * 38.0, 1.0));
      float mLine = smoothstep(hLine + px, hLine - px, y);
      float bush = fbm3(vec2(p.x * 40.0, y * 70.0));
      vec3 lineCol = mix(uTreeline, uHaze, 0.32 - 0.12 * smoothstep(0.0, hLine, y)) * (0.8 + 0.4 * bush);
      col = mix(col, lineCol, mLine);

      // --- trees, standing on the far edge of the field --------------------
      vec3 tr = tree(p, vec2(0.5, -0.004), 0.17, 1.0);
      vec3 t2 = tree(p, vec2(-0.66, -0.003), 0.09, 2.0);
      vec3 t3 = tree(p, vec2(-0.55, -0.003), 0.065, 3.0);
      vec3 t4 = tree(p, vec2(-0.1, -0.003), 0.06, 4.0);
      vec3 t5 = tree(p, vec2(0.92, -0.003), 0.08, 5.0);
      vec3 trees[5];
      trees[0] = t2; trees[1] = t3; trees[2] = t4; trees[3] = t5; trees[4] = tr;
      for (int i = 0; i < 5; i++) {
        vec3 T = trees[i];
        if (T.x > 0.0) {
          vec3 leaf = uTree * (0.65 + 0.75 * T.y);
          vec3 bark = uTree * vec3(0.75, 0.6, 0.5) * 0.7;
          vec3 tc = mix(mix(leaf, bark, T.z), uHaze, 0.16);
          col = mix(col, tc, T.x);
        }
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // ---- Grass field (based on "Grass Field" by Originkit) ----
  const FIELD_FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform vec3 uHaze;
    varying vec3 vCol;
    varying float vFog;
    void main() {
      gl_FragColor = vec4(mix(vCol, uHaze, vFog * 0.7), 1.0);
    }
  `;

  const HILL_GLSL = `
    uniform float uTerrain;
    float hill(vec2 b) {
      return uTerrain * (
            0.42 * sin(b.x * 0.155 + 0.6) * cos(b.y * 0.105)
          + 0.30 * sin(b.y * 0.185 + 1.1)
          - 0.10 * cos(b.x * 0.34 - b.y * 0.2)
      );
    }
  `;

  const HASH_GLSL = `
    float h21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 34.56);
      return fract(p.x * p.y);
    }
  `;

  // same camera for the ground, the blades and the fireflies
  const PROJECT_GLSL = `
    uniform float uAspect, uF, uPitch;
    uniform vec3 uEye;
    vec4 project(vec3 P, out float depth) {
      vec3 rel = P - uEye;
      float cp = cos(uPitch), sp = sin(uPitch);
      float wy = rel.y * cp - rel.z * sp;
      depth = max(-rel.y * sp - rel.z * cp, 0.05);
      return vec4(uF * rel.x / uAspect, uF * wy, 1.00334 * depth - 0.2003, depth);
    }
  `;

  const GROUND_VS = `
    precision highp float;
    attribute vec2 aXZ;
    uniform vec3 uBase;
    varying vec3 vCol;
    varying float vFog;
    ${HASH_GLSL}
    ${HILL_GLSL}
    ${PROJECT_GLSL}
    void main() {
      vec2 b = aXZ;
      float depth;
      gl_Position = project(vec3(b.x, hill(b) - 0.012, b.y), depth);
      float e = 0.55;
      vec3 n = normalize(vec3(hill(b - vec2(e, 0.0)) - hill(b + vec2(e, 0.0)), 2.0 * e,
                              hill(b - vec2(0.0, e)) - hill(b + vec2(0.0, e))));
      float lam = 0.42 + 0.58 * clamp(dot(n, normalize(vec3(-0.35, 0.80, 0.48))), 0.0, 1.0);
      vCol = uBase * (0.55 + 0.85 * lam) * (0.80 + 0.35 * h21(b * 1.7));
      vFog = clamp((depth - 12.0) / 40.0, 0.0, 1.0);
    }
  `;

  const BLADE_VS = `
    precision highp float;
    attribute vec2 aBase, aParam, aRand;
    uniform float uTime, uPushAmt, uReach, uHeight, uWind, uGust;
    uniform vec3 uBase, uTip, uFlower;
    uniform vec2 uPush, uWindDir;
    varying vec3 vCol;
    varying float vFog;
    ${HASH_GLSL}
    ${HILL_GLSL}
    ${PROJECT_GLSL}
    void main() {
      vec2 base = aBase;
      float v = aParam.x, side = aParam.y;

      float y0 = hill(base);
      float h = (0.16 + 0.20 * aRand.x) * uHeight;
      float ang = aRand.y * 6.2831853;
      vec2 lean = normalize(uWindDir + 0.55 * vec2(cos(ang), sin(ang)));

      float wind = sin(uTime * 1.25 + base.x * 0.55 + base.y * 0.30 + aRand.x * 6.28) * 0.5 + 0.5;
      float gust = 1.0 - uGust * 0.5 + uGust * 0.5 * sin(uTime * 0.42 - base.y * 0.16);
      float bend = (0.10 + 0.16 * wind) * gust * uWind;

      // grass parts around the mouse pointer
      vec2 dp = base - uPush;
      float dl = length(dp) + 1e-4;
      float push = uPushAmt * exp(-dl * dl / max(uReach, 0.05));

      vec2 off = lean * bend * v * v + (dp / dl) * push * v * v * 0.75;
      float drop = 1.0 - 0.30 * dot(off, off) / max(h * h, 1e-4);
      vec3 P = vec3(base.x + off.x, y0 + h * v * clamp(drop, 0.45, 1.0), base.y + off.y);

      vec2 perp = normalize(mix(vec2(1.0, 0.0), vec2(-lean.y, lean.x), 0.40));
      float wdt = (0.0080 + 0.0040 * aRand.y) * (1.0 - 0.88 * v);
      P.xz += perp * side * wdt;

      float depth;
      gl_Position = project(P, depth);

      vec3 nrm = normalize(vec3(lean.x * 0.55, 1.0, lean.y * 0.55));
      float lam = 0.34 + 0.66 * clamp(dot(nrm, normalize(vec3(-0.35, 0.80, 0.48))), 0.0, 1.0);
      vec3 c = mix(uBase, uTip, pow(v, 0.85));
      c *= 0.55 + 0.45 * lam;
      c *= 0.70 + 0.42 * h21(base * 3.1);
      c *= mix(0.42, 1.0, pow(v, 0.7));
      // a few wildflowers at the tips of the taller stems
      if (aRand.x > 0.965) c = mix(c, uFlower * (0.75 + 0.35 * lam), smoothstep(0.7, 0.95, v));
      vCol = c;
      vFog = clamp((depth - 12.0) / 40.0, 0.0, 1.0);
    }
  `;

  // Fireflies: soft glowing points drifting just above the grass at night
  const FIREFLY_VS = `
    precision highp float;
    attribute vec3 aSeed;
    uniform float uTime, uPx;
    varying float vGlow;
    ${PROJECT_GLSL}
    void main() {
      float t = uTime;
      float z = -(1.2 + aSeed.y * 14.0);
      float x = (aSeed.x * 2.0 - 1.0) * (2.0 + -z * 0.9) + sin(t * 0.23 + aSeed.y * 30.0) * 0.5;
      float y = 0.35 + 0.45 * aSeed.z + sin(t * 0.7 + aSeed.x * 20.0) * 0.12;
      float depth;
      gl_Position = project(vec3(x, y, z), depth);
      gl_PointSize = clamp(uPx * 70.0 / depth, 4.0, 22.0);
      vGlow = pow(0.5 + 0.5 * sin(t * (1.2 + aSeed.z) + aSeed.x * 40.0), 2.0);
    }
  `;

  const FIREFLY_FS = `
    precision mediump float;
    uniform float uNight;
    varying float vGlow;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float g = (exp(-dot(d, d) * 40.0) + exp(-dot(d, d) * 10.0) * 0.35) * vGlow * uNight * 1.4;
      gl_FragColor = vec4(vec3(1.0, 0.92, 0.5) * g, g);
    }
  `;

  // Ground: a grid spaced geometrically in depth, so cells stay even on screen
  function buildGround() {
    const NX = 72, NZ = 58, out = [];
    const gz = (i) => -(0.04 * Math.pow(46.0 / 0.04, i / NZ));
    for (let i = 0; i < NZ; i++) {
      const z0 = gz(i), z1 = gz(i + 1);
      // wide enough to reach past the screen edges even on ultra-wide monitors
      const s0 = 3.0 - z0 * 2.4, s1 = 3.0 - z1 * 2.4;
      for (let j = 0; j < NX; j++) {
        const t0 = (j / NX) * 2 - 1, t1 = ((j + 1) / NX) * 2 - 1;
        out.push(t0 * s0, z0, t1 * s0, z0, t0 * s1, z1, t0 * s1, z1, t1 * s0, z0, t1 * s1, z1);
      }
    }
    return new Float32Array(out);
  }

  // Blades spread evenly with low-discrepancy sequences; each blade is two
  // quads and a tip triangle. Any prefix of the list is still an even spread,
  // so drawing fewer blades just thins the field.
  function buildBlades(count, widthK) {
    const GOLDEN = 0.6180339887498949, SILVER = 0.41421356237309515, TRIBO = 0.7320508075688772;
    const shape = [[0, -1], [0, 1], [0.55, -1], [0.55, -1], [0, 1], [0.55, 1], [0.55, -1], [0.55, 1], [1, 0]];
    const base = new Float32Array(count * BLADE_VERTS * 2);
    const param = new Float32Array(count * BLADE_VERTS * 2);
    const rand = new Float32Array(count * BLADE_VERTS * 2);
    let vi = 0;
    for (let b = 0; b < count; b++) {
      const dist = 0.55 + 32.0 * Math.pow((b * GOLDEN) % 1, 1.75);
      const spread = 2.2 + dist * widthK;   // field half-width at this distance
      const x = ((b * SILVER) % 1) * 2 * spread - spread;
      const r0 = (b * TRIBO) % 1, r1 = (b * 0.5436890126920763) % 1;
      for (let k = 0; k < BLADE_VERTS; k++, vi++) {
        base[vi * 2] = x; base[vi * 2 + 1] = -dist;
        param[vi * 2] = shape[k][0]; param[vi * 2 + 1] = shape[k][1];
        rand[vi * 2] = r0; rand[vi * 2 + 1] = r1;
      }
    }
    return { base, param, rand };
  }

  function createLivingSky(container, onReady) {
    const canvas = el("canvas", { class: "sky-canvas", "data-engine": "landscape", "aria-hidden": "true" });
    const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 ||
      window.matchMedia("(max-width: 700px)").matches;
    // no antialiasing: on built-in graphics it costs ~7x the frame time; a sharper
    // canvas (higher pixel budget below) keeps the blades crisp instead
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: true, powerPreference: "low-power" });
    if (!gl) return null;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function link(vs, fs) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }
    let skyProg, groundProg, bladeProg, flyProg;
    try {
      skyProg = link(QUAD_VS, BACKDROP_FS);
      groundProg = link(GROUND_VS, FIELD_FS);
      bladeProg = link(BLADE_VS, FIELD_FS);
      flyProg = link(FIREFLY_VS, FIREFLY_FS);
    } catch (err) {
      console.warn("Landscape disabled:", err);
      return null;
    }

    // uniform locations belong to one program, so each program gets its own lookup
    function uniformer(prog) {
      const cache = {};
      return (name) => (name in cache ? cache[name] : (cache[name] = gl.getUniformLocation(prog, name)));
    }
    const su = uniformer(skyProg), gu = uniformer(groundProg), bu = uniformer(bladeProg), fu = uniformer(flyProg);

    function buffer(data) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }
    function attrib(loc, buf, size = 2) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }

    const quadBuf = buffer(new Float32Array([-1, -1, 3, -1, -1, 3]));
    const groundData = buildGround();
    const groundBuf = buffer(groundData);
    const groundCount = groundData.length / 2;

    // Quality: smaller or older devices start lighter, and any device that
    // struggles steps down on its own (frame rate, then blades, then resolution).
    // The field is spread as wide as the screen needs, with more blades on
    // wider screens so it stays just as dense.
    const BASE_BLADES = lowEnd ? 14000 : 26000;
    let bladeShare = 1;   // lowered step by step on slow devices
    let field = null;
    function ensureField(ar) {
      const k = Math.max(0.85, (ar / FIELD_FOCAL) * 1.12);
      if (field && Math.abs(field.k - k) / k < 0.08) return;
      const count = Math.round(BASE_BLADES * Math.min(k / 0.85, 2.4));
      const b = buildBlades(count, k);
      if (field) [field.base, field.param, field.rand].forEach((buf) => gl.deleteBuffer(buf));
      field = { k, count, base: buffer(b.base), param: buffer(b.param), rand: buffer(b.rand) };
    }
    let fps = lowEnd ? 30 : 60;
    const PIXEL_BUDGET = lowEnd ? 1000000 : 2400000;

    let fseed = 7;
    const frnd = () => { fseed = (fseed * 1664525 + 1013904223) >>> 0; return fseed / 4294967296; };
    const flyBuf = buffer(new Float32Array(FIREFLIES * 3).map(frnd));

    const attr = {
      sky: gl.getAttribLocation(skyProg, "aPos"),
      ground: gl.getAttribLocation(groundProg, "aXZ"),
      base: gl.getAttribLocation(bladeProg, "aBase"),
      param: gl.getAttribLocation(bladeProg, "aParam"),
      rand: gl.getAttribLocation(bladeProg, "aRand"),
      fly: gl.getAttribLocation(flyProg, "aSeed")
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let look = SKY_LOOKS[1];
    let scale = 1;
    let lastDraw = 0, slowFrames = 0, frameAvg = 1000 / fps;
    let lastRefresh = 0, refreshAvg = 1000 / 60, refreshCount = 0;
    let lastTick = performance.now();
    let clock = 0;
    let paused = false, looping = true;   // paused while the plain background is chosen
    let scrollingUntil = 0;
    window.addEventListener("scroll", () => { scrollingUntil = performance.now() + 250; }, { passive: true });
    // small or older devices also get a lighter frosted-glass blur from the start
    if (lowEnd) document.documentElement.classList.add("lite-glass");
    // clouds continue from where they would be right now, so every visit looks live
    let cloudT = (Date.now() / 1000 * 0.004) % 400;

    // mouse pointer, eased, for parting the grass
    const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: 0, onTarget: 0 };
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;   // don't fight with scrolling on phones
      ptr.tx = e.clientX / window.innerWidth;
      ptr.ty = e.clientY / window.innerHeight;
      ptr.onTarget = 1;
    }, { passive: true });
    document.addEventListener("pointerleave", () => { ptr.onTarget = 0; });
    window.addEventListener("blur", () => { ptr.onTarget = 0; });

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const s = Math.min(scale * dpr, Math.sqrt(PIXEL_BUDGET / (w * h)));
      canvas.width = Math.round(w * s);
      canvas.height = Math.round(h * s);
      ensureField(w / h);
      if (!paused) draw(performance.now());
    }

    function camera(u, ar) {
      gl.uniform1f(u("uAspect"), ar);
      gl.uniform1f(u("uF"), FIELD_FOCAL);
      gl.uniform3f(u("uEye"), 0, FIELD_EYE_Y, 0);
      gl.uniform1f(u("uPitch"), FIELD_PITCH);
    }

    function draw(now) {
      const still = reduceMotion.matches;
      const dt = Math.min(0.05, (now - lastTick) / 1000);
      lastTick = now;
      const breeze = 0.85 + 0.12 * Math.sin(clock * 0.13) + 0.08 * Math.sin(clock * 0.31 + 1.7);
      if (!still) {
        clock = (clock + dt) % 3600;
        cloudT = (cloudT + dt * 0.004 * look.clouds * breeze) % 400;
      }
      const t = still ? 30 : clock;
      const wind = look.wind * breeze;

      const bw = canvas.width, bh = canvas.height, ar = bw / bh;
      gl.viewport(0, 0, bw, bh);
      gl.clearColor(look.haze[0], look.haze[1], look.haze[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // 1. sky, clouds, hills and trees
      // on narrow screens, look towards the sun or moon so it stays in view
      const focus = ar < 1.2 ? look.focus * Math.min(1, (1.2 - ar) * 1.5) : 0;
      const light = look.sunAmt >= look.moonAmt ? look.sun : MOON;
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(skyProg);
      attrib(attr.sky, quadBuf);
      gl.uniform2f(su("uRes"), bw, bh);
      gl.uniform1f(su("uTime"), t);
      gl.uniform1f(su("uCloudT"), cloudT);
      gl.uniform1f(su("uHorizon"), FIELD_HORIZON);
      gl.uniform1f(su("uFocus"), focus);
      gl.uniform1f(su("uNight"), look.night);
      gl.uniform1f(su("uWind"), wind);
      gl.uniform1f(su("uCover"), look.cover);
      ["zenith", "horizon", "haze", "sunCol", "cloudLit", "cloudShade", "hills", "treeline", "tree"].forEach((k) => {
        const name = k === "horizon" ? "uHorizonCol" : "u" + k.charAt(0).toUpperCase() + k.slice(1);
        gl.uniform3fv(su(name), look[k]);
      });
      gl.uniform2fv(su("uSun"), look.sun);
      gl.uniform2fv(su("uMoon"), MOON);
      gl.uniform2fv(su("uLight"), light);
      gl.uniform1f(su("uSunAmt"), look.sunAmt);
      gl.uniform1f(su("uMoonAmt"), look.moonAmt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(attr.sky);

      // pointer ray -> ground plane, so the grass parts where the mouse is
      const k = 1 - Math.exp(-6 * dt);
      ptr.on += (ptr.onTarget - ptr.on) * k;
      ptr.x += ((ptr.onTarget > 0 ? ptr.tx : 0.5) - ptr.x) * k;
      ptr.y += ((ptr.onTarget > 0 ? ptr.ty : 0.5) - ptr.y) * k;
      const nx = (ptr.x * 2 - 1) * ar / FIELD_FOCAL, ny = ((1 - ptr.y) * 2 - 1) / FIELD_FOCAL;
      const cp = Math.cos(FIELD_PITCH), sp = Math.sin(FIELD_PITCH);
      const dy = ny * cp - sp, dz = -ny * sp - cp;
      let pushX = 0, pushZ = -999, amt = 0;
      if (dy < -1e-3) {
        const s = -FIELD_EYE_Y / dy;
        if (s > 0 && s < 42) { pushX = s * nx; pushZ = s * dz; amt = Math.min(1, ptr.on) * 1.2; }
      }

      // 2. ground and 3. grass blades
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);

      gl.useProgram(groundProg);
      attrib(attr.ground, groundBuf);
      camera(gu, ar);
      gl.uniform1f(gu("uTerrain"), FIELD_TERRAIN);
      gl.uniform3fv(gu("uBase"), look.base);
      gl.uniform3fv(gu("uHaze"), look.haze);
      gl.drawArrays(gl.TRIANGLES, 0, groundCount);
      gl.disableVertexAttribArray(attr.ground);

      gl.useProgram(bladeProg);
      attrib(attr.base, field.base);
      attrib(attr.param, field.param);
      attrib(attr.rand, field.rand);
      camera(bu, ar);
      gl.uniform1f(bu("uTime"), t);
      gl.uniform2f(bu("uPush"), pushX, pushZ);
      gl.uniform1f(bu("uPushAmt"), amt);
      gl.uniform1f(bu("uReach"), 1.57 * 1.35);
      gl.uniform1f(bu("uHeight"), 1.81);
      gl.uniform1f(bu("uWind"), wind * 1.15);
      gl.uniform1f(bu("uGust"), 0.9);
      gl.uniform2f(bu("uWindDir"), Math.cos(0.26), Math.sin(0.26));
      gl.uniform1f(bu("uTerrain"), FIELD_TERRAIN);
      gl.uniform3fv(bu("uBase"), look.base);
      gl.uniform3fv(bu("uTip"), look.tip);
      gl.uniform3fv(bu("uFlower"), look.flower);
      gl.uniform3fv(bu("uHaze"), look.haze);
      gl.drawArrays(gl.TRIANGLES, 0, Math.round(field.count * bladeShare) * BLADE_VERTS);
      [attr.base, attr.param, attr.rand].forEach((loc) => gl.disableVertexAttribArray(loc));

      // 4. fireflies (night only), glowing on top without hiding the grass
      if (look.night > 0.05) {
        gl.useProgram(flyProg);
        attrib(attr.fly, flyBuf, 3);
        camera(fu, ar);
        gl.uniform1f(fu("uTime"), t);
        gl.uniform1f(fu("uPx"), bh / 860);
        gl.uniform1f(fu("uNight"), look.night);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.POINTS, 0, FIREFLIES);
        gl.disable(gl.BLEND);
        gl.disableVertexAttribArray(attr.fly);
      }
    }

    function loop(now) {
      if (paused) { looping = false; return; }   // stop completely; resume() restarts
      requestAnimationFrame(loop);
      if (reduceMotion.matches) return;
      // Draw on every Nth screen refresh so the gaps between frames are always
      // equal (60 Hz: every refresh, 120/144 Hz: every 2nd) — no judder.
      const raw = now - lastRefresh;
      lastRefresh = now;
      if (raw > 0 && raw < 100) refreshAvg = refreshAvg * 0.95 + raw * 0.05;
      // while the page is scrolling, give the browser room: draw at most 30 fps
      const target = now < scrollingUntil ? Math.min(fps, 30) : fps;
      const every = Math.max(1, Math.round(1000 / target / refreshAvg));
      if (++refreshCount % every) return;
      const gap = now - lastDraw;
      // Struggling for ~2 seconds? Step down: 60 -> 30 fps, lighter glass blur,
      // fewer blades, then resolution.
      if (lastDraw && gap < 500) {
        frameAvg = frameAvg * 0.9 + gap * 0.1;
        if (frameAvg > every * refreshAvg * 1.35) {
          if (++slowFrames > 60) {
            slowFrames = 0;
            if (fps > 30) fps = 30;
            else if (!document.documentElement.classList.contains("lite-glass")) document.documentElement.classList.add("lite-glass");
            else if (bladeShare > 0.4) bladeShare *= 0.7;
            else if (scale > 0.55) { scale *= 0.8; resize(); }
            frameAvg = every * refreshAvg;
          }
        } else slowFrames = Math.max(0, slowFrames - 2);
      }
      lastDraw = now;
      draw(now);
    }

    container.append(canvas);
    resize();
    requestAnimationFrame(() => onReady && onReady());
    requestAnimationFrame(loop);

    window.addEventListener("resize", resize);
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); container.classList.remove("landscape-ready"); });

    return {
      // Show time of day `a` blended into `b` by f (0..1)
      set(a, b, f) {
        look = {};
        Object.keys(SKY_LOOKS[0]).forEach((key) => {
          const A = SKY_LOOKS[a][key], B = SKY_LOOKS[b][key];
          look[key] = Array.isArray(A) ? A.map((v, j) => v + (B[j] - v) * f) : A + (B - A) * f;
        });
        if (reduceMotion.matches && !paused) draw(performance.now());
      },
      // stop drawing entirely (plain background), and start again
      pause() { paused = true; },
      resume() {
        if (!paused) return;
        paused = false;
        lastTick = performance.now();
        lastDraw = 0;
        resize();
        if (!looping) { looping = true; requestAnimationFrame(loop); }
      }
    };
  }

  /* =======================================================
     2b. PIXELS (WebGL, three.js) — a voxel meadow seen from down
         in the grass: a square sun or moon, cube clouds drifting by,
         turf terraces and blocky hills on the horizon, and a field of
         block flowers and tall grass that leans as gusts roll across
         it and parts around the pointer. Its day follows the same
         clock and slider as the landscape.
         Based on "Still Sunset Meadow" (MeadowBlush) by Originkit.
     ======================================================= */
  const createPixelSky = (() => {
    let THREE = null;   // set once three.js has loaded

    // ── look (fixed: these are the picture, not knobs) ──
    const DEG = Math.PI / 180;
    const CAM_H = 1;          // eye height; everything is measured against it
    const REF_H = 0.47;       // the layout tables were measured with the horizon at 47 %
    const VOXEL = 0.036;      // grass voxel edge, in eye heights
    const CLOUD_D = 40;       // cloud depth: close enough that undersides show
    const STRIDE = 14;        // floats per instance: centre 3, size 3, colour 3 + tip, root x/z, height, kind
    const K_GRASS = 0, K_FLOWER = 1, K_BLOCK = 2, K_CLOUD = 3;

    // Settings (the component's panel, fixed to its preset)
    const OPTS = {
      flowers: 3.7, grass: 5, horizon: 50, seed: 7, voxelSize: 10,
      depthBlur: 4.9, haze: 5, hover: 10, wind: 10, speed: 10, cloudSpeed: 3, cloudDir: 1
    };

    const hex = (s) => {
      const n = parseInt(s.slice(1), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };
    const C = {
      sun: hex("#FFF7E8"),
      grassDark: hex("#172604"), grassMid: hex("#4A700E"), grassLight: hex("#8AAA18"), grassTip: hex("#CACC34"),
      rim: hex("#F4D040"),
      groundDark: hex("#162404"), groundMid: hex("#34500E"), groundFar: hex("#647616"), dapple: hex("#B09A1C"),
      dirt: hex("#74491E"), dirtDark: hex("#4E3212"), turf: hex("#6A8216"), turf2: hex("#A4A026"),
      stem: hex("#4A8C24"), leaf: hex("#2C5A16"),
      hazeGold: hex("#E2A832"), hazeSun: hex("#F7944A")
    };
    // sunset palette, and the noon and midnight palettes the day blends through
    const SUNSET_SKY = { top: hex("#E2A8AE"), horizon: hex("#F8A68E"), glow: hex("#FFCB8C") };
    const DAY_SKY = { top: hex("#5E9BE6"), horizon: hex("#BCD9F2"), glow: hex("#FFF4DC") };
    const NIGHT_SKY = { top: hex("#060A20"), horizon: hex("#1A2350"), glow: hex("#9DB0F0") };
    const LIGHT_DAY = [1.1, 1.1, 1.08], LIGHT_NIGHT = [0.22, 0.27, 0.46];
    const CLOUD_DAY = [1.04, 1.04, 1.04], CLOUD_NIGHT = [0.3, 0.34, 0.5];
    const FLOWER_COLS = ["#E0402C", "#F08030", "#F08AB0", "#D04A9A", "#3C6AE0", "#7A4AD0", "#F6F0EA", "#F2C83A"];

    // Flowers: [x, head y, cube, stem base y, petal, centre] — x as a share of
    // the width, y as a share of the height, cube in half-heights.
    const HERO_FLOWERS = [
      [0.118, 0.655, 0.04, 0.735, "#D8352A", "#F08030"],
      [0.03, 0.69, 0.036, 0.765, "#F07A30", "#F2C83A"],
      [0.3, 0.728, 0.05, 0.83, "#F6F0EE", "#F2C83A"],
      [0.847, 0.69, 0.022, 0.745, "#E0508A", "#F2C83A"],
      [0.905, 0.655, 0.038, 0.74, "#F0507A", "#F2C83A"],
      [0.935, 0.74, 0.046, 0.85, "#F6B83A", "#E09A2A"],
      [0.69, 0.79, 0.07, 0.975, "#FFF4EC", "#F4C24A"]
    ];
    const FRONT_FLOWERS = [
      [0.45, 1.0, 0.068, 1.16, "#E890B0", "#F2C83A"],
      [0.95, 0.965, 0.068, 1.16, "#F6C040", "#E09A2A"]
    ];
    const MID_FLOWERS = [
      [0.075, 0.603, 0.018, 0.64, "#D88AB8", "#F2C83A"],
      [0.45, 0.598, 0.021, 0.64, "#3A5AE0", "#F2C83A"],
      [0.67, 0.603, 0.018, 0.642, "#D83030", "#F2C83A"],
      [0.63, 0.632, 0.019, 0.672, "#F4F0EA", "#F2C83A"],
      [0.2, 0.62, 0.018, 0.66, "#F08030", "#F2C83A"],
      [0.88, 0.598, 0.016, 0.632, "#F2E6D2", "#F2C83A"],
      [0.94, 0.62, 0.016, 0.655, "#F2C83A", "#E86A2A"],
      [0.61, 0.567, 0.012, 0.592, "#E86A2A", "#F2C83A"],
      [0.4, 0.575, 0.013, 0.6, "#7A4AD0", "#F2C83A"]
    ];
    // Clouds: front-face blocks [x0, y0, x1, y1] around an anchor ax (share of the width)
    const CLOUDS = [
      { ax: 1, color: "#F8D4B8", blocks: [[0.83, 0.024, 1.04, 0.127], [0.74, 0.078, 0.8, 0.098], [0.69, 0.098, 0.83, 0.127], [0.615, 0.122, 0.82, 0.18], [0.82, 0.122, 0.995, 0.17], [0.67, 0.17, 0.99, 0.21]] },
      { ax: 0.3, color: "#F4B0BA", blocks: [[0.19, 0.255, 0.415, 0.288], [0.235, 0.243, 0.3, 0.256], [0.27, 0.232, 0.37, 0.256], [0.36, 0.246, 0.4, 0.256]] },
      { ax: 0.83, color: "#FAF2F2", blocks: [[0.7, 0.318, 0.965, 0.352], [0.72, 0.308, 0.79, 0.319], [0.76, 0.296, 0.86, 0.319], [0.86, 0.302, 0.93, 0.319], [0.93, 0.311, 0.952, 0.319]] }
    ];
    // extra clouds for wide screens, which would otherwise show empty sky
    const WIDE_CLOUDS = [
      { min: 1, def: 2, ax: 0.5, dy: -0.13, scale: 0.8 },
      { min: 1.5, def: 1, ax: 0.66, dy: 0.05, scale: 0.9 },
      { min: 2.2, def: 2, ax: 0.18, dy: -0.18, scale: 0.7 }
    ];

    // ── helpers ──
    const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const shade = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const blend3 = (a, b, c, wa, wb, wc) => [0, 1, 2].map((i) => a[i] * wa + b[i] * wb + c[i] * wc);
    function mulberry32(a) {
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    // vertical field of view: 50° in portrait, narrowing for wide screens
    function vfovFor(aspect) {
      const t = clamp((aspect - 0.6) / 1.4, 0, 1);
      return 50 - 14 * t * t * (3 - 2 * t);
    }
    // Where the day stands at an hour: 6 sunrise, 12 noon, 18 sunset, 0 midnight
    function dayAt(hour) {
      const th = ((hour - 6) / 24) * Math.PI * 2;
      const e = Math.sin(th);
      const day = smooth(0.12, 0.5, e);
      const gold = (1 - day) * smooth(-0.2, 0, e);
      return { th, e, day, gold, night: 1 - day - gold };
    }

    // ── scene build: every voxel as an instance ──
    function put(o, cx, cy, cz, sx, sy, sz, c, tip, rx, rz, h, kind) {
      o.push(cx, cy, cz, sx, sy, sz, c[0], c[1], c[2], tip, rx, rz, h, kind);
    }

    function buildMeadow(W, H, o) {
      const rnd = mulberry32(Math.round(clamp(o.seed, 0, 9999)) * 9973 + 17);
      const aspect = W / H;
      const h = clamp(o.horizon, 30, 70) / 100;
      const f = 0.5 / Math.tan((vfovFor(aspect) * DEG) / 2);
      const vk = Math.pow(2, (clamp(o.voxelSize, 0, 10) - 5) / 5);
      const v = VOXEL * vk;
      const dens = clamp(o.grass, 0, 10) / 5;
      const fd = clamp(o.flowers, 0, 10) / 5;
      const wk = Math.pow(Math.max(1, aspect / 0.5), 0.8);   // how many portrait frames wide

      // screen positions are in heights: x from 0 to aspect, y from 0 (top) to 1
      const toY = (fy) => (fy <= REF_H ? (fy * h) / REF_H : h + ((fy - REF_H) * (1 - h)) / (1 - REF_H));
      const depthAt = (y) => (f * CAM_H) / Math.max(1e-4, y - h);
      const wx = (x, d) => ((x - aspect / 2) / f) * d;
      const halfW = (d) => (aspect / 2 / f) * d;
      const heightAt = (y, d) => CAM_H - ((y - h) / f) * d;
      const len = (s, d) => (s / f) * d;

      const dBottom = depthAt(1);
      const main = [], soft = [], near = [], clouds = [];
      const pick = (d) => (d < dBottom * 0.94 ? near : d < dBottom * 1.3 ? soft : main);

      // grass blades: a stack of voxel cards, dark at the root, lit at the tip
      const blade = (out, x, d, c, n, bright, y0 = 0) => {
        const tone = bright ? 0.3 + rnd() * 0.7 : rnd();
        const body = mix(C.grassMid, C.grassLight, 0.1 + tone * 0.6);
        const slant = (rnd() - 0.5) * 0.5;
        for (let i = 0; i < n; i++) {
          const t = n > 1 ? i / (n - 1) : 1;
          let col = mix(C.grassDark, body, Math.min(1, 0.3 + t * 1.1));
          if (i === n - 1) col = mix(col, C.grassTip, 0.55);
          else if (i === n - 2) col = mix(col, C.grassTip, 0.2);
          const r = rnd();
          if (r < 0.18) col = shade(col, 0.78);
          else if (r < 0.28) col = mix(col, C.grassTip, 0.35);
          put(out, x + Math.round(i * slant) * c * 0.8, y0 + (i + 0.5) * c, -d, c * 0.8, c, c * 0.35, col, t, x, -d, (i + 0.5) * c, K_GRASS);
        }
      };

      // a strip of bare turf running into the field
      const pathX = 0.07 * dBottom, pathHalf = 0.17 * dBottom, pathEnd = dBottom / 0.39;
      const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28;

      if (dens > 0) {
        const fPx = f * Math.min(H, 900);
        const sq = Math.sqrt(dens);
        let d = dBottom * 0.6;
        while (d < 48) {
          const c = v * Math.max(1, d / 14);
          const step = Math.max(0.8 * c * d, (2 * d * d) / fPx) / sq;
          const sx = (c * 1.5) / sq;
          const hw = halfW(d) + c * 4;
          const q = d / dBottom;
          for (let x = -hw + rnd() * sx; x < hw; x += sx * (0.6 + rnd() * 0.8)) {
            const bd = d + rnd() * step;
            const clump = 0.5 + 0.5 * Math.sin(x * 2.3 + bd * 0.9 + ph1) * Math.sin(x * 0.7 - bd * 1.7 + ph2);
            const tall = (0.22 + 0.1 / q) * (0.55 + 0.45 * rnd()) * (0.7 + 0.6 * clump);
            let n = Math.max(1, Math.round(tall / c));
            if (bd < pathEnd * (0.85 + rnd() * 0.3) && Math.abs(x - pathX) < pathHalf + (rnd() - 0.5) * 0.12 * dBottom) {
              if (rnd() > 0.08) continue;
              n = 1 + Math.floor(rnd() * 2);
            }
            blade(pick(bd), x, bd, c, n, false);
          }
          d += step;
        }
        // big out-of-focus blades across the bottom edge
        const bokeh = (count, u0, u1, top0, top1) => {
          for (let i = 0; i < count; i++) {
            const bd = dBottom * (0.5 + rnd() * 0.35);
            const u = u0 + (u1 - u0) * ((i + rnd() * 0.8) / count);
            const c = len((0.05 + rnd() * 0.03) * 0.5 * vk, bd);
            const top = heightAt(toY(top0 + rnd() * (top1 - top0)), bd);
            blade(near, wx(u * aspect, bd), bd, c, Math.max(3, Math.round(top / c)), true);
          }
        };
        bokeh(Math.round(11 * wk * sq), 0, 0.3, 0.72, 0.8);
        bokeh(Math.round(8 * wk * sq), 0.66, 1, 0.84, 0.9);
      }

      // flowers: a stem, leaves, and a cross of petal cubes tipped toward the camera
      const flower = (x, d, stemH, s, petal, centre, leafy) => {
        const out = pick(d);
        const z = -d;
        const sw = s * 0.55;
        const n = Math.max(1, Math.round(stemH / sw));
        const step = stemH / n;
        const stem = mix(C.stem, C.grassDark, rnd() * 0.25);
        for (let i = 0; i < n; i++) {
          const y = (i + 0.5) * step;
          put(out, x, y, z, sw, step, sw, i % 2 ? shade(stem, 0.9) : stem, 0, x, z, y, K_FLOWER);
        }
        if (leafy && n > 2) {
          const a = Math.max(1, Math.floor(n * 0.3));
          const b = Math.max(a + 1, Math.floor(n * 0.55));
          put(out, x - sw * 1.05, (a + 0.5) * step, z, sw * 1.1, sw * 0.9, sw * 1.1, C.leaf, 0, x, z, (a + 0.5) * step, K_FLOWER);
          put(out, x + sw * 1.05, (b + 0.5) * step, z, sw * 1.1, sw * 0.9, sw * 1.1, C.leaf, 0, x, z, (b + 0.5) * step, K_FLOWER);
          for (let k = 0; k < 3; k++) {
            const lx = x + (k - 1) * sw * 1.15;
            const lz = z + (rnd() - 0.5) * sw * 1.4;
            const lh = sw * (0.9 + rnd() * 1.4);
            put(out, lx, lh / 2, lz, sw * 1.1, lh, sw * 1.1, shade(C.leaf, 0.75 + rnd() * 0.3), 0, x, z, lh / 2, K_FLOWER);
          }
        }
        const hc = stemH + s * 0.5;
        const pv = () => mix(petal, [1, 1, 1], (rnd() - 0.5) * 0.12);
        const r = s * 0.8, up = r * 0.82, fwd = r * 0.57;
        [[-r, 0, 0], [r, 0, 0], [0, up, -fwd], [0, -up, fwd]].forEach(([dx, dy, dz]) => {
          put(out, x + dx, hc + dy, z + dz, s, s, s, pv(), 0, x, z, hc, K_FLOWER);
        });
        put(out, x, hc + s * 0.05, z + s * 0.5, s * 0.75, s * 0.75, s * 0.75, centre, 0, x, z, hc, K_FLOWER);
      };
      const fromRow = (r, sizeK, leafy) => {
        const d = depthAt(toY(r[3]));
        const s = len(r[2] * 0.5 * sizeK, d);
        const stemH = Math.max(s * 1.5, heightAt(toY(r[1]), d) - s * 0.5);
        flower(wx(r[0] * aspect, d), d, stemH, s, hex(r[4]), hex(r[5]), leafy);
      };

      if (fd > 0) {
        HERO_FLOWERS.forEach((r) => fromRow(r, vk, true));
        FRONT_FLOWERS.forEach((r) => fromRow(r, vk, true));
        MID_FLOWERS.forEach((r) => fromRow(r, vk * 1.35, rnd() < 0.5));
        // wide screens repeat the hero row in the extra space
        for (let k = 1; k < Math.floor(aspect / 0.9); k++) {
          const r = HERO_FLOWERS[(k * 3) % HERO_FLOWERS.length];
          fromRow([(k + 0.4 + rnd() * 0.3) / Math.floor(aspect / 0.9 + 1), r[1], r[2] * 0.8, r[3], r[4], r[5]], vk, true);
        }
        const pickCol = () => FLOWER_COLS[Math.floor(rnd() * FLOWER_COLS.length)];
        const extra = Math.round(16 * fd * wk);
        for (let i = 0; i < extra; i++) {
          const yc = 0.56 + rnd() * 0.12;
          const col = pickCol();
          const cen = col === "#F2C83A" ? "#E86A2A" : "#F2C83A";
          fromRow([rnd(), yc, (0.011 + rnd() * 0.008) * (1 + (yc - 0.56) * 4), yc + 0.028 + rnd() * 0.02, col, cen], vk, rnd() < 0.4);
        }
        // specks of colour toward the horizon
        const tiny = Math.round(70 * fd * wk);
        for (let i = 0; i < tiny; i++) {
          const d = depthAt(toY(0.502 + Math.pow(rnd(), 1.6) * 0.1));
          const c = v * Math.max(1, d / 14);
          const x = (rnd() * 2 - 1) * halfW(d);
          const sh = c * (2 + Math.floor(rnd() * 4));
          put(main, x, sh / 2, -d, c * 0.5, sh, c * 0.5, C.stem, 0, x, -d, sh / 2, K_FLOWER);
          put(main, x, sh + c, -d, c * 2.2, c * 1.8, c * 2.2, hex(pickCol()), 0, x, -d, sh + c, K_FLOWER);
        }
      }

      // raised turf terraces on the horizon
      const terrace = (u0, u1, base, top, rows) => {
        const d = depthAt(toY(base));
        const tall = heightAt(toY(top), d);
        const B = tall / rows;
        const deep = B * 3;
        const x0 = u0 <= 0 ? -halfW(d) * 1.1 : wx(u0 * aspect, d);
        const x1 = u1 >= 1 ? halfW(d) * 1.1 : wx(u1 * aspect, d);
        for (let x = x0; x < x1; x += B) put(main, x + B / 2, tall / 2, -d - deep / 2, B, tall, deep, C.dirt, 8 / B, 0, 0, 0, K_BLOCK);
        const c = B / 5;
        for (let x = x0; x < x1; x += c * (0.5 + rnd() * 0.7)) {
          blade(main, x, d + rnd() * c * 3, c, 1 + Math.floor(rnd() * 5), true, tall);
          if (fd > 0 && rnd() < 0.05) {
            const fx = x + c / 2;
            put(main, fx, tall + c * 2.2, -d - c, c * 1.8, c * 1.5, c * 1.8, hex(FLOWER_COLS[Math.floor(rnd() * FLOWER_COLS.length)]), 0, fx, -d, c * 2.2, K_FLOWER);
          }
        }
      };
      terrace(0.62, 1, 0.494, 0.438, 4);
      terrace(0.48, 1, 0.508, 0.471, 2);
      terrace(0, 0.23, 0.51, 0.476, 2);

      // blocky far hills on the skyline
      {
        const d = 170, hw = halfW(d) * 1.1, B = 2.4;
        for (let x = -hw; x < hw; x += B) {
          const u = (x + hw) / (2 * hw);
          const lift = Math.max(0, 1 - u * 1.8);
          let rows = 1 + (Math.sin(x * 0.09 + ph1) + rnd() * 0.8 > 0.6 ? 1 : 0);
          if (rnd() < 0.06 + lift * 0.2) rows += 1;
          const tall = rows * B;
          put(main, x + B / 2, tall / 2, -d - rnd() * 10, B, tall, B * 3, C.dirt, 8 / B, 0, 0, 0, K_BLOCK);
        }
      }

      // clouds: each block carries its cloud's centre and drift rate,
      // so the shader slides a whole cloud and wraps it round off-screen
      let cloudWide = 0;
      const cloud = (def, ax, dy, scale) => {
        const cx = ax * aspect;
        const rate = 0.85 + rnd() * 0.3;
        const col = hex(def.color);
        const rects = def.blocks.map((b) => [
          cx + (b[0] - def.ax) * 0.5 * scale, toY(b[1] + dy),
          cx + (b[2] - def.ax) * 0.5 * scale, toY(b[3] + dy)
        ]);
        const x0 = Math.min(...rects.map((r) => r[0]));
        const x1 = Math.max(...rects.map((r) => r[2]));
        const span = len(x1 - x0, CLOUD_D);
        const mid = wx((x0 + x1) / 2, CLOUD_D);
        cloudWide = Math.max(cloudWide, span);
        rects.forEach((r) => {
          const xa = wx(r[0], CLOUD_D), xb = wx(r[2], CLOUD_D);
          const yt = heightAt(r[1], CLOUD_D), yb = heightAt(r[3], CLOUD_D);
          const dz = span * (0.6 + rnd() * 0.5);
          put(clouds, (xa + xb) / 2, (yt + yb) / 2, -CLOUD_D - dz / 2, xb - xa, yt - yb, dz, col, 0, mid, rate, 0, K_CLOUD);
        });
      };
      CLOUDS.forEach((def) => cloud(def, def.ax, 0, 1));
      WIDE_CLOUDS.forEach((w) => { if (aspect >= w.min) cloud(CLOUDS[w.def], w.ax, w.dy, w.scale); });

      const cloudHalf = halfW(CLOUD_D);
      return { main, soft, clouds, near, tile: v * 1.6, cloudHalf, cloudWrap: cloudHalf + cloudWide * 0.6 };
    }

    // ── shaders ──
    const NOISE = `
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
    `;
    // shared tail of every lit fragment: the hour's light, then haze
    const LIGHT = `
      uniform vec3 uGlow;
      uniform vec3 uLight;
      uniform float uKeyDir;
      uniform vec3 uHazeA;
      uniform vec3 uHazeB;
      uniform float uHazeK;
      uniform vec2 uSunNdc;
      uniform float uAspect;
      float sunNear(vec2 ndc) { return exp(-length((ndc - uSunNdc) * vec2(uAspect, 1.0)) * 1.3); }
      vec3 hazeOf(vec3 col, float depth, float sunP) {
        float fog = 1.0 - exp(-depth * uHazeK);
        return mix(col, mix(uHazeA, uHazeB, sunP), fog);
      }
    `;

    const VOXEL_VERT = `
      attribute vec3 aCenter;
      attribute vec3 aSize;
      attribute vec4 aColor;
      attribute vec4 aBend;
      uniform float uTime;
      uniform float uWind;
      uniform float uAspect;
      uniform sampler2D uPush;
      uniform float uCloudShift;
      uniform float uCloudWrap;
      varying vec3 vColor;
      varying vec3 vN;
      varying vec3 vLocal;
      varying vec3 vSize;
      varying float vTip;
      varying float vKind;
      varying float vDepth;
      varying vec3 vClip;
      void main() {
        float kind = aBend.w;
        vec3 p = aCenter + position * aSize;
        if (kind < 1.5) {
          // grass and flowers shear from the root, so a blade bends in voxel steps
          float h = aBend.z;
          vec2 r = aBend.xy;
          float s = sin(uTime * 0.7 - r.x * 0.32 - r.y * 0.04);
          float gust = s > 0.0 ? s * s * s : 0.0;
          float sway = sin(uTime * 2.1 + r.x * 3.7 + r.y * 2.9);
          float lean = uWind * (0.11 * gust + 0.022 * sway);
          // the pointer's lean, from the spring grid at this place on screen
          vec4 rc = projectionMatrix * viewMatrix * vec4(r.x, h, r.y, 1.0);
          lean += texture2D(uPush, rc.xy / rc.w * 0.5 + 0.5).r;
          p.x += lean * h;
          p.y -= 0.5 * lean * lean * h;
        } else if (kind > 2.5) {
          // slide the whole cloud by its centre and wrap it round off-screen
          float cx = aBend.x;
          float nx = mod(cx + uCloudShift * aBend.y + uCloudWrap, 2.0 * uCloudWrap) - uCloudWrap;
          p.x += nx - cx;
        }
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vColor = aColor.rgb;
        vTip = aColor.a;
        vKind = kind;
        vN = normal;
        vLocal = position;
        vSize = aSize;
        vDepth = -mv.z;
        vClip = gl_Position.xyw;
      }
    `;

    const VOXEL_FRAG = `
      uniform vec3 uRim;
      uniform float uRimK;
      uniform vec3 uCloudLight;
      uniform float uCloudWhite;
      uniform vec3 uDirt;
      uniform vec3 uDirt2;
      uniform vec3 uTurf;
      uniform vec3 uTurf2;
      varying vec3 vColor;
      varying vec3 vN;
      varying vec3 vLocal;
      varying vec3 vSize;
      varying float vTip;
      varying float vKind;
      varying float vDepth;
      varying vec3 vClip;
      ${NOISE}
      ${LIGHT}
      void main() {
        vec3 n = vN;
        vec3 col = vColor;
        float sunP = sunNear(vClip.xy / vClip.z);
        if (vKind > 2.5) {
          // clouds: lit from below and from the sun's side; peach at sunset, white by day
          col = mix(col, vec3(1.0), uCloudWhite);
          vec3 top = mix(col, vec3(1.0), 0.45);
          vec3 under = col * mix(vec3(0.88, 0.66, 0.56), vec3(0.86, 0.88, 0.94), uCloudWhite);
          float lit = 0.5 + 0.5 * n.x * uKeyDir;
          if (n.y < -0.5) col = under;
          else if (abs(n.x) > 0.5) col = mix(mix(col, under, 0.5), mix(col, top, 0.4), lit);
          else col = mix(mix(col, under, 0.3), mix(col, top, 0.3), vLocal.y + 0.5);
          gl_FragColor = vec4(mix(col * uCloudLight, uHazeA, 0.08), 1.0);
          return;
        }
        if (vKind > 1.5) {
          // turf blocks: 8 x 8 texels, dirt with a ragged grass lip
          vec3 lp = (vLocal + 0.5) * vSize * vTip;
          vec2 uv = abs(n.y) > 0.5 ? lp.xz : (abs(n.x) > 0.5 ? lp.zy : lp.xy);
          vec2 tx = floor(uv);
          float hs = h21(tx + n.xz * 31.0);
          float lip = 1.0 + floor(h21(vec2(tx.x, 7.0)) * 2.5);
          bool turf = n.y > 0.5 || (vSize.y * vTip - lp.y) < lip;
          col = turf ? mix(uTurf, uTurf2, hs) : mix(uDirt, uDirt2, hs);
        }
        // backlit: faces toward the camera in shade, tops and the sun side catch the light
        float side = abs(n.x) > 0.5 ? 0.5 + 0.5 * n.x * uKeyDir : 0.0;
        float face = n.y > 0.5 ? 0.95 : (abs(n.x) > 0.5 ? mix(0.55, 0.88, side) : 0.68);
        col *= face;
        col = mix(col, col * uGlow * 1.3, max(n.y, 0.0) * 0.2 + side * 0.25);
        col *= uLight;
        // backlight through the grass tips
        if (vKind < 0.5) col += uRim * uRimK * pow(vTip, 2.0) * (0.04 + 0.3 * sunP + 0.5 * smoothstep(5.0, 25.0, vDepth));
        gl_FragColor = vec4(hazeOf(col, vDepth, sunP), 1.0);
      }
    `;

    const GROUND_VERT = `
      varying vec3 vW;
      varying float vDepth;
      varying vec3 vClip;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        vDepth = -mv.z;
        vClip = gl_Position.xyw;
      }
    `;

    const GROUND_FRAG = `
      uniform float uTile;
      uniform vec3 uGDark;
      uniform vec3 uGMid;
      uniform vec3 uGFar;
      uniform vec3 uDapple;
      varying vec3 vW;
      varying float vDepth;
      varying vec3 vClip;
      ${NOISE}
      ${LIGHT}
      void main() {
        float d = -vW.z;
        vec2 cell = floor(vW.xz / uTile);
        float hs = h21(cell);
        float chk = mod(cell.x + cell.y, 2.0);
        // turf tiles: a soft checker with pools of low sun across them
        vec3 tile = mix(uGDark, uGMid, chk * 0.45 + hs * 0.55);
        float dap = smoothstep(0.5, 0.68, vn(cell * 0.16 + 11.0));
        tile = mix(tile, uDapple * (0.75 + 0.45 * hs), dap * 0.6);
        vec3 far = mix(uGMid, uGFar, smoothstep(3.0, 30.0, d));
        vec3 col = mix(far, tile, clamp(1.4 - d / 14.0, 0.0, 1.0));
        col = mix(col, col * uGlow * 1.3, 0.25) * uLight;
        float sunP = sunNear(vClip.xy / vClip.z);
        gl_FragColor = vec4(hazeOf(col, vDepth, sunP), 1.0);
      }
    `;

    const SCREEN_VERT = `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `;

    const SKY_FRAG = `
      uniform float uAspect;
      uniform float uHy;
      uniform vec3 uTop;
      uniform vec3 uHor;
      uniform vec3 uGlow;
      uniform vec3 uSun;
      uniform vec2 uSunPos;
      uniform float uSunSize;
      uniform float uSunK;
      uniform vec2 uMoonPos;
      uniform float uMoonK;
      uniform float uGold;
      uniform float uNight;
      uniform float uTime;
      uniform float uClock;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = vec2(vUv.x * uAspect, 1.0 - vUv.y);
        float t = clamp(p.y / uHy, 0.0, 1.0);
        vec3 peach = mix(mix(uTop, uHor, 0.5), uGlow, 0.12 * uGold);
        vec3 c = mix(uTop, peach, smoothstep(0.0, 0.42, t));
        c = mix(c, uHor, smoothstep(0.5, 0.95, t));
        // cooler mauve toward the top, away from the setting sun
        c = mix(c, c * vec3(0.95, 0.97, 1.06), (1.0 - t) * vUv.x * 0.7 * uGold);
        vec2 q = p - uSunPos;
        float g1 = exp(-dot(q * vec2(4.0, 6.0), q * vec2(4.0, 6.0)));
        float g2 = exp(-length(q * vec2(1.6, 3.0)) * 3.2);
        // the coral band low on the right, away from the sun
        float pinkB = smoothstep(0.62, 0.8, t) * (1.0 - smoothstep(0.9, 1.0, t)) * smoothstep(0.25, 0.9, vUv.x) * uGold;
        c = mix(c, mix(uHor, vec3(0.96, 0.56, 0.58), 0.45), pinkB * 0.6);
        c = mix(c, uGlow, clamp((g1 * 0.6 + g2 * 0.3) * uSunK, 0.0, 1.0));
        c = mix(c, mix(uGlow, uSun, 0.6), exp(-length(q * vec2(1.0, 1.7)) * 10.0) * 0.85 * uSunK);
        // square stars, twinkling, thinning toward the skyline
        vec2 sg = p * 110.0;
        vec2 cell = floor(sg);
        float hs = h21(cell);
        vec2 sd = abs(fract(sg) - (vec2(h21(cell + 3.1), h21(cell + 7.7)) * 0.6 + 0.2));
        float star = step(0.982, hs) * step(max(sd.x, sd.y), 0.07 + 0.09 * h21(cell + 1.7));
        star *= 0.55 + 0.45 * sin(uClock * (1.5 + hs * 3.0) + hs * 40.0);
        c += vec3(0.92, 0.95, 1.0) * star * uNight * (1.0 - smoothstep(0.55, 0.95, t));
        // thin wisps stretched along the horizon
        vec2 sp = vec2(p.x * 1.3 + uTime * 0.004, p.y * 15.0);
        float n = fbm(sp + fbm(sp * 0.5) * 1.6);
        float band = smoothstep(0.12, 0.3, t) * (1.0 - smoothstep(0.86, 1.0, t));
        vec3 wisp = mix(mix(uHor, vec3(1.0, 0.88, 0.8), 0.45), uGlow, g2);
        c = mix(c, wisp, smoothstep(0.55, 0.8, n) * band * 0.4 * (1.0 - 0.7 * uNight));
        // the square moon, with a few darker texels for its seas
        vec2 mq = p - uMoonPos;
        vec2 msq = abs(mq) - vec2(uSunSize * 0.42);
        float mbox = max(msq.x, msq.y);
        float moonM = (1.0 - smoothstep(-0.0015, 0.0015, mbox)) * uMoonK;
        float sea = step(0.7, h21(floor((mq / (uSunSize * 0.84) + 0.5) * 6.0) + 5.0)) * 0.16;
        c += vec3(0.55, 0.65, 1.0) * exp(-max(mbox, 0.0) / 0.03) * 0.25 * uMoonK;
        c = mix(c, vec3(0.9, 0.93, 1.0) - sea, moonM);
        // the square sun
        vec2 sq = abs(q) - vec2(uSunSize * 0.5);
        float box = max(sq.x, sq.y);
        float sunM = (1.0 - smoothstep(-0.0015, 0.0015, box)) * uSunK;
        c += uGlow * exp(-max(box, 0.0) / 0.014) * 0.35 * uSunK;
        c = mix(c, uSun, sunM);
        c = mix(c, mix(uHor, uGlow, 0.5), step(uHy, p.y));
        c += (h21(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(c, 1.0);
      }
    `;

    const BLUR_FRAG = `
      uniform sampler2D tMap;
      uniform vec2 uStep;
      varying vec2 vUv;
      void main() {
        vec4 s = vec4(0.0);
        float w = 0.0;
        for (int i = -6; i <= 6; i++) {
          float fi = float(i);
          float k = exp(-fi * fi / 18.0);
          s += texture2D(tMap, vUv + uStep * fi) * k;
          w += k;
        }
        gl_FragColor = s / w;
      }
    `;

    const COPY_FRAG = `
      uniform sampler2D tMap;
      varying vec2 vUv;
      void main() { gl_FragColor = texture2D(tMap, vUv); }
    `;

    // sun bloom over everything, and a warm vignette, in one premultiplied pass
    const POST_FRAG = `
      uniform float uAspect;
      uniform float uHy;
      uniform vec2 uSunPos;
      uniform vec2 uMoonPos;
      uniform float uMoonK;
      uniform vec3 uGlow;
      uniform float uGlowK;
      varying vec2 vUv;
      void main() {
        vec2 p = vec2(vUv.x * uAspect, 1.0 - vUv.y);
        vec2 q = p - uSunPos;
        float r = length(q * vec2(0.8, 1.0));
        float g = 0.28 * exp(-r * r / 0.004) + 0.12 * exp(-r / 0.12)
                + 0.18 * exp(-abs(p.y - uHy) / 0.025) * exp(-abs(q.x) / 0.35) * exp(-max(abs(q.y) - 0.08, 0.0) / 0.1);
        vec2 mq = p - uMoonPos;
        float mr = length(mq);
        float gm = (0.16 * exp(-mr * mr / 0.003) + 0.05 * exp(-mr / 0.1)) * uMoonK;
        vec3 glow = uGlow * g * uGlowK + vec3(0.55, 0.65, 1.0) * gm;
        vec2 v = vUv - 0.5;
        float vig = smoothstep(0.35, 0.95, length(v * vec2(1.0, 1.15)) * 1.2) * 0.14;
        gl_FragColor = vec4(glow * (1.0 - vig) + vec3(0.12, 0.03, 0.0) * vig, vig);
      }
    `;

    // box faces: +x, -x, +y, -y, +z, -z; the camera only ever sees some of them
    const FACES_GROUNDED = [0, 1, 2, 4];
    const FACES_ALOFT = [0, 1, 3, 4];

    function instanced(base, faces, data) {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute("position", base.getAttribute("position").clone());
      g.setAttribute("normal", base.getAttribute("normal").clone());
      const idx = base.getIndex().array;
      const sub = [];
      faces.forEach((face) => { for (let i = 0; i < 6; i++) sub.push(idx[face * 6 + i]); });
      g.setIndex(sub);
      const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(data), STRIDE);
      g.setAttribute("aCenter", new THREE.InterleavedBufferAttribute(ib, 3, 0));
      g.setAttribute("aSize", new THREE.InterleavedBufferAttribute(ib, 3, 3));
      g.setAttribute("aColor", new THREE.InterleavedBufferAttribute(ib, 4, 6));
      g.setAttribute("aBend", new THREE.InterleavedBufferAttribute(ib, 4, 10));
      g.instanceCount = data.length / STRIDE;
      return g;
    }

    // The pointer's effect on the grass: a coarse grid of damped springs,
    // so the grass lags, overshoots and wobbles back after the pointer moves on.
    const PUSH_ROWS = 28, PUSH_HZ = 1.4, PUSH_ZETA = 0.22;

    return function create(container, onReady) {
      const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 ||
        window.matchMedia("(max-width: 700px)").matches;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
      // the hour shown glides toward the hour asked for (clock, slider, buttons)
      const state = { target: 18, hour: null, paused: false, looping: false, ready: false, draw: null };
      let scrollingUntil = 0;
      window.addEventListener("scroll", () => { scrollingUntil = performance.now() + 250; }, { passive: true });

      loadThree()
        .then((T) => { THREE = T; start(); })
        .catch((err) => console.warn("Pixels background unavailable:", err));

      function start() {
        let renderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, alpha: false, powerPreference: "low-power" });
        } catch (err) {
          console.warn("Pixels background unavailable:", err);
          return;
        }
        const canvas = renderer.domElement;
        canvas.className = "sky-canvas";
        canvas.dataset.engine = "pixels";
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.display = "";   // three.js sets display:block, which would beat the stylesheet hiding it
        renderer.autoClear = false;
        const webgl2 = renderer.capabilities.isWebGL2;

        const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 8000);
        camera.position.set(0, CAM_H, 0);
        const screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const vec3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);
        const setV = (u, c) => u.value.set(c[0], c[1], c[2]);

        const shared = {
          uTime: { value: 0 },
          uWind: { value: 1 },
          uAspect: { value: 1 },
          uGlow: { value: new THREE.Vector3() },
          uLight: { value: new THREE.Vector3(1, 1, 1) },
          uKeyDir: { value: -1 },
          uHazeA: { value: new THREE.Vector3() },
          uHazeB: { value: new THREE.Vector3() },
          uHazeK: { value: 0.0085 },
          uSunNdc: { value: new THREE.Vector2() }
        };
        const voxelMat = new THREE.ShaderMaterial({
          vertexShader: VOXEL_VERT,
          fragmentShader: VOXEL_FRAG,
          uniforms: Object.assign({}, shared, {
            uPush: { value: null },
            uCloudShift: { value: 0 },
            uCloudWrap: { value: 100 },
            uRim: { value: vec3(C.rim) },
            uRimK: { value: 1 },
            uCloudLight: { value: new THREE.Vector3(1, 1, 1) },
            uCloudWhite: { value: 0 },
            uDirt: { value: vec3(C.dirt) },
            uDirt2: { value: vec3(C.dirtDark) },
            uTurf: { value: vec3(C.turf) },
            uTurf2: { value: vec3(C.turf2) }
          })
        });
        const groundMat = new THREE.ShaderMaterial({
          vertexShader: GROUND_VERT,
          fragmentShader: GROUND_FRAG,
          uniforms: Object.assign({}, shared, {
            uTile: { value: VOXEL * 1.6 },
            uGDark: { value: vec3(C.groundDark) },
            uGMid: { value: vec3(C.groundMid) },
            uGFar: { value: vec3(C.groundFar) },
            uDapple: { value: vec3(C.dapple) }
          })
        });
        const screenMat = (fragmentShader, uniforms, overlay) => new THREE.ShaderMaterial({
          vertexShader: SCREEN_VERT, fragmentShader, uniforms,
          depthTest: false, depthWrite: false,
          transparent: !!overlay, premultipliedAlpha: !!overlay
        });
        const skyMat = screenMat(SKY_FRAG, {
          uAspect: shared.uAspect,
          uGlow: shared.uGlow,
          uTime: shared.uTime,
          uClock: { value: 0 },
          uHy: { value: 0.47 },
          uTop: { value: new THREE.Vector3() },
          uHor: { value: new THREE.Vector3() },
          uSun: { value: vec3(C.sun) },
          uSunPos: { value: new THREE.Vector2() },
          uSunSize: { value: 0.065 },
          uSunK: { value: 1 },
          uMoonPos: { value: new THREE.Vector2() },
          uMoonK: { value: 0 },
          uGold: { value: 1 },
          uNight: { value: 0 }
        });
        const blurMat = screenMat(BLUR_FRAG, { tMap: { value: null }, uStep: { value: new THREE.Vector2() } });
        const copyMat = screenMat(COPY_FRAG, { tMap: { value: null } }, true);
        const postMat = screenMat(POST_FRAG, {
          uAspect: shared.uAspect,
          uGlow: shared.uGlow,
          uHy: skyMat.uniforms.uHy,
          uSunPos: skyMat.uniforms.uSunPos,
          uMoonPos: skyMat.uniforms.uMoonPos,
          uMoonK: skyMat.uniforms.uMoonK,
          uGlowK: { value: 1 }
        }, true);

        const tri = new THREE.BufferGeometry();
        tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        const screen = new THREE.Mesh(tri, copyMat);
        screen.frustumCulled = false;
        const screenScene = new THREE.Scene();
        screenScene.add(screen);

        const skyMesh = new THREE.Mesh(tri, skyMat);
        skyMesh.frustumCulled = false;
        skyMesh.renderOrder = -1;
        const groundGeo = new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2).translate(0, 0, -3950);
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.frustumCulled = false;

        const mainScene = new THREE.Scene();
        mainScene.add(skyMesh, ground);
        const softScene = new THREE.Scene();
        const nearScene = new THREE.Scene();
        const box = new THREE.BoxGeometry(1, 1, 1);
        let meshes = [];

        // two blurred layers: a softly blurred band in front of focus, a heavily blurred foreground
        const softRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
        const softTmp = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
        const nearRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
        const nearTmp = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });

        // ── pointer: parts the grass (mouse only, so it never fights scrolling) ──
        const pointer = { x: 0, y: 0, sx: 0, sy: 0, vx: 0, inside: false, down: false, over: 0, press: 0 };
        let gw = 0, lean = new Float32Array(0), vel = new Float32Array(0), half = new Uint16Array(0);
        let pushTex = null, calm = false;
        const noPush = new THREE.DataTexture(new Uint8Array(4), 1, 1);
        noPush.needsUpdate = true;
        voxelMat.uniforms.uPush.value = noPush;
        const sizeGrid = (aspect) => {
          if (!webgl2) return;   // half-float textures need WebGL 2; the grass still sways without it
          const w = Math.round(clamp(PUSH_ROWS * aspect, 8, 96));
          if (w === gw) return;
          gw = w;
          lean = new Float32Array(gw * PUSH_ROWS);
          vel = new Float32Array(gw * PUSH_ROWS);
          half = new Uint16Array(gw * PUSH_ROWS);
          if (pushTex) pushTex.dispose();
          pushTex = new THREE.DataTexture(half, gw, PUSH_ROWS, THREE.RedFormat, THREE.HalfFloatType);
          pushTex.minFilter = THREE.LinearFilter;
          pushTex.magFilter = THREE.LinearFilter;
          pushTex.needsUpdate = true;
          voxelMat.uniforms.uPush.value = pushTex;
          calm = false;
        };
        const stepPush = (dt, hk, aspect) => {
          const kf = 1 - Math.exp(-dt / 0.06);
          const nx = pointer.sx + (pointer.x - pointer.sx) * kf;
          const ny = pointer.sy + (pointer.y - pointer.sy) * kf;
          const vx = dt > 0 ? (nx - pointer.sx) / dt : 0;
          pointer.vx += (vx - pointer.vx) * (1 - Math.exp(-dt / 0.08));
          pointer.sx = nx;
          pointer.sy = ny;
          const amp = pointer.over * hk;
          if (!pushTex || (calm && amp < 1e-3)) return;
          const R = 0.22 + 0.12 * pointer.press;   // pressing parts a wider swathe
          const inv = 1 / (R * R);
          const part = 0.2 * (1 + 0.8 * pointer.press);
          const sweep = clamp(pointer.vx * aspect * 0.035, -0.22, 0.22);
          const w = PUSH_HZ * Math.PI * 2;
          const steps = Math.max(1, Math.ceil(dt * 120));
          const hs = dt / steps;
          let energy = 0;
          for (let j = 0; j < PUSH_ROWS; j++) {
            const dy = ((j + 0.5) / PUSH_ROWS) * 2 - 1 - ny;
            for (let i = 0; i < gw; i++) {
              const k = j * gw + i;
              let target = 0;
              if (amp > 1e-3) {
                const dx = (((i + 0.5) / gw) * 2 - 1 - nx) * aspect;
                const fk = Math.exp(-(dx * dx + dy * dy) * inv) * amp;
                target = fk * ((part * dx) / Math.sqrt(dx * dx + 0.004) + sweep);
              }
              let x = lean[k], v = vel[k];
              for (let s = 0; s < steps; s++) {
                v += (w * w * (target - x) - 2 * PUSH_ZETA * w * v) * hs;
                x += v * hs;
              }
              lean[k] = x;
              vel[k] = v;
              half[k] = THREE.DataUtils.toHalfFloat(x);
              energy += Math.abs(x) + Math.abs(v);
            }
          }
          pushTex.needsUpdate = true;
          calm = energy < 1e-4 * gw * PUSH_ROWS;
        };
        window.addEventListener("pointermove", (e) => {
          if (e.pointerType === "touch") return;
          pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
          pointer.y = 1 - (e.clientY / window.innerHeight) * 2;
          // arriving from outside is not a sweep: start the lagged point here
          if (!pointer.inside) { pointer.sx = pointer.x; pointer.sy = pointer.y; pointer.vx = 0; }
          pointer.inside = true;
        }, { passive: true });
        window.addEventListener("pointerdown", (e) => { if (e.pointerType !== "touch") pointer.down = true; }, { passive: true });
        window.addEventListener("pointerup", () => { pointer.down = false; }, { passive: true });
        document.addEventListener("pointerleave", () => { pointer.inside = false; });
        window.addEventListener("blur", () => { pointer.inside = false; });

        // ── size and quality ──
        // Smaller or older devices start lighter; a device that struggles steps
        // down on its own: 60 -> 30 fps, lighter glass, no depth blur, resolution.
        const PIXEL_BUDGET = lowEnd ? 1000000 : 2400000;
        let fps = lowEnd ? 30 : 60, scale = 1, blurOn = !lowEnd;
        let W = 0, H = 0, pr = 1;
        function resize() {
          W = window.innerWidth;
          H = window.innerHeight;
          pr = Math.min(scale * Math.min(window.devicePixelRatio || 1, 2), Math.sqrt(PIXEL_BUDGET / (W * H)));
          renderer.setPixelRatio(pr);
          renderer.setSize(W, H, false);
          const fw = Math.round(W * pr), fh = Math.round(H * pr);
          softRT.setSize(fw, fh);
          softTmp.setSize(fw, fh);
          nearRT.setSize(Math.ceil(fw / 2), Math.ceil(fh / 2));
          nearTmp.setSize(Math.ceil(fw / 2), Math.ceil(fh / 2));
          sizeGrid(W / H);
        }
        resize();
        window.addEventListener("resize", resize);

        let builtKey = "", builtAt = -1e9;
        let built = { aspect: 1, h: REF_H, cloudHalf: 1, cloudWrap: 100 };
        const opts = Object.assign({}, OPTS, { grass: lowEnd ? 3.5 : OPTS.grass });
        function rebuild(key, now) {
          const b = buildMeadow(W, H, opts);
          meshes.forEach((m) => { m.removeFromParent(); m.geometry.dispose(); });
          meshes = [
            new THREE.Mesh(instanced(box, FACES_GROUNDED, b.main), voxelMat),
            new THREE.Mesh(instanced(box, FACES_GROUNDED, b.soft), voxelMat),
            new THREE.Mesh(instanced(box, FACES_ALOFT, b.clouds), voxelMat),
            new THREE.Mesh(instanced(box, FACES_GROUNDED, b.near), voxelMat)
          ];
          meshes.forEach((m) => { m.frustumCulled = false; });
          mainScene.add(meshes[0], meshes[2]);
          softScene.add(meshes[1]);
          nearScene.add(meshes[3]);
          groundMat.uniforms.uTile.value = b.tile;
          built = { aspect: W / H, h: clamp(opts.horizon, 30, 70) / 100, cloudHalf: b.cloudHalf, cloudWrap: b.cloudWrap };
          builtKey = key;
          builtAt = now;
        }

        function blur(src, tmp, px) {
          const k = px / 6;
          screen.material = blurMat;
          blurMat.uniforms.tMap.value = src.texture;
          blurMat.uniforms.uStep.value.set(k / src.width, 0);
          renderer.setRenderTarget(tmp);
          renderer.render(screenScene, screenCam);
          blurMat.uniforms.tMap.value = tmp.texture;
          blurMat.uniforms.uStep.value.set(0, k / src.height);
          renderer.setRenderTarget(src);
          renderer.render(screenScene, screenCam);
        }
        function layer(scene, rt, tmp, px) {
          renderer.setRenderTarget(rt);
          renderer.setClearColor(0x000000, 0);
          renderer.clear(true, true, false);
          renderer.render(scene, camera);
          if (px > 0.3) blur(rt, tmp, px);
          renderer.setRenderTarget(null);
          screen.material = copyMat;
          copyMat.uniforms.tMap.value = rt.texture;
          renderer.render(screenScene, screenCam);
        }

        let time = 0, clock = 0, cloudShift = 0, keyDir = -1, last = -1;
        let lastRefresh = 0, refreshAvg = 1000 / 60, refreshCount = 0, lastDraw = 0, frameAvg = 1000 / fps, slowFrames = 0;

        function draw(now) {
          const dt = last < 0 ? 0 : Math.min(0.05, (now - last) / 1000);
          last = now;
          if (W < 2 || H < 2) return;
          const key = W + "|" + H;
          // rebuilding is ~10 ms; while the window is being resized, do it a few times a second at most
          if (key !== builtKey && (builtKey === "" || now - builtAt > 160)) rebuild(key, now);
          const aspect = W / H;
          const h = built.h;
          const still = reduce.matches;

          // pointer: ease in and out, then step the springs
          const hk = still ? 0 : clamp(opts.hover, 0, 10) / 5;
          const ease = 1 - Math.exp(-dt / 0.35);
          pointer.over += ((pointer.inside ? 1 : 0) - pointer.over) * ease;
          pointer.press += ((pointer.down && pointer.inside ? 1 : 0) - pointer.press) * (1 - Math.exp(-dt / 0.15));
          stepPush(dt, hk, aspect);
          camera.fov = vfovFor(built.aspect);
          camera.aspect = aspect;
          // shift the lens rather than tilt the camera, so voxels stay upright
          camera.setViewOffset(W, H, 0, (0.5 - h) * H, W, H);
          camera.updateProjectionMatrix();

          // clocks
          if (!still) {
            time += (dt * clamp(opts.speed, 0, 10)) / 5;
            clock += dt;
            cloudShift += opts.cloudDir * clamp(opts.cloudSpeed, 0, 10) * 0.006 * 2 * built.cloudHalf * dt;
          }
          // the hour glides to the one asked for, the short way round the clock
          if (state.hour === null || still) state.hour = state.target;
          else {
            let d = state.target - state.hour;
            d -= Math.round(d / 24) * 24;
            state.hour = (state.hour + d * (1 - Math.exp(-dt / 0.45)) + 24) % 24;
          }
          const D = dayAt(state.hour);

          // sun and moon share one arc, rising on the right and setting on the left
          const baseY = h - (0.041 * h) / REF_H - 0.0325;
          const arc = baseY - 0.13;
          const reach = aspect / 2 - 0.03;
          const sun = [aspect / 2 + Math.cos(D.th) * reach, baseY - Math.sin(D.th) * arc];
          const moon = [aspect / 2 - Math.cos(D.th) * reach, baseY + Math.sin(D.th) * arc];
          const sunUp = smooth(-0.12, 0.02, D.e);
          const moonUp = smooth(0.06, 0.22, -D.e);   // the moon shows only once the sun is well down
          const src = D.e > -0.3 ? sun : moon;
          const toward = clamp((src[0] - aspect / 2) / (aspect / 2), -1, 1);
          keyDir = dt === 0 ? toward : keyDir + (toward - keyDir) * (1 - Math.exp(-dt / 0.8));

          // colours for the hour
          const w3 = (a, b, c) => blend3(a, b, c, D.day, D.gold, D.night);
          const top = w3(DAY_SKY.top, SUNSET_SKY.top, NIGHT_SKY.top);
          const hor = w3(DAY_SKY.horizon, SUNSET_SKY.horizon, NIGHT_SKY.horizon);
          const glow = w3(DAY_SKY.glow, SUNSET_SKY.glow, NIGHT_SKY.glow);

          shared.uTime.value = time;
          shared.uWind.value = clamp(opts.wind, 0, 10) / 5;
          shared.uAspect.value = aspect;
          setV(shared.uGlow, glow);
          setV(shared.uLight, w3(LIGHT_DAY, [1, 1, 1], LIGHT_NIGHT));
          shared.uKeyDir.value = keyDir;
          setV(shared.uHazeA, w3(mix(DAY_SKY.horizon, [0.86, 0.9, 0.95], 0.3), mix(SUNSET_SKY.horizon, C.hazeGold, 0.7), shade(NIGHT_SKY.horizon, 0.9)));
          setV(shared.uHazeB, w3(mix(DAY_SKY.glow, DAY_SKY.horizon, 0.5), mix(SUNSET_SKY.glow, C.hazeSun, 0.55), shade(NIGHT_SKY.glow, 0.35)));
          shared.uHazeK.value = 0.0017 * clamp(opts.haze, 0, 10);
          shared.uSunNdc.value.set((src[0] / aspect) * 2 - 1, 1 - 2 * src[1]);

          voxelMat.uniforms.uCloudShift.value = cloudShift;
          voxelMat.uniforms.uCloudWrap.value = built.cloudWrap;
          voxelMat.uniforms.uRimK.value = sunUp * (1 - 0.5 * D.day) + 0.15 * moonUp * smooth(-0.3, -0.5, D.e);
          setV(voxelMat.uniforms.uCloudLight, w3(CLOUD_DAY, [1, 1, 1], CLOUD_NIGHT));
          voxelMat.uniforms.uCloudWhite.value = D.day * 0.8 + D.night * 0.6;

          skyMat.uniforms.uHy.value = h;
          setV(skyMat.uniforms.uTop, top);
          setV(skyMat.uniforms.uHor, hor);
          skyMat.uniforms.uSunPos.value.set(sun[0], sun[1]);
          skyMat.uniforms.uMoonPos.value.set(moon[0], moon[1]);
          skyMat.uniforms.uSunK.value = sunUp * (1 - 0.4 * D.day);
          skyMat.uniforms.uMoonK.value = moonUp;
          skyMat.uniforms.uGold.value = D.gold;
          skyMat.uniforms.uNight.value = D.night;
          skyMat.uniforms.uClock.value = clock;
          // the sun breathes: a slow swell in its bloom
          postMat.uniforms.uGlowK.value = (0.9 + 0.1 * Math.cos(time * 0.8)) * sunUp * (1 - 0.6 * D.day);

          renderer.setRenderTarget(null);
          renderer.setClearColor(0x000000, 1);
          renderer.clear();
          renderer.render(mainScene, camera);
          if (blurOn) {
            const blurK = (clamp(opts.depthBlur, 0, 10) / 5) * H * pr;
            layer(softScene, softRT, softTmp, blurK * 0.005);
            layer(nearScene, nearRT, nearTmp, blurK * 0.022 * 0.5);
          } else {
            // lighter path: the nearer grass drawn straight in, sharp, sharing the depth buffer
            renderer.render(softScene, camera);
            renderer.render(nearScene, camera);
          }
          screen.material = postMat;
          renderer.render(screenScene, screenCam);
        }

        function loop(now) {
          if (state.paused) { state.looping = false; return; }   // stopped; resume() restarts
          requestAnimationFrame(loop);
          if (reduce.matches && state.ready) return;
          // draw on every Nth screen refresh so frames stay evenly spaced
          const raw = now - lastRefresh;
          lastRefresh = now;
          if (raw > 0 && raw < 100) refreshAvg = refreshAvg * 0.95 + raw * 0.05;
          const target = now < scrollingUntil ? Math.min(fps, 30) : fps;   // give scrolling room
          const every = Math.max(1, Math.round(1000 / target / refreshAvg));
          if (++refreshCount % every) return;
          const gap = now - lastDraw;
          if (lastDraw && gap < 500) {
            frameAvg = frameAvg * 0.9 + gap * 0.1;
            if (frameAvg > every * refreshAvg * 1.35) {
              if (++slowFrames > 60) {
                slowFrames = 0;
                if (fps > 30) fps = 30;
                else if (!document.documentElement.classList.contains("lite-glass")) document.documentElement.classList.add("lite-glass");
                else if (blurOn) blurOn = false;
                else if (scale > 0.55) { scale *= 0.8; resize(); }
                frameAvg = every * refreshAvg;
              }
            } else slowFrames = Math.max(0, slowFrames - 2);
          }
          lastDraw = now;
          draw(now);
        }

        state.draw = (now) => { last = -1; draw(now); };
        container.append(canvas);
        draw(performance.now());
        state.ready = true;
        requestAnimationFrame(() => onReady && onReady());
        if (!state.paused) { state.looping = true; requestAnimationFrame(loop); }
        state.restart = () => {
          last = -1;
          lastDraw = 0;
          resize();
          if (!state.looping) { state.looping = true; requestAnimationFrame(loop); }
        };
        canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); });
      }

      return {
        // Same call as the landscape's set(a, b, f): this scene only needs the clock hour
        // (or, without one, the hour of time of day `a` plus f)
        set(a, _b, f, hour) {
          state.target = typeof hour === "number" ? hour : (6 + (a + f) * 6) % 24;
          if (state.ready && reduce.matches && state.draw) state.draw(performance.now());
        },
        pause() { state.paused = true; },
        resume() {
          if (!state.paused) return;
          state.paused = false;
          if (state.restart) state.restart();
        }
      };
    };
  })();

  // three.js for the intro and the Pixels background, loaded once, on first use
  let threeLoading = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (!threeLoading) {
      threeLoading = loadScript(THREE_URL, 8000).then(() => window.THREE);
      threeLoading.catch(() => { threeLoading = null; });   // a later try may succeed
    }
    return threeLoading;
  }

  /* =======================================================
     3. TIME OF DAY — real-time sunrise / midday / sunset / midnight,
        light / dark theme and the background picker
     ======================================================= */
  const sky = {
    layers: $$(".sky-layer"),   // still gradients, used only when WebGL is unavailable
    range: $("#sky-range"),
    liveBtn: $("#sky-live"),
    clock: $("#sky-clock"),
    stops: $$(".sky-stops button"),
    icon: $("#sky-icon"),
    themeBtn: $("#theme-toggle"),
    mode: "live",
    position: 1,
    timer: null,
    living: null
  };

  const PHASE_ICONS = ["fa-cloud-sun", "fa-sun", "fa-cloud-moon", "fa-moon"];

  // Hour of day -> sky position (0 sunrise, 1 midday, 2 sunset, 3 midnight)
  // Each phase holds for a while, then blends into the next over about an hour.
  const KEYFRAMES = [
    [4.5, 3], [5.5, 4], [7.5, 4], [8.5, 5], [15.5, 5],
    [16.5, 6], [18.5, 6], [19.5, 7], [28.5, 7]
  ];

  function positionFromTime(date) {
    let h = date.getHours() + date.getMinutes() / 60;
    if (h < 4.5) h += 24;
    for (let i = 0; i < KEYFRAMES.length - 1; i++) {
      const [h1, p1] = KEYFRAMES[i];
      const [h2, p2] = KEYFRAMES[i + 1];
      if (h >= h1 && h <= h2) {
        const t = h2 === h1 ? 0 : (h - h1) / (h2 - h1);
        return (p1 + (p2 - p1) * t) % 4;
      }
    }
    return 3;
  }

  function renderSky(p) {
    sky.position = p;
    const base = Math.floor(p) % 4;
    const next = (base + 1) % 4;
    const f = p - Math.floor(p);

    sky.layers.forEach((layer, i) => {
      let opacity = 0, z = 0;
      if (i === base) { opacity = 1; z = 1; }
      if (i === next && f > 0) { opacity = f; z = 2; }
      layer.style.opacity = opacity;
      layer.style.zIndex = z;
    });

    // Pixels follows the clock hour itself (its sun and moon ride one arc);
    // the slider and buttons map sunrise, midday, sunset, midnight to 6, 12, 18 and 0
    const now = new Date();
    const hour = sky.mode === "live" ? now.getHours() + now.getMinutes() / 60 : (6 + p * 6) % 24;
    if (sky.living) sky.living.set(base, next, f, hour);

    const nearest = Math.round(p) % 4;
    const dark = p >= 1.5 && p < 3.5;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]').content = ["#e9a87c", "#4a90d9", "#c8643a", "#141a35"][nearest];

    sky.icon.className = "fa-solid " + PHASE_ICONS[nearest];
    sky.stops.forEach((b) => b.classList.toggle("current", Number(b.dataset.stop) === nearest));
    sky.range.value = p > 3 ? 3 : p;
    sky.range.setAttribute("aria-valuetext", ["Sunrise", "Midday", "Sunset", "Midnight"][nearest]);

    sky.themeBtn.querySelector("i").className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
    sky.themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }

  function tickLive() {
    const now = new Date();
    sky.clock.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (sky.mode === "live") renderSky(positionFromTime(now));
  }

  function setMode(mode, position) {
    sky.mode = mode;
    sky.liveBtn.setAttribute("aria-pressed", String(mode === "live"));
    if (mode === "live") {
      storage.set("sky", { mode: "live" });
      tickLive();
    } else {
      storage.set("sky", { mode: "manual", position });
      renderSky(position);
    }
  }

  /* Background theme: "plain" (simple, calm), "landscape" (the live scene) or
     "pixels" (the voxel meadow). A scene is only started the first time it is
     shown, and rests whenever another one is chosen. */
  const BACKGROUNDS = { landscape: createLivingSky, pixels: createPixelSky };
  const engines = {};

  function setBackground(mode, save) {
    if (mode !== "plain" && !BACKGROUNDS[mode]) mode = "pixels";
    document.documentElement.dataset.bg = mode;
    $$(".bg-option").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.bg === mode)));
    Object.keys(engines).forEach((name) => { if (name !== mode) engines[name].pause(); });
    sky.living = null;
    if (BACKGROUNDS[mode]) {
      if (engines[mode]) engines[mode].resume();
      else {
        const skyEl = $(".sky");
        engines[mode] = BACKGROUNDS[mode](skyEl, () => skyEl.classList.add(mode + "-ready"));
      }
      sky.living = engines[mode];
      renderSky(sky.position);
    }
    if (save) storage.set("background", mode);
  }

  function initBackground() {
    const btn = $("#bg-btn");
    const menu = $("#bg-menu");
    const saved = storage.get("background");
    // new visitors start on Pixels, which carries on from the blocky intro
    setBackground(typeof saved === "string" ? saved : "pixels", false);

    function setMenu(open) {
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenu(menu.hidden);
    });
    $$(".bg-option", menu).forEach((option) => option.addEventListener("click", () => {
      setBackground(option.dataset.bg, true);
      setMenu(false);
      btn.focus();
    }));
    document.addEventListener("click", (e) => {
      if (!menu.hidden && !menu.contains(e.target)) setMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) { setMenu(false); btn.focus(); }
    });
  }

  function initSky() {
    const saved = storage.get("sky");
    if (saved && saved.mode === "manual" && typeof saved.position === "number") {
      setMode("manual", Math.min(Math.max(saved.position, 0), 3));
    } else {
      setMode("live");
    }
    tickLive();
    sky.timer = setInterval(tickLive, 30000);

    // Drag the scale: blend smoothly, without fade lag
    sky.range.addEventListener("input", () => {
      document.body.classList.add("sky-dragging");
      setMode("manual", Number(sky.range.value));
    });
    sky.range.addEventListener("change", () => document.body.classList.remove("sky-dragging"));

    sky.stops.forEach((b) => b.addEventListener("click", () => setMode("manual", Number(b.dataset.stop))));
    sky.liveBtn.addEventListener("click", () => setMode("live"));

    // Quick light/dark toggle in the header (midday <-> midnight)
    sky.themeBtn.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme === "dark";
      setMode("manual", dark ? 1 : 3);
    });

    // Open / close the sky panel
    const toggle = $("#sky-toggle");
    const panel = $("#sky-panel");
    toggle.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  /* =======================================================
     4. NAVIGATION
     ======================================================= */
  /* Clean URLs: every section and project has its own address (/about,
     /projects/booksheaven). firebase.json serves this page for all of them,
     and links here change the address without reloading the page. */
  const BASE = new URL(document.baseURI).pathname;   // the site's folder (the <base> set in index.html)
  const SECTION_TITLES = {
    about: "About", skills: "Skills", projects: "Projects", experience: "Experience",
    education: "Education", cv: "CV", contact: "Contact", analytics: "Site analytics"
  };
  const pathOf = (route) => BASE + (route === "home" ? "" : route);

  function currentRoute() {
    const rest = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : "";
    return rest.replace(/\/+$/, "") || "home";
  }

  // Title and canonical address for what is on screen
  function setPage(route) {
    if (!/^projects\//.test(route)) {
      document.title = SECTION_TITLES[route] ? SECTION_TITLES[route] + " | Margie A. Marquez" : baseTitle;
    }
    const url = location.origin + pathOf(route);
    $('link[rel="canonical"]').href = url;
    $('meta[property="og:url"]').content = url;
  }

  // Show a section or project (the address is already set)
  function showRoute(route, smooth) {
    const project = route.match(/^projects\/([\w-]+)$/);
    if (project && openProject(project[1])) { setPage(route); return; }
    if (dialog.open) dialog.close();
    const known = route === "home" || SECTION_TITLES[route];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(known ? route : project ? "projects" : "home")
      .scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto" });
    setPage(known ? route : "home");
  }

  // Go somewhere from a link: a new address, then show it
  function go(route) {
    const url = pathOf(route);
    if (url !== location.pathname) history.pushState(null, "", url);
    showRoute(route, true);
    track(url);
  }

  function initRoutes() {
    // old shared links (#about, #/projects/booksheaven) become clean addresses
    const old = location.hash.match(/^#\/?(projects\/[\w-]+|home|about|skills|projects|experience|education|cv|contact|analytics)$/);
    if (old) history.replaceState(null, "", pathOf(old[1]));

    // in-page links get the clean address of their section
    $$('a[href^="#"]').forEach((a) => {
      const id = a.getAttribute("href").slice(1);
      if (id === "home" || SECTION_TITLES[id]) {
        a.dataset.route = id;
        a.href = pathOf(id);
      }
    });
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a");
      if (!a) return;
      if (a.dataset.route) {
        e.preventDefault();
        go(a.dataset.route);
        return;
      }
      // other "#id" links (the skip link) stay on this page rather than going to the site's folder
      const href = a.getAttribute("href") || "";
      const target = href.length > 1 && href.startsWith("#") && document.getElementById(href.slice(1));
      if (target) {
        e.preventDefault();
        target.scrollIntoView();
        target.focus({ preventScroll: true });
      }
    });
    window.addEventListener("popstate", () => showRoute(currentRoute(), true));
  }

  function initNav() {
    const header = $(".site-header");
    const nav = $("#site-nav");
    const menuBtn = $("#menu-btn");

    function setMenu(open) {
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menuBtn.querySelector("i").className = open ? "fa-solid fa-xmark" : "fa-solid fa-bars";
    }
    menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
    $$("a", nav).forEach((a) => a.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
    document.addEventListener("click", (e) => {
      if (nav.classList.contains("open") && !nav.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });

    let scrolled = false;
    window.addEventListener("scroll", () => {
      const now = window.scrollY > 10;
      if (now !== scrolled) header.classList.toggle("scrolled", (scrolled = now));
    }, { passive: true });

    // Highlight the section in view, and keep the address on it (without
    // adding to the back history, and not while a project is open)
    const links = new Map($$("a[data-route]", nav).map((a) => [a.dataset.route, a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        links.forEach((a) => a.classList.remove("active"));
        const link = links.get(id);
        if (link) link.classList.add("active");
        if (!dialog.open && currentRoute() !== id && !/^projects\//.test(currentRoute())) {
          history.replaceState(null, "", pathOf(id));
          setPage(id);
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach((s) => spy.observe(s));
  }

  /* =======================================================
     5. PROJECTS — cards, search & filters
     ======================================================= */
  const grid = $("#project-grid");
  const filters = {
    search: $("#project-search"),
    category: $("#filter-category"),
    type: $("#filter-type"),
    tech: $("#filter-tech"),
    year: $("#filter-year")
  };
  // The grid shows the newest few, so it doesn't take over the page;
  // a bar under it names the rest and opens them in place.
  const PREVIEW_COUNT = 3;
  let showAll = false;
  let lastResults = [];

  function fillSelect(select, values) {
    values.forEach((v) => select.append(el("option", { value: v, text: v })));
  }

  function projectCard(p, index) {
    const open = () => go("projects/" + p.id);
    const done = p.status.toLowerCase() === "complete";
    const statusClass = "badge status" + (done ? "" : " in-progress");

    const actions = [
      el("button", { class: "btn btn-primary btn-small", type: "button", onclick: open },
        [icon("fa-solid fa-eye"), "View project"])
    ];
    if (p.url) actions.push(el("a", { class: "btn btn-small", href: p.url, target: "_blank", rel: "noopener" }, [icon("fa-solid fa-globe"), "Live site"]));
    if (p.github) actions.push(el("a", { class: "btn btn-small", href: p.github, target: "_blank", rel: "noopener" }, [icon("fa-brands fa-github"), "Source code"]));
    if (p.demo) actions.push(el("a", { class: "btn btn-small", href: p.demo, target: "_blank", rel: "noopener" }, [icon("fa-solid fa-play"), "Demo"]));

    return el("article", { class: "project-card glass", style: `animation-delay:${index * 70}ms` }, [
      el("a", { class: "pc-media", href: pathOf("projects/" + p.id), "data-route": "projects/" + p.id, "aria-label": "View details for " + p.name }, [
        el("img", { src: p.image, alt: p.alt, loading: "lazy", decoding: "async" }),
        el("div", { class: "pc-badges" }, [
          el("span", { class: "badge" }, [icon(CATEGORY_ICONS[p.category] || "fa-solid fa-folder"), p.category]),
          el("span", { class: statusClass }, [icon(done ? "fa-solid fa-circle-check" : "fa-solid fa-hourglass-half"), p.status])
        ])
      ]),
      el("div", { class: "pc-body" }, [
        el("p", { class: "pc-type", text: p.type }),
        el("h3", { class: "pc-title", text: p.name }),
        el("p", { class: "pc-desc", text: p.description }),
        el("ul", { class: "tech-list", "aria-label": "Technologies used" }, p.technologies.map((t) => el("li", { text: t }))),
        el("div", { class: "pc-meta" }, [
          el("div", {}, [icon("fa-regular fa-calendar"), formatDate(p.date)]),
          el("div", {}, [icon("fa-solid fa-user-pen"), p.role])
        ]),
        el("div", { class: "pc-actions" }, actions)
      ])
    ]);
  }

  function applyFilters() {
    const terms = filters.search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const cat = filters.category.value;
    const type = filters.type.value;
    const tech = filters.tech.value;
    const year = filters.year.value;

    const results = projects.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (type && p.type !== type) return false;
      if (tech && !p.technologies.includes(tech)) return false;
      if (year && yearOf(p) !== year) return false;
      const haystack = [p.name, p.category, p.type, p.description, p.role, p.status,
        yearOf(p), formatDate(p.date), ...p.technologies].join(" ").toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });

    lastResults = results;
    grid.replaceChildren(...(showAll ? results : results.slice(0, PREVIEW_COUNT)).map(projectCard));
    $("#empty-state").hidden = results.length > 0;
    renderMore();
  }

  function renderMore() {
    const extra = lastResults.slice(PREVIEW_COUNT);
    const shown = grid.children.length;
    $("#result-count").textContent =
      `Showing ${shown} of ${projects.length} project${projects.length === 1 ? "" : "s"}`;
    $("#project-more").hidden = extra.length === 0;
    if (!extra.length) return;

    const n = extra.length;
    const names = extra.slice(0, 3).map((p) => p.name).join(", ") + (n > 3 ? " and more" : "");
    $("#pm-peek").replaceChildren(...(showAll ? [] : extra.slice(0, 4).map((p) =>
      el("img", { src: p.image, alt: "", loading: "lazy", decoding: "async" }))));
    $("#pm-text").textContent = showAll
      ? `That's all ${lastResults.length} projects.`
      : `+${n} more project${n === 1 ? "" : "s"}: ${names}`;
    const btn = $("#pm-toggle");
    btn.setAttribute("aria-expanded", String(showAll));
    btn.replaceChildren(...(showAll
      ? [icon("fa-solid fa-chevron-up"), "Show fewer"]
      : [`See all ${lastResults.length} projects`, icon("fa-solid fa-chevron-down")]));
  }

  function toggleMore() {
    showAll = !showAll;
    if (showAll) {
      // add only the hidden cards, so the first ones don't animate in again
      grid.append(...lastResults.slice(PREVIEW_COUNT).map(projectCard));
    } else {
      [...grid.children].slice(PREVIEW_COUNT).forEach((card) => card.remove());
      // the page just got shorter: bring the bar back into view
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      $("#project-more").scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
    }
    renderMore();
  }

  function initProjects() {
    projects.sort((a, b) => b.date.localeCompare(a.date));

    const unique = (arr) => [...new Set(arr)].sort();
    fillSelect(filters.category, unique([...CATEGORIES, ...projects.map((p) => p.category)]));
    fillSelect(filters.type, unique(projects.map((p) => p.type)));
    fillSelect(filters.tech, unique(projects.flatMap((p) => p.technologies)));
    fillSelect(filters.year, unique(projects.map(yearOf)).reverse());

    let debounce;
    filters.search.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(applyFilters, 120);
    });
    [filters.category, filters.type, filters.tech, filters.year].forEach((s) => s.addEventListener("change", applyFilters));
    $("#project-filters").addEventListener("reset", () => setTimeout(applyFilters, 0));
    $("#project-filters").addEventListener("submit", (e) => e.preventDefault());   // results update as you type
    $("#pm-toggle").addEventListener("click", toggleMore);

    applyFilters();
  }

  /* =======================================================
     6. PROJECT DETAILS DIALOG — /projects/<id>
     ======================================================= */
  const dialog = $("#project-dialog");
  const dialogBody = $("#pd-body");
  const baseTitle = document.title;

  function projectDetails(p) {
    const i = projects.indexOf(p);
    const prev = projects[(i - 1 + projects.length) % projects.length];
    const next = projects[(i + 1) % projects.length];

    const links = [
      ["url", "Live website", "fa-solid fa-globe"],
      ["github", "GitHub", "fa-brands fa-github"],
      ["demo", "Demo", "fa-solid fa-play"],
      ["docs", "Documentation", "fa-solid fa-book"]
    ].filter(([key]) => p[key])
      .map(([key, label, cls]) => el("a", { class: "btn btn-small", href: p[key], target: "_blank", rel: "noopener" }, [icon(cls), label]));

    const fact = (label, value) => el("div", {}, [el("dt", { text: label }), el("dd", { text: value })]);
    const section = (title, content) => el("section", { class: "pd-section" }, [el("h3", { text: title }), content]);

    return [
      el("header", { class: "pd-header" }, [
        el("p", { class: "pc-type", text: p.category + " · " + p.type }),
        el("h2", { id: "pd-title", text: p.name })
      ]),
      el("a", { class: "pd-shot", href: p.image, target: "_blank", rel: "noopener", "aria-label": "Open full-size image of " + p.name }, [
        el("img", { src: p.image, alt: p.alt })
      ]),
      el("dl", { class: "pd-facts" }, [
        fact("Category", p.category),
        fact("Type", p.type),
        fact("Date", formatDate(p.date)),
        fact("Role", p.role),
        fact("Status", p.status),
        fact("Technologies", p.technologies.join(", "))
      ]),
      section("Overview", el("p", { text: p.overview })),
      section("Brief", el("p", { text: p.description })),
      section("Problem", el("p", { text: p.problem })),
      section("Solution", el("p", { text: p.solution })),
      section("Features", el("ul", {}, p.features.map((f) => el("li", { text: f })))),
      links.length
        ? section("Links", el("div", { class: "btn-row" }, links))
        : el("p", { class: "pd-note pd-section", text: "This is a design project, so there is no live website or source code to link." }),
      el("footer", { class: "pd-footer" }, [
        el("a", { class: "btn btn-small", href: pathOf("projects/" + prev.id), "data-route": "projects/" + prev.id }, [icon("fa-solid fa-arrow-left"), prev.name]),
        el("a", { class: "btn btn-small", href: pathOf("projects/" + next.id), "data-route": "projects/" + next.id }, [next.name, icon("fa-solid fa-arrow-right")])
      ])
    ];
  }

  // Show a project's details (at /projects/<id>); false if there is no such project
  function openProject(id) {
    const project = projects.find((p) => p.id === id);
    if (!project) return false;
    dialogBody.replaceChildren(...projectDetails(project));
    dialogBody.scrollTop = 0;
    document.title = project.name + " | Margie A. Marquez";
    if (!dialog.open) {
      dialog.showModal();
      // the page behind is blurred out, so the landscape can rest meanwhile
      if (sky.living) sky.living.pause();
    }
    return true;
  }

  function initDialog() {
    $("#pd-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => {
      if (sky.living && document.documentElement.dataset.bg !== "plain") sky.living.resume();
      // closed by the visitor (not by going back): the address returns to /projects
      if (/^projects\//.test(currentRoute())) {
        history.replaceState(null, "", pathOf("projects"));
        setPage("projects");
        const box = $("#projects").getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) $("#projects").scrollIntoView();
      }
    });
  }

  /* =======================================================
     7. CONTACT FORM — validation, spam protection, delivery.
        Messages are delivered to Margie's inbox by FormSubmit
        (free, no account). The very first message sends her an
        "Activate form" email; after she activates it, FormSubmit
        also offers a random alias to use below instead of the
        address. If sending fails, the visitor's email app opens.
     ======================================================= */
  const CONTACT_TO = "margiemarquez71@gmail.com";
  const CONTACT_ENDPOINT = "https://formsubmit.co/ajax/" + CONTACT_TO;

  function initContactForm() {
    const form = $("#contact-form");
    const status = $("#form-status");
    const loadedAt = Date.now();
    const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      status.className = "form-status";

      const data = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        subject: form.subject.value.trim(),
        message: form.message.value.trim()
      };

      // Spam checks: hidden honeypot filled, or submitted too fast
      if (form.website.value || Date.now() - loadedAt < 3000) {
        status.textContent = "Thanks! Your message has been noted.";
        form.reset();
        return;
      }

      const errors = [];
      const mark = (field, bad) => field.setAttribute("aria-invalid", String(bad));
      mark(form.name, data.name.length < 2);
      mark(form.email, !EMAIL.test(data.email));
      mark(form.subject, data.subject.length < 2);
      mark(form.message, data.message.length < 10);
      if (data.name.length < 2) errors.push("your name");
      if (!EMAIL.test(data.email)) errors.push("a valid email");
      if (data.subject.length < 2) errors.push("a subject");
      if (data.message.length < 10) errors.push("a message (at least 10 characters)");

      if (errors.length) {
        status.classList.add("error");
        status.textContent = "Please enter " + errors.join(", ") + ".";
        form.querySelector('[aria-invalid="true"]').focus();
        return;
      }

      const last = storage.get("contactSentAt");
      if (last && Date.now() - last < 30000) {
        status.classList.add("error");
        status.textContent = "Please wait a few seconds before sending another message.";
        return;
      }
      storage.set("contactSentAt", Date.now());

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      status.textContent = "Sending your message...";
      fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,          // FormSubmit uses this as the reply-to address
          _subject: "Portfolio message: " + data.subject,
          message: data.message,
          _template: "table",
          _captcha: "false"
        })
      })
        .then((res) => res.json().catch(() => ({})).then((json) => {
          if (!res.ok || String(json.success) !== "true") throw new Error(json.message || "not sent");
        }))
        .then(() => {
          status.textContent = "Thank you! Your message has been sent. I'll reply to " + data.email + " soon.";
          form.reset();
          track("contact-sent", true);
        })
        .catch(() => {
          // the service is down or not activated yet: let the visitor send it by email instead
          const body = `Name: ${data.name}\nEmail: ${data.email}\n\n${data.message}`;
          window.location.href = "mailto:" + CONTACT_TO +
            "?subject=" + encodeURIComponent(data.subject) +
            "&body=" + encodeURIComponent(body);
          status.textContent = "The message couldn't be sent directly, so your email app is opening with it instead.";
        })
        .finally(() => { button.disabled = false; });
    });

    form.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));
  }

  /* =======================================================
     8. 3D PHOTO CARD — tilts with the pointer; click / tap
         flips it over to show the tagline
     ======================================================= */
  function initProfileCard() {
    const card = $("#profile3d");
    if (!card) return;
    const side = card.parentElement;
    const back = $(".profile3d-back", card);
    const hint = $("#profile3d-hint");
    const live = $("#profile3d-live");
    const tagline = $$(".profile3d-quote span", card).map((s) => s.textContent).join(" ");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let flipped = false, resetTimer = 0;

    try { if (sessionStorage.getItem("taglineSeen")) hint.classList.add("is-hidden"); } catch (e) { /* private mode */ }

    // tilt towards the pointer, with a soft light following it; fast mice send
    // more events than the screen shows, so the card updates at most once a frame
    let pointer = null, tiltFrame = 0;
    function applyTilt() {
      tiltFrame = 0;
      if (!pointer) return;
      const r = card.getBoundingClientRect();
      const px = Math.min(Math.max((pointer.x - r.left) / r.width, 0), 1) - 0.5;
      const py = Math.min(Math.max((pointer.y - r.top) / r.height, 0), 1) - 0.5;
      card.style.setProperty("--ry", (px * 18).toFixed(2) + "deg");
      card.style.setProperty("--rx", (-py * 14).toFixed(2) + "deg");
      card.style.setProperty("--sx", ((px + 0.5) * 100).toFixed(1) + "%");
      card.style.setProperty("--sy", ((py + 0.5) * 100).toFixed(1) + "%");
      card.classList.add("is-tracking");
    }
    function tilt(e) {
      if (still.matches) return;
      pointer = { x: e.clientX, y: e.clientY };
      clearTimeout(resetTimer);
      if (!tiltFrame) tiltFrame = requestAnimationFrame(applyTilt);
    }
    function settle() {
      pointer = null;
      card.classList.remove("is-tracking");
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    }
    card.addEventListener("pointermove", tilt);
    card.addEventListener("pointerleave", settle);
    card.addEventListener("pointercancel", settle);
    card.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse") resetTimer = setTimeout(settle, 450);   // fingers leave no hover
    });

    // a little burst of sparkles in the theme's colours
    function sparkle() {
      if (still.matches) return;
      const colours = ["var(--accent)", "#ffffff", "#ffd27a"];
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 110 + Math.random() * 80;
        const s = el("span", { class: "profile3d-spark", "aria-hidden": "true" });
        s.style.setProperty("--dx", (Math.cos(ang) * dist).toFixed(0) + "px");
        s.style.setProperty("--dy", (Math.sin(ang) * dist * 0.85).toFixed(0) + "px");
        s.style.setProperty("--size", (4 + Math.random() * 6).toFixed(1) + "px");
        s.style.setProperty("--spark", colours[i % colours.length]);
        s.addEventListener("animationend", () => s.remove());
        side.append(s);
      }
    }

    card.addEventListener("click", () => {
      flipped = !flipped;
      card.classList.toggle("is-flipped", flipped);
      card.setAttribute("aria-pressed", String(flipped));
      card.setAttribute("aria-label", flipped ? "Hide Margie's tagline" : "Show Margie's tagline");
      back.setAttribute("aria-hidden", String(!flipped));
      live.textContent = flipped ? tagline : "";
      card.classList.remove("is-popping");
      void card.offsetWidth;   // restart the pop animation
      card.classList.add("is-popping");
      if (flipped) {
        sparkle();
        hint.classList.add("is-hidden");
        try { sessionStorage.setItem("taglineSeen", "1"); } catch (e) { /* private mode */ }
      }
    });
    card.addEventListener("animationend", (e) => {
      if (e.target === card) card.classList.remove("is-popping");
    });
  }

  /* =======================================================
     9. ANALYTICS — anonymous visit counts, shown on the site
        itself in the "Site analytics" section (/analytics).
        The site's own Vercel functions keep the counts (api/hit.js
        adds one, api/stats.js reads them all) in Vercel's free
        Redis storage: pages and projects opened, CV views and
        downloads, certificate views, contact messages, outside
        links and device types. No cookies, no personal data.
        Firebase Hosting has no functions, so the web.app site uses
        the same counts on Vercel. Visits on localhost are not counted (set sessionStorage
        "countLocal" to "1" to test counting there).
     ======================================================= */
  const API = /(^|\.)(web\.app|firebaseapp\.com)$/.test(location.hostname) ? "https://margie-marquez.vercel.app/api/" : BASE + "api/";
  const COUNTING = !/^(localhost|127\.|\[::1\])/.test(location.hostname) ||
    (() => { try { return sessionStorage.getItem("countLocal") === "1"; } catch (e) { return false; } })();

  // Count a page view (path "/about") or an event (path "cv-download")
  function track(path, isEvent) {
    if (!COUNTING) return;
    const body = JSON.stringify({ path, event: !!isEvent });
    const sent = navigator.sendBeacon && navigator.sendBeacon(API + "hit", new Blob([body], { type: "text/plain" }));
    if (!sent) {
      fetch(API + "hit", { method: "POST", headers: { "Content-Type": "text/plain" }, body, keepalive: true })
        .catch(() => { /* not counted: no harm done */ });
    }
  }

  const DEVICES = { phone: "Phone", tablet: "Tablet", desktop: "Desktop / laptop" };
  function deviceType() {
    if (Math.min(screen.width, screen.height) < 600) return "phone";
    return window.matchMedia("(pointer: coarse)").matches ? "tablet" : "desktop";
  }

  const formatCount = (n) => n.toLocaleString("en-US");

  // A ranked list (the top `limit` rows): name and count, with a thin bar sized against the largest
  function renderBars(list, rows, unit, withShare, limit) {
    const shown = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count).slice(0, limit || rows.length);
    if (!shown.length) {
      list.replaceChildren(el("li", { class: "bar-empty", text: "No " + unit + " yet." }));
      return;
    }
    const max = shown[0].count;
    const total = shown.reduce((sum, r) => sum + r.count, 0);
    list.replaceChildren(...shown.map((r) => {
      const share = Math.round((r.count / total) * 100);
      const fill = el("span", { class: "bar-fill" });
      requestAnimationFrame(() => { fill.style.width = Math.max(2, (r.count / max) * 100) + "%"; });
      return el("li", { title: `${r.label}: ${formatCount(r.count)} ${unit} (${share}%)` }, [
        el("span", { class: "bar-label", text: r.label }),
        el("span", { class: "bar-value" }, [formatCount(r.count), withShare ? el("small", { text: share + "%" }) : null]),
        el("span", { class: "bar-track", "aria-hidden": "true" }, [fill])
      ]);
    }));
  }

  function loadStats() {
    const status = $("#stats-status");
    fetch(API + "stats")
      .then((res) => {
        if (!res.ok) throw new Error("stats " + res.status);
        return res.json();
      })
      .then((stats) => {
        const pageCount = (route) => stats.pages[pathOf(route)] || 0;
        $$("[data-stat]").forEach((t) => {
          const key = t.dataset.stat;
          t.textContent = formatCount(key === "TOTAL" ? stats.total : stats.events[key] || 0);
        });
        renderBars($("#stats-projects"),
          projects.map((p) => ({ label: p.name, count: pageCount("projects/" + p.id) })), "views", false);
        renderBars($("#stats-pages"),
          [["home", "Home"], ...Object.entries(SECTION_TITLES)].map(([route, label]) => ({ label, count: pageCount(route) })),
          "views", false, 6);
        renderBars($("#stats-devices"),
          Object.entries(DEVICES).map(([key, label]) => ({ label, count: stats.events["device-" + key] || 0 })), "visitors", true);
        status.textContent = "Live counts since November 2026, updated every minute.";
      })
      .catch(() => {
        status.textContent = "The visit numbers aren't available right now. Please check back later.";
      });
  }

  function initAnalytics() {
    $("#analytics-note").hidden = false;

    // the numbers load when the section comes near the screen
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      loadStats();
    }, { rootMargin: "300px 0px" });
    io.observe($("#analytics"));

    // each visitor's device type, once per visit
    try {
      if (!sessionStorage.getItem("deviceCounted")) {
        sessionStorage.setItem("deviceCounted", "1");
        track("device-" + deviceType(), true);
      }
    } catch (e) { /* private mode: skip */ }

    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (href.includes("assets/cv/")) track(a.hasAttribute("download") ? "cv-download" : "cv-view", true);
      else if (href.includes("assets/certificates/")) track("certificate-view", true);
      else if (/^https?:/.test(a.href) && a.host !== location.host) track("outbound/" + a.hostname.toLowerCase(), true);
    });
  }

  /* =======================================================
     10. REVEAL ON SCROLL & START-UP
     ======================================================= */
  function initReveal() {
    const items = $$(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((i) => i.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((i) => io.observe(i));
  }

  $("#year").textContent = new Date().getFullYear();

  initSky();
  initBackground();
  initRoutes();
  initNav();
  initProjects();
  initDialog();
  initContactForm();
  initProfileCard();
  initAnalytics();

  // Then show the address visited (/, /about, /projects/booksheaven) and count it.
  // The intro only plays on the home page, so shared links open straight away.
  const startRoute = currentRoute();
  function begin() {
    initReveal();
    showRoute(startRoute, false);
    track(location.pathname);
  }
  if (introWanted() && startRoute === "home") runIntro(begin);
  else { document.documentElement.classList.remove("intro-pending"); begin(); }
})();
