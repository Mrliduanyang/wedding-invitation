import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// ========== 加载进度条控制 ==========
const loadingStages = [
  {
    id: "world",
    percent: 10,
    stepId: "step-world",
    text: "🌍正在创建世界...",
  },
  {
    id: "roads",
    percent: 30,
    stepId: "step-roads",
    text: "🛣️铺设道路网络...",
  },
  {
    id: "buildings",
    percent: 55,
    stepId: "step-buildings",
    text: "🏙️建造婚礼城市...",
  },
  {
    id: "ferrari",
    percent: 75,
    stepId: "step-ferrari",
    text: "🏎️法拉利458加载中...",
  },
  {
    id: "ready",
    percent: 100,
    stepId: "step-ready",
    text: "✨一切准备就绪！",
  },
];
let _loadingCurrentPercent = 0;
let _loadingRafId = null;

function setLoadingProgress(stageId) {
  const stage = loadingStages.find((s) => s.id === stageId);
  if (!stage) return;

  const fill = document.getElementById("loadingBarFill");
  const glow = document.getElementById("loadingBarGlow");
  const pct = document.getElementById("loadingPercent");
  const stageText = document.getElementById("loadingStageText");

  // 更新文案（带重新触发动画）
  if (stageText) {
    stageText.style.animation = "none";
    stageText.offsetHeight; // reflow
    stageText.style.animation = "";
    stageText.textContent = stage.text;
  }

  // 平滑滚动进度数值
  const targetPercent = stage.percent;
  if (_loadingRafId) cancelAnimationFrame(_loadingRafId);

  function animatePercent() {
    if (_loadingCurrentPercent < targetPercent) {
      _loadingCurrentPercent = Math.min(
        _loadingCurrentPercent + 1,
        targetPercent,
      );
      if (pct) pct.textContent = `${_loadingCurrentPercent}%`;
      _loadingRafId = requestAnimationFrame(animatePercent);
    }
  }
  animatePercent();

  // 更新进度条宽度
  if (fill) fill.style.width = `${targetPercent}%`;
  if (glow) glow.style.width = `${targetPercent}%`;

  // 更新步骤图标状态
  loadingStages.forEach((s) => {
    const el = document.getElementById(s.stepId);
    if (!el) return;
    if (s.percent < stage.percent) {
      el.classList.remove("active");
      el.classList.add("done");
    } else if (s.id === stageId) {
      el.classList.remove("done");
      el.classList.add("active");
    } else {
      el.classList.remove("active", "done");
    }
  });
}

function hideLoadingScreen() {
  const screen = document.getElementById("loadingScreen");
  if (!screen) return;
  screen.classList.add("fade-out");
  setTimeout(() => {
    showGuideModal();
  }, 400);
  setTimeout(() => {
    screen.style.display = "none";
  }, 800);
}

// ========== 引导弹窗 ==========
function showGuideModal() {
  const overlay = document.getElementById("guideModal");
  if (!overlay) return;
  overlay.style.display = "flex";

  // 逐行渐现
  const lines = overlay.querySelectorAll(".guide-line");
  lines.forEach((line) => {
    const delay = parseInt(line.dataset.delay, 10) || 0;
    setTimeout(() => {
      line.classList.add("visible");
    }, delay + 200);
  });

  // 按钮在最后一行出现后再显示
  const lastDelay = Math.max(
    ...Array.from(lines).map((l) => parseInt(l.dataset.delay, 10) || 0),
  );
  const btns = overlay.querySelector(".guide-btns");
  setTimeout(() => {
    if (btns) btns.classList.add("visible");
  }, lastDelay + 2000);
}

function closeGuideModal(callback) {
  const overlay = document.getElementById("guideModal");
  if (!overlay) {
    if (callback) callback();
    return;
  }
  overlay.classList.add("guide-closing");
  setTimeout(() => {
    overlay.style.display = "none";
    overlay.classList.remove("guide-closing");
    if (callback) callback();
  }, 350);
}

// ========== 全局变量 ==========
let scene, camera, renderer, controls;
let buildings = [];
let car = null;
let currentTransport = "taxi";
let selectedDestination = null;
let routeGenerated = false;
let isNavigating = false;
let currentRoutePoints = [];
let currentRouteIndex = 0;
let balloons = [];
let routePreviewLine = null;
let isShowingRoutePreview = false;
let routeSegments = []; // 存储路线段，用于动态消失

// 语音播报（兼容性检查）
const synth = window.speechSynthesis || null;
let keyState = {}; // 存储键盘状态
let carSpeed = 0.3; // 小车移动速度
let lastUpdatedRouteIndex = -1; // 上次更新导航线时的路径点索引
let isMobile = false; // 是否为移动端

// 引擎声音系统
let audioContext = null;
let engineOscillator1 = null;
let engineOscillator2 = null;
let engineNoiseSource = null;
let engineGainNode = null;
let noiseGainNode = null;
let isEnginePlaying = false;

// ========== 烟花粒子系统 ==========
let fireworksParticles = []; // 所有烟花粒子组
let fireworksEnabled = false; // 是否启用烟花
let fireworksLastLaunchTime = 0; // 上次发射时间
const FIREWORKS_LAUNCH_INTERVAL = 400; // 发射间隔（毫秒）

// BGM 系统（目的地弹窗背景音乐）
let bgmAudio = null; // BGM Audio 实例

// 加减速系统
let currentActualSpeed = 0; // 当前实际速度（从0开始）
let targetSpeed = 0; // 目标速度
let isAccelerating = false; // 是否正在加速
let isDecelerating = false; // 是否正在减速
const acceleration = 0.001; // 加速度（每帧增加的速度）- 降低以延长加速时间
const deceleration = 0.0012; // 减速度（每帧减少的速度）- 平衡速度，既明显又能到达

// ========== 检测是否为移动端 ==========
function detectMobile() {
  isMobile = window.innerWidth <= 768;
  return isMobile;
}

// 小工具：延迟 ms 毫秒
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== Three.js 初始化 ==========
async function initThreeJS() {
  detectMobile();
  const container = document.getElementById("canvas-container");

  // 开始加载：世界创建
  setLoadingProgress("world");
  await delay(600);

  // 场景设置
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9eeff);
  scene.fog = new THREE.Fog(0xc9eeff, 180, 520);

  // 摄像头
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    10000,
  );
  camera.position.set(100, 120, 150);
  camera.lookAt(0, 0, 0);

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  // 控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.autoRotate = false;
  controls.autoRotateSpeed = 2;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // 限制垂直旋转角度，防止视角透视到地面底部
  controls.maxPolarAngle = Math.PI / 2.2; // 约 82 度，不能完全垂直向下
  controls.minPolarAngle = 0; // 可以完全向上看

  // 光源
  const ambientLight = new THREE.AmbientLight(0xfff5e0, 0.85); // 暖白光，增强亮度
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xfffbe8, 1.1); // 暖黄阳光，更明亮
  directionalLight.position.set(100, 150, 80);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.far = 500;
  directionalLight.shadow.camera.left = -150;
  directionalLight.shadow.camera.right = 150;
  directionalLight.shadow.camera.top = 150;
  directionalLight.shadow.camera.bottom = -150;
  scene.add(directionalLight);

  // 创建场景（分阶段汇报进度）
  await createCityScene();
  createBalloons();

  // 处理窗口大小变化
  window.addEventListener("resize", onWindowResize);

  // 开始渲染
  animate();

  // 加载法拉利（异步，进度由 createVehicle 内部控制）
  createVehicle();
}

// ========== 创建城市场景 ==========
async function createCityScene() {
  // 地面 - 扩大范围
  const groundGeometry = new THREE.PlaneGeometry(600, 600);
  const groundMaterial = new THREE.MeshLambertMaterial({
    color: 0x5ee87a, // 亮草绿，更清新
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 道路
  setLoadingProgress("roads");
  createRoads();
  await delay(700);

  // 建筑物
  setLoadingProgress("buildings");
  createBuildings();
  await delay(800);

  // 天空盒
  createSkybox();
}

function createRoads() {
  const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x6b6b82 }); // 蓝灰色路面，更欢快
  const lineMaterial = new THREE.MeshLambertMaterial({ color: 0xffee44 }); // 明黄中心线

  // 创建更多道路网格
  const roadWidth = 15;
  const roadSpacing = 100;

  // 水平道路
  for (let i = -2; i <= 2; i++) {
    const roadGeometry = new THREE.PlaneGeometry(600, roadWidth);
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.position.set(0, 0.5, i * roadSpacing);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    scene.add(road);

    // 中心线
    const lineGeometry = new THREE.PlaneGeometry(600, 0.5);
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.position.set(0, 0.6, i * roadSpacing);
    line.rotation.x = -Math.PI / 2;
    scene.add(line);
  }

  // 竖直道路
  for (let i = -2; i <= 2; i++) {
    const roadGeometry = new THREE.PlaneGeometry(roadWidth, 600);
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.position.set(i * roadSpacing, 0.5, 0);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    scene.add(road);

    // 中心线
    const lineGeometry = new THREE.PlaneGeometry(0.5, 600);
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.position.set(i * roadSpacing, 0.6, 0);
    line.rotation.x = -Math.PI / 2;
    scene.add(line);
  }
}

function createBuildings() {
  const positions = [
    // === 目的地建筑（特殊颜色，带指示灯）===
    {
      x: -150,
      z: -150,
      width: 35,
      depth: 35,
      height: 55,
      name: "婚礼现场",
      color: 0xff69b4,
      isVenue: true,
      destination: "wedding",
    },
    {
      x: 150,
      z: -150,
      width: 28,
      depth: 28,
      height: 45,
      name: "新郎家",
      color: 0x1e90ff,
      isVenue: true,
      destination: "groom",
    },
    {
      x: -150,
      z: 150,
      width: 28,
      depth: 28,
      height: 45,
      name: "新娘家",
      color: 0xffd700,
      isVenue: true,
      destination: "bride",
    },

    // === 办公大楼（鲜亮蓝绿系）===
    { x: -150, z: -60, width: 25, depth: 25, height: 60, color: 0x00d4ff }, // 天蓝
    { x: -150, z: 60, width: 22, depth: 22, height: 55, color: 0x00e5cc }, // 青绿
    { x: 150, z: -60, width: 24, depth: 24, height: 58, color: 0x5bc8ff }, // 浅蓝
    { x: 150, z: 60, width: 26, depth: 26, height: 52, color: 0x00bfff }, // 深天蓝

    // === 商业中心（亮橙/黄系）===
    { x: -60, z: -150, width: 30, depth: 20, height: 40, color: 0xff9500 }, // 橙色
    { x: 60, z: -150, width: 28, depth: 22, height: 42, color: 0xffd000 }, // 金黄
    { x: -60, z: 150, width: 32, depth: 18, height: 38, color: 0xff6b35 }, // 亮橙红
    { x: 60, z: 150, width: 26, depth: 24, height: 44, color: 0xffaa00 }, // 琥珀

    // === 住宅楼（珊瑚/粉红系）===
    { x: -160, z: -130, width: 18, depth: 18, height: 35, color: 0xff6eb4 }, // 粉红
    { x: -160, z: -30, width: 20, depth: 20, height: 32, color: 0xff4d8b }, // 亮粉
    { x: 160, z: -130, width: 18, depth: 18, height: 36, color: 0xff7eb3 }, // 浅粉
    { x: 160, z: 30, width: 21, depth: 21, height: 33, color: 0xff5fa0 }, // 玫瑰粉

    // === 中心区域建筑 ===
    // 左下街区 (-100到0, -100到0)
    { x: -60, z: -60, width: 20, depth: 20, height: 48, color: 0xff6ec7 }, // 亮玫粉
    { x: -70, z: -30, width: 18, depth: 18, height: 40, color: 0xffb347 }, // 鲜橙黄
    { x: -45, z: -45, width: 14, depth: 14, height: 32, color: 0xff5fa0 }, // 玫瑰粉
    { x: -20, z: -50, width: 13, depth: 13, height: 28, color: 0xffd966 }, // 亮黄

    // 右下街区 (0到100, -100到0)
    { x: 60, z: -60, width: 22, depth: 22, height: 46, color: 0x4dd9ff }, // 天蓝（浅亮）
    { x: 30, z: -70, width: 17, depth: 17, height: 38, color: 0x5ef6ff }, // 亮青蓝
    { x: 70, z: -30, width: 19, depth: 19, height: 42, color: 0x40d4ff }, // 浅蓝
    { x: 20, z: -50, width: 14, depth: 14, height: 29, color: 0x80eaff }, // 淡青

    // 左上街区 (-100到0, 0到100)
    { x: -60, z: 60, width: 21, depth: 21, height: 44, color: 0x69f0ae }, // 薄荷绿
    { x: -30, z: 70, width: 16, depth: 16, height: 36, color: 0x00e676 }, // 亮绿
    { x: -20, z: 50, width: 13, depth: 13, height: 30, color: 0x76ff03 }, // 草绿

    // 右上街区 (0到100, 0到100)
    { x: 30, z: 70, width: 17, depth: 17, height: 37, color: 0xffea00 }, // 亮黄
    { x: 70, z: 30, width: 19, depth: 19, height: 43, color: 0xff6d00 }, // 深橙
    { x: 45, z: 45, width: 15, depth: 15, height: 35, color: 0xff3d00 }, // 朱红

    // === 小型建筑（填充街区）===
    // 南边街区
    { x: -130, z: -150, width: 15, depth: 15, height: 28, color: 0x40c4ff }, // 浅天蓝
    { x: -30, z: -150, width: 16, depth: 16, height: 30, color: 0x18ffff }, // 亮青
    { x: -130, z: -165, width: 14, depth: 14, height: 24, color: 0x64ffda }, // 薄荷青
    { x: 30, z: -165, width: 13, depth: 13, height: 22, color: 0xb2ff59 }, // 黄绿

    // 北边街区
    { x: -130, z: 150, width: 15, depth: 15, height: 29, color: 0xeeff41 }, // 柠檬黄
    { x: 130, z: 150, width: 14, depth: 14, height: 31, color: 0xffd740 }, // 金黄
    { x: -70, z: 165, width: 13, depth: 13, height: 25, color: 0xffab40 }, // 橙黄
    { x: 70, z: 165, width: 14, depth: 14, height: 23, color: 0xff6e40 }, // 橙红

    // 西边街区
    { x: -150, z: -130, width: 16, depth: 16, height: 34, color: 0x40ffb3 }, // 翠青
    { x: -150, z: -30, width: 18, depth: 18, height: 36, color: 0x00e5ff }, // 亮青
    { x: -150, z: 70, width: 15, depth: 15, height: 32, color: 0x84ffff }, // 淡青
    { x: -165, z: -70, width: 14, depth: 14, height: 28, color: 0x1de9b6 }, // 碧绿

    // 东边街区
    { x: 150, z: -130, width: 17, depth: 17, height: 35, color: 0xff80ab }, // 粉红
    { x: 150, z: 130, width: 16, depth: 16, height: 37, color: 0xffb3c6 }, // 浅粉
    { x: 165, z: -70, width: 14, depth: 14, height: 31, color: 0xffda79 }, // 杏黄
    { x: 165, z: 70, width: 15, depth: 15, height: 29, color: 0xffd166 }, // 蜜黄

    // === 街角建筑 ===
    // 四个角的主要建筑
    { x: -130, z: -130, width: 18, depth: 18, height: 40, color: 0x00e5ff }, // 亮青
    { x: 130, z: -130, width: 19, depth: 19, height: 42, color: 0x00bcd4 }, // 青色
    { x: -130, z: 130, width: 17, depth: 17, height: 38, color: 0x26c6da }, // 青蓝
    { x: 130, z: 130, width: 20, depth: 20, height: 41, color: 0x00acc1 }, // 深青

    // 左侧街区建筑
    { x: -130, z: -60, width: 16, depth: 16, height: 30, color: 0xff5722 }, // 深橙
    { x: -130, z: 60, width: 17, depth: 17, height: 32, color: 0xff7043 }, // 橙色
    { x: -165, z: -30, width: 13, depth: 13, height: 26, color: 0xffa726 }, // 亮橙
    { x: -165, z: 30, width: 14, depth: 14, height: 28, color: 0xffca28 }, // 金黄

    // 右侧街区建筑
    { x: 130, z: -60, width: 15, depth: 15, height: 31, color: 0x5ce8a4 }, // 薄荷绿
    { x: 130, z: 60, width: 18, depth: 18, height: 29, color: 0x5de8d9 }, // 青绿
    { x: 165, z: -30, width: 13, depth: 13, height: 27, color: 0xf48fb1 }, // 粉色
    { x: 165, z: 30, width: 14, depth: 14, height: 25, color: 0xf06292 }, // 玫红

    // 南侧街区建筑
    { x: -60, z: -130, width: 14, depth: 14, height: 25, color: 0xff4081 }, // 粉红
    { x: 60, z: -130, width: 15, depth: 15, height: 27, color: 0xff1744 }, // 亮红
    { x: -30, z: -165, width: 12, depth: 12, height: 23, color: 0xff6b35 }, // 橙红
    { x: 30, z: -165, width: 13, depth: 13, height: 24, color: 0xff9100 }, // 橙色

    // 北侧街区建筑
    { x: -60, z: 130, width: 16, depth: 16, height: 26, color: 0x69f0ae }, // 薄荷绿
    { x: 60, z: 130, width: 14, depth: 14, height: 28, color: 0xb2ff59 }, // 黄绿
    { x: -30, z: 165, width: 12, depth: 12, height: 24, color: 0xccff90 }, // 浅绿
    { x: 30, z: 165, width: 13, depth: 13, height: 25, color: 0xf4ff81 }, // 嫩黄
  ];

  positions.forEach((pos, idx) => {
    const geometry = new THREE.BoxGeometry(pos.width, pos.height, pos.depth);
    const material = new THREE.MeshPhongMaterial({ color: pos.color });
    const building = new THREE.Mesh(geometry, material);

    building.position.set(pos.x, pos.height / 2, pos.z);
    building.castShadow = true;
    building.receiveShadow = true;

    building.userData = { name: pos.name, index: idx, color: pos.color };

    scene.add(building);
    buildings.push(building);

    // 为婚礼现场建筑添加指示灯
    if (pos.isVenue) {
      addBuildingIndicator(building, pos);
    }
  });
}

function addBuildingIndicator(building, pos) {
  // 只添加箭头指示器
  createArrowIndicator(pos);
}

function createArrowIndicator(pos) {
  // 创建箭头组
  const arrowGroup = new THREE.Group();

  // 只保留箭头主体（三角形圆锥体）
  const coneGeometry = new THREE.ConeGeometry(4, 8, 4);
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: pos.color,
    transparent: true,
    opacity: 0.9,
  });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  cone.rotation.x = Math.PI; // 旋转使箭头朝上
  arrowGroup.add(cone);

  // 设置箭头位置（在建筑上方）
  arrowGroup.position.set(pos.x, pos.height + 15, pos.z);

  // 添加到场景
  scene.add(arrowGroup);

  // 保存箭头信息用于动画
  arrowGroup.userData = {
    originalY: pos.height + 15,
    animate: true,
    destination: pos.destination,
  };

  // 将箭头添加到全局数组以便在动画循环中更新
  if (!window.arrowIndicators) {
    window.arrowIndicators = [];
  }
  window.arrowIndicators.push(arrowGroup);
}

function createVehicle() {
  // 创建一个容器组
  const carGroup = new THREE.Group();
  carGroup.position.set(0, 0, -200);
  carGroup.visible = false;
  scene.add(carGroup);
  car = carGroup;

  // 汇报进度：法拉利加载中
  setLoadingProgress("ferrari");

  // 使用GLTFLoader加载法拉利458模型
  const loader = new GLTFLoader();

  // 配置DRACOLoader（法拉利模型使用了Draco压缩）
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("./draco/gltf/");
  dracoLoader.setDecoderConfig({ type: "js" });
  loader.setDRACOLoader(dracoLoader);

  // 从本地加载模型（public/ferrari.glb）
  const modelUrl = "./ferrari.glb";

  loader.load(
    modelUrl,
    (gltf) => {
      const ferrari = gltf.scene;

      // 调整模型大小和位置
      ferrari.scale.set(3, 3, 3);
      ferrari.position.y = 0;
      ferrari.rotation.y = Math.PI; // 旋转180度，让车头朝向正确方向

      // 启用阴影
      ferrari.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // 添加到车辆组
      carGroup.add(ferrari);

      // 让车辆可见
      carGroup.visible = true;

      // 法拉利加载成功，完成加载
      _finishLoading();
    },
    undefined,
    () => {
      // 加载失败时使用备用的简单车辆
      createFallbackVehicle(carGroup);
      // 备用车辆也算加载完成
      _finishLoading();
    },
  );
}

// 完成加载：显示"准备完成"再隐藏加载屏
function _finishLoading() {
  setLoadingProgress("ready");
  setTimeout(() => {
    hideLoadingScreen();
  }, 1200);
}

// 备用的简单车辆模型（如果法拉利加载失败）
function createFallbackVehicle(carGroup) {
  // 车身
  const bodyGeometry = new THREE.BoxGeometry(6, 3, 3);
  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: 0xff3333,
    emissive: 0xff0000,
    emissiveIntensity: 0.2,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 1.5;
  body.castShadow = true;
  carGroup.add(body);

  // 车顶
  const roofGeometry = new THREE.BoxGeometry(3.5, 1.5, 2.8);
  const roofMaterial = new THREE.MeshPhongMaterial({
    color: 0xcc0000,
    emissive: 0xcc0000,
    emissiveIntensity: 0.1,
  });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.y = 3.2;
  roof.position.z = -0.4;
  roof.castShadow = true;
  carGroup.add(roof);

  // 轮子
  const wheelGeometry = new THREE.CylinderGeometry(1, 1, 0.8, 16);
  const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });

  const positions = [
    [-1.8, 1, 1.2],
    [1.8, 1, 1.2],
    [-1.8, 1, -1.2],
    [1.8, 1, -1.2],
  ];
  positions.forEach((pos) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(pos[0], pos[1], pos[2]);
    wheel.castShadow = true;
    carGroup.add(wheel);
  });

  carGroup.visible = true;
}

function createBalloons() {
  // 颜色 + 对应自发光色（emissive 约为主色的 30%，保持鲜亮不发灰）
  const colorPairs = [
    { color: 0xff4da6, emissive: 0x7a1040 }, // 玫粉
    { color: 0xff85c2, emissive: 0x6e1535 }, // 亮粉
    { color: 0xffd700, emissive: 0x806800 }, // 金黄
    { color: 0xff9933, emissive: 0x7a3d00 }, // 亮橙
    { color: 0x33bbff, emissive: 0x005580 }, // 天蓝
    { color: 0x33e8a0, emissive: 0x007540 }, // 翠绿
    { color: 0xcc66ff, emissive: 0x5c007a }, // 亮紫
    { color: 0xff6655, emissive: 0x801800 }, // 珊瑚红
    { color: 0x44ddbb, emissive: 0x006655 }, // 青绿
    { color: 0xffcc33, emissive: 0x806000 }, // 琥珀黄
  ];
  for (let i = 0; i < 18; i++) {
    const size = 2.5 + Math.random() * 2; // 大小随机 2.5~4.5
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const pair = colorPairs[i % colorPairs.length];
    const material = new THREE.MeshPhongMaterial({
      color: pair.color,
      emissive: pair.emissive,
      emissiveIntensity: 0.5,
      shininess: 120,
    });
    const balloon = new THREE.Mesh(geometry, material);

    balloon.position.set(
      (Math.random() - 0.5) * 340, // 更大范围分布
      45 + Math.random() * 110, // 高度 45~155，层次更丰富
      (Math.random() - 0.5) * 340,
    );

    balloon.userData.initialPos = balloon.position.clone();
    balloon.userData.speed = 0.3 + Math.random() * 0.3;
    balloon.userData.angle = Math.random() * Math.PI * 2;

    scene.add(balloon);
    balloons.push(balloon);
  }
}

function createSkybox() {
  const skyGeometry = new THREE.SphereGeometry(400, 32, 32);
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0xc9eeff, // 与场景背景色一致的明亮天蓝
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(sky);
}

// ========== UI 交互 ==========
function selectTransport(type) {
  currentTransport = type;
  document.querySelectorAll(".transport-options .btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-transport="${type}"]`).classList.add("active");
  updateStatus(`已选择 ${type === "taxi" ? "打车" : "自驾"} 出行`);
}

function updateDestination() {
  const select = document.getElementById("destinationSelect");
  selectedDestination = select.value;
  if (selectedDestination) {
    updateStatus(`已选择目的地: ${select.options[select.selectedIndex].text}`);
  }
}

function generateRoute() {
  if (!selectedDestination) {
    updateStatus("⚠️请选择目的地");
    return;
  }

  routeGenerated = true;
  document.getElementById("startBtn").disabled = false;

  const distance = (Math.random() * 15 + 5).toFixed(1);
  const time = Math.ceil(distance * (currentTransport === "taxi" ? 1.5 : 1.2));

  updateStatus(`✓路线已生成\n距离: ${distance}km\n预计时间: ${time}分钟`);

  // 显示路线信息面板
  const infoPanel = document.getElementById("infoPanel");
  infoPanel.style.display = "block";
  document.getElementById("routeInfo").innerHTML = `
    <div class="route-info">
      <p>📍目的地: ${document.getElementById("destinationSelect").options[document.getElementById("destinationSelect").selectedIndex].text}</p>
      <p class="distance">📏距离: ${distance}km</p>
      <p class="time">⏱️时间: 约${time}分钟</p>
      <p>🚗方式: ${currentTransport === "taxi" ? "🚖打车服务" : "🚗自驾"}</p>
    </div>
  `;

  generateRoutePoints();

  // 移动端：隐藏控制面板、状态框和导航信息
  if (isMobile) {
    document.getElementById("controlsPanel").style.display = "none";
    document.getElementById("statusBox").style.display = "none";
    document.getElementById("infoPanel").style.display = "none";
  }

  // 先切换到俯视视角，完成后再显示路线预览
  switchToTopView(() => {
    // 视角切换完成后的回调
    // 移动端：在开始绘制前，先将相机移动到路线起点
    if (isMobile && currentRoutePoints.length > 0) {
      const startPoint = currentRoutePoints[0];
      camera.position.set(startPoint.x, 300, startPoint.z + 50);
      controls.target.set(startPoint.x, 0, startPoint.z);
      controls.update();
    }
    // 开始路线预览
    showRoutePreview();
  });
}

function generateRoutePoints() {
  // 根据目的地位置计算起始点和终点（都在道路上）
  const destinationPositions = {
    wedding: { x: -150, z: -100 }, // 左下道路边的中间点
    groom: { x: 150, z: -100 }, // 右下道路边的中间点
    bride: { x: -150, z: 100 }, // 左上道路边的中间点
  };

  const destPos = destinationPositions[selectedDestination];

  // 计算起始点：在目的地的对角方向，在道路上
  const startPos = {
    wedding: { x: 200, z: 200 }, // 右上角道路
    groom: { x: -200, z: 200 }, // 左上角道路
    bride: { x: 200, z: -200 }, // 右下角道路
  }[selectedDestination];

  // 使用A*算法在道路网格上寻路
  currentRoutePoints = findPathOnRoads(startPos, destPos);

  // 设置小车起始位置并显示
  if (car && currentRoutePoints.length > 1) {
    car.position.set(startPos.x, 1, startPos.z); // 抬高Y轴位置
    car.visible = true;

    // 让小车朝向第一个路径点（而不是固定朝向）
    // 找到第一个与起点不同的路径点
    let targetIndex = 1;
    for (let i = 1; i < currentRoutePoints.length; i++) {
      const point = currentRoutePoints[i];
      if (point.x !== startPos.x || point.z !== startPos.z) {
        targetIndex = i;
        break;
      }
    }

    const firstTarget = currentRoutePoints[targetIndex];
    const dx = firstTarget.x - startPos.x;
    const dz = firstTarget.z - startPos.z;

    // 计算初始朝向，确保小车正对第一个目标点
    if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
      car.rotation.y = Math.atan2(dx, dz);
    }
  }
}

// 在道路网格上寻找路径 - 增加拐点让路线更有趣
function findPathOnRoads(start, end) {
  const path = [];
  let current = { x: start.x, z: start.z };

  path.push({ ...current });

  // 创建Z字形路线：交替移动，每次移动1-2个路口
  let moveX = true; // 交替方向

  while (current.x !== end.x || current.z !== end.z) {
    if (moveX && current.x !== end.x) {
      // X方向移动
      const remainingX = Math.abs(end.x - current.x);

      if (remainingX >= 100) {
        // 如果距离>=100，按100的步长移动1-2步
        const steps = Math.min(
          Math.floor(remainingX / 100),
          remainingX > 200 ? 2 : 1,
        );
        for (let i = 0; i < steps; i++) {
          const step = current.x < end.x ? 100 : -100;
          current.x += step;
          current.x = Math.max(-300, Math.min(300, current.x));
          path.push({ x: current.x, z: current.z });
        }
      } else if (remainingX > 0) {
        // 如果距离<100，直接移动到终点X坐标
        current.x = end.x;
        path.push({ x: current.x, z: current.z });
      }
      moveX = false; // 下次移动Z
    } else if (!moveX && current.z !== end.z) {
      // Z方向移动
      const remainingZ = Math.abs(end.z - current.z);

      if (remainingZ >= 100) {
        // 如果距离>=100，按100的步长移动1-2步
        const steps = Math.min(
          Math.floor(remainingZ / 100),
          remainingZ > 200 ? 2 : 1,
        );
        for (let i = 0; i < steps; i++) {
          const step = current.z < end.z ? 100 : -100;
          current.z += step;
          current.z = Math.max(-300, Math.min(300, current.z));
          path.push({ x: current.x, z: current.z });
        }
      } else if (remainingZ > 0) {
        // 如果距离<100，直接移动到终点Z坐标
        current.z = end.z;
        path.push({ x: current.x, z: current.z });
      }
      moveX = true; // 下次移动X
    } else {
      // 如果一个方向已经到达，切换到另一个方向
      moveX = !moveX;
    }

    // 防止无限循环
    if (path.length > 50) break;
  }

  // 在每两个点之间插入中间点，让路线更平滑
  return smoothPath(path);
}

// 平滑路径：在每两个点之间插入多个中间点
function smoothPath(path) {
  const smoothed = [];
  const segmentsPerSection = 10; // 每段插入10个点

  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];

    // 添加起点
    smoothed.push(start);

    // 在两点之间插入中间点
    for (let j = 1; j < segmentsPerSection; j++) {
      const t = j / segmentsPerSection;
      smoothed.push({
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      });
    }
  }

  // 添加终点
  if (path.length > 0) {
    smoothed.push(path[path.length - 1]);
  }

  return smoothed;
}

// 切换到俯视视角 - 优化为更平滑的过渡
function switchToTopView(onComplete) {
  // 平滑过渡到俯视视角
  const targetPosition = { x: 0, y: 300, z: 50 }; // 稍微偏移Z轴，让过渡更自然
  const targetLookAt = { x: 0, y: 0, z: 0 };

  // 禁用控制器自动旋转
  controls.autoRotate = false;
  controls.enableRotate = false;

  // 保存初始状态
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = Date.now();
  const duration = 2500; // 增加到2.5秒，更舒缓

  function animateCamera() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // 使用更平滑的缓动函数 - easeInOutCubic
    const eased =
      progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    // 平滑过渡相机位置
    camera.position.x = startPos.x + (targetPosition.x - startPos.x) * eased;
    camera.position.y = startPos.y + (targetPosition.y - startPos.y) * eased;
    camera.position.z = startPos.z + (targetPosition.z - startPos.z) * eased;

    // 平滑过渡观察目标
    const currentTarget = {
      x: startTarget.x + (targetLookAt.x - startTarget.x) * eased,
      y: startTarget.y + (targetLookAt.y - startTarget.y) * eased,
      z: startTarget.z + (targetLookAt.z - startTarget.z) * eased,
    };

    camera.lookAt(currentTarget.x, currentTarget.y, currentTarget.z);
    controls.target.set(currentTarget.x, currentTarget.y, currentTarget.z);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(animateCamera);
    } else {
      // 动画完成后，确保精确到达目标位置
      camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
      camera.lookAt(targetLookAt.x, targetLookAt.y, targetLookAt.z);
      controls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
      controls.update();

      // 执行完成回调
      if (onComplete && typeof onComplete === "function") {
        onComplete();
      }
    }
  }

  animateCamera();
}

// 显示路线预览动画
function showRoutePreview() {
  isShowingRoutePreview = true;

  // 移除旧的路线
  if (routePreviewLine) {
    scene.remove(routePreviewLine);
    routePreviewLine = null;
  }

  // 动画绘制路线
  let currentPointIndex = 0;
  const animationDuration = 4000; // 增加到4秒，更慢
  const startTime = Date.now();

  function animateRouteLine() {
    if (!isShowingRoutePreview) return;

    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / animationDuration, 1);

    // 计算当前应该显示到第几个点
    const targetIndex = Math.floor(progress * (currentRoutePoints.length - 1));

    if (targetIndex > currentPointIndex) {
      currentPointIndex = targetIndex;

      // 移除旧的路线
      if (routePreviewLine) {
        scene.remove(routePreviewLine);
      }

      // 使用连续的曲线创建路线，没有接缝
      const points = [];
      for (let i = 0; i <= currentPointIndex; i++) {
        const point = currentRoutePoints[i];
        points.push(new THREE.Vector3(point.x, 2, point.z));
      }

      // 创建曲线 - 使用centripetal模式和tension=0实现更锐利的转角
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0);

      // 使用TubeGeometry创建管道，完全平滑无接缝
      const tubeGeometry = new THREE.TubeGeometry(
        curve,
        Math.max(points.length * 4, 128), // 增加分段数以更好地跟随路径
        2, // 管道半径
        8, // 径向分段
        false, // 不闭合
      );

      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00, // 鲜艳的黄色
        transparent: true,
        opacity: 0.9,
      });

      // TubeGeometry不需要定位，直接添加到场景
      routePreviewLine = new THREE.Mesh(tubeGeometry, tubeMaterial);
      scene.add(routePreviewLine);

      // 移动端：水平平移相机，跟随当前绘制点
      if (isMobile && currentPointIndex > 0) {
        const currentPoint = currentRoutePoints[currentPointIndex];

        // 只在水平方向（X和Z轴）平移，保持高度不变
        const lerpFactor = 0.15;

        // 目标点跟随当前绘制点
        controls.target.x += (currentPoint.x - controls.target.x) * lerpFactor;
        controls.target.z += (currentPoint.z - controls.target.z) * lerpFactor;
        // 保持Y轴不变
        controls.target.y = 0;

        // 相机位置也跟随平移，保持固定的相对位置
        camera.position.x += (currentPoint.x - camera.position.x) * lerpFactor;
        camera.position.z +=
          (currentPoint.z + 50 - camera.position.z) * lerpFactor;
        // 保持高度不变
        camera.position.y = 300;

        controls.update();
      }
    }

    if (progress < 1) {
      requestAnimationFrame(animateRouteLine);
    } else {
      // 路线预览完成，移动端显示控制面板
      if (isMobile) {
        document.getElementById("controlsPanel").style.display = "block";
      }
    }
  }

  animateRouteLine();
}

function startJourney() {
  if (!routeGenerated) {
    updateStatus("请先生成路线");
    return;
  }

  isNavigating = true;
  isShowingRoutePreview = false;
  currentRouteIndex = 0;
  lastUpdatedRouteIndex = -1; // 重置导航线更新状态

  // 隐藏出行方案框
  const controlsPanel = document.getElementById("controlsPanel");
  if (controlsPanel) {
    controlsPanel.style.display = "none";
  }

  // 移动端：显示虚拟方向键和导航信息
  if (isMobile) {
    const virtualJoystick = document.getElementById("virtualJoystick");
    const infoPanel = document.getElementById("infoPanel");

    // 只在自驾模式显示虚拟方向键
    if (currentTransport === "drive" && virtualJoystick) {
      virtualJoystick.classList.add("active");
    }

    // 显示导航信息
    if (infoPanel) {
      infoPanel.style.display = "block";
    }
  }

  // 根据出行方式显示不同提示和语音播报
  const destinationNames = {
    wedding: "婚礼现场",
    groom: "新郎家",
    bride: "新娘家",
  };

  const destName = destinationNames[selectedDestination] || "目的地";

  if (currentTransport === "taxi") {
    updateStatus("🚖打车模式：自动导航中...");
    speak(`开始导航，目的地${destName}，请系好安全带`);
  } else {
    updateStatus("🚗自驾模式：使用方向键控制（↑↓←→）");
    speak(`开始导航，目的地${destName}，请小心驾驶`);
  }

  // 📢 在用户交互的同步回调中启动引擎声音（iOS 兼容性要求）
  startEngineSound();

  // 启动加速过程
  currentActualSpeed = 0; // 从静止开始
  targetSpeed = carSpeed; // 目标速度
  isAccelerating = true;
  isDecelerating = false;

  // 恢复相机控制
  controls.enableRotate = true;

  // 确保小车朝向正确（面向第一个路径点）
  if (car && currentRoutePoints.length > 1) {
    const start = currentRoutePoints[0];
    const nextPoint = currentRoutePoints[1];
    const dx = nextPoint.x - start.x;
    const dz = nextPoint.z - start.z;

    if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
      car.rotation.y = Math.atan2(dx, dz);
    }
  }

  // 移动相机到跟随视角 - 根据小车朝向设置相机
  if (car) {
    // 相机在小车后方
    const offsetDistance = 50;
    camera.position.set(
      car.position.x - Math.sin(car.rotation.y) * offsetDistance,
      50,
      car.position.z - Math.cos(car.rotation.y) * offsetDistance,
    );

    // 相机看向小车前方
    controls.target.set(
      car.position.x + Math.sin(car.rotation.y) * 20,
      car.position.y,
      car.position.z + Math.cos(car.rotation.y) * 20,
    );
  }

  // 高亮显示目标箭头，淡化其他箭头
  if (window.arrowIndicators) {
    window.arrowIndicators.forEach((arrow) => {
      if (arrow.userData.destination === selectedDestination) {
        // 目标箭头：增强亮度和大小
        arrow.scale.set(1.2, 1.2, 1.2);
        arrow.children.forEach((child) => {
          if (child.material) {
            child.material.opacity = 1;
          }
        });
      } else {
        // 非目标箭头：降低透明度
        arrow.children.forEach((child) => {
          if (child.material) {
            child.material.opacity = 0.2;
          }
        });
      }
    });
  }

  // 将路线预览线保留在场景中，但改变颜色让它更低调
  if (routePreviewLine) {
    // 创建自定义shader材质来实现渐变消失效果
    const geometry = routePreviewLine.geometry;

    // 初始化顶点alpha属性
    const positionAttribute = geometry.attributes.position;
    const vertexCount = positionAttribute.count;
    const alphas = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      alphas[i] = 1.0; // 初始全部可见
    }
    geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));

    // 使用自定义shader材质
    routePreviewLine.material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xffff00) },
        opacity: { value: 0.9 },
      },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float opacity;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(color, opacity * vAlpha);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    // 保留路线不删除，只是把引用存到routeSegments数组中
    routeSegments = [routePreviewLine];
  }

  // 如果是自驾模式，添加键盘监听
  if (currentTransport === "drive") {
    setupKeyboardControls();
  }

  // 启动烟花效果
  enableFireworks();
}

function updateStatus(message) {
  document.getElementById("statusBox").textContent = message;
}

// Toast 提示函数
function showToast(message, type = "info", duration = 2000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  // 创建 toast 元素
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  // 设置图标
  const iconMap = {
    success: "✓",
    warning: "⚠",
    error: "✕",
    info: "ℹ",
  };

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || "ℹ"}</span>
    <span class="toast-message">${message}</span>
  `;

  // 添加到容器
  container.appendChild(toast);

  // 点击消除
  toast.addEventListener("click", () => removeToast(toast));

  // 自动消除
  toast._timeoutId = setTimeout(() => removeToast(toast), duration);
}

// 移除 Toast 函数
function removeToast(toast) {
  if (!toast) return;

  // 清除 timeout
  if (toast._timeoutId) {
    clearTimeout(toast._timeoutId);
  }

  // 添加移除动画
  toast.classList.add("removing");

  // 等待动画完成后移除元素
  setTimeout(() => {
    if (toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  }, 300);
}

// 语音播报函数
function speak(text) {
  // 检查语音合成 API 是否可用
  if (!synth) {
    // 不支持语音，显示 Toast 提示
    showToast(`🔔 ${text}`, "info");
    return;
  }

  try {
    // 取消之前的播报
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN"; // 设置中文
    utterance.rate = 1.0; // 语速
    utterance.pitch = 1.0; // 音调
    utterance.volume = 1.0; // 音量

    // 监听播报失败事件
    utterance.onerror = (event) => {
      showToast(`🔔${text}`, "warning");
    };

    synth.speak(utterance);
  } catch (error) {
    // 异常时显示 Toast 提示
    showToast(`🔔${text}`, "warning");
  }
}

// 初始化引擎声音 - 在用户交互中同步创建
function initEngineSound() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // 如果 AudioContext 被挂起（iOS 常见），立即 resume
      if (audioContext.state === "suspended") {
        audioContext
          .resume()
          .then(() => {})
          .catch(() => {});
      }
    } catch (error) {
      // AudioContext 创建失败
    }
  }
}

// 启动引擎声音 - 在用户交互的同步回调中执行
function startEngineSound() {
  if (isEnginePlaying) return;

  initEngineSound();

  // 再次确保 AudioContext 处于可用状态（iOS 兼容性）
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  // 创建主振荡器（低频基础音）
  engineOscillator1 = audioContext.createOscillator();
  engineOscillator1.type = "triangle"; // 三角波更柔和
  engineOscillator1.frequency.setValueAtTime(60, audioContext.currentTime);

  // 创建副振荡器（高频泛音，增加层次感）
  engineOscillator2 = audioContext.createOscillator();
  engineOscillator2.type = "sine"; // 正弦波作为泛音
  engineOscillator2.frequency.setValueAtTime(120, audioContext.currentTime); // 倍频

  // 创建噪声（模拟引擎震动和排气声）
  const bufferSize = audioContext.sampleRate * 2;
  const noiseBuffer = audioContext.createBuffer(
    1,
    bufferSize,
    audioContext.sampleRate,
  );
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  engineNoiseSource = audioContext.createBufferSource();
  engineNoiseSource.buffer = noiseBuffer;
  engineNoiseSource.loop = true;

  // 噪声滤波器（只保留低频噪声）
  const noiseFilter = audioContext.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.setValueAtTime(300, audioContext.currentTime);

  // 创建增益节点
  engineGainNode = audioContext.createGain();
  engineGainNode.gain.setValueAtTime(0.08, audioContext.currentTime);

  noiseGainNode = audioContext.createGain();
  noiseGainNode.gain.setValueAtTime(0.03, audioContext.currentTime);

  // 同步连接所有节点
  engineOscillator1.connect(engineGainNode);
  engineOscillator2.connect(engineGainNode);
  engineNoiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGainNode);

  engineGainNode.connect(audioContext.destination);
  noiseGainNode.connect(audioContext.destination);

  // 同步启动所有节点
  try {
    engineOscillator1.start();
    engineOscillator2.start();
    engineNoiseSource.start();
    isEnginePlaying = true;
  } catch (error) {
    isEnginePlaying = false;
  }
}

// 更新引擎声音（根据速度调整音调）- 提升基础音量适配 iOS
function updateEngineSound(speed) {
  if (!isEnginePlaying || !engineOscillator1 || !engineOscillator2) return;

  // 根据速度调整频率
  const baseFrequency1 = 60; // 主振荡器怠速频率
  const maxFrequency1 = 150; // 主振荡器最高频率
  const normalizedSpeed = Math.min(speed / 0.3, 1); // 归一化速度

  // 添加明显的随机波动（模拟引擎转速的自然变化）
  const randomFluctuation = (Math.random() - 0.5) * 12; // ±6Hz 的随机波动（增强4倍）
  const targetFrequency1 =
    baseFrequency1 +
    (maxFrequency1 - baseFrequency1) * normalizedSpeed +
    randomFluctuation;

  // 副振荡器保持倍频关系，但有明显偏移避免完全谐和
  const targetFrequency2 = targetFrequency1 * 2.1 + (Math.random() - 0.5) * 8;

  // 添加明显的周期性频率调制（模拟引擎运转的律动感）
  const time = Date.now() * 0.001;
  const periodicModulation = Math.sin(time * 3) * 8; // 3Hz 频率，8Hz 振幅（增强4倍）

  // 添加额外的低频调制（模拟引擎负载变化）
  const lowFreqModulation = Math.sin(time * 0.5) * 5; // 0.5Hz 的慢速调制

  // 平滑过渡频率（缩短时间常数让变化更敏捷）
  engineOscillator1.frequency.setTargetAtTime(
    targetFrequency1 + periodicModulation + lowFreqModulation,
    audioContext.currentTime,
    0.1,
  );

  engineOscillator2.frequency.setTargetAtTime(
    targetFrequency2 + periodicModulation * 0.7,
    audioContext.currentTime,
    0.1,
  );

  // 根据速度调整音量（加速时引擎声更响），添加明显波动
  const volumeFluctuation = (Math.random() - 0.5) * 0.03; // 增强3倍
  const volumePulse = Math.sin(time * 2.5) * 0.02; // 添加节奏性音量变化
  const targetVolume =
    0.08 + normalizedSpeed * 0.04 + volumeFluctuation + volumePulse;
  engineGainNode.gain.setTargetAtTime(
    targetVolume,
    audioContext.currentTime,
    0.1,
  );

  // 噪声音量也随速度变化，添加非常明显的脉动效果
  const noisePulse = Math.sin(time * 5) * 0.015; // 5Hz 的脉动（增强3倍）
  const noiseRandomPulse = Math.sin(time * 7.3) * 0.01; // 添加不同频率的叠加
  const targetNoiseVolume =
    0.03 + normalizedSpeed * 0.02 + noisePulse + noiseRandomPulse;
  noiseGainNode.gain.setTargetAtTime(
    targetNoiseVolume,
    audioContext.currentTime,
    0.1,
  );
}

// 停止引擎声音
function stopEngineSound() {
  if (!isEnginePlaying) return;

  // 停止所有振荡器
  if (engineOscillator1) {
    engineOscillator1.stop();
    engineOscillator1.disconnect();
    engineOscillator1 = null;
  }

  if (engineOscillator2) {
    engineOscillator2.stop();
    engineOscillator2.disconnect();
    engineOscillator2 = null;
  }

  if (engineNoiseSource) {
    engineNoiseSource.stop();
    engineNoiseSource.disconnect();
    engineNoiseSource = null;
  }

  // 断开增益节点
  if (engineGainNode) {
    engineGainNode.disconnect();
    engineGainNode = null;
  }

  if (noiseGainNode) {
    noiseGainNode.disconnect();
    noiseGainNode = null;
  }

  isEnginePlaying = false;
}

// ========== 目的地弹窗 BGM ==========
// ========== 目的地弹窗 BGM ==========
function startBgm() {
  stopBgm();
  bgmAudio = new Audio("./bgm.mp3");
  bgmAudio.loop = true;
  bgmAudio.volume = 0;
  bgmAudio.play().catch(() => {});
  // 淡入：0 → 0.5，持续 1s
  const fadeIn = setInterval(() => {
    if (!bgmAudio) { clearInterval(fadeIn); return; }
    bgmAudio.volume = Math.min(bgmAudio.volume + 0.05, 0.5);
    if (bgmAudio.volume >= 0.5) clearInterval(fadeIn);
  }, 50);
}

function stopBgm() {
  if (!bgmAudio) return;
  const audio = bgmAudio;
  bgmAudio = null;
  // 淡出：volume → 0，持续 0.6s，再 pause
  const fadeOut = setInterval(() => {
    audio.volume = Math.max(audio.volume - 0.05, 0);
    if (audio.volume <= 0) {
      clearInterval(fadeOut);
      audio.pause();
      audio.src = "";
    }
  }, 30);
}

// 设置键盘控制
function setupKeyboardControls() {
  // 移除旧的监听器（如果有）
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("keyup", handleKeyUp);

  // 添加新的监听器
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
}

function handleKeyDown(e) {
  // 方向键控制
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    keyState[e.key] = true;
  }
}

function handleKeyUp(e) {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    keyState[e.key] = false;
  }
}

// 自驾模式处理
function handleDriveMode() {
  if (!car) return;

  let moved = false;

  // 前进/后退
  if (keyState["ArrowUp"]) {
    car.position.x += Math.sin(car.rotation.y) * carSpeed;
    car.position.z += Math.cos(car.rotation.y) * carSpeed;
    moved = true;
  }
  if (keyState["ArrowDown"]) {
    car.position.x -= Math.sin(car.rotation.y) * carSpeed;
    car.position.z -= Math.cos(car.rotation.y) * carSpeed;
    moved = true;
  }

  // 转向 - 降低转向速度，让控制更精确
  if (keyState["ArrowLeft"]) {
    car.rotation.y += 0.02;
    moved = true;
  }
  if (keyState["ArrowRight"]) {
    car.rotation.y -= 0.02;
    moved = true;
  }

  // 限制小车在地图范围内
  car.position.x = Math.max(-280, Math.min(280, car.position.x));
  car.position.z = Math.max(-280, Math.min(280, car.position.z));

  if (moved) {
    // 更新相机跟随
    updateCameraFollow();
    // 移除走过的路线段（自驾模式也适用）
    removePassedRouteSegments();
    // 检查是否到达目的地
    checkArrival();
  }
}

// 更新相机跟随小车
function updateCameraFollow() {
  if (!car) return;

  // 计算相机的目标位置（在小车后方偏上）
  const targetCameraPos = new THREE.Vector3(
    car.position.x - Math.sin(car.rotation.y) * 50,
    50,
    car.position.z - Math.cos(car.rotation.y) * 50,
  );

  // 计算相机的目标观察点（小车前方）
  const targetLookAt = new THREE.Vector3(
    car.position.x + Math.sin(car.rotation.y) * 20,
    car.position.y,
    car.position.z + Math.cos(car.rotation.y) * 20,
  );

  // 🎬 使用线性插值(lerp)平滑过渡相机位置和观察点
  // lerp因子：值越小越平滑但响应越慢
  const cameraLerpFactor = 0.12; // 相机位置的平滑系数
  const targetLerpFactor = 0.15; // 观察点的平滑系数（稍快一些，保持跟踪）

  // 平滑移动相机位置（带阻尼效果）
  camera.position.x +=
    (targetCameraPos.x - camera.position.x) * cameraLerpFactor;
  camera.position.y +=
    (targetCameraPos.y - camera.position.y) * cameraLerpFactor;
  camera.position.z +=
    (targetCameraPos.z - camera.position.z) * cameraLerpFactor;

  // 平滑移动观察目标点（稍快响应，让视角更跟随小车）
  controls.target.x += (targetLookAt.x - controls.target.x) * targetLerpFactor;
  controls.target.y += (targetLookAt.y - controls.target.y) * targetLerpFactor;
  controls.target.z += (targetLookAt.z - controls.target.z) * targetLerpFactor;

  controls.update();
}

// 移除走过的路线段 - 动态更新导航线，只显示前方未走过的部分
function removePassedRouteSegments() {
  if (!car || currentRoutePoints.length === 0) return;
  if (!isNavigating) return;
  if (routeSegments.length === 0 || !routeSegments[0]) return;

  const tube = routeSegments[0];
  const geometry = tube.geometry;

  // 确保有alpha属性
  if (!geometry.attributes.alpha) return;

  // 更新顶点alpha以创建渐变消失效果
  const alphaAttribute = geometry.attributes.alpha;
  const positionAttribute = geometry.attributes.position;
  const vertexCount = positionAttribute.count;

  // 计算小车在路径上的实际位置
  const carPos = new THREE.Vector3(
    car.position.x,
    car.position.y,
    car.position.z,
  );
  const fadeDistance = 25; // 渐变区域距离

  for (let i = 0; i < vertexCount; i++) {
    // 获取当前顶点的世界坐标
    const x = positionAttribute.getX(i);
    const z = positionAttribute.getZ(i);

    // 计算顶点到小车的距离
    const distance = Math.hypot(x - carPos.x, z - carPos.z);

    // 根据距离计算新的alpha值
    let newAlpha = 1.0;
    if (distance < fadeDistance) {
      // 在渐变区域内，线性渐变
      newAlpha = distance / fadeDistance;
      // 使用平滑曲线让渐变更自然
      newAlpha = newAlpha * newAlpha; // 二次曲线
    }

    // 只更新到更小的alpha值（保持已经消失的部分不恢复）
    const currentAlpha = alphaAttribute.getX(i);
    const finalAlpha = Math.min(currentAlpha, newAlpha);
    alphaAttribute.setX(i, finalAlpha);
  }

  // 标记需要更新
  alphaAttribute.needsUpdate = true;
}

// 检查是否到达目的地（自驾模式）
function checkArrival() {
  if (!car || currentRoutePoints.length === 0) return;

  const destination = currentRoutePoints[currentRoutePoints.length - 1];
  const distance = Math.hypot(
    destination.x - car.position.x,
    destination.z - car.position.z,
  );

  // 如果距离目的地较远就开始减速，让减速过程更明显
  if (distance < 40 && !isDecelerating) {
    startDeceleration();
  }

  // 检查是否已经到达终点（完全停止）
  if (distance < 15 && currentActualSpeed < 0.1 && isDecelerating) {
    onArrival();
  }
}

// 开始减速过程
function startDeceleration() {
  isDecelerating = true;
  isAccelerating = false;
  targetSpeed = 0;
}

// ========== 烟花粒子系统实现 ==========

// 烟花颜色主题（婚礼主题：金红粉紫）
const FIREWORK_COLORS = [
  0xff4444, // 红
  0xff8800, // 橙
  0xffcc00, // 金黄
  0xff69b4, // 粉红
  0xff1493, // 深粉
  0xda70d6, // 兰花紫
  0x9b59b6, // 紫
  0xffffff, // 白
  0x00ffcc, // 青绿
  0x66ccff, // 浅蓝
];

/**
 * 在指定位置发射一颗烟花
 * @param {THREE.Vector3} position 发射位置（道路两侧）
 */
function launchFirework(position) {
  // 随机选择爆炸颜色
  const color =
    FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
  const accentColor =
    FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];

  // ---- 阶段1：上升拖尾 ----
  const trailCount = 12;
  const trailPositions = new Float32Array(trailCount * 3);
  for (let i = 0; i < trailCount; i++) {
    trailPositions[i * 3] = position.x;
    trailPositions[i * 3 + 1] = position.y;
    trailPositions[i * 3 + 2] = position.z;
  }
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(trailPositions.slice(), 3),
  );
  const trailMaterial = new THREE.PointsMaterial({
    color: 0xffffaa,
    size: 0.6,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
  });
  const trail = new THREE.Points(trailGeometry, trailMaterial);
  scene.add(trail);

  // 上升速度：随机高度
  const riseHeight = 40 + Math.random() * 20; // 爆炸高度
  const riseSpeed = 0.8 + Math.random() * 0.5;

  // ---- 阶段2：爆炸粒子 ----
  const particleCount = 80 + Math.floor(Math.random() * 60);
  const explosionPositions = new Float32Array(particleCount * 3);
  const explosionVelocities = [];
  const explosionColors = new Float32Array(particleCount * 3);

  // 预先分配爆炸位置（在爆炸高度处）
  const explodePos = new THREE.Vector3(
    position.x + (Math.random() - 0.5) * 3,
    position.y + riseHeight,
    position.z + (Math.random() - 0.5) * 3,
  );

  for (let i = 0; i < particleCount; i++) {
    explosionPositions[i * 3] = explodePos.x;
    explosionPositions[i * 3 + 1] = explodePos.y;
    explosionPositions[i * 3 + 2] = explodePos.z;

    // 球形随机速度（爆炸方向）
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 0.3 + Math.random() * 0.6;
    explosionVelocities.push({
      x: Math.sin(phi) * Math.cos(theta) * speed,
      y: Math.sin(phi) * Math.sin(theta) * speed * 0.8,
      z: Math.sin(phi) * Math.sin(theta) * speed * 0.8 + Math.cos(phi) * speed,
    });

    // 颜色：主色 + 少量点缀色
    const useAccent = Math.random() < 0.3;
    const c = new THREE.Color(useAccent ? accentColor : color);
    explosionColors[i * 3] = c.r;
    explosionColors[i * 3 + 1] = c.g;
    explosionColors[i * 3 + 2] = c.b;
  }

  const explosionGeometry = new THREE.BufferGeometry();
  explosionGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(explosionPositions.slice(), 3),
  );
  explosionGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(explosionColors, 3),
  );

  const explosionMaterial = new THREE.PointsMaterial({
    size: 0.8,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const explosion = new THREE.Points(explosionGeometry, explosionMaterial);
  scene.add(explosion);
  explosion.visible = false; // 先隐藏，等上升结束后显示

  // ---- 添加到粒子系统管理列表 ----
  const fireworkData = {
    trail,
    trailMaterial,
    explosion,
    explosionMaterial,
    explosionGeometry,
    explosionVelocities,
    explodePos,
    riseHeight,
    riseSpeed,
    riseY: 0, // 当前上升高度，从0开始
    risePhase: true,
    exploded: false,
    lifetime: 0,
    maxLifetime: 120, // 爆炸后存活帧数
    position: position.clone(),
  };
  fireworksParticles.push(fireworkData);

  // ---- 播放烟花音效（30% 概率，避免密集发射时音效堆叠过重）----
  if (Math.random() < 0.3) {
    playFireworkSound(riseSpeed, riseHeight);
  }
}

/**
 * 播放单颗烟花的音效：上升哨声 → 爆炸噰响
 * 全部通过 Web Audio API 合成，无需外部文件
 */
function playFireworkSound(riseSpeed, riseHeight) {
  if (!audioContext) return;
  if (audioContext.state === "suspended") return;

  // 上升时长（与 riseHeight/riseSpeed 对应，约 = riseHeight/riseSpeed 帧 × 16ms）
  const riseDuration = (riseHeight / riseSpeed) * 0.016;
  const now = audioContext.currentTime;

  // ---- 爆炸声（噪声冲击 + 低频砰击，在上升结束时触发）----
  const explodeAt = now + riseDuration;

  // 噪声爆炸冲击
  const burstDuration = 0.6;
  const bufSize = Math.floor(audioContext.sampleRate * burstDuration);
  const noiseBuffer = audioContext.createBuffer(
    1,
    bufSize,
    audioContext.sampleRate,
  );
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2); // 指数衰减
  }
  const burstSource = audioContext.createBufferSource();
  burstSource.buffer = noiseBuffer;

  // 带通滤波让爆炸声更像真实烟花（去掉极低和极高频）
  const burstFilter = audioContext.createBiquadFilter();
  burstFilter.type = "bandpass";
  burstFilter.frequency.setValueAtTime(800, explodeAt);
  burstFilter.Q.setValueAtTime(0.5, explodeAt);

  const burstGain = audioContext.createGain();
  burstGain.gain.setValueAtTime(0.25, explodeAt);
  burstGain.gain.exponentialRampToValueAtTime(0.001, explodeAt + burstDuration);

  burstSource.connect(burstFilter);
  burstFilter.connect(burstGain);
  burstGain.connect(audioContext.destination);
  burstSource.start(explodeAt);
  burstSource.stop(explodeAt + burstDuration);

  // 低频砰击（给爆炸加厚重感）
  const thumpOsc = audioContext.createOscillator();
  const thumpGain = audioContext.createGain();
  thumpOsc.type = "sine";
  thumpOsc.frequency.setValueAtTime(80, explodeAt);
  thumpOsc.frequency.exponentialRampToValueAtTime(30, explodeAt + 0.3);
  thumpGain.gain.setValueAtTime(0.3, explodeAt);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, explodeAt + 0.35);
  thumpOsc.connect(thumpGain);
  thumpGain.connect(audioContext.destination);
  thumpOsc.start(explodeAt);
  thumpOsc.stop(explodeAt + 0.4);
}

/**
 * 每帧更新所有烟花粒子
 */
function updateFireworks() {
  if (fireworksParticles.length === 0) return;

  const toRemove = [];

  fireworksParticles.forEach((fw, idx) => {
    if (fw.risePhase) {
      // ---- 上升阶段 ----
      fw.riseY += fw.riseSpeed;

      // 更新拖尾位置（在当前上升高度显示）
      const pos = fw.trail.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const offset = (i / pos.count) * 3;
        pos.setXYZ(
          i,
          fw.position.x + (Math.random() - 0.5) * 0.3,
          fw.position.y + fw.riseY - offset,
          fw.position.z + (Math.random() - 0.5) * 0.3,
        );
      }
      pos.needsUpdate = true;
      fw.trailMaterial.opacity = Math.max(
        0,
        1 - (fw.riseY / fw.riseHeight) * 0.3,
      );

      // 到达爆炸高度
      if (fw.riseY >= fw.riseHeight) {
        fw.risePhase = false;
        fw.exploded = true;
        scene.remove(fw.trail);
        fw.trail.geometry.dispose();
        fw.trailMaterial.dispose();
        fw.explosion.visible = true;
      }
    } else if (fw.exploded) {
      // ---- 爆炸扩散阶段 ----
      fw.lifetime++;

      const progress = fw.lifetime / fw.maxLifetime;
      const gravity = 0.012;
      const drag = 0.97;

      const pos = fw.explosionGeometry.attributes.position;
      const count = pos.count;

      for (let i = 0; i < count; i++) {
        const v = fw.explosionVelocities[i];
        // 重力 + 阻力
        v.y -= gravity;
        v.x *= drag;
        v.y *= drag;
        v.z *= drag;

        pos.setXYZ(i, pos.getX(i) + v.x, pos.getY(i) + v.y, pos.getZ(i) + v.z);
      }
      pos.needsUpdate = true;

      // 淡出
      fw.explosionMaterial.opacity = Math.max(0, 1 - progress * progress);
      // 粒子缩小
      fw.explosionMaterial.size = 0.8 * (1 - progress * 0.5);

      if (fw.lifetime >= fw.maxLifetime) {
        toRemove.push(idx);
      }
    }
  });

  // 清理已结束的烟花
  for (let i = toRemove.length - 1; i >= 0; i--) {
    const fw = fireworksParticles[toRemove[i]];
    if (fw.explosion.parent) scene.remove(fw.explosion);
    fw.explosionGeometry.dispose();
    fw.explosionMaterial.dispose();
    fireworksParticles.splice(toRemove[i], 1);
  }
}

/**
 * 沿前方真实路线采样发射点，烟花位置跟着道路弯曲走。
 * 自驾模式（无路线点）时退化为以当前车头方向直线估算。
 */
function triggerRoadFireworks() {
  if (!car || !fireworksEnabled) return;

  const now = Date.now();
  if (now - fireworksLastLaunchTime < FIREWORKS_LAUNCH_INTERVAL) return;
  fireworksLastLaunchTime = now;

  const sideOffset = 11; // 距路中心的横向距离
  const SLOTS = 10; // 前方路段分为多少个候选槽
  const fireCount = 3 + Math.floor(Math.random() * 3); // 每次触发随机选 3~5 槽

  // ---- 沿路线点采集候选发射点 ----
  // 候选点数组：{ x, z, dirX, dirZ }，dirX/Z 为该点处路线的前进方向
  const candidates = [];

  const hasRoute =
    currentRoutePoints.length > 0 &&
    currentRouteIndex < currentRoutePoints.length;

  if (hasRoute) {
    // 打车/已生成路线：沿路线点向前最多 120 单位累积距离，均匀采样
    const maxDist = 120;
    const slotSpan = maxDist / SLOTS;
    let accumulated = 0;
    let ptIdx = currentRouteIndex;

    // 当前起点：用车辆当前位置
    let prevX = car.position.x;
    let prevZ = car.position.z;

    for (
      let slot = 0;
      slot < SLOTS && ptIdx < currentRoutePoints.length;
      slot++
    ) {
      // 目标累积距离：该槽中点 + 随机抖动
      const targetDist =
        slotSpan * slot + slotSpan * (0.2 + Math.random() * 0.6);

      // 沿路线前进直到超过 targetDist
      while (ptIdx < currentRoutePoints.length && accumulated < targetDist) {
        const np = currentRoutePoints[ptIdx];
        const segD = Math.hypot(np.x - prevX, np.z - prevZ);
        if (accumulated + segD >= targetDist) {
          // 在本段内插值到 targetDist
          const t = (targetDist - accumulated) / segD;
          const sx = prevX + (np.x - prevX) * t;
          const sz = prevZ + (np.z - prevZ) * t;
          // 方向用本段
          const len = segD || 1;
          candidates.push({
            x: sx,
            z: sz,
            dirX: (np.x - prevX) / len,
            dirZ: (np.z - prevZ) / len,
          });
          break;
        }
        accumulated += segD;
        prevX = np.x;
        prevZ = np.z;
        ptIdx++;
      }
    }
  }

  // 若路线采样不足（自驾模式或路线末段），用车头方向直线补全
  if (candidates.length < SLOTS) {
    const carAngle = car.rotation.y;
    const sinA = Math.sin(carAngle);
    const cosA = Math.cos(carAngle);
    const maxDist = 120;
    const slotSpan = maxDist / SLOTS;
    for (let slot = candidates.length; slot < SLOTS; slot++) {
      const fwd = slotSpan * slot + slotSpan * (0.2 + Math.random() * 0.6);
      candidates.push({
        x: car.position.x + sinA * fwd,
        z: car.position.z + cosA * fwd,
        dirX: sinA,
        dirZ: cosA,
      });
    }
  }

  // ---- 随机选槽发射 ----
  const chosen = candidates.sort(() => Math.random() - 0.5).slice(0, fireCount);

  chosen.forEach(({ x, z, dirX, dirZ }) => {
    // 该点的左右方向（垂直于行进方向）
    const jitter = (Math.random() - 0.5) * 3;
    const off = sideOffset + jitter;
    // 左：dir 顺时针旋转 90° → (-dirZ, dirX)
    launchFirework(new THREE.Vector3(x - dirZ * off, 1, z + dirX * off));
    // 右：dir 逆时针旋转 90° → (dirZ, -dirX)
    launchFirework(new THREE.Vector3(x + dirZ * off, 1, z - dirX * off));
  });
}

/**
 * 启动烟花效果（导航开始时调用）
 */
function enableFireworks() {
  fireworksEnabled = true;
  fireworksLastLaunchTime = 0;
}

/**
 * 停止烟花效果（导航结束时调用）
 */
function disableFireworks() {
  fireworksEnabled = false;
}

// ========== 动画循环 ==========
function animate() {
  requestAnimationFrame(animate);

  // 更新控制器
  controls.update();

  // 处理加减速
  if (isNavigating) {
    if (isAccelerating && currentActualSpeed < targetSpeed) {
      // 加速过程
      currentActualSpeed += acceleration;
      if (currentActualSpeed >= targetSpeed) {
        currentActualSpeed = targetSpeed;
        isAccelerating = false;
      }
    } else if (isDecelerating && currentActualSpeed > 0) {
      // 减速过程
      currentActualSpeed -= deceleration;
      // 设置最低速度，避免停在半路
      const minSpeed = 0.075;
      if (currentActualSpeed < minSpeed) {
        currentActualSpeed = minSpeed;
      }
    }
  }

  // 更新车辆位置
  if (isNavigating && car) {
    if (currentTransport === "taxi") {
      // 打车模式：自动按路线前进
      if (currentRouteIndex < currentRoutePoints.length) {
        const targetPoint = currentRoutePoints[currentRouteIndex];

        const distance = Math.hypot(
          targetPoint.x - car.position.x,
          targetPoint.z - car.position.z,
        );

        // 计算到终点的距离
        const finalDestination =
          currentRoutePoints[currentRoutePoints.length - 1];
        const distanceToEnd = Math.hypot(
          finalDestination.x - car.position.x,
          finalDestination.z - car.position.z,
        );

        // 当接近终点时开始减速（缩短距离避免提前停止）
        if (distanceToEnd < 40 && !isDecelerating) {
          startDeceleration();
        }

        if (distance < 5) {
          currentRouteIndex++;
          // 到达最后一个路点时触发到达
          if (currentRouteIndex >= currentRoutePoints.length) {
            // 重置速度并触发到达
            currentActualSpeed = 0;
            isDecelerating = false;
            onArrival();
          }
        } else {
          // 🎯 预测性转向：提前看向前方的点，避免过冲
          // 计算前瞻距离（保持适中，避免看太远导致转圈）
          const baseLookAhead = carSpeed * 12; // 降低基础倍数
          const maxLookAhead = 20; // 降低最大前瞻距离
          const minLookAhead = 8; // 降低最小前瞻距离
          const lookAheadDistance = Math.max(
            minLookAhead,
            Math.min(maxLookAhead, baseLookAhead * Math.sqrt(distance / 20)), // 使用平方根，让增长更平缓
          );

          // 找到前瞻点：从当前目标点开始累积距离
          let lookAheadPoint = targetPoint;
          let accumulatedDistance = distance;
          let lookAheadIndex = currentRouteIndex;

          // 向前寻找，直到累积距离达到前瞻距离
          while (
            lookAheadIndex + 1 < currentRoutePoints.length &&
            accumulatedDistance < lookAheadDistance
          ) {
            const currentPoint = currentRoutePoints[lookAheadIndex];
            const nextPoint = currentRoutePoints[lookAheadIndex + 1];
            const segmentDist = Math.hypot(
              nextPoint.x - currentPoint.x,
              nextPoint.z - currentPoint.z,
            );
            accumulatedDistance += segmentDist;
            lookAheadIndex++;
            lookAheadPoint = nextPoint;
          }

          // 计算朝向前瞻点的方向（而不是当前点）
          const dx = lookAheadPoint.x - car.position.x;
          const dz = lookAheadPoint.z - car.position.z;
          const targetDirection = Math.atan2(dx, dz);

          // 计算角度差,选择最短旋转路径
          let angleDiff = targetDirection - car.rotation.y;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          // 🎯 平滑转向：使用插值让转向更自然
          const angleDegrees = (Math.abs(angleDiff) * 180) / Math.PI;

          if (Math.abs(angleDiff) > 0.01) {
            // 动态转向速度：进一步降低，让转向更加柔和平缓
            const baseTurnSpeed = Math.abs(angleDiff) * 0.06; // 继续降低基础系数
            const maxTurnSpeed = 0.04; // 继续降低最大转速
            const turnSpeed = Math.min(baseTurnSpeed, maxTurnSpeed);

            car.rotation.y += Math.sign(angleDiff) * turnSpeed;
          }

          // 🚗 根据转向角度动态调整前进速度（确保始终前进）
          let speedMultiplier = 1.0;

          if (angleDegrees > 60) {
            // 急转弯：速度降至50%（提高最小速度，避免转圈）
            speedMultiplier = 0.5;
          } else if (angleDegrees > 45) {
            // 大转弯：速度降至60%
            speedMultiplier = 0.6;
          } else if (angleDegrees > 30) {
            // 中转弯：速度降至70%
            speedMultiplier = 0.7;
          } else if (angleDegrees > 15) {
            // 小转弯：速度降至85%
            speedMultiplier = 0.85;
          } else if (angleDegrees > 5) {
            // 微转弯：速度降至95%
            speedMultiplier = 0.95;
          }
          // 小于5度：直线行驶，保持100%速度

          // 使用实际速度（考虑加减速）和转向速度倍数
          const currentSpeed = currentActualSpeed * speedMultiplier;

          // 按当前朝向和调整后的速度前进
          car.position.x += Math.sin(car.rotation.y) * currentSpeed;
          car.position.z += Math.cos(car.rotation.y) * currentSpeed;

          // 更新引擎声音（根据实际速度，不受转向影响）
          updateEngineSound(currentActualSpeed);

          // 更新相机跟随小车
          updateCameraFollow();
        }
      }

      // 移除走过的路线段
      removePassedRouteSegments();
    } else {
      // 自驾模式：通过方向键控制
      handleDriveMode();
    }
  }

  // 触发并更新烟花效果
  if (isNavigating && fireworksEnabled) {
    triggerRoadFireworks();
  }
  updateFireworks();

  // 更新气球
  balloons.forEach((balloon, idx) => {
    balloon.position.y += balloon.userData.speed * 0.01;
    balloon.position.x += Math.sin(Date.now() * 0.001 + idx) * 0.1;
    balloon.position.z += Math.cos(Date.now() * 0.001 + idx) * 0.1;
    balloon.rotation.x += 0.01;
  });

  // 更新箭头指示器动画
  if (window.arrowIndicators) {
    window.arrowIndicators.forEach((arrow) => {
      if (arrow.userData && arrow.userData.animate) {
        const time = Date.now() * 0.002;
        // 上下浮动动画
        arrow.position.y = arrow.userData.originalY + Math.sin(time) * 3;
        // 旋转动画
        arrow.rotation.y = time * 0.5;
      }
    });
  }

  renderer.render(scene, camera);
}

function onArrival() {
  // 防止重复调用
  if (!isNavigating) return;

  isNavigating = false;
  isAccelerating = false;
  isDecelerating = false;
  currentActualSpeed = 0;

  // 清理键盘监听器
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("keyup", handleKeyUp);
  keyState = {};

  // 清理剩余的路线段
  routeSegments.forEach((segment) => scene.remove(segment));
  routeSegments = [];

  updateStatus("✨已到达目的地！");

  // 语音播报到达
  const destinationNames = {
    wedding: "婚礼现场",
    groom: "新郎家",
    bride: "新娘家",
  };
  const destName = destinationNames[selectedDestination] || "目的地";
  speak(`已到达${destName}，祝您幸福美满`);

  // 停止烟花效果
  disableFireworks();

  // 停止引擎声音
  stopEngineSound();

  // 移动端：隐藏虚拟方向键
  if (isMobile) {
    const virtualJoystick = document.getElementById("virtualJoystick");
    if (virtualJoystick) {
      virtualJoystick.classList.remove("active");
    }
  }

  // 显示目的地信息弹窗
  showDestinationInfo();
}

// ========== 弹窗轮播控制器 ==========
// key: carouselId  value: { index, timer, total }
const _carousels = {};

function initCarousel(carouselEl) {
  const id = carouselEl.id;
  if (!id) return;

  const track = carouselEl.querySelector(".carousel-track");
  const slides = carouselEl.querySelectorAll(".carousel-slide");
  const dotsWrap = carouselEl.querySelector(".carousel-dots");
  const prevBtn = carouselEl.querySelector(".carousel-prev");
  const nextBtn = carouselEl.querySelector(".carousel-next");
  const total = slides.length;

  if (total === 0) return;

  // 生成指示点
  dotsWrap.innerHTML = "";
  slides.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "carousel-dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => goTo(i));
    dotsWrap.appendChild(dot);
  });

  let current = 0;

  function goTo(idx) {
    current = (idx + total) % total;
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsWrap.querySelectorAll(".carousel-dot").forEach((d, i) => {
      d.classList.toggle("active", i === current);
    });
    _carousels[id].index = current;
  }

  // 按钮事件（阻止冒泡，避免触发 modal 遮罩关闭）
  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    goTo(current - 1);
  });
  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    goTo(current + 1);
  });

  // 触摸滑动支持（阻止横滑触发浏览器页面返回）
  let touchStartX = 0;
  let touchStartY = 0;
  let isHorizontalSwipe = false;
  carouselEl.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isHorizontalSwipe = false;
    },
    { passive: true },
  );
  carouselEl.addEventListener(
    "touchmove",
    (e) => {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      // 判断为横向滑动时阻止默认行为（防止触发页面返回/前进手势）
      if (
        !isHorizontalSwipe &&
        Math.abs(dx) > Math.abs(dy) &&
        Math.abs(dx) > 5
      ) {
        isHorizontalSwipe = true;
      }
      if (isHorizontalSwipe) {
        e.preventDefault();
      }
    },
    { passive: false },
  );
  carouselEl.addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1));
    },
    { passive: true },
  );

  // 先初始化记录（goTo 里会用到）
  _carousels[id] = { index: 0, timer: null, total };

  // 初始化到第 0 张（无动画）
  track.style.transition = "none";
  goTo(0);
  // 恢复过渡
  requestAnimationFrame(() => {
    track.style.transition = "";
  });

  // 自动播放（5s 切换）
  const timer = setInterval(() => goTo(current + 1), 5000);
  _carousels[id].timer = timer;
}

function destroyCarousel(carouselEl) {
  const id = carouselEl && carouselEl.id;
  if (!id || !_carousels[id]) return;
  clearInterval(_carousels[id].timer);
  delete _carousels[id];
}

// 显示目的地信息弹窗
function showDestinationInfo(destinationType = null) {
  // 使用传入的类型或默认使用selectedDestination
  const destType = destinationType || selectedDestination;

  // 根据目的地类型选择对应的弹窗
  let modalId;
  switch (destType) {
    case "wedding":
      modalId = "weddingModal";
      break;
    case "groom":
      modalId = "groomModal";
      break;
    case "bride":
      modalId = "brideModal";
      break;
    default:
      modalId = "weddingModal";
  }

  const modal = document.getElementById(modalId);
  if (!modal) return;

  // 只为婚礼现场弹窗更新LED文字（计算百年好合倒计时）
  if (destType === "wedding") {
    const startDate = new Date("2016-05-17");
    const now = new Date();
    const diffTime = Math.abs(now - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const hundredYears = 100 * 365;
    const remainingDays = hundredYears - diffDays;
    const remainingYears = Math.floor(remainingDays / 365);
    const remainingDaysInYear = remainingDays % 365;

    const ledContents = modal.querySelectorAll(".led-content");
    const ledText = `💒执子之手，与子偕老 · 离百年好合还有${remainingYears}年${remainingDaysInYear}天💒`;
    ledContents.forEach((span) => {
      span.textContent = ledText;
    });
  }

  // 显示弹窗
  modal.style.display = "flex";

  // 启动 BGM
  startBgm();

  // 启动轮播
  const carouselEl = modal.querySelector(".carousel");
  if (carouselEl) initCarousel(carouselEl);

  // 阻止弹窗内横向滑动触发浏览器页面返回/前进手势
  let _modalTouchStartX = 0;
  let _modalTouchStartY = 0;
  let _modalIsHorizontal = false;
  function _onModalTouchStart(e) {
    _modalTouchStartX = e.touches[0].clientX;
    _modalTouchStartY = e.touches[0].clientY;
    _modalIsHorizontal = false;
  }
  function _onModalTouchMove(e) {
    const dx = e.touches[0].clientX - _modalTouchStartX;
    const dy = e.touches[0].clientY - _modalTouchStartY;
    if (
      !_modalIsHorizontal &&
      Math.abs(dx) > Math.abs(dy) &&
      Math.abs(dx) > 5
    ) {
      _modalIsHorizontal = true;
    }
    if (_modalIsHorizontal) {
      e.preventDefault();
    }
  }
  modal.addEventListener("touchstart", _onModalTouchStart, { passive: true });
  modal.addEventListener("touchmove", _onModalTouchMove, { passive: false });
  // 存到 modal 上，关闭时解绑
  modal._removeTouchGuard = () => {
    modal.removeEventListener("touchstart", _onModalTouchStart);
    modal.removeEventListener("touchmove", _onModalTouchMove);
    delete modal._removeTouchGuard;
  };

  // 点击遮罩关闭
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal(destType);
    }
  };
}

// 关闭弹窗的全局函数
window.closeModal = function (destinationType) {
  let modalId;
  switch (destinationType) {
    case "wedding":
      modalId = "weddingModal";
      break;
    case "groom":
      modalId = "groomModal";
      break;
    case "bride":
      modalId = "brideModal";
      break;
    default:
      return;
  }

  const modal = document.getElementById(modalId);
  if (!modal) return;

  // 停止 BGM
  stopBgm();

  // 销毁轮播
  const carouselEl = modal.querySelector(".carousel");
  destroyCarousel(carouselEl);

  // 解绑触摸防返回监听
  if (modal._removeTouchGuard) modal._removeTouchGuard();

  // 关闭 wedding 弹窗时重置回信息页
  if (destinationType === "wedding") {
    window.switchWeddingPage("info");
  }

  modal.classList.add("closing");
  setTimeout(() => {
    modal.style.display = "none";
    modal.classList.remove("closing");

    // 重新显示出行方案框（仅在实际导航到达时）
    const controlsPanel = document.getElementById("controlsPanel");
    if (controlsPanel) {
      controlsPanel.style.display = "block";
    }

    // 移动端：同时显示状态框
    if (isMobile) {
      const statusBox = document.getElementById("statusBox");
      if (statusBox) {
        statusBox.style.display = "flex";
      }
    }
  }, 300);
};

// 测试方法：依次显示所有三个目的地弹窗
window.testDestinationModals = function () {
  showDestinationInfo("wedding");
  setTimeout(() => showDestinationInfo("groom"), 1000);
  setTimeout(() => showDestinationInfo("bride"), 2000);
};

// 将showDestinationInfo暴露到全局，方便测试
window.showDestinationInfo = showDestinationInfo;

// ========== 婚礼弹窗页面切换 & 地图导航 ==========

/**
 * 切换婚礼弹窗内的页面
 * @param {'info'|'map'} page
 */
window.switchWeddingPage = function (page) {
  const pageInfo = document.getElementById("weddingPageInfo");
  const pageMap = document.getElementById("weddingPageMap");
  if (!pageInfo || !pageMap) return;

  pageInfo.classList.toggle("active", page === "info");
  pageMap.classList.toggle("active", page === "map");
};

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ========== 虚拟方向键控制 ==========
function initVirtualJoystick() {
  const joystickBtns = document.querySelectorAll(
    ".joystick-btn:not(.disabled)",
  );

  joystickBtns.forEach((btn) => {
    const key = btn.getAttribute("data-key");
    if (!key) return;

    // 触摸开始
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      keyState[key] = true;
      btn.style.background = "rgba(255, 105, 180, 0.6)";
    });

    // 触摸结束
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      keyState[key] = false;
      btn.style.background = "rgba(0, 0, 0, 0.6)";
    });

    // 触摸取消（手指移出按钮）
    btn.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      keyState[key] = false;
      btn.style.background = "rgba(0, 0, 0, 0.6)";
    });

    // 鼠标事件（用于桌面测试）
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      keyState[key] = true;
      btn.style.background = "rgba(255, 105, 180, 0.6)";
    });

    btn.addEventListener("mouseup", (e) => {
      e.preventDefault();
      keyState[key] = false;
      btn.style.background = "rgba(0, 0, 0, 0.6)";
    });

    btn.addEventListener("mouseleave", () => {
      keyState[key] = false;
      btn.style.background = "rgba(0, 0, 0, 0.6)";
    });
  });
}

// ========== 事件绑定 ==========
window.addEventListener("load", () => {
  initThreeJS();

  // 绑定UI事件
  document
    .getElementById("taxiBtn")
    .addEventListener("click", () => selectTransport("taxi"));
  document
    .getElementById("driveBtn")
    .addEventListener("click", () => selectTransport("drive"));
  document
    .getElementById("destinationSelect")
    .addEventListener("change", updateDestination);
  document
    .getElementById("generateBtn")
    .addEventListener("click", generateRoute);
  document.getElementById("startBtn").addEventListener("click", startJourney);

  // 初始化虚拟方向键
  initVirtualJoystick();

  // 引导弹窗按钮
  document.getElementById("guideBtnSkip").addEventListener("click", () => {
    closeGuideModal(() => {
      showDestinationInfo("wedding");
    });
  });
  document.getElementById("guideBtnStart").addEventListener("click", () => {
    closeGuideModal();
  });

  // 监听窗口大小变化，更新移动端状态
  window.addEventListener("resize", () => {
    detectMobile();
  });
});

// ========== 微信 openLocation 查看位置 ==========

// 婚礼现场坐标（GCJ02，腾讯/高德通用）
const WEDDING_LOCATION = {
  latitude: 32.990191,
  longitude: 112.533027,
  name: "南阳市梅溪国际酒店",
  address: "河南省南阳市",
  scale: 16,
};

const WX_SIGN_API_URL = "/api/wx-sign";

/**
 * 判断是否在微信浏览器中
 */
function isWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent);
}

/**
 * 初始化微信 JSSDK，仅注册 openLocation 接口
 * 成功后显示微信地图按钮
 */
async function initWxConfig() {
  if (!isWeChat()) return;

  try {
    const url = location.href.split("#")[0];
    const resp = await fetch(
      `${WX_SIGN_API_URL}?url=${encodeURIComponent(url)}`,
    );
    if (!resp.ok) throw new Error(`签名接口失败: ${resp.status}`);
    const { appId, timestamp, nonceStr, signature } = await resp.json();

    wx.config({
      debug: false,
      appId,
      timestamp,
      nonceStr,
      signature,
      jsApiList: ["openLocation"],
    });

    wx.ready(() => {});
  } catch (err) {}
}

/**
 * 调起微信内置地图查看位置
 */
window.openWxLocation = function () {
  if (typeof wx === "undefined") return;
  wx.openLocation({
    latitude: WEDDING_LOCATION.latitude,
    longitude: WEDDING_LOCATION.longitude,
    name: WEDDING_LOCATION.name,
    address: WEDDING_LOCATION.address,
    scale: WEDDING_LOCATION.scale,
  });
};

// 页面加载后初始化
initWxConfig();
