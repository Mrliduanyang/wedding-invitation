import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// ========== 全局变量 ==========
let scene, camera, renderer, controls;
let buildings = [];
let roads = [];
let car = null;
let currentTransport = 'taxi';
let selectedDestination = null;
let routeGenerated = false;
let isNavigating = false;
let currentRoutePoints = [];
let currentRouteIndex = 0;
let balloons = [];
let routePreviewLine = null;
let isShowingRoutePreview = false;
let routeSegments = []; // 存储路线段，用于动态消失
let keyState = {}; // 存储键盘状态
let carSpeed = 0.2; // 小车移动速度（降低速度）
let lastUpdatedRouteIndex = -1; // 上次更新导航线时的路径点索引

// ========== Three.js 初始化 ==========
function initThreeJS() {
  const container = document.getElementById('canvas-container');

  // 场景设置
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 150, 500);

  // 摄像头
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
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
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(100, 100, 100);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.far = 500;
  directionalLight.shadow.camera.left = -150;
  directionalLight.shadow.camera.right = 150;
  directionalLight.shadow.camera.top = 150;
  directionalLight.shadow.camera.bottom = -150;
  scene.add(directionalLight);

  // 创建场景
  createCityScene();
  createVehicle();
  createBalloons();

  // 处理窗口大小变化
  window.addEventListener('resize', onWindowResize);

  // 开始渲染
  animate();
}

// ========== 创建城市场景 ==========
function createCityScene() {
  // 地面 - 扩大范围
  const groundGeometry = new THREE.PlaneGeometry(600, 600);
  const groundMaterial = new THREE.MeshLambertMaterial({
    color: 0x90ee90,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 道路
  createRoads();

  // 建筑物
  createBuildings();

  // 天空盒
  createSkybox();
}

function createRoads() {
  const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const lineMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });

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
      name: '婚礼现场 - 南阳梅溪国际酒店',
      color: 0xff69b4,
      isVenue: true,
      destination: 'wedding',
    },
    {
      x: 150,
      z: -150,
      width: 28,
      depth: 28,
      height: 45,
      name: '新郎家',
      color: 0x1e90ff,
      isVenue: true,
      destination: 'groom',
    },
    {
      x: -150,
      z: 150,
      width: 28,
      depth: 28,
      height: 45,
      name: '新娘家',
      color: 0xffd700,
      isVenue: true,
      destination: 'bride',
    },

    // === 办公大楼（灰色系）===
    { x: -150, z: -60, width: 25, depth: 25, height: 60, color: 0x808080 },
    { x: -150, z: 60, width: 22, depth: 22, height: 55, color: 0x696969 },
    { x: 150, z: -60, width: 24, depth: 24, height: 58, color: 0x778899 },
    { x: 150, z: 60, width: 26, depth: 26, height: 52, color: 0x708090 },

    // === 商业中心（蓝色系）===
    { x: -60, z: -150, width: 30, depth: 20, height: 40, color: 0x4169e1 },
    { x: 60, z: -150, width: 28, depth: 22, height: 42, color: 0x1e90ff },
    { x: -60, z: 150, width: 32, depth: 18, height: 38, color: 0x00bfff },
    { x: 60, z: 150, width: 26, depth: 24, height: 44, color: 0x87ceeb },

    // === 住宅楼（暖色系）===
    { x: -160, z: -130, width: 18, depth: 18, height: 35, color: 0xdaa520 },
    { x: -160, z: -30, width: 20, depth: 20, height: 32, color: 0xcd853f },
    { x: 160, z: -130, width: 18, depth: 18, height: 36, color: 0xbc8f8f },
    { x: 160, z: 30, width: 21, depth: 21, height: 33, color: 0xa0522d },

    // === 中心区域建筑 ===
    // 左下街区 (-100到0, -100到0)
    { x: -60, z: -60, width: 20, depth: 20, height: 48, color: 0x9370db },
    { x: -70, z: -30, width: 18, depth: 18, height: 40, color: 0x9f8faf },
    { x: -45, z: -45, width: 14, depth: 14, height: 32, color: 0x9f7faf },
    { x: -20, z: -50, width: 13, depth: 13, height: 28, color: 0x8b6f9b },

    // 右下街区 (0到100, -100到0)
    { x: 60, z: -60, width: 22, depth: 22, height: 46, color: 0x8a2be2 },
    { x: 30, z: -70, width: 17, depth: 17, height: 38, color: 0x9370db },
    { x: 70, z: -30, width: 19, depth: 19, height: 42, color: 0x7b68ee },
    { x: 20, z: -50, width: 14, depth: 14, height: 29, color: 0x8b6fbb },

    // 左上街区 (-100到0, 0到100)
    { x: -60, z: 60, width: 21, depth: 21, height: 44, color: 0x9932cc },
    { x: -30, z: 70, width: 16, depth: 16, height: 36, color: 0x8b008b },
    { x: -20, z: 50, width: 13, depth: 13, height: 30, color: 0x9b3bb0 },

    // 右上街区 (0到100, 0到100)
    { x: 30, z: 70, width: 17, depth: 17, height: 37, color: 0xda70d6 },
    { x: 70, z: 30, width: 19, depth: 19, height: 43, color: 0xc71585 },
    { x: 45, z: 45, width: 15, depth: 15, height: 35, color: 0xd465dd },

    // === 小型建筑（填充街区）===
    // 南边街区
    { x: -130, z: -150, width: 15, depth: 15, height: 28, color: 0xa9a9a9 },
    { x: -30, z: -150, width: 16, depth: 16, height: 30, color: 0xb0b0b0 },
    { x: -130, z: -165, width: 14, depth: 14, height: 24, color: 0x969696 },
    { x: 30, z: -165, width: 13, depth: 13, height: 22, color: 0xa8a8a8 },

    // 北边街区
    { x: -130, z: 150, width: 15, depth: 15, height: 29, color: 0xa0a0a0 },
    { x: 130, z: 150, width: 14, depth: 14, height: 31, color: 0x888888 },
    { x: -70, z: 165, width: 13, depth: 13, height: 25, color: 0x9a9a9a },
    { x: 70, z: 165, width: 14, depth: 14, height: 23, color: 0xaaaaaa },

    // 西边街区
    { x: -150, z: -130, width: 16, depth: 16, height: 34, color: 0x2f4f4f },
    { x: -150, z: -30, width: 18, depth: 18, height: 36, color: 0x556b2f },
    { x: -150, z: 70, width: 15, depth: 15, height: 32, color: 0x483d8b },
    { x: -165, z: -70, width: 14, depth: 14, height: 28, color: 0x3f5f5f },

    // 东边街区
    { x: 150, z: -130, width: 17, depth: 17, height: 35, color: 0x8b4513 },
    { x: 150, z: 130, width: 16, depth: 16, height: 37, color: 0x4b0082 },
    { x: 165, z: -70, width: 14, depth: 14, height: 31, color: 0x7a5230 },
    { x: 165, z: 70, width: 15, depth: 15, height: 29, color: 0x5a7c1a },

    // === 街角建筑 ===
    // 四个角的主要建筑
    { x: -130, z: -130, width: 18, depth: 18, height: 40, color: 0x5f9ea0 },
    { x: 130, z: -130, width: 19, depth: 19, height: 42, color: 0x20b2aa },
    { x: -130, z: 130, width: 17, depth: 17, height: 38, color: 0x48d1cc },
    { x: 130, z: 130, width: 20, depth: 20, height: 41, color: 0x40e0d0 },

    // 左侧街区建筑
    { x: -130, z: -60, width: 16, depth: 16, height: 30, color: 0xc0c0c0 },
    { x: -130, z: 60, width: 17, depth: 17, height: 32, color: 0xd3d3d3 },
    { x: -165, z: -30, width: 13, depth: 13, height: 26, color: 0xb8b8b8 },
    { x: -165, z: 30, width: 14, depth: 14, height: 28, color: 0xcccccc },

    // 右侧街区建筑
    { x: 130, z: -60, width: 15, depth: 15, height: 31, color: 0xdcdcdc },
    { x: 130, z: 60, width: 18, depth: 18, height: 29, color: 0xc8c8c8 },
    { x: 165, z: -30, width: 13, depth: 13, height: 27, color: 0xe0e0e0 },
    { x: 165, z: 30, width: 14, depth: 14, height: 25, color: 0xd0d0d0 },

    // 南侧街区建筑
    { x: -60, z: -130, width: 14, depth: 14, height: 25, color: 0xffa07a },
    { x: 60, z: -130, width: 15, depth: 15, height: 27, color: 0xfa8072 },
    { x: -30, z: -165, width: 12, depth: 12, height: 23, color: 0xffa500 },
    { x: 30, z: -165, width: 13, depth: 13, height: 24, color: 0xff8c69 },

    // 北侧街区建筑
    { x: -60, z: 130, width: 16, depth: 16, height: 26, color: 0xe9967a },
    { x: 60, z: 130, width: 14, depth: 14, height: 28, color: 0xf08080 },
    { x: -30, z: 165, width: 12, depth: 12, height: 24, color: 0xffa07a },
    { x: 30, z: 165, width: 13, depth: 13, height: 25, color: 0xff7f50 },
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
  const light = new THREE.PointLight(pos.color, 2, 100);
  light.position.set(pos.x, pos.height + 10, pos.z);
  scene.add(light);

  // 顶部闪烁灯
  const particleGeometry = new THREE.SphereGeometry(2, 8, 8);
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: pos.color,
  });
  const particle = new THREE.Mesh(particleGeometry, particleMaterial);
  particle.position.set(pos.x, pos.height + 5, pos.z);
  scene.add(particle);

  // 动画
  particle.userData.originalPos = particle.position.clone();
  particle.userData.animate = true;

  // 添加向上的箭头指示器
  createArrowIndicator(pos);
}

function createArrowIndicator(pos) {
  // 创建箭头组
  const arrowGroup = new THREE.Group();

  // 箭头主体（圆锥体）
  const coneGeometry = new THREE.ConeGeometry(3, 6, 4);
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: pos.color,
    transparent: true,
    opacity: 0.8,
  });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  cone.rotation.x = Math.PI; // 旋转使箭头朝上
  arrowGroup.add(cone);

  // 箭头杆（圆柱体）
  const cylinderGeometry = new THREE.CylinderGeometry(0.8, 0.8, 8, 8);
  const cylinderMaterial = new THREE.MeshBasicMaterial({
    color: pos.color,
    transparent: true,
    opacity: 0.7,
  });
  const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
  cylinder.position.y = -7;
  arrowGroup.add(cylinder);

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

  // 使用GLTFLoader加载法拉利458模型
  const loader = new GLTFLoader();

  // 配置DRACOLoader（法拉利模型使用了Draco压缩）
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    'https://www.gstatic.com/draco/versioned/decoders/1.5.6/'
  );
  dracoLoader.setDecoderConfig({ type: 'js' });
  loader.setDRACOLoader(dracoLoader);

  // 从Three.js的官方CDN加载模型
  const modelUrl = 'https://threejs.org/examples/models/gltf/ferrari.glb';

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
    },
    undefined,
    (error) => {
      // 加载失败时使用备用的简单车辆
      createFallbackVehicle(carGroup);
    }
  );
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
  const colors = [0xff69b4, 0xff1493, 0xffc0cb, 0xffe4e1];
  for (let i = 0; i < 8; i++) {
    const geometry = new THREE.SphereGeometry(3, 16, 16);
    const material = new THREE.MeshPhongMaterial({
      color: colors[i % colors.length],
    });
    const balloon = new THREE.Mesh(geometry, material);

    balloon.position.set(
      (Math.random() - 0.5) * 200,
      50 + Math.random() * 80,
      (Math.random() - 0.5) * 200
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
    color: 0x87ceeb,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(sky);
}

// ========== UI 交互 ==========
function selectTransport(type) {
  currentTransport = type;
  document.querySelectorAll('.transport-options .btn').forEach((btn) => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-transport="${type}"]`).classList.add('active');
  updateStatus(`已选择 ${type === 'taxi' ? '打车' : '自驾'} 出行`);
}

function updateDestination() {
  const select = document.getElementById('destinationSelect');
  selectedDestination = select.value;
  if (selectedDestination) {
    updateStatus(`已选择目的地: ${select.options[select.selectedIndex].text}`);
  }
}

function generateRoute() {
  if (!selectedDestination) {
    updateStatus('⚠️ 请选择目的地');
    return;
  }

  routeGenerated = true;
  document.getElementById('startBtn').disabled = false;

  const distance = (Math.random() * 15 + 5).toFixed(1);
  const time = Math.ceil(distance * (currentTransport === 'taxi' ? 1.5 : 1.2));

  updateStatus(`✓ 路线已生成\n距离: ${distance}km\n预计时间: ${time}分钟`);

  // 显示路线信息面板
  const infoPanel = document.getElementById('infoPanel');
  infoPanel.style.display = 'block';
  document.getElementById('routeInfo').innerHTML = `
    <div class="route-info">
      <p>📍 目的地: ${document.getElementById('destinationSelect').options[document.getElementById('destinationSelect').selectedIndex].text}</p>
      <p class="distance">📏 距离: ${distance} km</p>
      <p class="time">⏱️ 时间: 约 ${time} 分钟</p>
      <p>🚗 方式: ${currentTransport === 'taxi' ? '🚖 打车服务' : '🚗 自驾'}</p>
    </div>
  `;

  generateRoutePoints();

  // 先切换到俯视视角，完成后再显示路线预览
  switchToTopView(() => {
    // 视角切换完成后的回调，开始路线预览
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
        const steps = Math.min(Math.floor(remainingX / 100), remainingX > 200 ? 2 : 1);
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
        const steps = Math.min(Math.floor(remainingZ / 100), remainingZ > 200 ? 2 : 1);
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
      if (onComplete && typeof onComplete === 'function') {
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
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0);

      // 使用TubeGeometry创建管道，完全平滑无接缝
      const tubeGeometry = new THREE.TubeGeometry(
        curve,
        Math.max(points.length * 4, 128), // 增加分段数以更好地跟随路径
        2, // 管道半径
        8, // 径向分段
        false // 不闭合
      );

      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00, // 鲜艳的黄色
        transparent: true,
        opacity: 0.9,
      });

      // TubeGeometry不需要定位，直接添加到场景
      routePreviewLine = new THREE.Mesh(tubeGeometry, tubeMaterial);
      scene.add(routePreviewLine);
    }

    if (progress < 1) {
      requestAnimationFrame(animateRouteLine);
    }
  }

  animateRouteLine();
}

function startJourney() {
  if (!routeGenerated) {
    updateStatus('请先生成路线');
    return;
  }

  isNavigating = true;
  isShowingRoutePreview = false;
  currentRouteIndex = 0;
  lastUpdatedRouteIndex = -1; // 重置导航线更新状态

  // 隐藏出行方案框
  const controlsPanel = document.getElementById('controlsPanel');
  if (controlsPanel) {
    controlsPanel.style.display = 'none';
  }

  // 根据出行方式显示不同提示
  if (currentTransport === 'taxi') {
    updateStatus('🚖 打车模式：自动导航中...');
  } else {
    updateStatus('🚗 自驾模式：使用方向键控制（↑↓←→）');
  }

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
      car.position.z - Math.cos(car.rotation.y) * offsetDistance
    );

    // 相机看向小车前方
    controls.target.set(
      car.position.x + Math.sin(car.rotation.y) * 20,
      car.position.y,
      car.position.z + Math.cos(car.rotation.y) * 20
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
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    // 使用自定义shader材质
    const shaderMaterial = new THREE.ShaderMaterial({
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

    routePreviewLine.material = shaderMaterial;
    // 保留路线不删除，只是把引用存到routeSegments数组中
    routeSegments = [routePreviewLine];
  }

  // 如果是自驾模式，添加键盘监听
  if (currentTransport === 'drive') {
    setupKeyboardControls();
  }
}

function updateStatus(message) {
  document.getElementById('statusBox').textContent = message;
}

// 设置键盘控制
function setupKeyboardControls() {
  // 移除旧的监听器（如果有）
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('keyup', handleKeyUp);

  // 添加新的监听器
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
}

function handleKeyDown(e) {
  // 方向键控制
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    keyState[e.key] = true;
  }
}

function handleKeyUp(e) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    keyState[e.key] = false;
  }
}

// 自驾模式处理
function handleDriveMode() {
  if (!car) return;

  let moved = false;

  // 前进/后退
  if (keyState['ArrowUp']) {
    car.position.x += Math.sin(car.rotation.y) * carSpeed;
    car.position.z += Math.cos(car.rotation.y) * carSpeed;
    moved = true;
  }
  if (keyState['ArrowDown']) {
    car.position.x -= Math.sin(car.rotation.y) * carSpeed;
    car.position.z -= Math.cos(car.rotation.y) * carSpeed;
    moved = true;
  }

  // 转向 - 降低转向速度，让控制更精确
  if (keyState['ArrowLeft']) {
    car.rotation.y += 0.02;
    moved = true;
  }
  if (keyState['ArrowRight']) {
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
    car.position.z - Math.cos(car.rotation.y) * 50
  );

  // 计算相机的目标观察点（小车前方）
  const targetLookAt = new THREE.Vector3(
    car.position.x + Math.sin(car.rotation.y) * 20,
    car.position.y,
    car.position.z + Math.cos(car.rotation.y) * 20
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
    car.position.z
  );
  const fadeDistance = 25; // 渐变区域距离

  for (let i = 0; i < vertexCount; i++) {
    // 获取当前顶点的世界坐标
    const x = positionAttribute.getX(i);
    const y = positionAttribute.getY(i);
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
    destination.z - car.position.z
  );

  // 如果距离目的地很近，触发到达
  if (distance < 20) {
    onArrival();
  }
}

// ========== 动画循环 ==========
function animate() {
  requestAnimationFrame(animate);

  // 更新控制器
  controls.update();

  // 更新车辆位置
  if (isNavigating && car) {
    if (currentTransport === 'taxi') {
      // 打车模式：自动按路线前进
      if (currentRouteIndex < currentRoutePoints.length) {
        const targetPoint = currentRoutePoints[currentRouteIndex];

        const distance = Math.hypot(
          targetPoint.x - car.position.x,
          targetPoint.z - car.position.z
        );

        if (distance < 5) {
          currentRouteIndex++;
          if (currentRouteIndex >= currentRoutePoints.length) {
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
            Math.min(maxLookAhead, baseLookAhead * Math.sqrt(distance / 20)) // 使用平方根，让增长更平缓
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
              nextPoint.z - currentPoint.z
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

          const currentSpeed = carSpeed * speedMultiplier;

          // 按当前朝向和调整后的速度前进
          car.position.x += Math.sin(car.rotation.y) * currentSpeed;
          car.position.z += Math.cos(car.rotation.y) * currentSpeed;

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

  // 更新气球
  balloons.forEach((balloon, idx) => {
    balloon.position.y += balloon.userData.speed * 0.01;
    balloon.position.x += Math.sin(Date.now() * 0.001 + idx) * 0.1;
    balloon.position.z += Math.cos(Date.now() * 0.001 + idx) * 0.1;
    balloon.rotation.x += 0.01;
  });

  // 更新建筑顶部灯光
  scene.children.forEach((child) => {
    if (
      child.userData &&
      child.userData.animate &&
      child.userData.originalPos
    ) {
      const time = Date.now() * 0.005;
      child.position.y = child.userData.originalPos.y + Math.sin(time) * 1;
      child.material.emissiveIntensity = 0.5 + Math.sin(time) * 0.5;
    }
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
  isNavigating = false;

  // 清理键盘监听器
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('keyup', handleKeyUp);
  keyState = {};

  // 清理剩余的路线段
  routeSegments.forEach((segment) => scene.remove(segment));
  routeSegments = [];

  updateStatus('✨ 已到达目的地！');

  // 显示目的地信息弹窗
  showDestinationInfo();
}

// 显示目的地信息弹窗
function showDestinationInfo(destinationType = null) {
  // 使用传入的类型或默认使用selectedDestination
  const destType = destinationType || selectedDestination;

  // 根据目的地类型选择对应的弹窗
  let modalId;
  switch (destType) {
    case 'wedding':
      modalId = 'weddingModal';
      break;
    case 'groom':
      modalId = 'groomModal';
      break;
    case 'bride':
      modalId = 'brideModal';
      break;
    default:
      modalId = 'weddingModal';
  }

  const modal = document.getElementById(modalId);
  if (!modal) return;

  // 只为婚礼现场弹窗更新LED文字（计算百年好合倒计时）
  if (destType === 'wedding') {
    const startDate = new Date('2016-05-17');
    const now = new Date();
    const diffTime = Math.abs(now - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365);
    const days = diffDays % 365;

    const hundredYears = 100 * 365;
    const remainingDays = hundredYears - diffDays;
    const remainingYears = Math.floor(remainingDays / 365);
    const remainingDaysInYear = remainingDays % 365;

    const ledContents = modal.querySelectorAll('.led-content');
    const ledText = `💒 执子之手，与子偕老 · 离百年好合还有${remainingYears}年${remainingDaysInYear}天 💒`;
    ledContents.forEach((span) => {
      span.textContent = ledText;
    });
  }

  // 显示弹窗
  modal.style.display = 'flex';

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
    case 'wedding':
      modalId = 'weddingModal';
      break;
    case 'groom':
      modalId = 'groomModal';
      break;
    case 'bride':
      modalId = 'brideModal';
      break;
    default:
      return;
  }

  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.add('closing');
  setTimeout(() => {
    modal.style.display = 'none';
    modal.classList.remove('closing');

    // 重新显示出行方案框（仅在实际导航到达时）
    const controlsPanel = document.getElementById('controlsPanel');
    if (controlsPanel) {
      controlsPanel.style.display = 'block';
    }
  }, 300);
};

// 测试方法：依次显示所有三个目的地弹窗
window.testDestinationModals = function () {
  showDestinationInfo('wedding');
  setTimeout(() => showDestinationInfo('groom'), 1000);
  setTimeout(() => showDestinationInfo('bride'), 2000);
};

// 将showDestinationInfo暴露到全局，方便测试
window.showDestinationInfo = showDestinationInfo;

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ========== 事件绑定 ==========
window.addEventListener('load', () => {
  initThreeJS();

  // 绑定UI事件
  document
    .getElementById('taxiBtn')
    .addEventListener('click', () => selectTransport('taxi'));
  document
    .getElementById('driveBtn')
    .addEventListener('click', () => selectTransport('drive'));
  document
    .getElementById('destinationSelect')
    .addEventListener('change', updateDestination);
  document
    .getElementById('generateBtn')
    .addEventListener('click', generateRoute);
  document.getElementById('startBtn').addEventListener('click', startJourney);
});
