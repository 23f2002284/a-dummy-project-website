(() => {
  const THREE_URLS = [
    "https://unpkg.com/three@0.164.1/build/three.module.js",
    "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js"
  ];

  const SECRET_PAYLOAD = {
    salt: "LUEVlRbrSMHa86orHt3mPw==",
    iv: "6NNOZNzSRf3A1c9Q",
    ciphertext:
      "uDMudA5Q4uJp963H4MdyIf/ZHYbE7VpfiXSXDag19yCdyPYfSBbkGyXRhbtE5U6VEW0iOsJuvwOl+Q2oP4NtIblVTY1UG7OoH90xOERsSPgGSDHRl+AnVE5yUCCCYrkp8hFnLRk68xDEQ965MFyQRDY6VSdW5GoBsdU4zXy3sxyPCo8KTSpsXEhsn9IfdSH+5h5LQv/2DmbxPP0o02VIXj9k7CyUd6yZ5J8k"
  };

  const PLANET_COPY = {
    overview: {
      title: "Solar overview",
      body: "Eight planets, one hidden transmission, and a very patient astronaut."
    },
    Mercury: { title: "Mercury", body: "A scorched iron world racing through the Sun's glare." },
    Venus: { title: "Venus", body: "Cloud-bright, furnace-hot, and almost theatrical about it." },
    Earth: { title: "Earth", body: "Home signal acquired. Oceans, weather, listeners." },
    Mars: { title: "Mars", body: "Rust-red deserts with a skyline made for rovers." },
    Jupiter: { title: "Jupiter", body: "A storm king wrapped in bands of cream, ochre, and thunder." },
    Saturn: { title: "Saturn", body: "The ringed planet, holding court like a golden instrument." },
    Uranus: { title: "Uranus", body: "A tilted ice giant in pale mint light." },
    Neptune: { title: "Neptune", body: "Deep, windy, far-flung, and almost mythic." }
  };

  const dom = {
    shell: document.querySelector(".app-shell"),
    brand: document.querySelector(".brand"),
    canvas: document.getElementById("space-scene"),
    form: document.getElementById("decoder-form"),
    keyInput: document.getElementById("key-input"),
    status: document.getElementById("decode-status"),
    vault: document.getElementById("secret-vault"),
    secretText: document.getElementById("secret-text"),
    secretLink: document.getElementById("secret-link"),
    focusSelect: document.getElementById("focus-select"),
    speed: document.getElementById("orbit-speed"),
    speedOutput: document.getElementById("speed-output"),
    volume: document.getElementById("volume-control"),
    volumeOutput: document.getElementById("volume-output"),
    stargazeToggle: document.getElementById("stargaze-toggle"),
    decoderPill: document.getElementById("decoder-pill"),
    dockClose: document.getElementById("dock-close"),
    audioToggle: document.getElementById("audio-toggle"),
    audioIcon: document.getElementById("audio-icon"),
    boostToggle: document.getElementById("boost-toggle"),
    planetReadout: document.getElementById("planet-readout")
  };

  const state = {
    focus: "overview",
    speed: Number(dom.speed.value),
    boosted: false,
    dockOpen: false,
    unlocked: false
  };

  let universe = null;
  let music = null;

  function normalizePhrase(value) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }

  function bytesFromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function decryptSecret(phrase) {
    if (!window.crypto?.subtle) {
      throw new Error("Web Crypto is unavailable in this browser.");
    }

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(normalizePhrase(phrase)),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: bytesFromBase64(SECRET_PAYLOAD.salt),
        iterations: 160000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesFromBase64(SECRET_PAYLOAD.iv) },
      key,
      bytesFromBase64(SECRET_PAYLOAD.ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  }

  async function importThree() {
    for (const url of THREE_URLS) {
      try {
        return await Promise.race([
          import(url),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error("Three.js load timed out.")), 8000);
          })
        ]);
      } catch (error) {
        console.info("Three.js source unavailable:", url, error.message);
      }
    }
    throw new Error("Three.js unavailable.");
  }

  function updateReadout(name) {
    const copy = PLANET_COPY[name] || PLANET_COPY.overview;
    dom.planetReadout.innerHTML = `<strong>${copy.title}</strong><span>${copy.body}</span>`;
  }

  function setStatus(message, tone = "") {
    dom.status.classList.remove("is-good", "is-wrong");
    if (tone) {
      dom.status.classList.add(tone);
    }
    dom.status.textContent = message;
  }

  function revealSecret(rawSecret) {
    let decoded = { message: rawSecret };
    try {
      const parsed = JSON.parse(rawSecret);
      if (parsed && typeof parsed === "object") {
        decoded = parsed;
      }
    } catch {
      // Older payloads were plain text, so keep that path harmless.
    }

    dom.secretText.textContent = decoded.message || "";
    if (decoded.href && decoded.linkText) {
      dom.secretLink.href = decoded.href;
      dom.secretLink.textContent = decoded.linkText;
      dom.secretLink.hidden = false;
    } else {
      dom.secretLink.removeAttribute("href");
      dom.secretLink.textContent = "";
      dom.secretLink.hidden = true;
    }
  }

  function setFocus(name) {
    state.focus = name;
    dom.focusSelect.value = name;
    updateReadout(name);
    universe?.setFocus(name);
  }

  function setDockOpen(open) {
    state.dockOpen = open;
    dom.shell.classList.toggle("is-stargazing", !open);
    dom.stargazeToggle.classList.toggle("is-active", !open);
    dom.stargazeToggle.dataset.tooltip = open ? "Stargaze" : "Decoder";
    dom.stargazeToggle.setAttribute(
      "aria-label",
      open ? "Return to stargaze mode" : "Open decoder dock"
    );
    dom.stargazeToggle.querySelector(".sr-only").textContent = open
      ? "Return to stargaze mode"
      : "Open decoder dock";
    dom.decoderPill.setAttribute("aria-hidden", String(open));
    dom.decoderPill.tabIndex = open ? -1 : 0;
  }

  class AmbientMusic {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.nodes = [];
      this.interval = null;
      this.active = false;
    }

    async start() {
      if (this.active) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = Number(dom.volume.value);
      this.master.connect(this.ctx.destination);

      const delay = this.ctx.createDelay(4);
      delay.delayTime.value = 0.48;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.36;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1700;
      delay.connect(feedback);
      feedback.connect(filter);
      filter.connect(delay);
      delay.connect(this.master);

      [55, 82.41, 110, 164.81].forEach((frequency, index) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        osc.type = index % 2 ? "triangle" : "sine";
        osc.frequency.value = frequency;
        gain.gain.value = 0.035;
        lfo.frequency.value = 0.035 + index * 0.012;
        lfoGain.gain.value = 0.018;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        osc.connect(gain);
        gain.connect(this.master);
        gain.connect(delay);
        osc.start();
        lfo.start();
        this.nodes.push(osc, lfo, gain, lfoGain);
      });

      const shimmer = this.makeNoise();
      shimmer.connect(delay);
      shimmer.connect(this.master);
      this.nodes.push(shimmer);

      const scale = [220, 246.94, 293.66, 329.63, 392, 440, 493.88, 587.33];
      let step = 0;
      this.interval = window.setInterval(() => {
        const frequency = scale[(step * 3 + Math.floor(Math.random() * 2)) % scale.length] * (step % 4 === 0 ? 0.5 : 1);
        this.pluck(frequency, delay);
        step += 1;
      }, 720);

      this.active = true;
    }

    makeNoise() {
      const duration = 2;
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) {
        channel[i] = (Math.random() * 2 - 1) * 0.12;
      }
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = "bandpass";
      filter.frequency.value = 4200;
      filter.Q.value = 0.7;
      gain.gain.value = 0.022;
      source.connect(filter);
      filter.connect(gain);
      source.start();
      return gain;
    }

    pluck(frequency, delay) {
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, now);
      pan.pan.value = Math.sin(now * 0.9) * 0.52;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.085, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(this.master);
      pan.connect(delay);
      osc.start(now);
      osc.stop(now + 1.9);
    }

    setVolume(value) {
      if (this.master) {
        this.master.gain.setTargetAtTime(Number(value), this.ctx.currentTime, 0.05);
      }
    }

    stop() {
      window.clearInterval(this.interval);
      this.nodes.forEach((node) => {
        try {
          if (typeof node.stop === "function") node.stop();
          if (typeof node.disconnect === "function") node.disconnect();
        } catch {
          // Audio nodes can already be stopped during rapid toggles.
        }
      });
      this.nodes = [];
      this.active = false;
      this.ctx?.close();
      this.ctx = null;
      this.master = null;
    }
  }

  class FallbackUniverse {
    constructor(canvas) {
      this.type = "canvas-fallback";
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.speed = 1;
      this.focus = "overview";
      this.boost = false;
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      this.planets = [
        ["Mercury", 32, 3, "#a89884"],
        ["Venus", 48, 6, "#f0b66b"],
        ["Earth", 67, 6, "#4be4d3"],
        ["Mars", 88, 5, "#d66a4f"],
        ["Jupiter", 122, 13, "#e3bb81"],
        ["Saturn", 158, 11, "#ffd166"],
        ["Uranus", 192, 8, "#85e5a2"],
        ["Neptune", 224, 8, "#6587ff"]
      ];
      this.resize = this.resize.bind(this);
      this.animate = this.animate.bind(this);
      window.addEventListener("resize", this.resize);
      this.resize();
      this.frame = requestAnimationFrame(this.animate);
    }

    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.floor(this.width * this.pixelRatio);
      this.canvas.height = Math.floor(this.height * this.pixelRatio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    }

    setSpeed(value) {
      this.speed = Number(value);
    }

    setFocus(name) {
      this.focus = name;
    }

    setBoost(value) {
      this.boost = value;
    }

    pulseUnlock() {
      this.boost = true;
      window.setTimeout(() => {
        this.boost = state.boosted;
      }, 1800);
    }

    animate(time) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      const centerX = this.width * 0.58;
      const centerY = this.height * 0.48;
      const scale = Math.min(this.width, this.height) / 580;

      ctx.fillStyle = "#030406";
      ctx.fillRect(0, 0, this.width, this.height);
      for (let i = 0; i < 260; i += 1) {
        const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
        const y = (Math.sin(i * 78.233) * 12345.6789) % 1;
        const px = Math.abs(x) * this.width;
        const py = Math.abs(y) * this.height;
        const twinkle = 0.35 + Math.sin(time * 0.002 + i) * 0.28;
        ctx.fillStyle = `rgba(243, 240, 232, ${Math.max(0.18, twinkle)})`;
        ctx.fillRect(px, py, 1.4, 1.4);
      }

      const sunGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 140 * scale);
      sunGlow.addColorStop(0, this.boost ? "rgba(255,209,102,0.78)" : "rgba(255,209,102,0.55)");
      sunGlow.addColorStop(1, "rgba(255,209,102,0)");
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 145 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f8a13f";
      ctx.beginPath();
      ctx.arc(centerX, centerY, 24 * scale, 0, Math.PI * 2);
      ctx.fill();

      this.planets.forEach(([name, orbit, radius, color], index) => {
        const orbitalRadius = orbit * scale;
        ctx.strokeStyle = "rgba(243,240,232,0.15)";
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, orbitalRadius, orbitalRadius * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();

        const angle = time * 0.00012 * this.speed * (9 - index) + index;
        const x = centerX + Math.cos(angle) * orbitalRadius;
        const y = centerY + Math.sin(angle) * orbitalRadius * 0.42;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius * scale, 0, Math.PI * 2);
        ctx.fill();
        if (name === "Saturn") {
          ctx.strokeStyle = "rgba(255,209,102,0.72)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(x, y, radius * 2.2 * scale, radius * 0.58 * scale, -0.25, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      });

      ctx.strokeStyle = "rgba(243,240,232,0.72)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.width * 0.72, this.height * 0.24 + Math.sin(time * 0.001) * 8, 11, 0, Math.PI * 2);
      ctx.moveTo(this.width * 0.72, this.height * 0.24 + 13);
      ctx.lineTo(this.width * 0.72, this.height * 0.24 + 42);
      ctx.stroke();
      ctx.lineWidth = 1;

      this.frame = requestAnimationFrame(this.animate);
    }

    sampleBrightness() {
      const sample = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
      let total = 0;
      let bright = 0;
      for (let index = 0; index < sample.length; index += 160) {
        total += 1;
        if (sample[index] + sample[index + 1] + sample[index + 2] > 30) bright += 1;
      }
      return { total, bright };
    }
  }

  class ThreeUniverse {
    constructor(THREE, canvas) {
      this.type = "three";
      this.THREE = THREE;
      this.canvas = canvas;
      this.clock = new THREE.Clock();
      this.planets = [];
      this.pointer = new THREE.Vector2();
      this.pointerTarget = new THREE.Vector2();
      this.focus = "overview";
      this.speed = 1;
      this.boost = false;

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0x030406, 0.012);
      this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 220);
      this.camera.position.set(0, 8, 18);

      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;

      this.root = new THREE.Group();
      this.scene.add(this.root);

      this.buildLights();
      this.buildStars();
      this.buildSolarSystem();
      this.buildAstronaut();
      this.buildComet();

      this.raycaster = new THREE.Raycaster();
      this.target = new THREE.Vector3();
      this.desiredCamera = new THREE.Vector3(0, 8, 18);

      this.resize = this.resize.bind(this);
      this.animate = this.animate.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onCanvasClick = this.onCanvasClick.bind(this);

      window.addEventListener("resize", this.resize);
      window.addEventListener("pointermove", this.onPointerMove);
      canvas.addEventListener("click", this.onCanvasClick);
      this.animation = requestAnimationFrame(this.animate);
    }

    buildLights() {
      const THREE = this.THREE;
      this.scene.add(new THREE.AmbientLight(0x77817b, 0.42));
      this.sunLight = new THREE.PointLight(0xffcf75, 5.4, 120, 1.7);
      this.sunLight.position.set(0, 0, 0);
      this.scene.add(this.sunLight);
      const rim = new THREE.DirectionalLight(0x4be4d3, 1.15);
      rim.position.set(-10, 12, 14);
      this.scene.add(rim);
    }

    makeTexture(colors, options = {}) {
      const THREE = this.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      colors.forEach((color, index) => {
        gradient.addColorStop(index / Math.max(1, colors.length - 1), color);
      });
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const bands = options.bands || 22;
      for (let y = 0; y < canvas.height; y += canvas.height / bands) {
        const alpha = 0.04 + Math.random() * 0.08;
        ctx.fillStyle = y % 2 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
        ctx.fillRect(0, y + Math.sin(y) * 4, canvas.width, canvas.height / bands + 3);
      }

      for (let i = 0; i < 1200; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
        ctx.fillRect(x, y, 1, 1);
      }

      if (options.spot) {
        ctx.fillStyle = options.spot;
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.65, canvas.height * 0.55, 38, 18, -0.25, 0, Math.PI * 2);
        ctx.fill();
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return texture;
    }

    buildStars() {
      const THREE = this.THREE;
      const count = 4800;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const palette = [
        new THREE.Color(0xf3f0e8),
        new THREE.Color(0xffd166),
        new THREE.Color(0x4be4d3),
        new THREE.Color(0xffb7a3)
      ];

      for (let i = 0; i < count; i += 1) {
        const radius = 36 + Math.random() * 90;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.cos(phi) * 0.7;
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

        const color = palette[Math.floor(Math.random() * palette.length)];
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: 0.14,
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        depthWrite: false
      });
      this.stars = new THREE.Points(geometry, material);
      this.scene.add(this.stars);
    }

    buildSolarSystem() {
      const THREE = this.THREE;
      const sunGeometry = new THREE.SphereGeometry(1.35, 64, 64);
      const sunTexture = this.makeTexture(["#7c2d12", "#f8a13f", "#ffd166", "#fff0a3"], { bands: 34 });
      this.sun = new THREE.Mesh(
        sunGeometry,
        new THREE.MeshBasicMaterial({ map: sunTexture, color: 0xffc15d })
      );
      this.root.add(this.sun);

      const glowTexture = this.makeGlowTexture();
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0xffd166,
          transparent: true,
          opacity: 0.54,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      glow.scale.set(9.5, 9.5, 1);
      this.root.add(glow);
      this.sunGlow = glow;

      const planetData = [
        ["Mercury", 0.22, 2.8, 4.6, ["#716557", "#c7b69b", "#7a6b5c"]],
        ["Venus", 0.34, 3.8, 3.7, ["#8d5834", "#f0b66b", "#ffdc9a"]],
        ["Earth", 0.38, 5.0, 3.1, ["#0c6375", "#4be4d3", "#1d884d", "#e7f4ee"]],
        ["Mars", 0.3, 6.2, 2.6, ["#632a22", "#c75e40", "#f1a36e"]],
        ["Jupiter", 0.82, 8.0, 1.6, ["#5f3d2b", "#f0c992", "#e7d8b9", "#a94a35"], "#b54a38"],
        ["Saturn", 0.7, 10.2, 1.25, ["#7d673c", "#ffd166", "#ead8a5"]],
        ["Uranus", 0.52, 12.0, 0.95, ["#2c756f", "#85e5a2", "#c7f5df"]],
        ["Neptune", 0.5, 13.7, 0.76, ["#1c3f76", "#5572d8", "#9ab3ff"]]
      ];

      planetData.forEach(([name, radius, orbit, speed, colors, spot], index) => {
        const orbitLine = this.makeOrbit(orbit);
        this.root.add(orbitLine);

        const pivot = new THREE.Group();
        pivot.rotation.y = Math.random() * Math.PI * 2;
        this.root.add(pivot);

        const geometry = new THREE.SphereGeometry(radius, 48, 36);
        const material = new THREE.MeshStandardMaterial({
          map: this.makeTexture(colors, { bands: name === "Jupiter" ? 34 : 18, spot }),
          roughness: 0.76,
          metalness: 0.02
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.x = orbit;
        mesh.rotation.z = (index % 2 ? -1 : 1) * 0.12;
        mesh.userData.name = name;
        pivot.add(mesh);

        if (name === "Saturn") {
          const ringGeometry = new THREE.RingGeometry(radius * 1.45, radius * 2.45, 128);
          const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xffd166,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.66
          });
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          ring.rotation.x = Math.PI / 2.15;
          ring.rotation.y = 0.24;
          mesh.add(ring);
        }

        if (name === "Earth") {
          const moonPivot = new THREE.Group();
          const moon = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 22, 18),
            new THREE.MeshStandardMaterial({ color: 0xd8d0bd, roughness: 0.9 })
          );
          moon.position.x = 0.74;
          moonPivot.add(moon);
          mesh.add(moonPivot);
          mesh.userData.moonPivot = moonPivot;
        }

        this.planets.push({ name, pivot, mesh, speed, orbit, radius });
      });
    }

    makeGlowTexture() {
      const THREE = this.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, "rgba(255, 235, 166, 0.96)");
      gradient.addColorStop(0.26, "rgba(255, 209, 102, 0.45)");
      gradient.addColorStop(1, "rgba(255, 209, 102, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    makeOrbit(radius) {
      const THREE = this.THREE;
      const points = [];
      for (let index = 0; index <= 192; index += 1) {
        const angle = (index / 192) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      return new THREE.LineLoop(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0xf3f0e8,
          transparent: true,
          opacity: 0.14
        })
      );
    }

    buildAstronaut() {
      const THREE = this.THREE;
      const suit = new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.72, metalness: 0.08 });
      const glass = new THREE.MeshPhysicalMaterial({
        color: 0x4be4d3,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.58,
        transmission: 0.25
      });
      const dark = new THREE.MeshStandardMaterial({ color: 0x1b2021, roughness: 0.5 });
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.52, 8, 16), suit);
      body.position.y = -0.28;
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 24), glass);
      helmet.position.y = 0.28;
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), dark);
      visor.position.set(0, 0.29, 0.19);
      visor.scale.set(1.15, 0.58, 0.28);
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.16), dark);
      pack.position.set(0, -0.24, -0.22);
      group.add(body, helmet, visor, pack);

      const limbGeometry = new THREE.CylinderGeometry(0.045, 0.055, 0.54, 12);
      const limbPositions = [
        [-0.34, -0.22, 0, -0.3],
        [0.34, -0.22, 0, 0.3],
        [-0.13, -0.76, 0, 0.08],
        [0.13, -0.76, 0, -0.08]
      ];
      limbPositions.forEach(([x, y, z, tilt], index) => {
        const limb = new THREE.Mesh(limbGeometry, suit);
        limb.position.set(x, y, z);
        limb.rotation.z = tilt + (index < 2 ? Math.PI / 8 : 0);
        group.add(limb);
      });

      const tetherPoints = [
        new THREE.Vector3(-0.2, -0.45, -0.15),
        new THREE.Vector3(-1.1, -0.1, -0.6),
        new THREE.Vector3(-1.7, 0.5, -0.2)
      ];
      const tether = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(tetherPoints),
        new THREE.LineBasicMaterial({ color: 0xf3f0e8, transparent: true, opacity: 0.42 })
      );
      group.add(tether);
      group.position.set(-3.2, 1.3, 3.4);
      group.rotation.set(0.2, -0.55, -0.2);
      group.scale.setScalar(0.86);
      this.astronaut = group;
      this.scene.add(group);
    }

    buildComet() {
      const THREE = this.THREE;
      const group = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0xf3f0e8 })
      );
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 1.4, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x4be4d3,
          transparent: true,
          opacity: 0.38,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      tail.position.x = -0.72;
      tail.rotation.z = Math.PI / 2;
      group.add(core, tail);
      this.comet = group;
      this.scene.add(group);
    }

    resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }

    onPointerMove(event) {
      this.pointerTarget.x = (event.clientX / window.innerWidth - 0.5) * 2;
      this.pointerTarget.y = (event.clientY / window.innerHeight - 0.5) * 2;
    }

    onCanvasClick(event) {
      const rect = this.canvas.getBoundingClientRect();
      const pointer = new this.THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      );
      this.raycaster.setFromCamera(pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.planets.map((planet) => planet.mesh), false);
      if (hits[0]?.object?.userData?.name) {
        setFocus(hits[0].object.userData.name);
      }
    }

    setSpeed(value) {
      this.speed = Number(value);
    }

    setFocus(name) {
      this.focus = name;
    }

    setBoost(value) {
      this.boost = value;
    }

    pulseUnlock() {
      this.boost = true;
      this.sunGlow.material.opacity = 0.9;
      window.setTimeout(() => {
        this.boost = state.boosted;
        this.sunGlow.material.opacity = this.boost ? 0.78 : 0.54;
      }, 2200);
    }

    sampleBrightness() {
      const gl = this.renderer.getContext();
      const points = [];
      for (let y = 0.16; y <= 0.86; y += 0.18) {
        for (let x = 0.14; x <= 0.9; x += 0.19) {
          points.push([x, y]);
        }
      }
      let bright = 0;
      const pixel = new Uint8Array(4);
      points.forEach(([x, y]) => {
        gl.readPixels(
          Math.floor(this.canvas.width * x),
          Math.floor(this.canvas.height * y),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel
        );
        if (pixel[0] + pixel[1] + pixel[2] > 24) bright += 1;
      });
      return { total: points.length, bright };
    }

    animate() {
      const delta = Math.min(this.clock.getDelta(), 0.045);
      const elapsed = this.clock.elapsedTime;
      this.pointer.lerp(this.pointerTarget, 0.035);

      this.root.rotation.y += delta * 0.018 * this.speed;
      this.stars.rotation.y -= delta * 0.006;
      this.sun.rotation.y += delta * 0.08;
      this.sunLight.intensity = this.boost ? 8.1 + Math.sin(elapsed * 7) * 0.8 : 5.4;
      this.sunGlow.material.opacity = this.boost ? 0.78 + Math.sin(elapsed * 5) * 0.07 : this.sunGlow.material.opacity;

      this.planets.forEach((planet, index) => {
        planet.pivot.rotation.y += delta * planet.speed * 0.12 * this.speed;
        planet.mesh.rotation.y += delta * (0.8 + index * 0.04);
        if (planet.mesh.userData.moonPivot) {
          planet.mesh.userData.moonPivot.rotation.y += delta * 1.2;
        }
      });

      const cometAngle = elapsed * 0.22;
      this.comet.position.set(Math.cos(cometAngle) * 15, Math.sin(cometAngle * 1.6) * 2.2 + 2, Math.sin(cometAngle) * 7);
      this.comet.rotation.z = -cometAngle + 0.6;

      this.astronaut.position.y = 1.3 + Math.sin(elapsed * 0.75) * 0.18;
      this.astronaut.rotation.y = -0.55 + Math.sin(elapsed * 0.42) * 0.16;
      this.astronaut.rotation.z = -0.2 + Math.sin(elapsed * 0.53) * 0.08;

      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
      this.animation = requestAnimationFrame(this.animate);
    }

    updateCamera() {
      if (this.focus === "overview") {
        const compact = window.innerWidth < 760;
        this.target.set(0, 0, 0);
        this.desiredCamera.set(
          compact ? 2.6 : 0,
          compact ? 9.8 : 8.2,
          compact ? 22 : 18
        );
      } else {
        const planet = this.planets.find((item) => item.name === this.focus);
        if (planet) {
          planet.mesh.getWorldPosition(this.target);
          const distance = Math.max(2.6, planet.radius * 4.8);
          this.desiredCamera.set(
            this.target.x + distance + this.pointer.x * 0.65,
            this.target.y + distance * 0.75 - this.pointer.y * 0.5,
            this.target.z + distance * 1.35
          );
        }
      }
      if (this.focus === "overview") {
        this.desiredCamera.x += this.pointer.x * 1.2;
        this.desiredCamera.y -= this.pointer.y * 0.6;
      }
      this.camera.position.lerp(this.desiredCamera, 0.045);
      this.camera.lookAt(this.target);
    }
  }

  async function initUniverse() {
    try {
      const THREE = await importThree();
      universe = new ThreeUniverse(THREE, dom.canvas);
      setStatus("Three.js observatory online. Awaiting the phrase.");
    } catch (error) {
      console.warn(error.message);
      universe = new FallbackUniverse(dom.canvas);
      setStatus("Canvas observatory online. Awaiting the phrase.");
    }
    universe.setSpeed(state.speed);
    universe.setFocus(state.focus);
  }

  function bindControls() {
    dom.brand.addEventListener("click", (event) => {
      event.preventDefault();
      setDockOpen(true);
    });

    dom.stargazeToggle.addEventListener("click", () => {
      setDockOpen(!state.dockOpen);
    });

    dom.decoderPill.addEventListener("click", () => {
      setDockOpen(true);
    });

    dom.dockClose.addEventListener("click", () => {
      setDockOpen(false);
    });

    dom.focusSelect.addEventListener("change", (event) => {
      setFocus(event.target.value);
    });

    dom.speed.addEventListener("input", (event) => {
      state.speed = Number(event.target.value);
      dom.speedOutput.textContent = `${state.speed.toFixed(1)}x`;
      universe?.setSpeed(state.speed);
    });

    dom.volume.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      dom.volumeOutput.textContent = `${Math.round(value * 100)}%`;
      music?.setVolume(value);
    });

    dom.boostToggle.addEventListener("click", () => {
      state.boosted = !state.boosted;
      dom.boostToggle.classList.toggle("is-active", state.boosted);
      universe?.setBoost(state.boosted);
    });

    dom.audioToggle.addEventListener("click", async () => {
      try {
        if (!music || !music.active) {
          music = new AmbientMusic();
          await music.start();
          dom.audioToggle.classList.add("is-playing");
          dom.audioToggle.setAttribute("aria-label", "Mute ambient space music");
        } else {
          music.stop();
          dom.audioToggle.classList.remove("is-playing");
          dom.audioToggle.setAttribute("aria-label", "Play ambient space music");
        }
      } catch (error) {
        setStatus(`Audio engine could not start: ${error.message}`, "is-wrong");
      }
    });

    dom.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const phrase = dom.keyInput.value;
      if (!normalizePhrase(phrase)) {
        setStatus("The decoder needs a phrase from the book cipher.", "is-wrong");
        return;
      }

      setStatus("Aligning the phrase with the encrypted payload...");
      dom.form.querySelector("button").disabled = true;
      try {
        const secret = await decryptSecret(phrase);
        state.unlocked = true;
        revealSecret(secret);
        dom.vault.classList.remove("is-locked");
        dom.vault.classList.add("is-unlocked");
        setStatus("Decoded. The observatory has opened the vault.", "is-good");
        universe?.pulseUnlock();
        if (music?.active) {
          music.pluck(659.25, music.master);
          music.pluck(880, music.master);
        }
      } catch {
        setStatus("That phrase did not open the vault. Check the cipher coordinates.", "is-wrong");
      } finally {
        dom.form.querySelector("button").disabled = false;
      }
    });
  }

  bindControls();
  setDockOpen(false);
  updateReadout("overview");
  initUniverse();

  window.__observatory = {
    diagnostics: () => ({
      renderer: universe?.type || "loading",
      focus: state.focus,
      speed: state.speed,
      boosted: state.boosted,
      dockOpen: state.dockOpen,
      unlocked: state.unlocked,
      samples: universe?.sampleBrightness?.() || null
    }),
    unlockForTest: async (phrase) => {
      dom.keyInput.value = phrase;
      dom.form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  };
})();
