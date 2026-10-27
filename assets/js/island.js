/* Madeira in relief, built from open elevation data, with travel times from the hotel. three.js r128 (global build). */
window.initIsland = function initIsland(opts) {
  const THREE = window.THREE;
  const { canvas, stage, markers, hint, data, pick, onSelect, reduced } = opts;
  if (!THREE || !window.MADEIRA_HEIGHT) return Promise.resolve(null);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return Promise.resolve(null);
  }

  // bounds of the height map, matching the tiles it was cut from (Web Mercator)
  const BOUNDS = { w: -17.30, e: -16.62, s: 32.60, n: 32.90 };
  const mercX = lon => (lon + 180) / 360;
  const mercY = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; };
  const toUV = (lat, lon) => [
    (mercX(lon) - mercX(BOUNDS.w)) / (mercX(BOUNDS.e) - mercX(BOUNDS.w)),
    (mercY(lat) - mercY(BOUNDS.n)) / (mercY(BOUNDS.s) - mercY(BOUNDS.n))
  ];

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(build(img));
    img.onerror = () => resolve(null);
    img.src = window.MADEIRA_HEIGHT;
  });

  function build(img) {
    const hw = img.naturalWidth, hh = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = hw; c.height = hh;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    let px;
    try { px = cx.getImageData(0, 0, hw, hh).data; } catch (e) { return null; }
    const H = new Float32Array(hw * hh);
    for (let i = 0; i < hw * hh; i++) H[i] = px[i * 4] / 255;
    const sample = (u, v) => {
      const x = Math.min(hw - 1.001, Math.max(0, u * (hw - 1)));
      const y = Math.min(hh - 1.001, Math.max(0, v * (hh - 1)));
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const a = H[y0 * hw + x0], b = H[y0 * hw + x0 + 1], c2 = H[(y0 + 1) * hw + x0], d = H[(y0 + 1) * hw + x0 + 1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c2 * (1 - fx) + d * fx) * fy;
    };

    const SW = 10, SH = SW * hh / hw, MAXY = .66;
    const GX = 360, GY = Math.round(GX * SH / SW);
    const count = (GX + 1) * (GY + 1);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    // colours of the island by height: dry south coast, banana terraces, laurel, heath, basalt summits
    const ramp = [
      [0.00, '#5d6f4a'], [0.06, '#4c6b42'], [0.22, '#2f5d3b'], [0.45, '#22482f'],
      [0.62, '#4d5537'], [0.76, '#6d604b'], [0.9, '#8f8270'], [1.0, '#c9c1b5']
    ].map(([h, hex]) => [h, new THREE.Color(hex).convertSRGBToLinear()]);
    const tmp = new THREE.Color();
    const colorAt = h => {
      for (let i = 1; i < ramp.length; i++) {
        if (h <= ramp[i][0]) {
          const [h0, c0] = ramp[i - 1], [h1, c1] = ramp[i];
          return tmp.copy(c0).lerp(c1, (h - h0) / (h1 - h0));
        }
      }
      return tmp.copy(ramp[ramp.length - 1][1]);
    };

    let p = 0;
    for (let j = 0; j <= GY; j++) {
      for (let i = 0; i <= GX; i++) {
        const u = i / GX, v = j / GY;
        const h = sample(u, v);
        pos[p] = (u - .5) * SW;
        pos[p + 1] = h > .004 ? h * MAXY + .012 : -0.05;
        pos[p + 2] = (v - .5) * SH;
        const cc = colorAt(h);
        col[p] = cc.r; col[p + 1] = cc.g; col[p + 2] = cc.b;
        p += 3;
      }
    }
    const idx = new Uint32Array(GX * GY * 6);
    let q = 0;
    for (let j = 0; j < GY; j++) {
      for (let i = 0; i < GX; i++) {
        const a = j * (GX + 1) + i, b = a + 1, c3 = a + GX + 1, d = c3 + 1;
        idx[q++] = a; idx[q++] = c3; idx[q++] = b;
        idx[q++] = b; idx[q++] = c3; idx[q++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x05070b, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x05070b, 16, 46);
    const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 }));
    scene.add(land);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d1a2e').convertSRGBToLinear(), roughness: .42, metalness: .15 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = .006;
    scene.add(sea);

    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x0a0d14, .55));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.9);
    sun.position.set(-6, 7, 5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5a9bfc, .35);
    rim.position.set(6, 3, -6);
    scene.add(rim);

    // places, lifted onto the relief
    const at = (lat, lon) => {
      const [u, v] = toUV(lat, lon);
      return new THREE.Vector3((u - .5) * SW, sample(u, v) * MAXY + .03, (v - .5) * SH);
    };
    const hotelPos = at(data.hotel.lat, data.hotel.lon);
    const points = data.places.map(pl => ({ id: pl.id, pos: at(pl.lat, pl.lon), pl }));

    // a pulse on the roof of the hotel
    const accent = new THREE.Color('#5a9bfc').convertSRGBToLinear();
    const ring = new THREE.Mesh(new THREE.RingGeometry(.06, .085, 48), new THREE.MeshBasicMaterial({ color: accent, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(hotelPos).y += .01;
    scene.add(ring);

    // the route from the hotel to the chosen place, drawn as an arc
    let route = null, routeT = 0;
    const routeMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .95, depthWrite: false });
    function setRoute(to) {
      if (route) { scene.remove(route); route.geometry.dispose(); }
      const a = hotelPos.clone(), b = to.clone();
      const mid = a.clone().lerp(b, .5);
      mid.y += .25 + a.distanceTo(b) * .32;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const g = new THREE.TubeGeometry(curve, 96, .011, 6, false);
      route = new THREE.Mesh(g, routeMat);
      route.geometry.setDrawRange(0, 0);
      scene.add(route);
      routeT = reduced ? 1 : 0;
    }

    // HTML markers follow their 3D anchor every frame
    markers.innerHTML = '';
    const mk = (id, cls) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'marker ' + cls;
      el.dataset.id = id;
      el.innerHTML = '<i></i><span></span>';
      markers.appendChild(el);
      return el;
    };
    const hotelEl = mk('hotel', 'is-hotel');
    hotelEl.tabIndex = -1;
    points.forEach(pt => {
      pt.el = mk(pt.id, '');
      pt.el.tabIndex = -1;
      pt.el.addEventListener('click', () => onSelect(pt.id));
    });
    function setLabels() {
      hotelEl.querySelector('span').textContent = data.hotel.name;
      points.forEach(pt => { pt.el.querySelector('span').textContent = pick(pt.pl.name); });
    }
    setLabels();

    // camera: orbit around a target, with a slow sway while idle
    const camera = new THREE.PerspectiveCamera(32, 1, .05, 200);
    const targetNow = new THREE.Vector3(0, 0, 0), targetGoal = new THREE.Vector3(0, 0, .2);
    let theta = -0.18, phi = .86, radius = 14, radiusGoal = 14, baseRadius = 14;
    let thetaGoal = theta, phiGoal = phi;
    let dragging = false, lastX = 0, lastY = 0, idle = 0, introT = reduced ? 1 : 0, started = false;

    function size() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // on wide screens the island sits right of centre, clear of the list of places
      if (w >= 900) camera.setViewOffset(w, h, -w * .09, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      const hfov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
      baseRadius = Math.min(40, Math.max(8, (SW * (w < 760 ? .4 : .52)) / Math.tan(hfov / 2)));
      radiusGoal = focused ? baseRadius * .72 : baseRadius;
      if (w < 760 && !started) { theta = thetaGoal = -.75; }
    }

    let focused = null;
    function focus(id) {
      const pt = points.find(x => x.id === id);
      if (!pt) return;
      focused = id;
      points.forEach(x => x.el.classList.toggle('is-active', x.id === id));
      targetGoal.copy(hotelPos).lerp(pt.pos, .5).setY(0);
      radiusGoal = baseRadius * .72;
      setRoute(pt.pos);
      idle = 0;
    }

    canvas.addEventListener('pointerdown', e => {
      dragging = true; lastX = e.clientX; lastY = e.clientY; idle = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      thetaGoal -= dx * .006;
      if (e.pointerType === 'mouse') phiGoal = Math.min(1.25, Math.max(.45, phiGoal - dy * .004));
      if (hint) hint.classList.add('is-gone');
      idle = 0;
    });
    const stop = () => { dragging = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    const v3 = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    function place(el, pos, w, h) {
      v3.copy(pos).project(camera);
      const behind = v3.z > 1;
      const x = (v3.x * .5 + .5) * w, y = (-v3.y * .5 + .5) * h;
      el.style.transform = `translate3d(${x - 7}px, ${y - 7}px, 0)`;
      el.style.visibility = behind ? 'hidden' : 'visible';
      // fade markers on the far side of the island
      camPos.copy(camera.position);
      const far = pos.distanceTo(camPos) > camPos.distanceTo(targetNow) + 1.6;
      el.classList.toggle('is-behind', far && !el.classList.contains('is-active') && el !== hotelEl);
    }

    let visible = false, rafId = 0, last = performance.now(), clock = 0;
    function tick(now) {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      clock += dt;
      idle += dt;

      if (introT < 1) introT = Math.min(1, introT + dt / 2.6);
      const ease = 1 - Math.pow(1 - introT, 3);

      if (!dragging && idle > 4 && !reduced) thetaGoal += Math.sin(clock * .25) * dt * .05;
      theta += (thetaGoal - theta) * Math.min(1, dt * 4);
      phi += (phiGoal - phi) * Math.min(1, dt * 4);
      radius += (radiusGoal - radius) * Math.min(1, dt * 2.2);
      targetNow.lerp(targetGoal, Math.min(1, dt * 2.2));

      const ph = phi * ease + .18 * (1 - ease);
      const rr = radius * (ease + 1.45 * (1 - ease));
      const th = theta - (1 - ease) * .9;
      camera.position.set(
        targetNow.x + rr * Math.sin(ph) * Math.sin(th),
        targetNow.y + rr * Math.cos(ph),
        targetNow.z + rr * Math.sin(ph) * Math.cos(th)
      );
      camera.lookAt(targetNow);

      const s = 1 + (clock * .8 % 1) * 2.2;
      ring.scale.set(s, s, s);
      ring.material.opacity = 1 - (clock * .8 % 1);

      if (route && routeT < 1) {
        routeT = Math.min(1, routeT + dt / .9);
        const total = route.geometry.index.count;
        route.geometry.setDrawRange(0, Math.floor(total * (1 - Math.pow(1 - routeT, 3)) / 3) * 3);
      }

      renderer.render(scene, camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      place(hotelEl, hotelPos, w, h);
      points.forEach(pt => place(pt.el, pt.pos, w, h));
    }

    function start() {
      if (rafId) return;
      started = true;
      last = performance.now();
      rafId = requestAnimationFrame(tick);
    }
    function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; }

    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      visible ? start() : stopLoop();
    }, { rootMargin: '100px 0px' }).observe(stage);
    new ResizeObserver(size).observe(canvas);
    size();
    focus(opts.initial);

    return { focus, setLabels };
  }
};
