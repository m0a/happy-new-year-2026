import * as THREE from 'three';
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// ========== Game State ==========
interface GameState {
  score: number;
  lives: number;
  isGameOver: boolean;
  waveEnemies: number;
  waveNumber: number;
}

const gameState: GameState = {
  score: 0,
  lives: 100,
  isGameOver: false,
  waveEnemies: 0,
  waveNumber: 1,
};

// ========== Mobile/Touch Detection ==========
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const isMobile = isTouchDevice || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ========== Audio ==========
let audioContext: AudioContext | null = null;
let isPlaying = false;

function playSound(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.1) {
  if (!audioContext || !isPlaying) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

function playShootSound() { playSound(440, 0.08, 'square', 0.08); }
function playExplosionSound() { playSound(80, 0.3, 'sawtooth', 0.2); }
function playHitSound() { playSound(150, 0.15, 'square', 0.15); }
function playBoostSound() { playSound(200, 0.15, 'sawtooth', 0.1); }
function playCrashSound() {
  playSound(60, 0.5, 'sawtooth', 0.3);
  playSound(40, 0.6, 'square', 0.25);
}

function createBGM() {
  if (!audioContext) audioContext = new AudioContext();
  audioContext.resume(); // Ensure audio is not suspended
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.06;
  masterGain.connect(audioContext.destination);
  const bassNotes = [55, 55, 73.42, 55, 82.41, 82.41, 73.42, 55];
  let bassIndex = 0;
  function playBass() {
    if (!audioContext || !isPlaying) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = bassNotes[bassIndex % bassNotes.length];
    gain.gain.setValueAtTime(0.4, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(audioContext.currentTime + 0.2);
    bassIndex++;
    setTimeout(playBass, 200);
  }
  playBass();
}

// ========== Three.js Setup ==========
const scene = new THREE.Scene();
// Sky blue fog for flight atmosphere
scene.fog = new THREE.Fog(0x87CEEB, 100, 500);
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 150, 300);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app')!.appendChild(renderer.domElement);

// ========== Lighting ==========
const ambientLight = new THREE.AmbientLight(0x6688aa, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffee, 1.2);
dirLight.position.set(100, 200, 100);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -200;
dirLight.shadow.camera.right = 200;
dirLight.shadow.camera.top = 200;
dirLight.shadow.camera.bottom = -200;
scene.add(dirLight);

const hemiLight = new THREE.HemisphereLight(0xaaccff, 0x88aa44, 0.5);
scene.add(hemiLight);

// ========== Flight State ==========
let yaw = 0;
let pitch = 0;
let roll = 0;
let throttle = 0.25; // 0 to 1
let isBackCamera = false; // Back camera toggle

// PIP camera for front view when back camera is active
const pipCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000);
const pipSize = { width: 200, height: 150 };

// PIP frame element
let pipFrame: HTMLDivElement | null = null;
function createPipFrame() {
  pipFrame = document.createElement('div');
  pipFrame.id = 'pip-frame';
  pipFrame.innerHTML = '<span>FRONT</span>';
  pipFrame.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: ${isMobile ? '120px' : '200px'};
    height: ${isMobile ? '90px' : '150px'};
    border: 3px solid #0ff;
    box-shadow: 0 0 10px #0ff, inset 0 0 20px rgba(0,255,255,0.1);
    pointer-events: none;
    z-index: 50;
    display: none;
  `;
  const span = pipFrame.querySelector('span')!;
  span.style.cssText = `
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    color: #0ff;
    font-family: monospace;
    font-size: 12px;
    text-shadow: 0 0 5px #0ff;
  `;
  document.body.appendChild(pipFrame);
}

function updatePipFrame() {
  if (!pipFrame) createPipFrame();
  if (pipFrame) {
    pipFrame.style.display = isBackCamera ? 'block' : 'none';
  }
}
const maxSpeed = 2.0;
const minSpeed = 0.3;
const pitchSpeed = 0.03;
const yawSpeed = 0.02;
const rollSpeed = 0.04;
const sensitivity = 0.002;

// ========== Create Sky Environment ==========
const GROUND_LEVEL = 0;

// Ground plane (city ground)
const groundGeom = new THREE.PlaneGeometry(2000, 2000);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x333333,
  roughness: 0.9,
});
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_LEVEL;
ground.receiveShadow = true;
scene.add(ground);

// ========== City Buildings ==========
const buildings: THREE.Mesh[] = [];
const buildingData: { x: number; z: number; height: number }[] = [];
const buildingMats = [
  new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.7 }),
  new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.7 }),
  new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.7 }),
  new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.6 }),
  new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.6 }),
];
const windowMat = new THREE.MeshStandardMaterial({
  color: 0xffffaa,
  emissive: 0xffff66,
  emissiveIntensity: 0.3
});

function createBuilding(x: number, z: number, width: number, depth: number, height: number) {
  const mat = buildingMats[Math.floor(Math.random() * buildingMats.length)];
  const geom = new THREE.BoxGeometry(width, height, depth);
  const building = new THREE.Mesh(geom, mat);
  building.position.set(x, GROUND_LEVEL + height / 2, z);
  building.castShadow = true;
  building.receiveShadow = true;
  scene.add(building);
  buildings.push(building);
  buildingData.push({ x, z, height });

  // Add windows
  const windowRows = Math.floor(height / 8);
  const windowCols = Math.floor(width / 6);
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowCols; col++) {
      if (Math.random() > 0.3) { // 70% chance of lit window
        const windowGeom = new THREE.PlaneGeometry(3, 4);
        const windowMesh = new THREE.Mesh(windowGeom, windowMat);
        windowMesh.position.set(
          x - width / 2 + 4 + col * 6,
          GROUND_LEVEL + 5 + row * 8,
          z + depth / 2 + 0.1
        );
        scene.add(windowMesh);

        // Back side windows
        const windowBack = new THREE.Mesh(windowGeom, windowMat);
        windowBack.position.set(
          x - width / 2 + 4 + col * 6,
          GROUND_LEVEL + 5 + row * 8,
          z - depth / 2 - 0.1
        );
        windowBack.rotation.y = Math.PI;
        scene.add(windowBack);
      }
    }
  }
}

// Create city grid
const citySize = 700;
const blockSize = 60;
const streetWidth = 20;

for (let bx = -citySize / 2; bx < citySize / 2; bx += blockSize + streetWidth) {
  for (let bz = -citySize / 2; bz < citySize / 2; bz += blockSize + streetWidth) {
    // Random buildings per block
    const numBuildings = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numBuildings; i++) {
      const width = 15 + Math.random() * 25;
      const depth = 15 + Math.random() * 25;
      const height = 20 + Math.random() * 100;
      const offsetX = (Math.random() - 0.5) * (blockSize - width);
      const offsetZ = (Math.random() - 0.5) * (blockSize - depth);
      createBuilding(bx + offsetX, bz + offsetZ, width, depth, height);
    }
  }
}

// Roads (darker lines on ground)
const roadMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.95 });
for (let i = -citySize / 2; i < citySize / 2; i += blockSize + streetWidth) {
  // Horizontal roads
  const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(citySize, streetWidth), roadMat);
  hRoad.rotation.x = -Math.PI / 2;
  hRoad.position.set(0, GROUND_LEVEL + 0.1, i + blockSize / 2);
  scene.add(hRoad);

  // Vertical roads
  const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(streetWidth, citySize), roadMat);
  vRoad.rotation.x = -Math.PI / 2;
  vRoad.position.set(i + blockSize / 2, GROUND_LEVEL + 0.1, 0);
  scene.add(vRoad);
}

// Clouds
const clouds: THREE.Mesh[] = [];
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1,
  transparent: true,
  opacity: 0.5,
});

function createCloud(x: number, y: number, z: number) {
  const group = new THREE.Group();
  const numPuffs = 5 + Math.floor(Math.random() * 5);

  for (let i = 0; i < numPuffs; i++) {
    const size = 15 + Math.random() * 25;
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(size, 8, 6),
      cloudMat
    );
    puff.position.set(
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 30
    );
    group.add(puff);
  }

  group.position.set(x, y, z);
  scene.add(group);
  clouds.push(group as unknown as THREE.Mesh);
}

// Create scattered clouds (higher up)
for (let i = 0; i < 30; i++) {
  createCloud(
    (Math.random() - 0.5) * 900,
    150 + Math.random() * 150,
    (Math.random() - 0.5) * 900
  );
}

// ========== Crosshair ==========
function createCrosshair() {
  const div = document.createElement('div');
  div.id = 'crosshair';
  div.innerHTML = `
    <div id="crosshair-h" style="position:absolute;width:24px;height:2px;background:#0f0;left:50%;top:50%;transform:translate(-50%,-50%);box-shadow:0 0 10px #0f0"></div>
    <div id="crosshair-v" style="position:absolute;width:2px;height:24px;background:#0f0;left:50%;top:50%;transform:translate(-50%,-50%);box-shadow:0 0 10px #0f0"></div>
    <div id="crosshair-circle" style="position:absolute;width:40px;height:40px;border:2px solid #0f0;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;opacity:0.5"></div>
    <div id="autoaim-indicator" style="position:absolute;width:50px;height:50px;border:3px solid #f00;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;opacity:0;transition:opacity 0.1s"></div>
  `;
  div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100';
  document.body.appendChild(div);
}

function setAutoAimIndicator(active: boolean) {
  const indicator = document.getElementById('autoaim-indicator');
  if (indicator) indicator.style.opacity = active ? '1' : '0';
}

// ========== Bullets ==========
interface Bullet {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  isPlayer: boolean;
}

const bullets: Bullet[] = [];
const bulletGeom = new THREE.SphereGeometry(0.4, 12, 8);

function shoot(direction: THREE.Vector3) {
  const bulletMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.8 });
  const bullet = new THREE.Mesh(bulletGeom, bulletMat);
  bullet.position.copy(camera.position);
  bullet.castShadow = true;
  scene.add(bullet);
  bullets.push({ mesh: bullet, velocity: direction.clone().normalize().multiplyScalar(4), life: 150, isPlayer: true });
  playShootSound();
}

function enemyShoot(position: THREE.Vector3) {
  const direction = camera.position.clone().sub(position).normalize();
  const bulletMat = new THREE.MeshStandardMaterial({ color: 0xff0066, emissive: 0xff0066, emissiveIntensity: 0.8 });
  const bullet = new THREE.Mesh(bulletGeom, bulletMat);
  bullet.position.copy(position);
  bullet.castShadow = true;
  scene.add(bullet);
  bullets.push({ mesh: bullet, velocity: direction.multiplyScalar(1.2), life: 200, isPlayer: false });
}

// ========== Enemies ==========
interface Enemy {
  mesh: THREE.Mesh;
  health: number;
  type: 'drone' | 'hunter' | 'tank' | 'boss';
  shootTimer: number;
  moveAngle: number;
  baseY: number;
  dormant: boolean;
  letter?: string;
  originalPos?: THREE.Vector3;
  flyAngle: number;
  flySpeed: number;
  hiding: boolean;
  hideTimer: number;
  targetBuilding: { x: number; z: number; height: number } | null;
  visualsUpdated: boolean; // Track if visuals have been updated for current wave
  aura?: THREE.Mesh; // Aura effect for later waves
  effectParticles?: THREE.Points; // Fire/lightning effect
}

const enemies: Enemy[] = [];
const ACTIVATION_DISTANCE = 100;

// ========== Wave-based Enemy Visual Updates ==========
function updateEnemyVisuals(enemy: Enemy) {
  const wave = gameState.waveNumber;
  const intensity = Math.min(wave / 5, 1); // 0 to 1 based on wave

  // Traverse all meshes in the enemy group
  enemy.mesh.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
      const mat = child.material;

      // 1. Color changes - darken and add red tint for later waves
      if (mat.color) {
        const originalHSL = { h: 0, s: 0, l: 0 };
        mat.color.getHSL(originalHSL);
        // Shift towards red and darken
        const newHue = originalHSL.h * (1 - intensity * 0.3) + 0 * intensity * 0.3; // Shift to red
        const newLightness = originalHSL.l * (1 - intensity * 0.3); // Darken
        mat.color.setHSL(newHue, Math.min(originalHSL.s + intensity * 0.3, 1), newLightness);
      }

      // Add emissive glow for later waves
      if (wave >= 3) {
        mat.emissive = new THREE.Color(0xff0000);
        mat.emissiveIntensity = intensity * 0.3;
      }
    }
  });

  // 2. Size increase for later waves
  const scaleBonus = 1 + intensity * 0.3; // Up to 30% larger
  enemy.mesh.scale.setScalar(scaleBonus);

  // 3. Eye expression changes - find and modify pupils
  enemy.mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = child.material as THREE.MeshStandardMaterial;
      // Check if this is a pupil (small, dark sphere)
      if (mat.color && child.geometry instanceof THREE.SphereGeometry) {
        const params = child.geometry.parameters;
        if (params.radius < 0.5) {
          // This is likely a pupil - make it red and larger for later waves
          mat.color.setHex(wave >= 3 ? 0xff0000 : 0x220000);
          mat.emissive = new THREE.Color(wave >= 4 ? 0xff0000 : 0x000000);
          mat.emissiveIntensity = wave >= 4 ? 0.8 : 0;
          // Angry eyes - make pupils slightly larger
          child.scale.setScalar(1 + intensity * 0.5);
        }
        // Eye whites - add bloodshot effect
        if (params.radius > 0.5 && params.radius < 1) {
          if (wave >= 4) {
            mat.color.lerp(new THREE.Color(0xffcccc), intensity * 0.5);
          }
        }
      }
    }
  });

  // 4. Add aura for wave 3+
  if (wave >= 3 && !enemy.aura) {
    const auraGeom = new THREE.SphereGeometry(12, 16, 12);
    const auraMat = new THREE.MeshBasicMaterial({
      color: wave >= 5 ? 0xff0000 : 0xff6600,
      transparent: true,
      opacity: 0.15 + intensity * 0.1,
      side: THREE.BackSide,
    });
    enemy.aura = new THREE.Mesh(auraGeom, auraMat);
    enemy.mesh.add(enemy.aura);
  }

  // 5. Add fire/lightning particles for wave 4+
  if (wave >= 4 && !enemy.effectParticles) {
    const particleCount = 20;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 10;
      positions[i + 1] = (Math.random() - 0.5) * 10;
      positions[i + 2] = (Math.random() - 0.5) * 10;

      // Fire colors (orange to red) or lightning (blue to white)
      if (wave >= 5) {
        // Lightning - blue/white
        colors[i] = 0.5 + Math.random() * 0.5;
        colors[i + 1] = 0.5 + Math.random() * 0.5;
        colors[i + 2] = 1;
      } else {
        // Fire - orange/red
        colors[i] = 1;
        colors[i + 1] = Math.random() * 0.5;
        colors[i + 2] = 0;
      }
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    enemy.effectParticles = new THREE.Points(particleGeom, particleMat);
    enemy.mesh.add(enemy.effectParticles);
  }

  enemy.visualsUpdated = true;
}

// Animate enemy effects (call in update loop)
function animateEnemyEffects(enemy: Enemy, time: number) {
  // Animate aura
  if (enemy.aura) {
    enemy.aura.scale.setScalar(1 + Math.sin(time * 3) * 0.1);
    (enemy.aura.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(time * 5) * 0.05;
  }

  // Animate particles
  if (enemy.effectParticles) {
    const positions = enemy.effectParticles.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += (Math.random() - 0.5) * 0.3;
      positions[i + 1] += Math.random() * 0.2;
      positions[i + 2] += (Math.random() - 0.5) * 0.3;

      // Reset if too far
      if (Math.abs(positions[i]) > 8) positions[i] = (Math.random() - 0.5) * 5;
      if (positions[i + 1] > 8) positions[i + 1] = -3;
      if (Math.abs(positions[i + 2]) > 8) positions[i + 2] = (Math.random() - 0.5) * 5;
    }
    enemy.effectParticles.geometry.attributes.position.needsUpdate = true;
    enemy.effectParticles.rotation.y += 0.02;
  }
}

// Font will be loaded here
let loadedFont: Font | null = null;

// Create a 3D letter character
function createLetterCharacter(char: string, color: number, font: Font): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });

  // Create the letter body
  const textGeometry = new TextGeometry(char, {
    font: font,
    size: 8,
    depth: 3,
    curveSegments: 8,
    bevelEnabled: true,
    bevelThickness: 0.4,
    bevelSize: 0.3,
    bevelSegments: 3,
  });
  textGeometry.center();
  textGeometry.computeVertexNormals();

  const letterMesh = new THREE.Mesh(textGeometry, mat);
  letterMesh.castShadow = true;
  letterMesh.receiveShadow = true;
  group.add(letterMesh);

  // Add eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const eyeGeom = new THREE.SphereGeometry(0.8, 16, 12);

  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(-2, 2, 2.5);
  leftEye.castShadow = true;
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(2, 2, 2.5);
  rightEye.castShadow = true;
  group.add(rightEye);

  // Add pupils
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x220000, roughness: 0.1 });
  const pupilGeom = new THREE.SphereGeometry(0.4, 12, 8);

  const leftPupil = new THREE.Mesh(pupilGeom, pupilMat);
  leftPupil.position.set(-2, 2, 3.2);
  group.add(leftPupil);

  const rightPupil = new THREE.Mesh(pupilGeom, pupilMat);
  rightPupil.position.set(2, 2, 3.2);
  group.add(rightPupil);

  return group;
}

function createLetterFormation() {
  if (!loadedFont) return;

  // Three rows of text - flying formation
  const row1 = "HAPPY NEW YEAR";
  const row2 = "2026";
  const row3 = "今年もよろしくお願いします";
  const spacing = 12; // wider space for flying
  const startZ = -100; // in front of player
  const row1Y = 200; // high above the city
  const row2Y = 160;
  const row3Y = 140; // Japanese text

  // Colors for different parts of the text
  const colorMap: { [key: string]: number } = {
    'H': 0xff0066,
    'A': 0xff3300,
    'P': 0xff6600,
    'Y': 0xffcc00,
    'N': 0x00ff66,
    'E': 0x00ffcc,
    'W': 0x0066ff,
    'R': 0x6600ff,
    '2': 0xff00ff,
    '0': 0x00ffff,
    '6': 0xffff00,
    // Japanese characters - rainbow colors
    '今': 0xff0066,
    '年': 0xff6600,
    'も': 0xffcc00,
    'よ': 0x00ff66,
    'ろ': 0x00ffcc,
    'し': 0x0066ff,
    'く': 0x6600ff,
    'お': 0xff00ff,
    '願': 0xff3300,
    'い': 0x00ffff,
    'ま': 0xffff00,
    'す': 0xff0066,
  };

  // Create row 1: HAPPY NEW YEAR
  const row1Chars = row1.replace(/ /g, '');
  let currentX = -((row1Chars.length - 1) * spacing) / 2;

  for (const char of row1) {
    if (char === ' ') continue;
    createLetterEnemy(char, currentX, row1Y, startZ, colorMap[char] || 0xffffff);
    currentX += spacing;
  }

  // Create row 2: 2026 (centered below)
  const row2Chars = row2.replace(/ /g, '');
  currentX = -((row2Chars.length - 1) * spacing) / 2;

  for (const char of row2) {
    if (char === ' ') continue;
    createLetterEnemy(char, currentX, row2Y, startZ, colorMap[char] || 0xffffff);
    currentX += spacing;
  }

  // Create row 3: 今年もよろしくお願いします (Japanese greeting - using sprites)
  const row3Chars = row3.replace(/ /g, '');
  const japaneseSpacing = 10;
  currentX = -((row3Chars.length - 1) * japaneseSpacing) / 2;

  for (const char of row3) {
    if (char === ' ') continue;
    createJapaneseEnemy(char, currentX, row3Y, startZ - 50, colorMap[char] || 0xffffff);
    currentX += japaneseSpacing;
  }
}

// Create Japanese character enemy using canvas texture
function createJapaneseEnemy(char: string, x: number, y: number, z: number, color: number) {
  // Create canvas for Japanese character
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Draw character
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 100px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 64, 64);

  // Create texture and sprite
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(8, 8, 1);
  sprite.position.set(x, y, z);
  scene.add(sprite);

  // Create a group to hold sprite and eyes
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // Add eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const eyeGeom = new THREE.SphereGeometry(0.6, 16, 12);

  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(-1.5, 1.5, 1);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(1.5, 1.5, 1);
  group.add(rightEye);

  // Add pupils
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x220000, roughness: 0.1 });
  const pupilGeom = new THREE.SphereGeometry(0.3, 12, 8);

  const leftPupil = new THREE.Mesh(pupilGeom, pupilMat);
  leftPupil.position.set(-1.5, 1.5, 1.5);
  group.add(leftPupil);

  const rightPupil = new THREE.Mesh(pupilGeom, pupilMat);
  rightPupil.position.set(1.5, 1.5, 1.5);
  group.add(rightPupil);

  scene.add(group);

  // Determine enemy type
  let type: 'drone' | 'hunter' | 'tank' | 'boss' = 'hunter';
  let health = 5;

  // Store both sprite and group in a container
  const container = new THREE.Group();
  container.add(sprite);
  container.add(group);
  container.position.set(x, y, z);
  sprite.position.set(0, 0, 0);
  group.position.set(0, 0, 0);

  // Remove individual objects and use container
  scene.remove(sprite);
  scene.remove(group);
  scene.add(container);

  enemies.push({
    mesh: container as unknown as THREE.Mesh,
    health,
    type,
    shootTimer: 2 + Math.random() * 3,
    moveAngle: Math.random() * Math.PI * 2,
    baseY: y,
    dormant: true,
    letter: char,
    originalPos: new THREE.Vector3(x, y, z),
    flyAngle: Math.random() * Math.PI * 2,
    hiding: false,
    hideTimer: 0,
    targetBuilding: null,
    flySpeed: 0.3 + Math.random() * 0.5,
    visualsUpdated: false,
  });
}

function createLetterEnemy(char: string, x: number, y: number, z: number, color: number) {
  if (!loadedFont) return;

  // Determine enemy type based on character
  let type: 'drone' | 'hunter' | 'tank' | 'boss' = 'drone';
  let health: number;

  if (char === '2' || char === '0' || char === '6') {
    type = 'boss';
    health = 20;
  } else if (char === 'H' || char === 'N' || char === 'Y' || char === 'R') {
    type = 'tank';
    health = 10;
  } else {
    type = 'hunter';
    health = 5;
  }

  const mesh = createLetterCharacter(char, color, loadedFont) as unknown as THREE.Mesh;
  mesh.position.set(x, y, z);
  scene.add(mesh);

  enemies.push({
    mesh,
    health,
    type,
    shootTimer: 2 + Math.random() * 3,
    moveAngle: Math.random() * Math.PI * 2,
    baseY: y,
    dormant: true,
    letter: char,
    originalPos: new THREE.Vector3(x, y, z),
    flyAngle: Math.random() * Math.PI * 2,
    hiding: false,
    hideTimer: 0,
    targetBuilding: null,
    flySpeed: 0.3 + Math.random() * 0.5,
    visualsUpdated: false,
  });
}

// Load font and create formation
function loadFontAndCreateFormation() {
  const loader = new FontLoader();
  loader.load(
    'https://threejs.org/examples/fonts/helvetiker_bold.typeface.json',
    (font) => {
      loadedFont = font;
      createLetterFormation();
      gameState.waveEnemies = enemies.length;
    },
    undefined,
    (error) => {
      console.error('Font loading error:', error);
    }
  );
}

function createHumanoidMesh(color: number, scale: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });

  // Flying enemy - more aerodynamic
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2, 8), mat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);

  // Wings
  const wingGeom = new THREE.BoxGeometry(3, 0.1, 1);
  const leftWing = new THREE.Mesh(wingGeom, mat);
  leftWing.position.set(-1.5, 0, 0);
  leftWing.castShadow = true;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeom, mat);
  rightWing.position.set(1.5, 0, 0);
  rightWing.castShadow = true;
  group.add(rightWing);

  group.scale.setScalar(scale);
  return group;
}

function createEnemy(type: 'drone' | 'hunter' | 'tank' | 'boss' = 'drone') {
  let color: number;
  let health: number;
  let scale: number;

  switch (type) {
    case 'hunter': color = 0x00ff00; health = 2; scale = 1.5; break;
    case 'tank': color = 0xff8800; health = 8; scale = 2.5; break;
    case 'boss': color = 0xff0000; health = 30; scale = 4; break;
    default: color = 0xff00ff; health = 1; scale = 1;
  }

  const mesh = createHumanoidMesh(color, scale) as unknown as THREE.Mesh;

  const angle = Math.random() * Math.PI * 2;
  const dist = 150 + Math.random() * 100;
  const y = 20 + Math.random() * 100;
  mesh.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
  scene.add(mesh);

  const enemy: Enemy = {
    mesh,
    health,
    type,
    shootTimer: 1 + Math.random() * 2,
    moveAngle: Math.random() * Math.PI * 2,
    baseY: y,
    dormant: false,
    flyAngle: Math.random() * Math.PI * 2,
    flySpeed: 0.5 + Math.random() * 0.5,
    hiding: false,
    hideTimer: 0,
    targetBuilding: null,
    visualsUpdated: false,
  };
  // Apply wave-based visuals immediately for non-dormant enemies
  updateEnemyVisuals(enemy);
  enemies.push(enemy);
  gameState.waveEnemies++;
}

// ========== Recovery Items ==========
interface RecoveryItem {
  mesh: THREE.Mesh;
  rotationSpeed: number;
  floatOffset: number;
}
const recoveryItems: RecoveryItem[] = [];

function createRecoveryItem(pos: THREE.Vector3) {
  // Create a glowing cross/plus shape
  const group = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.5,
    roughness: 0.3,
  });

  // Vertical bar
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), mat);
  group.add(vBar);

  // Horizontal bar
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1), mat);
  group.add(hBar);

  group.position.copy(pos);
  group.position.y = Math.max(pos.y, 30); // Keep above ground
  scene.add(group);

  recoveryItems.push({
    mesh: group as unknown as THREE.Mesh,
    rotationSpeed: 0.02 + Math.random() * 0.02,
    floatOffset: Math.random() * Math.PI * 2,
  });
}

function playHealSound() {
  playSound(880, 0.15, 'sine', 0.15);
  setTimeout(() => playSound(1100, 0.15, 'sine', 0.12), 100);
}

// ========== Damage Screen Flash ==========
let damageOverlay: HTMLDivElement | null = null;

function createDamageOverlay() {
  damageOverlay = document.createElement('div');
  damageOverlay.id = 'damage-overlay';
  damageOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: radial-gradient(circle, transparent 30%, rgba(255, 0, 0, 0.6) 100%);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.1s;
    z-index: 50;
  `;
  document.body.appendChild(damageOverlay);
}

function showDamageFlash() {
  if (!damageOverlay) createDamageOverlay();
  if (damageOverlay) {
    damageOverlay.style.opacity = '1';
    setTimeout(() => {
      if (damageOverlay) damageOverlay.style.opacity = '0';
    }, 150);
  }
}

function updateRecoveryItems(time: number) {
  for (let i = recoveryItems.length - 1; i >= 0; i--) {
    const item = recoveryItems[i];

    // Rotate and float
    item.mesh.rotation.y += item.rotationSpeed;
    item.mesh.position.y += Math.sin(time * 3 + item.floatOffset) * 0.05;

    // Check collision with player
    const dist = item.mesh.position.distanceTo(camera.position);
    if (dist < 10) {
      // Collect item
      const healAmount = 25;
      gameState.lives = Math.min(100, gameState.lives + healAmount);
      playHealSound();
      scene.remove(item.mesh);
      recoveryItems.splice(i, 1);
    }
  }
}

// ========== Explosions ==========
interface Explosion { particles: THREE.Points; life: number; velocities: Float32Array; }
const explosions: Explosion[] = [];

function createExplosion(pos: THREE.Vector3, color: THREE.Color, size = 1) {
  const count = 50;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    positions[i] = pos.x; positions[i + 1] = pos.y; positions[i + 2] = pos.z;
    velocities[i] = (Math.random() - 0.5) * 0.6 * size;
    velocities[i + 1] = (Math.random() - 0.5) * 0.6 * size;
    velocities[i + 2] = (Math.random() - 0.5) * 0.6 * size;
    colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const particles = new THREE.Points(geom, new THREE.PointsMaterial({ size: 1, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending }));
  scene.add(particles);
  explosions.push({ particles, life: 60, velocities });
  playExplosionSound();
}

// ========== Input ==========
const keys: { [key: string]: boolean } = {};
let shootCooldown = 0;
let pointerLocked = false;

// Mobile
let moveJoystickX = 0, moveJoystickY = 0;
let mobileShoot = false, mobileBoost = false, mobileBrake = false;
let moveTouchId: number | null = null;

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  // Toggle back camera with 'C' or 'KeyC'
  if (e.code === 'KeyC') isBackCamera = !isBackCamera;
});
document.addEventListener('keyup', (e) => keys[e.code] = false);
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || isMobile) return;
  // Always plane-centric: mouse right = plane turns right (regardless of camera view)
  yaw -= e.movementX * sensitivity;
  pitch -= e.movementY * sensitivity;
  pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
});
document.addEventListener('mousedown', (e) => { if (e.button === 0) keys['shoot'] = true; });
document.addEventListener('mouseup', (e) => { if (e.button === 0) keys['shoot'] = false; });
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === renderer.domElement; });

// ========== Mobile Controls ==========
function createMobileControls() {
  if (!isMobile) return;
  const container = document.createElement('div');
  container.id = 'mobile-controls';
  container.innerHTML = `
    <div id="move-zone"><div id="move-base"><div id="move-stick"></div></div></div>
    <div id="shoot-btn">FIRE</div>
    <div id="boost-btn">BOOST</div>
    <div id="brake-btn">BRAKE</div>
    <div id="camera-btn">CAM</div>
  `;
  document.body.appendChild(container);

  const style = document.createElement('style');
  style.textContent = `
    #mobile-controls { position:fixed; bottom:0; left:0; right:0; height:220px; pointer-events:none; z-index:1000; }
    #move-zone { position:absolute; bottom:20px; left:15px; width:130px; height:130px; pointer-events:auto; touch-action:none; }
    #move-base { width:110px; height:110px; background:rgba(255,255,255,0.1); border:3px solid rgba(0,255,255,0.5); border-radius:50%; position:relative; display:flex; justify-content:center; align-items:center; }
    #move-stick { width:45px; height:45px; background:rgba(0,255,255,0.6); border-radius:50%; position:absolute; }
    #shoot-btn, #boost-btn, #brake-btn, #camera-btn { position:absolute; width:70px; height:70px; border-radius:50%; pointer-events:auto; touch-action:none; display:flex; justify-content:center; align-items:center; font-family:monospace; font-weight:bold; font-size:11px; }
    #shoot-btn { bottom:120px; right:30px; background:rgba(255,255,0,0.3); border:3px solid rgba(255,255,0,0.7); color:#ff0; }
    #boost-btn { bottom:30px; right:110px; background:rgba(0,255,0,0.3); border:3px solid rgba(0,255,0,0.7); color:#0f0; }
    #brake-btn { bottom:30px; right:30px; background:rgba(255,0,0,0.3); border:3px solid rgba(255,0,0,0.7); color:#f00; }
    #camera-btn { bottom:120px; right:110px; background:rgba(0,255,255,0.3); border:3px solid rgba(0,255,255,0.7); color:#0ff; }
    #camera-btn.back { background:rgba(255,0,255,0.4); border-color:rgba(255,0,255,0.8); color:#f0f; }
    #shoot-btn.active, #boost-btn.active, #brake-btn.active, #camera-btn.active { opacity:0.8; transform:scale(0.95); }
  `;
  document.head.appendChild(style);

  // Move joystick (controls pitch and yaw)
  const moveZone = document.getElementById('move-zone')!;
  const moveStick = document.getElementById('move-stick')!;
  const moveBase = document.getElementById('move-base')!;
  let moveStartX = 0, moveStartY = 0;

  moveZone.addEventListener('touchstart', (e) => { e.preventDefault(); const touch = e.changedTouches[0]; moveTouchId = touch.identifier; const rect = moveBase.getBoundingClientRect(); moveStartX = rect.left + rect.width / 2; moveStartY = rect.top + rect.height / 2; }, { passive: false });
  moveZone.addEventListener('touchmove', (e) => { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) { const touch = e.changedTouches[i]; if (touch.identifier === moveTouchId) { let dx = touch.clientX - moveStartX, dy = touch.clientY - moveStartY; const dist = Math.sqrt(dx * dx + dy * dy), maxDist = 30; if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; } moveJoystickX = dx / maxDist; moveJoystickY = dy / maxDist; moveStick.style.transform = `translate(${dx}px, ${dy}px)`; } } }, { passive: false });
  const resetMove = () => { moveTouchId = null; moveJoystickX = 0; moveJoystickY = 0; moveStick.style.transform = ''; };
  moveZone.addEventListener('touchend', (e) => { for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === moveTouchId) resetMove(); });
  moveZone.addEventListener('touchcancel', resetMove);

  // Buttons
  const shootBtn = document.getElementById('shoot-btn')!;
  shootBtn.addEventListener('touchstart', (e) => { e.preventDefault(); mobileShoot = true; shootBtn.classList.add('active'); }, { passive: false });
  shootBtn.addEventListener('touchend', () => { mobileShoot = false; shootBtn.classList.remove('active'); });
  shootBtn.addEventListener('touchcancel', () => { mobileShoot = false; shootBtn.classList.remove('active'); });

  const boostBtn = document.getElementById('boost-btn')!;
  boostBtn.addEventListener('touchstart', (e) => { e.preventDefault(); mobileBoost = true; boostBtn.classList.add('active'); }, { passive: false });
  boostBtn.addEventListener('touchend', () => { mobileBoost = false; boostBtn.classList.remove('active'); });
  boostBtn.addEventListener('touchcancel', () => { mobileBoost = false; boostBtn.classList.remove('active'); });

  const brakeBtn = document.getElementById('brake-btn')!;
  brakeBtn.addEventListener('touchstart', (e) => { e.preventDefault(); mobileBrake = true; brakeBtn.classList.add('active'); }, { passive: false });
  brakeBtn.addEventListener('touchend', () => { mobileBrake = false; brakeBtn.classList.remove('active'); });
  brakeBtn.addEventListener('touchcancel', () => { mobileBrake = false; brakeBtn.classList.remove('active'); });

  const cameraBtn = document.getElementById('camera-btn')!;
  cameraBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isBackCamera = !isBackCamera;
    cameraBtn.textContent = isBackCamera ? 'BACK' : 'CAM';
    cameraBtn.classList.toggle('back', isBackCamera);
  }, { passive: false });

  // Screen touch for camera control
  let screenTouchId: number | null = null;
  let lastTouchX = 0;
  let lastTouchY = 0;

  const canvas = renderer.domElement;
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && (target.closest('#mobile-controls') || target.closest('#shoot-btn') || target.closest('#boost-btn') || target.closest('#brake-btn') || target.closest('#camera-btn'))) {
      return;
    }
    if (screenTouchId === null) {
      screenTouchId = touch.identifier;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === screenTouchId) {
        const deltaX = touch.clientX - lastTouchX;
        const deltaY = touch.clientY - lastTouchY;
        yaw -= deltaX * 0.005;
        pitch -= deltaY * 0.005;
        pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      }
    }
  }, { passive: true });

  const resetScreenTouch = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === screenTouchId) {
        screenTouchId = null;
      }
    }
  };
  canvas.addEventListener('touchend', resetScreenTouch);
  canvas.addEventListener('touchcancel', resetScreenTouch);
}

// ========== Auto-Aim ==========
function getAutoAimTarget(): Enemy | null {
  let bestTarget: Enemy | null = null;
  let bestScore = -Infinity;
  const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

  for (const enemy of enemies) {
    const toEnemy = enemy.mesh.position.clone().sub(camera.position);
    const distance = toEnemy.length();
    if (distance > 200) continue;

    toEnemy.normalize();
    const dot = cameraDir.dot(toEnemy);

    if (dot < 0.5) continue;

    const score = dot * 100 - distance * 0.3;
    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }

  return bestTarget;
}

// ========== UI ==========
function createUI() {
  const ui = document.createElement('div');
  ui.id = 'game-ui';
  ui.innerHTML = `
    <div id="health-container">
      <div id="health-label">HP</div>
      <div id="health-bar-bg">
        <div id="health-bar"></div>
      </div>
      <div id="health-text">100</div>
    </div>
    <div id="score">SCORE: 0</div>
    <div id="wave">WAVE: 1</div>
    <div id="enemies">ENEMIES: 0</div>
    <div id="speed">SPEED: 25%</div>
    <div id="altitude">ALT: 50m</div>
    <div id="camera-mode">CAM: FRONT [C]</div>
    <div id="autoaim-status">AUTO-AIM: ON</div>
  `;
  ui.style.cssText = `position:fixed; top:20px; left:20px; color:#0f0; font-family:'Courier New',monospace; font-size:${isMobile ? '14px' : '18px'}; text-shadow:0 0 10px #0f0; z-index:100; pointer-events:none;`;
  document.body.appendChild(ui);

  const style = document.createElement('style');
  style.textContent = `
    #health-container { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
    #health-label { color:#0ff; text-shadow:0 0 10px #0ff; font-weight:bold; }
    #health-bar-bg { width:${isMobile ? '120px' : '200px'}; height:${isMobile ? '16px' : '20px'}; background:#333; border:2px solid #0ff; border-radius:4px; overflow:hidden; box-shadow:0 0 10px #0ff; }
    #health-bar { width:100%; height:100%; background:linear-gradient(90deg, #0f0, #0ff); transition:width 0.3s, background 0.3s; }
    #health-text { color:#0ff; text-shadow:0 0 10px #0ff; min-width:30px; }
    #score { margin-bottom:8px; }
    #wave { color:#ff0; text-shadow:0 0 10px #ff0; margin-bottom:8px; }
    #enemies { color:#f0f; text-shadow:0 0 10px #f0f; margin-bottom:8px; }
    #speed { color:#0f0; text-shadow:0 0 10px #0f0; margin-bottom:8px; }
    #altitude { color:#0ff; text-shadow:0 0 10px #0ff; margin-bottom:8px; }
    #camera-mode { color:#0ff; text-shadow:0 0 10px #0ff; margin-bottom:8px; }
    #camera-mode.back { color:#f0f; text-shadow:0 0 10px #f0f; }
    #autoaim-status { color:#f00; text-shadow:0 0 10px #f00; font-size:${isMobile ? '12px' : '14px'}; }
  `;
  document.head.appendChild(style);
}

function updateUI() {
  const hpBar = document.getElementById('health-bar');
  const hpText = document.getElementById('health-text');
  const s = document.getElementById('score');
  const w = document.getElementById('wave');
  const e = document.getElementById('enemies');
  const sp = document.getElementById('speed');
  const alt = document.getElementById('altitude');

  const hpPercent = Math.max(0, gameState.lives);
  if (hpBar) {
    hpBar.style.width = `${hpPercent}%`;
    // Change color based on HP
    if (hpPercent <= 25) {
      hpBar.style.background = 'linear-gradient(90deg, #f00, #f50)';
    } else if (hpPercent <= 50) {
      hpBar.style.background = 'linear-gradient(90deg, #f80, #ff0)';
    } else {
      hpBar.style.background = 'linear-gradient(90deg, #0f0, #0ff)';
    }
  }
  if (hpText) hpText.textContent = `${Math.max(0, gameState.lives)}`;
  if (s) s.textContent = `SCORE: ${gameState.score}`;
  if (w) w.textContent = `WAVE: ${gameState.waveNumber}`;
  if (e) e.textContent = `ENEMIES: ${enemies.length}`;
  if (sp) sp.textContent = `SPEED: ${Math.floor(throttle * 100)}%`;
  if (alt) alt.textContent = `ALT: ${Math.floor(camera.position.y)}m`;

  const cam = document.getElementById('camera-mode');
  if (cam) {
    cam.textContent = isBackCamera ? 'CAM: BACK [C]' : 'CAM: FRONT [C]';
    cam.classList.toggle('back', isBackCamera);
  }
}

// ========== Score API ==========
// Get group ID from URL query parameter (null if not specified)
function getGroupId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('g') || null;
}

const currentGroupId = getGroupId();

async function submitScore(playerName: string, score: number, wave: number, comment: string): Promise<{ success: boolean; rank?: number }> {
  try {
    const body: Record<string, unknown> = { player_name: playerName, score, wave, comment };
    if (currentGroupId) body.group_id = currentGroupId;
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to submit score:', error);
    return { success: false };
  }
}

async function getTopScores(checkScore?: number): Promise<{ scores: { player_name: string; score: number; wave: number; comment: string; created_at: string }[]; qualifies: boolean }> {
  try {
    const params = new URLSearchParams();
    if (currentGroupId) params.set('g', currentGroupId);
    if (checkScore) params.set('check', checkScore.toString());
    const url = '/api/scores' + (params.toString() ? '?' + params.toString() : '');
    const response = await fetch(url);
    const data = await response.json();
    return { scores: data.scores || [], qualifies: data.qualifies !== false };
  } catch (error) {
    console.error('Failed to get scores:', error);
    return { scores: [], qualifies: true };
  }
}

// LocalStorage keys
const PLAYER_NAME_KEY = 'sky-fighter-player-name';

function getSavedPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) || '';
  } catch {
    return '';
  }
}

function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // ignore
  }
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    // D1 datetime format: "YYYY-MM-DD HH:MM:SS"
    const isoStr = dateStr.replace(' ', 'T') + 'Z';
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return '';
    // Display in JST
    return date.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/\//g, '/');
  } catch {
    return '';
  }
}

let gameOverShown = false;

async function showGameOverScreen(title: string, emoji: string, bgColor: string, textColor: string) {
  // Prevent duplicate calls
  if (gameOverShown) return;
  gameOverShown = true;

  const overlay = document.createElement('div');
  overlay.id = 'game-over-overlay';
  overlay.innerHTML = `
    <h1>${title}</h1>
    ${emoji ? `<p style="font-size:${isMobile ? '40px' : '60px'}">${emoji}</p>` : ''}
    <p>SCORE: <span style="color:#ff0">${gameState.score}</span></p>
    <p>WAVE: ${gameState.waveNumber}</p>
    <div id="score-form" style="margin-top:20px;">
      <p style="color:#888">Checking ranking...</p>
    </div>
    <div id="leaderboard" style="margin-top:20px; display:none;">
      <h2 style="color:#ff0; margin-bottom:10px;">TOP SCORES</h2>
      <div id="leaderboard-list" style="font-size:${isMobile ? '12px' : '16px'};"></div>
    </div>
    <p id="restart-msg" style="margin-top:20px;animation:blink 1s infinite;display:none">[TAP TO RESTART]</p>
  `;
  overlay.style.cssText = `position:fixed; inset:0; background:${bgColor}; display:flex; flex-direction:column; justify-content:center; align-items:center; color:${textColor}; font-family:monospace; font-size:${isMobile ? '18px' : '24px'}; text-shadow:0 0 20px ${textColor}; z-index:2000; overflow-y:auto; padding:20px;`;
  document.body.appendChild(overlay);

  const scoreForm = document.getElementById('score-form')!;
  const leaderboard = document.getElementById('leaderboard')!;
  const leaderboardList = document.getElementById('leaderboard-list')!;
  const restartMsg = document.getElementById('restart-msg')!;

  let canRestart = false;

  // Check if score qualifies for top 10
  const { scores, qualifies } = await getTopScores(gameState.score);

  // Show leaderboard
  if (scores.length > 0) {
    leaderboard.style.display = 'block';
    leaderboardList.innerHTML = scores.map((s, i) => {
      const dateStr = s.created_at ? formatDateTime(s.created_at) : '';
      const commentStr = s.comment ? `<div style="color:#888; font-size:${isMobile ? '10px' : '12px'}; margin-left:20px;">"${s.comment}"</div>` : '';
      return `<div style="margin:8px 0;">
        <span style="color:#888; font-size:${isMobile ? '10px' : '12px'};">${dateStr}</span>
        ${i + 1}. ${s.player_name} - ${s.score} (Wave ${s.wave})
        ${commentStr}
      </div>`;
    }).join('');
  }

  if (!qualifies) {
    // Not in top 10 - skip registration
    scoreForm.innerHTML = `<p style="color:#888">Not in TOP 10</p>`;
    restartMsg.style.display = 'block';
    canRestart = true;
  } else {
    // Show registration form
    const savedName = getSavedPlayerName();
    scoreForm.innerHTML = `
      <input type="text" id="player-name" placeholder="YOUR NAME" maxlength="20" value="${savedName}"
        style="padding:10px 20px; font-size:18px; font-family:monospace; background:#222; color:#0f0; border:2px solid #0f0; text-align:center; width:200px;">
      <br>
      <input type="text" id="player-comment" placeholder="COMMENT (optional)" maxlength="100"
        style="margin-top:10px; padding:8px 15px; font-size:14px; font-family:monospace; background:#222; color:#0ff; border:2px solid #0ff; text-align:center; width:250px;">
      <br>
      <button id="submit-score" style="margin-top:15px; padding:10px 30px; font-size:16px; font-family:monospace; background:#0a0; color:#fff; border:none; cursor:pointer;">
        SUBMIT SCORE
      </button>
    `;

    const nameInput = document.getElementById('player-name') as HTMLInputElement;
    const commentInput = document.getElementById('player-comment') as HTMLInputElement;
    const submitBtn = document.getElementById('submit-score') as HTMLButtonElement;

    // Focus on name input (or comment if name already filled)
    setTimeout(() => {
      if (savedName) {
        commentInput.focus();
      } else {
        nameInput.focus();
      }
    }, 100);

    submitBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = nameInput.value.trim() || 'ANONYMOUS';
      const comment = commentInput.value.trim();
      submitBtn.textContent = 'SUBMITTING...';
      submitBtn.disabled = true;

      // Save name for next time
      savePlayerName(name);

      const result = await submitScore(name, gameState.score, gameState.waveNumber, comment);

      if (result.success) {
        scoreForm.innerHTML = `<p style="color:#0f0">RANK: #${result.rank}</p>`;
      } else {
        scoreForm.innerHTML = `<p style="color:#f00">FAILED TO SUBMIT</p>`;
      }

      // Refresh leaderboard
      const { scores: newScores } = await getTopScores();
      if (newScores.length > 0) {
        leaderboardList.innerHTML = newScores.map((s, i) => {
          const isMe = s.player_name === name && s.score === gameState.score;
          const dateStr = s.created_at ? formatDateTime(s.created_at) : '';
          const commentStr = s.comment ? `<div style="color:#888; font-size:${isMobile ? '10px' : '12px'}; margin-left:20px;">"${s.comment}"</div>` : '';
          return `<div style="margin:8px 0; ${isMe ? 'color:#0f0;' : ''}">
            <span style="color:#888; font-size:${isMobile ? '10px' : '12px'};">${dateStr}</span>
            ${i + 1}. ${s.player_name} - ${s.score} (Wave ${s.wave})
            ${commentStr}
          </div>`;
        }).join('');
      }

      restartMsg.style.display = 'block';
      canRestart = true;
    });

    // Handle Enter key
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commentInput.focus();
      }
    });

    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitBtn.click();
      }
    });

    // Prevent restart while form is visible
    overlay.addEventListener('click', (e) => {
      if (canRestart && e.target !== nameInput && e.target !== commentInput && e.target !== submitBtn) {
        location.reload();
      }
    });
    overlay.addEventListener('touchend', (e) => {
      if (canRestart && e.target !== nameInput && e.target !== commentInput && e.target !== submitBtn) {
        location.reload();
      }
    });
    return;
  }

  // Restart on click/tap
  overlay.addEventListener('click', () => {
    if (canRestart) location.reload();
  });
  overlay.addEventListener('touchend', () => {
    if (canRestart) location.reload();
  });
}

function showGameOver() {
  showGameOverScreen('GAME OVER', '', 'rgba(0,0,0,0.95)', '#f00');
}

function showCrashScreen() {
  showGameOverScreen('CRASHED!', '💥', 'rgba(20,0,0,0.95)', '#ff4400');
}

// ========== Game Logic ==========
function updatePlayer() {
  // Flight controls
  if (isMobile) {
    // Joystick controls pitch and roll
    pitch += moveJoystickY * pitchSpeed;
    roll = -moveJoystickX * 0.5; // Visual roll
    yaw -= moveJoystickX * yawSpeed;
  } else {
    // Keyboard controls
    if (keys['KeyW'] || keys['ArrowUp']) pitch -= pitchSpeed;
    if (keys['KeyS'] || keys['ArrowDown']) pitch += pitchSpeed;
    if (keys['KeyA'] || keys['ArrowLeft']) { yaw += yawSpeed; roll = Math.min(roll + rollSpeed, 0.5); }
    if (keys['KeyD'] || keys['ArrowRight']) { yaw -= yawSpeed; roll = Math.max(roll - rollSpeed, -0.5); }
    if (!keys['KeyA'] && !keys['ArrowLeft'] && !keys['KeyD'] && !keys['ArrowRight']) {
      roll *= 0.9; // Return to level
    }
  }

  // Throttle control
  if (keys['ShiftLeft'] || keys['ShiftRight'] || mobileBoost) {
    throttle = Math.min(throttle + 0.02, 1);
    if (throttle > 0.8) playBoostSound();
  }
  if (keys['ControlLeft'] || keys['ControlRight'] || mobileBrake) {
    throttle = Math.max(throttle - 0.02, 0.1);
  }

  // Clamp pitch
  pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));

  // Apply rotation (with back camera offset)
  camera.rotation.order = 'YXZ';
  if (isBackCamera) {
    camera.rotation.y = yaw + Math.PI; // Rotate 180 degrees
    camera.rotation.x = -pitch; // Invert pitch for back view
    camera.rotation.z = -roll;
  } else {
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = roll;
  }

  // Calculate speed
  const currentSpeed = minSpeed + throttle * (maxSpeed - minSpeed);

  // Move forward based on actual flight direction (not camera view)
  // Create a quaternion for the flight direction (always forward, ignoring back camera)
  const flightQuaternion = new THREE.Quaternion();
  const euler = new THREE.Euler(pitch, yaw, roll, 'YXZ');
  flightQuaternion.setFromEuler(euler);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(flightQuaternion);
  camera.position.add(forward.multiplyScalar(currentSpeed));

  // Altitude limits - crash if too low
  const crashHeight = GROUND_LEVEL + 5;
  if (camera.position.y < crashHeight) {
    // CRASH into ground!
    createExplosion(camera.position.clone(), new THREE.Color(0xff6600), 3);
    playCrashSound();
    gameState.lives = 0;
    gameState.isGameOver = true;
    showCrashScreen();
    return;
  }

  // Check collision with buildings
  for (const building of buildings) {
    const bPos = building.position;
    const bGeo = building.geometry as THREE.BoxGeometry;
    const halfW = bGeo.parameters.width / 2;
    const halfD = bGeo.parameters.depth / 2;
    const height = bGeo.parameters.height;

    if (
      camera.position.x > bPos.x - halfW - 3 &&
      camera.position.x < bPos.x + halfW + 3 &&
      camera.position.z > bPos.z - halfD - 3 &&
      camera.position.z < bPos.z + halfD + 3 &&
      camera.position.y < GROUND_LEVEL + height + 5
    ) {
      // CRASH into building!
      createExplosion(camera.position.clone(), new THREE.Color(0xff6600), 3);
      playCrashSound();
      gameState.lives = 0;
      gameState.isGameOver = true;
      showCrashScreen();
      return;
    }
  }

  // Upper altitude limit
  if (camera.position.y > 400) {
    camera.position.y = 400;
    if (pitch < 0) pitch *= 0.9;
  }

  // World boundaries (wrap around)
  const boundary = 400;
  if (camera.position.x > boundary) camera.position.x = -boundary;
  if (camera.position.x < -boundary) camera.position.x = boundary;
  if (camera.position.z > boundary) camera.position.z = -boundary;
  if (camera.position.z < -boundary) camera.position.z = boundary;

  // Shooting with auto-aim
  shootCooldown--;
  if ((keys['shoot'] || keys['Space'] || mobileShoot) && shootCooldown <= 0) {
    const target = getAutoAimTarget();
    let shootDir: THREE.Vector3;

    if (target) {
      shootDir = target.mesh.position.clone().sub(camera.position).normalize();
      setAutoAimIndicator(true);
    } else {
      shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      setAutoAimIndicator(false);
    }

    shoot(shootDir);
    shootCooldown = 6;
  } else if (shootCooldown > 3) {
    // Keep indicator on briefly
  } else {
    setAutoAimIndicator(false);
  }
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.add(b.velocity);
    b.life--;

    if (b.life <= 0 || b.mesh.position.y < -100 || b.mesh.position.y > 400) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }

    // Check collision with buildings - bullets don't pass through
    let hitBuilding = false;
    for (const building of buildings) {
      const bPos = building.position;
      const bGeo = building.geometry as THREE.BoxGeometry;
      const halfW = bGeo.parameters.width / 2;
      const halfD = bGeo.parameters.depth / 2;
      const height = bGeo.parameters.height;

      if (
        b.mesh.position.x > bPos.x - halfW &&
        b.mesh.position.x < bPos.x + halfW &&
        b.mesh.position.z > bPos.z - halfD &&
        b.mesh.position.z < bPos.z + halfD &&
        b.mesh.position.y < GROUND_LEVEL + height &&
        b.mesh.position.y > GROUND_LEVEL
      ) {
        hitBuilding = true;
        break;
      }
    }

    if (hitBuilding) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }

    if (b.isPlayer) {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dist = b.mesh.position.distanceTo(e.mesh.position);
        const hitRadius = e.type === 'boss' ? 8 : (e.type === 'tank' ? 5 : 3);

        if (dist < hitRadius) {
          e.health--;
          scene.remove(b.mesh);
          bullets.splice(i, 1);

          if (e.health <= 0) {
            const color = new THREE.Color(e.type === 'boss' ? 0xff0000 : e.type === 'tank' ? 0xff8800 : e.type === 'hunter' ? 0x00ff00 : 0xff00ff);
            createExplosion(e.mesh.position.clone(), color, e.type === 'boss' ? 3 : 1.5);
            // Drop recovery item (20% chance, 50% for boss)
            const dropChance = e.type === 'boss' ? 0.5 : 0.2;
            if (Math.random() < dropChance) {
              createRecoveryItem(e.mesh.position.clone());
            }
            scene.remove(e.mesh);
            enemies.splice(j, 1);
            gameState.waveEnemies--;
            gameState.score += e.type === 'boss' ? 1000 : e.type === 'tank' ? 300 : e.type === 'hunter' ? 150 : 100;
          } else {
            playHitSound();
          }
          break;
        }
      }
    } else {
      const dist = b.mesh.position.distanceTo(camera.position);
      if (dist < 3) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
        gameState.lives -= 10;
        playHitSound();
        showDamageFlash();
        if (gameState.lives <= 0) { gameState.isGameOver = true; showGameOver(); }
      }
    }
  }
}

// Find nearest building for cover
function findNearestBuilding(pos: THREE.Vector3): { x: number; z: number; height: number } | null {
  let nearest: { x: number; z: number; height: number } | null = null;
  let minDist = Infinity;

  for (const b of buildingData) {
    const dx = b.x - pos.x;
    const dz = b.z - pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < minDist && d < 100) {
      minDist = d;
      nearest = b;
    }
  }
  return nearest;
}

function updateEnemies(time: number) {
  for (const e of enemies) {
    const toPlayer = camera.position.clone().sub(e.mesh.position);
    const dist = toPlayer.length();
    toPlayer.normalize();

    // Check if dormant enemy should wake up
    if (e.dormant) {
      // Gentle floating motion
      e.mesh.position.y = e.baseY + Math.sin(time * 2 + e.moveAngle) * 2;

      // Wake up if player is close enough
      if (dist < ACTIVATION_DISTANCE) {
        e.dormant = false;
        // Apply wave-based visuals when waking up
        updateEnemyVisuals(e);
        playSound(200 + Math.random() * 100, 0.2, 'sawtooth', 0.15);
      }
      continue;
    }

    // Animate enemy effects (aura, particles)
    animateEnemyEffects(e, time);

    // Active: fly towards player
    const speed = e.type === 'hunter' ? 0.8 : e.type === 'tank' ? 0.4 : e.type === 'boss' ? 0.3 : 0.5;

    // Add some evasive movement
    e.flyAngle += 0.02;
    const evadeX = Math.sin(e.flyAngle) * 0.3;
    const evadeY = Math.cos(e.flyAngle * 0.7) * 0.2;

    // Check if enemy is in player's back camera view (being targeted from behind)
    // Player's forward direction based on yaw
    const playerForward = new THREE.Vector3(
      -Math.sin(yaw),
      0,
      -Math.cos(yaw)
    );
    // Direction from player to enemy
    const playerToEnemy = e.mesh.position.clone().sub(camera.position).normalize();
    // If dot product is negative, enemy is behind the player
    const enemyBehindPlayer = playerForward.dot(playerToEnemy) < -0.3;
    // Enemy should evade if player is using back camera and enemy is in that view
    const isTargetedByBackCamera = isBackCamera && enemyBehindPlayer && dist < 100;

    // Hiding behavior (only for non-boss enemies)
    e.hideTimer -= 0.016;

    if (e.type !== 'boss' && !e.hiding && e.hideTimer <= 0 && Math.random() < 0.002) {
      // Decide to hide
      const building = findNearestBuilding(e.mesh.position);
      if (building) {
        e.hiding = true;
        e.targetBuilding = building;
        e.hideTimer = 2 + Math.random() * 3; // Hide for 2-5 seconds
      }
    }

    if (e.hiding && e.targetBuilding) {
      // Move behind building (opposite side from player)
      const buildingToPlayer = new THREE.Vector2(
        camera.position.x - e.targetBuilding.x,
        camera.position.z - e.targetBuilding.z
      ).normalize();

      const hideX = e.targetBuilding.x - buildingToPlayer.x * 25;
      const hideZ = e.targetBuilding.z - buildingToPlayer.y * 25;
      const hideY = Math.min(e.targetBuilding.height * 0.7, 80);

      // Move towards hiding spot
      e.mesh.position.x += (hideX - e.mesh.position.x) * 0.03;
      e.mesh.position.z += (hideZ - e.mesh.position.z) * 0.03;
      e.mesh.position.y += (hideY - e.mesh.position.y) * 0.03;

      // Check if done hiding
      if (e.hideTimer <= 0) {
        e.hiding = false;
        e.targetBuilding = null;
        e.hideTimer = 5 + Math.random() * 5; // Wait before hiding again
      }
    } else if (isTargetedByBackCamera) {
      // EVASIVE MANEUVER! Enemy is being targeted by back camera - escape!
      // Evasion intensity scales with wave number (wave 1 = minimal, wave 5+ = maximum)
      const waveMultiplier = Math.min(gameState.waveNumber / 5, 1); // 0.2 at wave 1, 1.0 at wave 5+
      const evadeSpeed = speed * (1 + waveMultiplier * 2); // 1x to 3x speed

      // Early waves: enemies barely react. Later waves: aggressive evasion
      if (waveMultiplier < 0.4) {
        // Wave 1-2: Light evasion - just drift sideways a bit
        const dodgeDir = Math.sin(e.flyAngle * 5) > 0 ? 1 : -1;
        e.mesh.position.x += -toPlayer.z * dodgeDir * evadeSpeed * 0.3;
        e.mesh.position.z += toPlayer.x * dodgeDir * evadeSpeed * 0.3;
      } else if (waveMultiplier < 0.8) {
        // Wave 3-4: Moderate evasion - dodge and change altitude
        const dodgeDir = Math.sin(e.flyAngle * 8) > 0 ? 1 : -1;
        const perpX = -toPlayer.z * dodgeDir;
        const perpZ = toPlayer.x * dodgeDir;
        e.mesh.position.x += perpX * evadeSpeed * 0.6;
        e.mesh.position.z += perpZ * evadeSpeed * 0.6;
        e.mesh.position.y += Math.sin(e.flyAngle * 6) * 1.5;
      } else {
        // Wave 5+: Full evasion - aggressive escape maneuvers
        const dodgeDir = Math.sin(e.flyAngle * 10) > 0 ? 1 : -1;
        const perpX = -toPlayer.z * dodgeDir;
        const perpZ = toPlayer.x * dodgeDir;

        // Move sideways and away from player's back camera view
        e.mesh.position.x += perpX * evadeSpeed + toPlayer.x * evadeSpeed * 0.3;
        e.mesh.position.z += perpZ * evadeSpeed + toPlayer.z * evadeSpeed * 0.3;

        // Rapid altitude change to escape targeting
        e.mesh.position.y += Math.sin(e.flyAngle * 8) * 3;

        // Try to get out of back camera view by moving to player's side
        const escapeAngle = yaw + (dodgeDir * Math.PI / 2);
        e.mesh.position.x += Math.sin(escapeAngle) * evadeSpeed * 0.5;
        e.mesh.position.z += Math.cos(escapeAngle) * evadeSpeed * 0.5;
      }
    } else {
      // Normal movement
      if (dist > 30) {
        e.mesh.position.x += toPlayer.x * speed + evadeX;
        e.mesh.position.y += toPlayer.y * speed * 0.5 + evadeY;
        e.mesh.position.z += toPlayer.z * speed;
      } else {
        // Circle around player when close
        e.mesh.position.x += evadeX * 2;
        e.mesh.position.y += evadeY * 2;
      }
    }

    // Face the player
    const angleToPlayer = Math.atan2(
      camera.position.x - e.mesh.position.x,
      camera.position.z - e.mesh.position.z
    );
    e.mesh.rotation.y = angleToPlayer;

    // Tilt towards player
    const verticalAngle = Math.atan2(
      camera.position.y - e.mesh.position.y,
      dist
    );
    e.mesh.rotation.x = verticalAngle * 0.3;

    // Shooting
    e.shootTimer -= 0.016;
    if (e.shootTimer <= 0 && dist < 150) {
      enemyShoot(e.mesh.position.clone());
      e.shootTimer = e.type === 'boss' ? 0.5 : (e.type === 'tank' ? 1 : 1.5);
    }
  }
}

function updateExplosions() {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i];
    exp.life--;
    const pos = exp.particles.geometry.attributes.position.array as Float32Array;
    for (let j = 0; j < pos.length; j += 3) { pos[j] += exp.velocities[j]; pos[j + 1] += exp.velocities[j + 1]; pos[j + 2] += exp.velocities[j + 2]; }
    exp.particles.geometry.attributes.position.needsUpdate = true;
    (exp.particles.material as THREE.PointsMaterial).opacity = exp.life / 60;
    if (exp.life <= 0) { scene.remove(exp.particles); explosions.splice(i, 1); }
  }
}

// Update clouds position (parallax effect)
function updateClouds() {
  for (const cloud of clouds) {
    // Slowly move clouds
    cloud.position.x += 0.05;
    if (cloud.position.x > 500) cloud.position.x = -500;
  }
}

let letterFormationCreated = false;
let fontLoadingStarted = false;

function spawnWave() {
  // First wave: create the HAPPY NEW YEAR 2026 letter formation
  if (!letterFormationCreated) {
    if (!fontLoadingStarted) {
      fontLoadingStarted = true;
      loadFontAndCreateFormation();
    }
    if (enemies.length > 0) {
      letterFormationCreated = true;
    }
    return;
  }

  if (enemies.length === 0 && gameState.waveEnemies === 0) {
    const waveSize = 5 + gameState.waveNumber * 2;
    for (let i = 0; i < waveSize; i++) {
      setTimeout(() => {
        if (gameState.isGameOver) return;
        const rand = Math.random();
        let type: 'drone' | 'hunter' | 'tank' | 'boss' = 'drone';
        if (gameState.waveNumber >= 5 && rand < 0.08) type = 'boss';
        else if (gameState.waveNumber >= 3 && rand < 0.2) type = 'tank';
        else if (gameState.waveNumber >= 2 && rand < 0.45) type = 'hunter';
        createEnemy(type);
      }, i * 500);
    }
    gameState.waveNumber++;
  }
}

// ========== Animation Loop ==========
let time = 0;

function animate() {
  requestAnimationFrame(animate);
  if (gameState.isGameOver) return;

  time += 0.016;

  updatePlayer();
  updateBullets();
  updateEnemies(time);
  updateExplosions();
  updateRecoveryItems(time);
  updateClouds();
  spawnWave();
  updateUI();

  // Main render
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissorTest(false);
  renderer.render(scene, camera);

  // PIP render when back camera is active
  updatePipFrame();
  if (isBackCamera) {
    // Update PIP camera to show front view
    pipCamera.position.copy(camera.position);
    pipCamera.rotation.order = 'YXZ';
    pipCamera.rotation.y = yaw;
    pipCamera.rotation.x = pitch;
    pipCamera.rotation.z = roll;

    // Render PIP in top-right corner
    const pipW = isMobile ? 120 : pipSize.width;
    const pipH = isMobile ? 90 : pipSize.height;
    const pipX = window.innerWidth - pipW - 20;
    const pipY = window.innerHeight - pipH - 20;

    renderer.setScissorTest(true);
    renderer.setScissor(pipX, pipY, pipW, pipH);
    renderer.setViewport(pipX, pipY, pipW, pipH);
    renderer.render(scene, pipCamera);
  }
}

// ========== Resize ==========
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ========== Start ==========
const startScreen = document.getElementById('start-screen')!;

// Show leaderboard on start screen
async function showStartLeaderboard() {
  const container = document.getElementById('start-leaderboard');
  if (!container) return;

  container.innerHTML = '<p style="color:#888;">Loading scores...</p>';

  try {
    const { scores } = await getTopScores();
    if (scores.length > 0) {
      container.innerHTML = `
        <h2 style="color:#ff0; margin-bottom:15px; font-size:${isMobile ? '16px' : '20px'};">TOP SCORES</h2>
        <div style="font-size:${isMobile ? '11px' : '14px'}; color:#0f0;">
          ${scores.slice(0, 5).map((s, i) => {
            const dateStr = s.created_at ? formatDateTime(s.created_at) : '';
            const commentStr = s.comment ? `<div style="color:#888; font-size:${isMobile ? '9px' : '11px'}; margin-left:15px;">"${s.comment}"</div>` : '';
            return `<div style="margin:8px 0;">
              <span style="color:#888;">${dateStr}</span>
              ${i + 1}. ${s.player_name} - ${s.score}
              ${commentStr}
            </div>`;
          }).join('')}
        </div>
      `;
    } else {
      container.innerHTML = '';
    }
  } catch {
    container.innerHTML = '';
  }
}

showStartLeaderboard();

const startGame = () => {
  startScreen.style.display = 'none';
  if (!isMobile) renderer.domElement.requestPointerLock();
  isPlaying = true;
  createBGM();
  createUI();
  createCrosshair();
  createMobileControls();
  animate();
};

startScreen.addEventListener('click', startGame);
startScreen.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); }, { passive: false });

if (!isMobile) {
  renderer.domElement.addEventListener('click', () => { if (!pointerLocked && isPlaying) renderer.domElement.requestPointerLock(); });
}
