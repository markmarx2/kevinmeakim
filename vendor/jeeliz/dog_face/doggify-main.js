/**
 * Doggify multi-filter orchestrator (Jeeliz FaceFilter, Apache-2.0).
 *
 * Photos only — Jeeliz expects a <video> source; we pass a hidden video fed by
 * canvas.captureStream() that paints your image each frame.
 *
 * Filters (URL ?filter=…): 'dog' (default), 'tiger'.
 * Dog has style sub-options ('pink', 'white', 'none').
 *
 * Sources adapted from Jeeliz demos:
 *   demos/threejs/dog_face, demos/threejs/tiger.
 */

const PRESET_KEVINS = [
  { src: 'doggify/Kevin.jpg',     label: 'Kevin' },
  { src: 'doggify/IMG_6657.jpeg', label: 'Photo 2' },
  { src: 'doggify/IMG_6658.jpeg', label: 'Photo 3' },
  { src: 'doggify/IMG_6659.jpeg', label: 'Photo 4' },
  { src: 'doggify/IMG_6661.jpeg', label: 'Photo 5' },
  { src: 'doggify/IMG_6662.jpeg', label: 'Photo 6' },
];

const FILTER = (() => {
  const f = new URLSearchParams(window.location.search).get('filter');
  return ['dog', 'tiger'].indexOf(f) >= 0 ? f : 'dog';
})();

// ============================================================================
// SHARED STATE
// ============================================================================
let FFSPECS = null;
let THREECAMERA = null;
let ISDETECTED = false;
let pumpCanvas = null;
let pumpCtx = null;
let pumpVideo = null;
let pumpImage = null;
let pumpRafId = null;

// ============================================================================
// SHARED UTILITIES
// ============================================================================
function setStatus(message, isError) {
  const el = document.getElementById('doggify-status');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('doggify-status--error', !!isError);
}

function detect_callback(isDetected) {
  if (!isDetected) setStatus('No face detected — try another photo.', true);
}

function setupPumpElements() {
  pumpCanvas = document.createElement('canvas');
  pumpCtx = pumpCanvas.getContext('2d');
  pumpVideo = document.createElement('video');
  pumpVideo.setAttribute('playsinline', '');
  pumpVideo.setAttribute('webkit-playsinline', '');
  pumpVideo.setAttribute('muted', '');
  pumpVideo.setAttribute('autoplay', '');
  pumpVideo.muted = true;
  pumpVideo.autoplay = true;
  const offscreen =
    'position:fixed;left:-9999px;top:0;width:4px;height:4px;opacity:0;pointer-events:none';
  pumpCanvas.style.cssText = offscreen;
  pumpVideo.style.cssText = offscreen;
  document.body.appendChild(pumpCanvas);
  document.body.appendChild(pumpVideo);
}

function drawImageCover(img) {
  if (!pumpCtx || !img) return;
  const cw = pumpCanvas.width;
  const ch = pumpCanvas.height;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  // Cover (fill) so the face fills the frame — neural net needs the face to be
  // large to detect reliably. For portrait photos top-align so the head stays
  // in frame (faces are in the upper portion of most photos).
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cw - dw) / 2;
  const dy = dh > ch ? 0 : (ch - dh) / 2;
  pumpCtx.clearRect(0, 0, cw, ch);
  pumpCtx.drawImage(img, dx, dy, dw, dh);
}

function startPumpLoop() {
  function loop() {
    if (pumpCanvas.width > 0 && pumpCanvas.height > 0) {
      drawImageCover(pumpImage);
    }
    pumpRafId = requestAnimationFrame(loop);
  }
  if (pumpRafId) cancelAnimationFrame(pumpRafId);
  loop();
}

function loadImagePromise(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Failed to load image'));
    im.src = src;
  });
}

async function applyPhotoSource(img) {
  pumpImage = img;
  drawImageCover(img);
  if (!FFSPECS) {
    if (pumpVideo.srcObject) {
      pumpVideo.srcObject.getTracks().forEach((t) => t.stop());
      pumpVideo.srcObject = null;
    }
    const stream = pumpCanvas.captureStream(30);
    pumpVideo.srcObject = stream;
    await pumpVideo.play();
  }
}

// ============================================================================
// FILTER: DOG (Jeeliz dog_face demo)
// ============================================================================
const DogFilter = (function () {
  const ASSETS = 'vendor/jeeliz/dog_face/';
  const state = {
    tongueMesh: null, noseMesh: null, earMesh: null,
    dogObj3D: null, frameObj3D: null,
    overlayMesh: null,
    mixer: null, action: null,
    videoGeometry: null,
    isLoaded: false,
    isOverThreshold: false, isUnderThreshold: true,
    isAnimating: false, isOpaque: false, isTongueOut: false, isAnimationOver: false,
    currentStyle: 'pink',
  };

  function create_mat2d(threeTexture, isTransparent) {
    return new THREE.RawShaderMaterial({
      depthWrite: false,
      depthTest: false,
      transparent: isTransparent,
      vertexShader:
        'attribute vec2 position;\n\
        varying vec2 vUV;\n\
        void main(void){\n\
          gl_Position = vec4(position, 0., 1.);\n\
          vUV = 0.5 + 0.5 * position;\n\
        }',
      fragmentShader:
        'precision lowp float;\n\
        uniform sampler2D samplerVideo;\n\
        varying vec2 vUV;\n\
        void main(void){\n\
          gl_FragColor = texture2D(samplerVideo, vUV);\n\
        }',
      uniforms: { samplerVideo: { value: threeTexture } },
    });
  }

  function applyStyle(filterType) {
    if (state.overlayMesh && state.frameObj3D) {
      state.frameObj3D.remove(state.overlayMesh);
      if (state.overlayMesh.material) {
        if (state.overlayMesh.material.uniforms && state.overlayMesh.material.uniforms.samplerVideo) {
          state.overlayMesh.material.uniforms.samplerVideo.value.dispose();
        }
        state.overlayMesh.material.dispose();
      }
      state.overlayMesh = null;
    }
    if (!filterType || filterType === 'none') return;

    let canvas;
    try {
      canvas = fx.canvas();
    } catch (e) {
      return;
    }
    const texFile = filterType === 'white' ? 'texture_white.jpg' : 'texture_pink.jpg';
    const tempImage = new Image(512, 512);
    tempImage.src = ASSETS + 'images/' + texFile;
    tempImage.onload = () => {
      const texture = canvas.texture(tempImage);
      canvas.draw(texture).vignette(0.5, 0.6).update();
      const canvasOpacity = document.createElement('canvas');
      canvasOpacity.width = 512;
      canvasOpacity.height = 512;
      const ctx = canvasOpacity.getContext('2d');
      ctx.globalAlpha = 0.2;
      ctx.drawImage(canvas, 0, 0, 512, 512);
      const mesh = new THREE.Mesh(
        state.videoGeometry,
        create_mat2d(new THREE.TextureLoader().load(canvasOpacity.toDataURL('image/png')), true),
      );
      mesh.material.opacity = 0.2;
      mesh.material.transparent = true;
      mesh.renderOrder = 999;
      mesh.frustumCulled = false;
      state.overlayMesh = mesh;
      state.frameObj3D.add(mesh);
    };
  }

  function init(spec) {
    state.dogObj3D = new THREE.Object3D();
    state.frameObj3D = new THREE.Object3D();

    const threeStuffs = JeelizThreeHelper.init(spec, detect_callback);
    state.videoGeometry = threeStuffs.videoMesh.geometry;

    const loadingManager = new THREE.LoadingManager();

    const loaderEars = new THREE.BufferGeometryLoader(loadingManager);
    loaderEars.load(ASSETS + 'models/dog/dog_ears.json', function (geometry) {
      const mat = new THREE.FlexMaterial({
        map: new THREE.TextureLoader().load(ASSETS + 'models/dog/texture_ears.jpg'),
        flexMap: new THREE.TextureLoader().load(ASSETS + 'models/dog/flex_ears_256.jpg'),
        alphaMap: new THREE.TextureLoader().load(ASSETS + 'models/dog/alpha_ears_256.jpg'),
        transparent: true, opacity: 1,
        bumpMap: new THREE.TextureLoader().load(ASSETS + 'models/dog/normal_ears.jpg'),
        bumpScale: 0.0075, shininess: 1.5, specular: 0xffffff,
      });
      state.earMesh = new THREE.Mesh(geometry, mat);
      state.earMesh.scale.multiplyScalar(0.025);
      state.earMesh.position.setY(-0.3);
      state.earMesh.frustumCulled = false;
      state.earMesh.renderOrder = 10000;
      state.earMesh.material.opacity.value = 1;
    });

    const loaderNose = new THREE.BufferGeometryLoader(loadingManager);
    loaderNose.load(ASSETS + 'models/dog/dog_nose.json', function (geometry) {
      const mat = new THREE.MeshPhongMaterial({
        map: new THREE.TextureLoader().load(ASSETS + 'models/dog/texture_nose.jpg'),
        shininess: 1.5, specular: 0xffffff,
        bumpMap: new THREE.TextureLoader().load(ASSETS + 'models/dog/normal_nose.jpg'),
        bumpScale: 0.005,
      });
      state.noseMesh = new THREE.Mesh(geometry, mat);
      state.noseMesh.scale.multiplyScalar(0.018);
      state.noseMesh.position.setY(-0.05);
      state.noseMesh.position.setZ(0.15);
      state.noseMesh.frustumCulled = false;
      state.noseMesh.renderOrder = 10000;
    });

    const loaderTongue = new THREE.JSONLoader(loadingManager);
    loaderTongue.load(ASSETS + 'models/dog/dog_tongue.json', function (geometry) {
      geometry.computeMorphNormals();
      const mat = new THREE.FlexMaterial({
        map: new THREE.TextureLoader().load(ASSETS + 'models/dog/dog_tongue.jpg'),
        flexMap: new THREE.TextureLoader().load(ASSETS + 'models/dog/flex_tongue_256.png'),
        alphaMap: new THREE.TextureLoader().load(ASSETS + 'models/dog/tongue_alpha_256.jpg'),
        transparent: true, morphTargets: true, opacity: 1,
      });
      state.tongueMesh = new THREE.Mesh(geometry, mat);
      state.tongueMesh.material.opacity.value = 0;
      state.tongueMesh.scale.multiplyScalar(2);
      state.tongueMesh.position.setY(-0.28);
      state.tongueMesh.frustumCulled = false;
      state.tongueMesh.visible = false;

      if (!state.mixer) {
        state.mixer = new THREE.AnimationMixer(state.tongueMesh);
        const clip = state.tongueMesh.geometry.animations[0];
        state.action = state.mixer.clipAction(clip);
        state.action.noLoop = true;
        state.action.play();
      }
    });

    loadingManager.onLoad = () => {
      state.dogObj3D.add(state.earMesh);
      state.dogObj3D.add(state.noseMesh);
      state.dogObj3D.add(state.tongueMesh);
      addDragEventListener(state.dogObj3D);
      threeStuffs.faceObject.add(state.dogObj3D);
      state.isLoaded = true;
      setStatus('Dog filter active. Open mouth wide for the tongue.');
      applyStyle(state.currentStyle);
    };

    threeStuffs.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(100, 1000, 1000);
    threeStuffs.scene.add(dirLight);

    THREECAMERA = JeelizThreeHelper.create_camera();
    threeStuffs.scene.add(state.frameObj3D);
  }

  function animate_tongue(mesh, isReverse) {
    mesh.visible = true;
    if (isReverse) {
      state.action.timeScale = -1;
      state.action.paused = false;
      setTimeout(() => {
        state.action.paused = true;
        state.isOpaque = false;
        state.isTongueOut = false;
        state.isAnimating = false;
        state.isAnimationOver = true;
        new TWEEN.Tween(mesh.material.opacity).to({ value: 0 }, 150).start();
      }, 150);
    } else {
      state.action.timeScale = 1;
      state.action.reset();
      state.action.paused = false;
      new TWEEN.Tween(mesh.material.opacity)
        .to({ value: 1 }, 100)
        .onComplete(() => {
          state.isOpaque = true;
          setTimeout(() => {
            state.action.paused = true;
            state.isAnimating = false;
            state.isTongueOut = true;
            state.isAnimationOver = true;
          }, 150);
        })
        .start();
    }
  }

  function track(detectState) {
    ISDETECTED = JeelizThreeHelper.get_isDetected();
    if (ISDETECTED) {
      const _eul = new THREE.Euler();
      if (state.earMesh && state.earMesh.material.set_amortized) {
        state.earMesh.material.set_amortized(
          state.earMesh.getWorldPosition(new THREE.Vector3()),
          state.earMesh.getWorldScale(new THREE.Vector3()),
          state.earMesh.getWorldQuaternion(_eul), false, 0.1,
        );
      }
      if (state.tongueMesh && state.tongueMesh.material.set_amortized) {
        state.tongueMesh.material.set_amortized(
          state.tongueMesh.getWorldPosition(new THREE.Vector3()),
          state.tongueMesh.getWorldScale(new THREE.Vector3()),
          state.tongueMesh.getWorldQuaternion(_eul), false, 0.3,
        );
      }
      if (detectState.expressions[0] >= 0.85 && !state.isOverThreshold) {
        state.isOverThreshold = true; state.isUnderThreshold = false; state.isAnimationOver = false;
      }
      if (detectState.expressions[0] <= 0.1 && !state.isUnderThreshold) {
        state.isOverThreshold = false; state.isUnderThreshold = true; state.isAnimationOver = false;
      }
      if (state.isLoaded && state.isOverThreshold && !state.isAnimating && !state.isAnimationOver) {
        state.isAnimating = true;
        animate_tongue(state.tongueMesh, state.isTongueOut);
      }
    }
    TWEEN.update();
    if (state.isOpaque && state.mixer) state.mixer.update(0.16);
    JeelizThreeHelper.render(detectState, THREECAMERA);
  }

  return { init, track, applyStyle, state };
})();

// ============================================================================
// FILTER: TIGER (adapted from Jeeliz tiger demo)
// ============================================================================
const TigerFilter = (function () {
  const ASSETS = 'vendor/jeeliz/tiger/';
  const state = {
    mouthHideMesh: null,
    mouthOpeningMaterials: [],
    particlesObj3D: null,
    particles: [],
    particleShotIndex: 0,
    particleDir: null,
    threeStuffs: null,
  };

  function generateSprite() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.2, 'rgba(0,255,255,0.5)');
    g.addColorStop(0.4, 'rgba(0,0,64,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
    return c;
  }

  function initParticle(particle, delay, direction) {
    if (particle.visible) return;
    particle.position.set(0.5 * (Math.random() - 0.5), -0.35 + 0.5 * (Math.random() - 0.5), 0.5);
    particle.visible = true;
    new TWEEN.Tween(particle.position)
      .to({ x: direction.x * 10, y: direction.y * 10, z: direction.z * 10 }, delay)
      .start()
      .onComplete(() => { particle.visible = false; });
    particle.scale.x = particle.scale.y = Math.random() * 0.6;
    new TWEEN.Tween(particle.scale).to({ x: 0.8, y: 0.8 }, delay).start();
  }

  function buildCustomMaskMaterial(textureURL, videoTransformMat2, rendererSize) {
    let vertexShaderSource = THREE.ShaderLib.lambert.vertexShader;
    vertexShaderSource = vertexShaderSource.replace(
      'void main() {',
      'varying vec3 vPos; uniform float mouthOpening; void main(){ vPos=position;'
    );
    const vGlsl = [
      'float isLowerJaw = step(position.y+position.z*0.2, 0.0);',
      'float theta = isLowerJaw * mouthOpening * 3.14/12.0;',
      'transformed.yz = mat2(cos(theta), sin(theta),-sin(theta), cos(theta))*transformed.yz;',
    ].join('\n');
    vertexShaderSource = vertexShaderSource.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vGlsl);

    let fragmentShaderSource = THREE.ShaderLib.lambert.fragmentShader;
    const fGlsl = [
      'float alphaMask = 1.0;',
      'vec2 pointToEyeL = vPos.xy - vec2(0.25,0.15);',
      'vec2 pointToEyeR = vPos.xy - vec2(-0.25,0.15);',
      'alphaMask *= smoothstep(0.05, 0.2, length(vec2(0.6,1.)*pointToEyeL));',
      'alphaMask *= smoothstep(0.05, 0.2, length(vec2(0.6,1.)*pointToEyeR));',
      'alphaMask = max(alphaMask, smoothstep(0.65, 0.75, vPos.z));',
      'float isDark = step(dot(texelColor.rgb, vec3(1.,1.,1.)), 1.0);',
      'alphaMask = mix(alphaMask, 1., isDark);',
      'vec2 uvVp = gl_FragCoord.xy/resolution;',
      'float scale = 0.03 / vPos.z;',
      'vec2 uvMove = vec2(-sign(vPos.x), -1.5) * scale;',
      'uvVp += uvMove;',
      'vec2 uvVideo = 0.5 + 2.0 * videoTransformMat2 * (uvVp - 0.5);',
      'vec4 videoColor = texture2D(samplerVideo, uvVideo);',
      'float videoColorGS = dot(vec3(0.299, 0.587, 0.114), videoColor.rgb);',
      'videoColor.rgb = videoColorGS * vec3(1.5,0.6,0.0);',
      'gl_FragColor = mix(videoColor, gl_FragColor, alphaMask);',
    ].join('\n');
    fragmentShaderSource = fragmentShaderSource.replace(
      'void main() {',
      'varying vec3 vPos; uniform sampler2D samplerVideo; uniform vec2 resolution; uniform mat2 videoTransformMat2; void main(){'
    );
    fragmentShaderSource = fragmentShaderSource.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n' + fGlsl
    );

    const mat = new THREE.ShaderMaterial({
      vertexShader: vertexShaderSource,
      fragmentShader: fragmentShaderSource,
      uniforms: Object.assign({
        samplerVideo: { value: JeelizThreeHelper.get_threeVideoTexture() },
        resolution: { value: new THREE.Vector2(rendererSize.width, rendererSize.height) },
        mouthOpening: { value: 0 },
        videoTransformMat2: { value: videoTransformMat2 },
      }, THREE.ShaderLib.lambert.uniforms),
      lights: true,
      transparent: true,
    });
    const texture = new THREE.TextureLoader().load(textureURL);
    mat.uniforms.map = { value: texture };
    mat.map = texture;
    state.mouthOpeningMaterials.push(mat);
    return mat;
  }

  function init(spec) {
    state.threeStuffs = JeelizThreeHelper.init(spec, detect_callback);
    const videoTransformMat2 = spec.videoTransformMat2;
    const rendererSize = state.threeStuffs.renderer.getSize();

    const loader = new THREE.BufferGeometryLoader();
    loader.load(ASSETS + 'TigerHead.json', function (geom) {
      const skinMat = buildCustomMaskMaterial(ASSETS + 'headTexture2.png', videoTransformMat2, rendererSize);
      const eyesMat = buildCustomMaskMaterial(ASSETS + 'white.png', videoTransformMat2, rendererSize);
      const whiskersMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const insideEarsMat = new THREE.MeshBasicMaterial({ color: 0x331100 });
      const tigerMesh = new THREE.Mesh(geom, [whiskersMat, eyesMat, skinMat, insideEarsMat]);
      tigerMesh.scale.set(2, 3, 2);
      tigerMesh.position.set(0, 0.2, -0.48);

      state.mouthHideMesh = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(0.5, 0.6),
        new THREE.MeshBasicMaterial({ color: 0x000000 }),
      );
      state.mouthHideMesh.position.set(0, -0.35, 0.5);
      state.threeStuffs.faceObject.add(tigerMesh, state.mouthHideMesh);
      setStatus('Tiger filter active. Open mouth wide for sparks.');
    });

    state.particlesObj3D = new THREE.Object3D();
    const particleMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(generateSprite()),
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 200; i++) {
      const p = new THREE.Sprite(particleMat);
      p.scale.multiplyScalar(0);
      p.visible = false;
      state.particles.push(p);
      state.particlesObj3D.add(p);
    }
    state.threeStuffs.faceObject.add(state.particlesObj3D);
    state.particleDir = new THREE.Vector3();

    state.threeStuffs.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dirLight = new THREE.DirectionalLight(0xff8833, 2);
    dirLight.position.set(0, 0.5, 1);
    state.threeStuffs.scene.add(dirLight);

    THREECAMERA = JeelizThreeHelper.create_camera();
  }

  function track(detectState) {
    ISDETECTED = JeelizThreeHelper.get_isDetected();
    if (ISDETECTED) {
      let mouthOpening = (detectState.expressions[0] - 0.2) * 5.0;
      mouthOpening = Math.min(Math.max(mouthOpening, 0), 1);
      if (mouthOpening > 0.5 && state.particles.length) {
        const theta = Math.random() * 6.28;
        state.particleDir.set(0.5 * Math.cos(theta), 0.5 * Math.sin(theta), 1)
          .applyEuler(state.threeStuffs.faceObject.rotation);
        initParticle(state.particles[state.particleShotIndex], 2000 + 40 * Math.random(), state.particleDir);
        state.particleShotIndex = (state.particleShotIndex + 1) % state.particles.length;
      }
      state.mouthOpeningMaterials.forEach((m) => { m.uniforms.mouthOpening.value = mouthOpening; });
      if (state.mouthHideMesh) state.mouthHideMesh.scale.setY(1 + mouthOpening * 0.4);
    }
    TWEEN.update();
    JeelizThreeHelper.render(detectState, THREECAMERA);
  }

  return { init, track, state };
})();

// ============================================================================
// FILTER ROUTING
// ============================================================================
const FILTERS = { dog: DogFilter, tiger: TigerFilter };
const ACTIVE = FILTERS[FILTER];

function init_faceFilter() {
  JEELIZFACEFILTER.init({
    canvasId: 'jeeFaceFilterCanvas',
    NNCPath: 'vendor/jeeliz/neuralNets/',
    videoSettings: { videoElement: pumpVideo },
    callbackReady: function (errCode, spec) {
      if (errCode) {
        setStatus('Jeeliz failed to start (code ' + errCode + '). WebGL + neural net files required.', true);
        return;
      }
      FFSPECS = spec;
      spec.canvasElement.width = pumpCanvas.width;
      spec.canvasElement.height = pumpCanvas.height;
      JEELIZFACEFILTER.resize();
      ACTIVE.init(spec);
    },
    callbackTrack: function (detectState) {
      ACTIVE.track(detectState);
    },
  });
}

// ============================================================================
// UI WIRING
// ============================================================================
function buildPicker() {
  const pickerEl = document.getElementById('kevin-picker');
  if (!pickerEl) return;
  pickerEl.innerHTML = '';
  PRESET_KEVINS.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kevin-thumb';
    btn.setAttribute('aria-label', 'Use ' + item.label);
    const thumb = document.createElement('img');
    thumb.src = item.src;
    thumb.alt = '';
    btn.appendChild(thumb);
    btn.addEventListener('click', () => {
      pickerEl.querySelectorAll('.kevin-thumb').forEach((b) => b.classList.remove('kevin-thumb--active'));
      btn.classList.add('kevin-thumb--active');
      loadImageUrl(item.src, false);
    });
    pickerEl.appendChild(btn);
    if (i === 0) btn.classList.add('kevin-thumb--active');
  });
}

function loadImageUrl(url, revokeAfter) {
  loadImagePromise(url)
    .then((img) => applyPhotoSource(img))
    .then(() => { if (revokeAfter) URL.revokeObjectURL(url); })
    .catch(() => {
      setStatus('Could not load image.', true);
      if (revokeAfter) URL.revokeObjectURL(url);
    });
}

function wireFilterTypePicker() {
  document.querySelectorAll('.filter-type-btn').forEach((btn) => {
    if (btn.dataset.filter === FILTER) btn.classList.add('filter-type-btn--active');
    btn.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('filter', btn.dataset.filter);
      window.location.href = url.toString();
    });
  });
}

function wireStylePicker() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      DogFilter.state.currentStyle = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach((b) => {
        b.classList.toggle('filter-btn--active', b.dataset.filter === btn.dataset.filter);
      });
      if (DogFilter.state.isLoaded) DogFilter.applyStyle(btn.dataset.filter);
    });
  });
}

function showTapToStart(startFn) {
  const wrap = document.querySelector('.doggify-canvas-wrap');
  if (!wrap) { startFn(); return; }
  const overlay = document.createElement('button');
  overlay.type = 'button';
  overlay.className = 'doggify-tap-start';
  overlay.textContent = 'Tap to start';
  wrap.appendChild(overlay);
  overlay.addEventListener('click', () => { overlay.remove(); startFn(); }, { once: true });
}

function boot() {
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    setStatus('This filter requires canvas streaming support. Try Chrome, Firefox, or update your browser.', true);
    return;
  }

  document.body.classList.add('doggify-filter-' + FILTER);

  wireFilterTypePicker();
  wireStylePicker();
  setupPumpElements();

  const downloadBtn = document.getElementById('download-btn');
  if (downloadBtn) {
    downloadBtn.disabled = false;
    downloadBtn.addEventListener('click', () => {
      const c = document.getElementById('jeeFaceFilterCanvas');
      try {
        const a = document.createElement('a');
        a.href = c.toDataURL('image/png');
        a.download = 'kevin-' + FILTER + '.png';
        a.click();
      } catch (e) {
        setStatus('Could not export PNG (browser/WebGL readback). Try a screenshot.', true);
      }
    });
  }

  const fileInput = document.getElementById('photo-upload');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      document.querySelectorAll('.kevin-thumb').forEach((b) => b.classList.remove('kevin-thumb--active'));
      loadImageUrl(url, true);
    });
  }

  buildPicker();
  setStatus('Loading…');

  function startFilter() {
    loadImagePromise(PRESET_KEVINS[0].src)
      .then((img) => {
        pumpImage = img;
        // Fixed square 720×720 — neural net is most reliable on a square input
        // and a fixed size means switching photos never resizes the WebGL canvas.
        pumpCanvas.width = 720;
        pumpCanvas.height = 720;
        drawImageCover(img);
        const stream = pumpCanvas.captureStream(30);
        pumpVideo.srcObject = stream;
        return pumpVideo.play();
      })
      .then(() => {
        startPumpLoop();
        init_faceFilter();
      })
      .catch((e) => {
        if (e && e.name === 'NotAllowedError') {
          setStatus('Tap the canvas to start.');
          showTapToStart(startFilter);
        } else {
          console.error(e);
          setStatus('Could not prepare image stream. Serve over http(s):// not file://.', true);
        }
      });
  }

  startFilter();
}

window.addEventListener('load', boot);
