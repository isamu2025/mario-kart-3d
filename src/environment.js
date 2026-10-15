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
      bottomColor: { value: new THREE.Color(0xbbdefb) }, // 地平线浅天蓝
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
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff9c4, fog: false });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.set(220, 260, -280);
    this.scene.add(this.sunMesh);

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

  // 2. 暖阳与自然天光
  initLights() {
    const hemiLight = new THREE.HemisphereLight(0x90caf9, 0xa5d6a7, 0.75);
    hemiLight.position.set(0, 200, 0);
    this.scene.add(hemiLight);

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

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);
  }

  // 3. 蓬松 3D 白云系统
  initClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true
    });

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

      const x = (Math.random() - 0.5) * 600;
      const y = 85 + Math.random() * 65;
      const z = (Math.random() - 0.5) * 600;

      cloudGroup.position.set(x, y, z);
      cloudGroup.userData = { speed: 1.5 + Math.random() * 2.5 };

      this.scene.add(cloudGroup);
      this.clouds.push(cloudGroup);
    }
  }

  // 4. 周边群山与马里奥风格红白蘑菇风景
  initLandscape() {
    // 平整赛场主草坪，杜绝草皮波浪上涌遮挡赛道柏油与防护墙
    const groundGeo = new THREE.PlaneGeometry(1000, 1000, 8, 8);
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x558b2f,
      roughness: 0.85,
      metalness: 0.05
    });

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this._createCartoonHills();
    this._createMushroomDecorations();
  }

  _createCartoonHills() {
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x689f38, roughness: 0.8 });

    const hillPositions = [
      { x: -190, z: -170, r: 75, h: 48 },
      { x: 210, z: -170, r: 85, h: 55 },
      { x: 230, z: 150, r: 70, h: 42 },
      { x: -210, z: 170, r: 80, h: 50 },
      { x: 0, z: -250, r: 90, h: 52 },
      { x: 0, z: 250, r: 90, h: 48 }
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
    // 蘑菇均放置在赛道两侧足够远的安全区域（杜绝误侵入车道）
    const mushroomPositions = [
      { x: -45, z: -40, s: 1.5 },
      { x: 45, z: 40, s: 1.8 },
      { x: -65, z: 85, s: 1.6 },
      { x: 80, z: -80, s: 1.7 },
      { x: -145, z: 10, s: 2.2 },
      { x: 210, z: 40, s: 2.0 },   // 移至东外侧 210m，彻底远离 165m 赛道
      { x: -40, z: -145, s: 1.6 },
      { x: 50, z: 185, s: 1.8 }
    ];

    mushroomPositions.forEach(m => {
      const group = new THREE.Group();

      const stemGeo = new THREE.CylinderGeometry(1.2, 1.5, 4.5, 12);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 2.25;
      stem.castShadow = true;
      group.add(stem);

      const capGeo = new THREE.SphereGeometry(3.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 4.2;
      cap.scale.set(1.1, 0.8, 1.1);
      cap.castShadow = true;
      group.add(cap);

      const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const spot1 = new THREE.Mesh(new THREE.CircleGeometry(0.85, 12), spotMat);
      spot1.position.set(0, 6.7, 0);
      spot1.rotation.x = -Math.PI / 2;
      group.add(spot1);

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

    const treePositions = [
      { x: -50, z: -85 }, { x: 55, z: -85 }, { x: -85, z: 20 },
      { x: 85, z: -30 }, { x: -35, z: 85 }, { x: 60, z: 80 }
    ];

    treePositions.forEach(t => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.9 })
      );
      trunk.position.y = 2;
      trunk.castShadow = true;
      tree.add(trunk);

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

  update(delta, playerPos) {
    this.clouds.forEach(cloud => {
      cloud.position.x += cloud.userData.speed * delta;
      if (cloud.position.x > 320) {
        cloud.position.x = -320;
      }
    });

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
