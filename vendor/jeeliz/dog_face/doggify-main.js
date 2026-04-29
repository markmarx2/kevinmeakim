/**
 * Dog filter: Jeeliz FaceFilter dog_face demo (Apache-2.0).
 *
 * Photos only — no webcam: Jeeliz expects a <video> source; we pass a hidden
 * video fed by canvas.captureStream() that paints your image each frame (library API:
 * videoSettings.videoElement skips getUserMedia — see dist/jeelizFaceFilter.js init).
 */

const ASSET_BASE = 'vendor/jeeliz/dog_face/';
const PRESET_KEVINS = [{ src: 'doggify/Kevin.jpg', label: 'Kevin' }];

let THREECAMERA = null;
let ISDETECTED = false;
let TONGUEMESH = null;
let NOSEMESH = null;
let EARMESH = null;
let DOGOBJ3D = null;
let FRAMEOBJ3D = null;

let ISOVERTHRESHOLD = false;
let ISUNDERTRESHOLD = true;
let ISLOADED = false;

let MIXER = null;
let ACTION = null;

let ISANIMATING = false;
let ISOPAQUE = false;
let ISTONGUEOUT = false;
let ISANIMATIONOVER = false;

let _videoGeometry = null;

let FFSPECS = null;

/** Off-screen 2D canvas → MediaStream → hidden video (Jeeliz input, no webcam). */
let pumpCanvas = null;
let pumpCtx = null;
let pumpVideo = null;
let pumpImage = null;
let pumpRafId = null;

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
  pumpVideo.setAttribute('muted', '');
  pumpVideo.muted = true;
  pumpVideo.autoplay = true;
  pumpCanvas.style.cssText =
    'position:fixed;left:-9999px;top:0;width:4px;height:4px;opacity:0;pointer-events:none';
  pumpVideo.style.cssText = pumpCanvas.style.cssText;
  document.body.appendChild(pumpCanvas);
  document.body.appendChild(pumpVideo);
}

function startPumpLoop() {
  function loop() {
    if (pumpCtx && pumpImage && pumpCanvas.width > 0 && pumpCanvas.height > 0) {
      pumpCtx.drawImage(pumpImage, 0, 0, pumpCanvas.width, pumpCanvas.height);
    }
    pumpRafId = requestAnimationFrame(loop);
  }
  if (pumpRafId) cancelAnimationFrame(pumpRafId);
  loop();
}

function stopPumpLoop() {
  if (pumpRafId) {
    cancelAnimationFrame(pumpRafId);
    pumpRafId = null;
  }
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

/** Resize pump canvas, redraw, recreate MediaStream so Jeeliz sees new dimensions. */
async function applyPhotoSource(img, recreateStream) {
  pumpImage = img;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return;

  pumpCanvas.width = w;
  pumpCanvas.height = h;
  pumpCtx.drawImage(img, 0, 0);

  if (recreateStream && pumpVideo.srcObject) {
    pumpVideo.srcObject.getTracks().forEach((t) => t.stop());
    pumpVideo.srcObject = null;
  }

  const stream = pumpCanvas.captureStream(30);
  pumpVideo.srcObject = stream;
  await pumpVideo.play();

  if (typeof JEELIZFACEFILTER !== 'undefined' && JEELIZFACEFILTER.update_videoElement && FFSPECS) {
    await new Promise((resolve) => {
      try {
        JEELIZFACEFILTER.update_videoElement(pumpVideo, resolve);
      } catch (e) {
        resolve();
      }
    });
  }

  if (FFSPECS) {
    FFSPECS.canvasElement.width = w;
    FFSPECS.canvasElement.height = h;
    JEELIZFACEFILTER.resize();
  }
}

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
    uniforms: {
      samplerVideo: { value: threeTexture },
    },
  });
}

function apply_filter() {
  let canvas;
  try {
    canvas = fx.canvas();
  } catch (e) {
    console.warn('glfx canvas unavailable', e);
    return;
  }

  const tempImage = new Image(512, 512);
  tempImage.src = ASSET_BASE + 'images/texture_pink.jpg';

  tempImage.onload = () => {
    const texture = canvas.texture(tempImage);
    canvas.draw(texture).vignette(0.5, 0.6).update();

    const canvasOpacity = document.createElement('canvas');
    canvasOpacity.width = 512;
    canvasOpacity.height = 512;
    const ctx = canvasOpacity.getContext('2d');

    ctx.globalAlpha = 0.2;
    ctx.drawImage(canvas, 0, 0, 512, 512);

    const calqueMesh = new THREE.Mesh(
      _videoGeometry,
      create_mat2d(new THREE.TextureLoader().load(canvasOpacity.toDataURL('image/png')), true),
    );
    calqueMesh.material.opacity = 0.2;
    calqueMesh.material.transparent = true;
    calqueMesh.renderOrder = 999;
    calqueMesh.frustumCulled = false;
    FRAMEOBJ3D.add(calqueMesh);
  };
}

function init_threeScene(spec) {
  const threeStuffs = JeelizThreeHelper.init(spec, detect_callback);
  _videoGeometry = threeStuffs.videoMesh.geometry;

  const loadingManager = new THREE.LoadingManager();

  const loaderEars = new THREE.BufferGeometryLoader(loadingManager);

  loaderEars.load(ASSET_BASE + 'models/dog/dog_ears.json', function (geometry) {
    const mat = new THREE.FlexMaterial({
      map: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/texture_ears.jpg'),
      flexMap: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/flex_ears_256.jpg'),
      alphaMap: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/alpha_ears_256.jpg'),
      transparent: true,
      opacity: 1,
      bumpMap: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/normal_ears.jpg'),
      bumpScale: 0.0075,
      shininess: 1.5,
      specular: 0xffffff,
    });

    EARMESH = new THREE.Mesh(geometry, mat);
    EARMESH.scale.multiplyScalar(0.025);
    EARMESH.position.setY(-0.3);
    EARMESH.frustumCulled = false;
    EARMESH.renderOrder = 10000;
    EARMESH.material.opacity.value = 1;
  });

  const loaderNose = new THREE.BufferGeometryLoader(loadingManager);

  loaderNose.load(ASSET_BASE + 'models/dog/dog_nose.json', function (geometry) {
    const mat = new THREE.MeshPhongMaterial({
      map: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/texture_nose.jpg'),
      shininess: 1.5,
      specular: 0xffffff,
      bumpMap: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/normal_nose.jpg'),
      bumpScale: 0.005,
    });

    NOSEMESH = new THREE.Mesh(geometry, mat);
    NOSEMESH.scale.multiplyScalar(0.018);
    NOSEMESH.position.setY(-0.05);
    NOSEMESH.position.setZ(0.15);
    NOSEMESH.frustumCulled = false;
    NOSEMESH.renderOrder = 10000;
  });

  const loaderTongue = new THREE.JSONLoader(loadingManager);

  loaderTongue.load(ASSET_BASE + 'models/dog/dog_tongue.json', function (geometry) {
    geometry.computeMorphNormals();
    const mat = new THREE.FlexMaterial({
      map: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/dog_tongue.jpg'),
      flexMap: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/flex_tongue_256.png'),
      alphaMap: new THREE.TextureLoader().load(ASSET_BASE + 'models/dog/tongue_alpha_256.jpg'),
      transparent: true,
      morphTargets: true,
      opacity: 1,
    });

    TONGUEMESH = new THREE.Mesh(geometry, mat);
    TONGUEMESH.material.opacity.value = 0;

    TONGUEMESH.scale.multiplyScalar(2);
    TONGUEMESH.position.setY(-0.28);

    TONGUEMESH.frustumCulled = false;
    TONGUEMESH.visible = false;

    if (!MIXER) {
      MIXER = new THREE.AnimationMixer(TONGUEMESH);
      const clips = TONGUEMESH.geometry.animations;
      const clip = clips[0];
      ACTION = MIXER.clipAction(clip);
      ACTION.noLoop = true;
      ACTION.play();
    }
  });

  loadingManager.onLoad = () => {
    DOGOBJ3D.add(EARMESH);
    DOGOBJ3D.add(NOSEMESH);
    DOGOBJ3D.add(TONGUEMESH);

    addDragEventListener(DOGOBJ3D);

    threeStuffs.faceObject.add(DOGOBJ3D);

    ISLOADED = true;
    setStatus('Dog filter active. Open mouth wide for the tongue.');
  };

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  threeStuffs.scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(100, 1000, 1000);
  threeStuffs.scene.add(dirLight);

  THREECAMERA = JeelizThreeHelper.create_camera();

  threeStuffs.scene.add(FRAMEOBJ3D);

  apply_filter();
}

function animate_tongue(mesh, isReverse) {
  mesh.visible = true;

  if (isReverse) {
    ACTION.timeScale = -1;
    ACTION.paused = false;

    setTimeout(() => {
      ACTION.paused = true;

      ISOPAQUE = false;
      ISTONGUEOUT = false;
      ISANIMATING = false;
      ISANIMATIONOVER = true;

      new TWEEN.Tween(mesh.material.opacity).to({ value: 0 }, 150).start();
    }, 150);
  } else {
    ACTION.timeScale = 1;
    ACTION.reset();
    ACTION.paused = false;

    new TWEEN.Tween(mesh.material.opacity)
      .to({ value: 1 }, 100)
      .onComplete(() => {
        ISOPAQUE = true;
        setTimeout(() => {
          ACTION.paused = true;
          ISANIMATING = false;
          ISTONGUEOUT = true;
          ISANIMATIONOVER = true;
        }, 150);
      })
      .start();
  }
}

function init_faceFilter() {
  JEELIZFACEFILTER.init({
    canvasId: 'jeeFaceFilterCanvas',
    NNCPath: 'vendor/jeeliz/neuralNets/',
    videoSettings: {
      videoElement: pumpVideo,
    },
    callbackReady: function (errCode, spec) {
      if (errCode) {
        setStatus('Jeeliz failed to start (code ' + errCode + '). WebGL + neural net files required.', true);
        return;
      }

      FFSPECS = spec;
      const w = pumpCanvas.width;
      const h = pumpCanvas.height;
      spec.canvasElement.width = w;
      spec.canvasElement.height = h;
      JEELIZFACEFILTER.resize();
      init_threeScene(spec);
    },

    callbackTrack: function (detectState) {
      ISDETECTED = JeelizThreeHelper.get_isDetected();

      if (ISDETECTED) {
        const _quat = new THREE.Quaternion();
        const _eul = new THREE.Euler();
        _eul.setFromQuaternion(_quat);

        if (EARMESH && EARMESH.material.set_amortized) {
          EARMESH.material.set_amortized(
            EARMESH.getWorldPosition(new THREE.Vector3(0, 0, 0)),
            EARMESH.getWorldScale(new THREE.Vector3(0, 0, 0)),
            EARMESH.getWorldQuaternion(_eul),
            false,
            0.1,
          );
        }

        if (TONGUEMESH && TONGUEMESH.material.set_amortized) {
          TONGUEMESH.material.set_amortized(
            TONGUEMESH.getWorldPosition(new THREE.Vector3(0, 0, 0)),
            TONGUEMESH.getWorldScale(new THREE.Vector3(0, 0, 0)),
            TONGUEMESH.getWorldQuaternion(_eul),
            false,
            0.3,
          );
        }

        if (detectState.expressions[0] >= 0.85 && !ISOVERTHRESHOLD) {
          ISOVERTHRESHOLD = true;
          ISUNDERTRESHOLD = false;
          ISANIMATIONOVER = false;
        }
        if (detectState.expressions[0] <= 0.1 && !ISUNDERTRESHOLD) {
          ISOVERTHRESHOLD = false;
          ISUNDERTRESHOLD = true;
          ISANIMATIONOVER = false;
        }

        if (ISLOADED && ISOVERTHRESHOLD && !ISANIMATING && !ISANIMATIONOVER) {
          if (!ISTONGUEOUT) {
            ISANIMATING = true;
            animate_tongue(TONGUEMESH);
          } else {
            ISANIMATING = true;
            animate_tongue(TONGUEMESH, true);
          }
        }
      }

      TWEEN.update();

      if (ISOPAQUE && MIXER) {
        MIXER.update(0.16);
      }

      JeelizThreeHelper.render(detectState, THREECAMERA);
    },
  });
}

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
    .then((img) => applyPhotoSource(img, !!FFSPECS))
    .then(() => {
      if (revokeAfter) URL.revokeObjectURL(url);
    })
    .catch(() => {
      setStatus('Could not load image.', true);
      if (revokeAfter) URL.revokeObjectURL(url);
    });
}

function boot() {
  DOGOBJ3D = new THREE.Object3D();
  FRAMEOBJ3D = new THREE.Object3D();

  setupPumpElements();

  const downloadBtn = document.getElementById('download-btn');
  if (downloadBtn) {
    downloadBtn.disabled = false;
    downloadBtn.addEventListener('click', () => {
      const c = document.getElementById('jeeFaceFilterCanvas');
      try {
        const a = document.createElement('a');
        a.href = c.toDataURL('image/png');
        a.download = 'kevin-doggified.png';
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
  setStatus('Loading photo & Jeeliz (no webcam)…');

  loadImagePromise(PRESET_KEVINS[0].src)
    .then((img) => {
      pumpImage = img;
      pumpCanvas.width = img.naturalWidth;
      pumpCanvas.height = img.naturalHeight;
      pumpCtx.drawImage(img, 0, 0);
      const stream = pumpCanvas.captureStream(30);
      pumpVideo.srcObject = stream;
      return pumpVideo.play();
    })
    .then(() => {
      startPumpLoop();
      init_faceFilter();
    })
    .catch((e) => {
      console.error(e);
      setStatus('Could not prepare image/video stream. Serve over http(s):// not file://.', true);
    });
}

window.addEventListener('load', boot);
