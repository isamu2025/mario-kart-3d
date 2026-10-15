import * as THREE from 'three';

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.clouds = [];
    this.sunMesh = null;
    this.dirLight = null;

    this.initSky();
    this.initLights();
    this.initClouds();
    this.initLandscape();
  }

  // 1. 晴朗高远蓝天穹顶
  initSky() {
    // 渐变天空球
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `;

    const uniforms = {
      topColor: { value: new THREE.Color(0x1976d2) },    // 蔚蓝高空
      bottomColor: { value: new THREE.Color(0xbbdefb) }, // 地平线柔和浅天蓝
      offset: { value: 33 },
      exponent: { value: 0.6 }
    };

    const skyGeo = new THREE.SphereGeometry(650, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.BackSide,
      depthWrite: false
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // 视觉太阳光轮
    const sunGeo = new THREE.SphereGeometry(18, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff9c4,
      fog: false
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.set(220, 260, -280);
    this.scene.add(this.sunMesh);

    // 太阳发光外光晕
    const glowGeo = new THREE.SphereGeometry(35, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffecb3,
      transparent: true,
      opacity: 0.35,
      fog: false
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.sunMesh.add(glowMesh);
  }

  // 2. 阳光与自然环境光
  initLights() {
    // 半球光：模拟天空天光与草地绿意反射
    const hemiLight = new THREE.HemisphereLight(0x90caf9, 0xa5d6a7, 0.75);
    hemiLight.position.set(0, 200, 0);
    this.scene.add(hemiLight);

    // 暖色平行日光与高精度柔和阴影
    this.dirLight = new THREE.DirectionalLight(0xfff8e1, 1.8);
    this.dirLight.position.set(220, 260, -280);
    this.dirLight.castShadow = true;

    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 700;

    const d = 160;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0004;

    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // 环境微光填充暗部细节
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);
  }

  // 3. 蓬松可爱的 3D 体积白云系统
  initClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true
    });

    // 生成一组由不同大小球体簇合成的立体白云
    for (let c = 0; c < 22; c++) {
      const cloudGroup = new THREE.Group();
      const numPuffs = 5 + Math.floor(Math.random() * 5);

      for (let p = 0; p < numPuffs; p++) {
        const radius = 9 + Math.random() * 14;
        const sphereGeo = new THREE.DodecahedronGeometry(radius, 1);
        const puff = new THREE.Mesh(sphereGeo, cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 32,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 26
        );
        puff.scale.set(1.2, 0.8, 1.1);
        cloudGroup.add(puff);
      }

      // 广阔高空随机分布
      const x = (Math.random() - 0.5) * 600;
      const y = 85 + Math.random() * 65;
      const z = (Math.random() - 0.5) * 600;

      cloudGroup.position.set(x, y, z);
      cloudGroup.userData = {
        speed: 1.5 + Math.random() * 2.5
      };

      this.scene.add(cloudGroup);
      this.clouds.push(cloudGroup);
    }
  }

  // 4. 周边群山与马里奥风格红白蘑菇风景
  initLandscape() {
    // 宽阔翠绿地表
    const groundGeo = new THREE.PlaneGeometry(900, 900, 32, 32);
    // 随机微起伏
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      // 距离赛道中心区域平整，远端平缓起伏
      const dist = Math.sqrt(vx * vx + vy * vy);
      if (dist > 90) {
        const wave = Math.sin(vx * 0.03) * Math.cos(vy * 0.03) * 6.5;
        pos.setZ(i, wave);
      }
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x558b2f, // 活力草地绿
      roughness: 0.85,
      metalness: 0.05
    });

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 远方马里奥风格圆润绿丘
    this._createCartoonHills();

    // 沿途马里奥经典红白波点蘑菇与树木
    this._createMushroomDecorations();
  }

  _createCartoonHills() {
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x689f38,
      roughness: 0.8
    });

    const hillPositions = [
      { x: -180, z: -150, r: 70, h: 45 },
      { x: 190, z: -160, r: 85, h: 55 },
      { x: 210, z: 140, r: 65, h: 40 },
      { x: -190, z: 160, r: 80, h: 48 },
      { x: 0, z: -230, r: 90, h: 50 },
      { x: 0, z: 240, r: 85, h: 45 }
    ];

    hillPositions.forEach(p => {
      const geo = new THREE.SphereGeometry(p.r, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const hill = new THREE.Mesh(geo, hillMat);
      hill.position.set(p.x, 0, p.z);
      hill.scale.set(1.1, p.h / p.r, 1.1);
      hill.receiveShadow = true;
      this.scene.add(hill);
    });
  }

  _createMushroomDecorations() {
    // 经典马里奥红伞白点蘑菇
    const mushroomPositions = [
      { x: -65, z: -40, s: 1.4 },
      { x: 70, z: 50, s: 1.8 },
      { x: -75, z: 60, s: 1.2 },
      { x: 80, z: -70, s: 1.6 },
      { x: -110, z: -90, s: 2.2 },
      { x: 115, z: 95, s: 2.0 },
      { x: -20, z: -100, s: 1.5 },
      { x: 30, z: 110, s: 1.7 }
    ];

    mushroomPositions.forEach(m => {
      const group = new THREE.Group();

      // 白茎
      const stemGeo = new THREE.CylinderGeometry(1.2, 1.5, 4.5, 12);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 2.25;
      stem.castShadow = true;
      stem.receiveShadow = true;
      group.add(stem);

      // 红盖
      const capGeo = new THREE.SphereGeometry(3.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 4.2;
      cap.scale.set(1.1, 0.8, 1.1);
      cap.castShadow = true;
      group.add(cap);

      // 顶部白圆点
      const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const spot1 = new THREE.Mesh(new THREE.CircleGeometry(0.85, 12), spotMat);
      spot1.position.set(0, 6.7, 0);
      spot1.rotation.x = -Math.PI / 2;
      group.add(spot1);

      // 侧面白圆点
      for (let i = 0; i < 4; i++) {
        const spot = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), spotMat);
        const angle = (i * Math.PI) / 2;
        spot.position.set(Math.sin(angle) * 2.8, 5.2, Math.cos(angle) * 2.8);
        spot.rotation.y = angle;
        spot.rotation.x = -0.35;
        group.add(spot);
      }

      group.position.set(m.x, 0, m.z);
      group.scale.set(m.s, m.s, m.s);
      this.scene.add(group);
    });

    // 搭配可爱的卡通圆球绿树
    const treePositions = [
      { x: -50, z: -80 }, { x: 55, z: -95 }, { x: -85, z: 20 },
      { x: 90, z: -30 }, { x: -35, z: 85 }, { x: 60, z: 80 }
    ];

    treePositions.forEach(t => {
      const tree = new THREE.Group();
      // 树干
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.9 })
      );
      trunk.position.y = 2;
      trunk.castShadow = true;
      tree.add(trunk);

      // 圆球树冠
      const leaves = new THREE.Mesh(
        new THREE.DodecahedronGeometry(2.8, 1),
        new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 0.7, flatShading: true })
      );
      leaves.position.y = 5.2;
      leaves.castShadow = true;
      tree.add(leaves);

      tree.position.set(t.x, 0, t.z);
      this.scene.add(tree);
    });
  }

  // 逐帧更新白云漂移与太阳光追随
  update(delta, playerPos) {
    // 白云缓慢飘动
    this.clouds.forEach(cloud => {
      cloud.position.x += cloud.userData.speed * delta;
      if (cloud.position.x > 320) {
        cloud.position.x = -320;
      }
    });

    // 日光阴影摄像机跟随赛车移动，保持阴影贴图清晰度
    if (playerPos && this.dirLight) {
      this.dirLight.target.position.copy(playerPos);
      this.dirLight.position.set(
        playerPos.x + 180,
        playerPos.y + 240,
        playerPos.z - 220
      );
    }
  }
}
