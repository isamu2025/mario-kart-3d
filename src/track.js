import * as THREE from 'three';

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.width = 14.0;
    this.wallHeight = 2.4;

    // 碰撞线段集合（内墙和外墙，每条线段为 [p1, p2, normal]）
    this.wallSegments = [];
    // 检查点集合
    this.checkpoints = [];
    // 互动实体
    this.coins = [];
    this.boostPads = [];
    this.itemBoxes = [];

    // 创建赛车跑道中心平滑样条曲线
    this.curve = this._buildTrackCurve();
    this.curvePoints = this.curve.getSpacedPoints(360);

    // 构建赛道三维网格
    this._buildRoadMesh();
    this._buildCurbsAndWalls();
    this._buildStartArch();
    this._buildBoostPads();
    this._buildCoins();
    this._buildItemBoxes();
    this._buildCheckpoints();
  }

  // 1. 构建经典封闭赛道控制点（包含大直道、发卡弯、S弯）
  _buildTrackCurve() {
    const rawPoints = [
      new THREE.Vector3(0, 0, -110),     // 起终点大直道中央
      new THREE.Vector3(45, 0, -110),
      new THREE.Vector3(85, 0, -95),
      new THREE.Vector3(120, 0, -60),    // 1号高速右弧弯
      new THREE.Vector3(135, 0, -15),
      new THREE.Vector3(125, 0, 35),
      new THREE.Vector3(95, 0, 70),      // S弯入口
      new THREE.Vector3(50, 0, 85),
      new THREE.Vector3(10, 0, 70),      // S弯折返
      new THREE.Vector3(-25, 0, 85),
      new THREE.Vector3(-60, 0, 115),    // 2号大弯
      new THREE.Vector3(-110, 0, 105),
      new THREE.Vector3(-135, 0, 65),    // 惊险发卡弯
      new THREE.Vector3(-130, 0, 10),
      new THREE.Vector3(-105, 0, -30),
      new THREE.Vector3(-85, 0, -65),    // 回航加速直道
      new THREE.Vector3(-50, 0, -100),
      new THREE.Vector3(-25, 0, -110)
    ];

    return new THREE.CatmullRomCurve3(rawPoints, true, 'centripetal', 0.5);
  }

  // 2. 铺设沥青路面网格与终点黑白方格线
  _buildRoadMesh() {
    const numSteps = this.curvePoints.length - 1;
    const halfW = this.width / 2;

    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= numSteps; i++) {
      const p = this.curvePoints[i];
      const nextIdx = (i + 1) % this.curvePoints.length;
      const tangent = new THREE.Vector3().subVectors(this.curvePoints[nextIdx], p).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // 左右边缘点
      const leftP = new THREE.Vector3().copy(p).addScaledVector(normal, -halfW);
      const rightP = new THREE.Vector3().copy(p).addScaledVector(normal, halfW);

      vertices.push(leftP.x, 0.02, leftP.z);
      vertices.push(rightP.x, 0.02, rightP.z);

      const v = (i / numSteps) * 45; // 贴图纵向平铺
      uvs.push(0, v);
      uvs.push(1, v);

      if (i < numSteps) {
        const row = i * 2;
        indices.push(row, row + 1, row + 2);
        indices.push(row + 1, row + 3, row + 2);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    // 动态生成沥青公路纹理（含中央黄色分道虚线与两侧白边线）
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#263238'; // 深色沥青底
    ctx.fillRect(0, 0, 512, 512);

    // 增加沥青颗粒噪点
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#37474f' : '#1e272c';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // 两侧白色实线
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(16, 0, 8, 512);
    ctx.fillRect(512 - 24, 0, 8, 512);

    // 中央黄色虚线
    ctx.fillStyle = '#ffca28';
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(252, y + 8, 8, 48);
    }

    const roadTexture = new THREE.CanvasTexture(canvas);
    roadTexture.wrapS = THREE.RepeatWrapping;
    roadTexture.wrapT = THREE.RepeatWrapping;

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture,
      roughness: 0.8,
      metalness: 0.1
    });

    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
  }

  // 3. 构建高韧性防撞外墙/内墙与红白相间路肩（Curbs）
  _buildCurbsAndWalls() {
    const numSteps = this.curvePoints.length - 1;
    const halfW = this.width / 2;
    const curbW = 1.3;
    const wallH = this.wallHeight;

    // 准备内墙、外墙的碰撞折线段点集
    const innerPoints = [];
    const outerPoints = [];

    // 路肩网格数据
    const curbVerts = [];
    const curbColors = [];
    const curbIndices = [];

    // 墙体网格数据（双侧独立立面）
    const wallVerts = [];
    const wallColors = [];
    const wallIndices = [];

    const redColor = new THREE.Color(0xd32f2f);
    const whiteColor = new THREE.Color(0xffffff);
    const wallBaseColor = new THREE.Color(0x455a64);
    const wallTopColor = new THREE.Color(0xfbc02d); // 警示黄顶条

    for (let i = 0; i <= numSteps; i++) {
      const p = this.curvePoints[i];
      const nextIdx = (i + 1) % this.curvePoints.length;
      const tangent = new THREE.Vector3().subVectors(this.curvePoints[nextIdx], p).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // 内侧与外侧坐标
      const innerRoadP = new THREE.Vector3().copy(p).addScaledVector(normal, -halfW);
      const innerWallP = new THREE.Vector3().copy(p).addScaledVector(normal, -(halfW + curbW));

      const outerRoadP = new THREE.Vector3().copy(p).addScaledVector(normal, halfW);
      const outerWallP = new THREE.Vector3().copy(p).addScaledVector(normal, halfW + curbW);

      innerPoints.push(innerWallP);
      outerPoints.push(outerWallP);

      // 路肩颜色交替（每5步红白切换）
      const isRed = Math.floor(i / 5) % 2 === 0;
      const color = isRed ? redColor : whiteColor;

      // --- 内侧路肩 ---
      const idxStart = curbVerts.length / 3;
      curbVerts.push(innerRoadP.x, 0.03, innerRoadP.z);
      curbVerts.push(innerWallP.x, 0.15, innerWallP.z); // 轻微台阶隆起
      curbColors.push(color.r, color.g, color.b, color.r, color.g, color.b);

      // --- 外侧路肩 ---
      curbVerts.push(outerRoadP.x, 0.03, outerRoadP.z);
      curbVerts.push(outerWallP.x, 0.15, outerWallP.z);
      curbColors.push(color.r, color.g, color.b, color.r, color.g, color.b);

      if (i < numSteps) {
        // 内侧路肩面
        curbIndices.push(idxStart, idxStart + 1, idxStart + 4);
        curbIndices.push(idxStart + 1, idxStart + 5, idxStart + 4);

        // 外侧路肩面
        curbIndices.push(idxStart + 2, idxStart + 6, idxStart + 3);
        curbIndices.push(idxStart + 3, idxStart + 6, idxStart + 7);
      }

      // --- 构建双侧直立实心防撞墙 ---
      const wIdxStart = wallVerts.length / 3;

      // 内墙（底与顶）
      wallVerts.push(innerWallP.x, 0, innerWallP.z);
      wallVerts.push(innerWallP.x, wallH, innerWallP.z);
      wallColors.push(wallBaseColor.r, wallBaseColor.g, wallBaseColor.b);
      wallColors.push(wallTopColor.r, wallTopColor.g, wallTopColor.b);

      // 外墙（底与顶）
      wallVerts.push(outerWallP.x, 0, outerWallP.z);
      wallVerts.push(outerWallP.x, wallH, outerWallP.z);
      wallColors.push(wallBaseColor.r, wallBaseColor.g, wallBaseColor.b);
      wallColors.push(wallTopColor.r, wallTopColor.g, wallTopColor.b);

      if (i < numSteps) {
        // 内墙面（朝向赛道内部）
        wallIndices.push(wIdxStart, wIdxStart + 4, wIdxStart + 1);
        wallIndices.push(wIdxStart + 1, wIdxStart + 4, wIdxStart + 5);

        // 外墙面（朝向赛道内部）
        wallIndices.push(wIdxStart + 2, wIdxStart + 3, wIdxStart + 6);
        wallIndices.push(wIdxStart + 3, wIdxStart + 7, wIdxStart + 6);
      }
    }

    // 组装路肩网格
    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbVerts, 3));
    curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(curbColors, 3));
    curbGeo.setIndex(curbIndices);
    curbGeo.computeVertexNormals();

    const curbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.1
    });
    const curbMesh = new THREE.Mesh(curbGeo, curbMat);
    curbMesh.receiveShadow = true;
    this.scene.add(curbMesh);

    // 组装防撞实心墙网格
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3));
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallColors, 3));
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();

    const wallMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    this.scene.add(wallMesh);

    // --- 提取连续防穿墙碰撞折线段 (Wall Collision Segments) ---
    // 内墙线段（法线指向赛道中心即向外）
    for (let i = 0; i < innerPoints.length; i++) {
      const p1 = innerPoints[i];
      const p2 = innerPoints[(i + 1) % innerPoints.length];
      const edge = new THREE.Vector2(p2.x - p1.x, p2.z - p1.z);
      const len = edge.length();
      if (len > 0.001) {
        // 内墙朝向赛道中心法线
        const normal = new THREE.Vector2(edge.y / len, -edge.x / len);
        this.wallSegments.push({
          p1: new THREE.Vector2(p1.x, p1.z),
          p2: new THREE.Vector2(p2.x, p2.z),
          normal,
          type: 'inner'
        });
      }
    }

    // 外墙线段（法线指向赛道中心即向内）
    for (let i = 0; i < outerPoints.length; i++) {
      const p1 = outerPoints[i];
      const p2 = outerPoints[(i + 1) % outerPoints.length];
      const edge = new THREE.Vector2(p2.x - p1.x, p2.z - p1.z);
      const len = edge.length();
      if (len > 0.001) {
        // 外墙朝向赛道中心法线
        const normal = new THREE.Vector2(-edge.y / len, edge.x / len);
        this.wallSegments.push({
          p1: new THREE.Vector2(p1.x, p1.z),
          p2: new THREE.Vector2(p2.x, p2.z),
          normal,
          type: 'outer'
        });
      }
    }
  }

  // 4. 起终点门楼拱门与黑白方格终点线
  _buildStartArch() {
    const archGroup = new THREE.Group();

    // 终点方格线贴地条
    const finishLineGeo = new THREE.PlaneGeometry(this.width, 3);
    const flCanvas = document.createElement('canvas');
    flCanvas.width = 256;
    flCanvas.height = 64;
    const flCtx = flCanvas.getContext('2d');
    const cols = 16;
    const rows = 4;
    const cellW = 256 / cols;
    const cellH = 64 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        flCtx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
        flCtx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
    const flTex = new THREE.CanvasTexture(flCanvas);
    const flMat = new THREE.MeshBasicMaterial({ map: flTex, polygonOffset: true, polygonOffsetFactor: -2 });
    const finishLine = new THREE.Mesh(finishLineGeo, flMat);
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.set(0, 0.06, -110);
    this.scene.add(finishLine);

    // 红色金属拱门立柱
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, metalness: 0.6, roughness: 0.3 });
    const pillarGeo = new THREE.CylinderGeometry(0.65, 0.75, 8.5, 12);

    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-(this.width / 2 + 1.8), 4.25, -110);
    leftPillar.castShadow = true;
    archGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(this.width / 2 + 1.8, 4.25, -110);
    rightPillar.castShadow = true;
    archGroup.add(rightPillar);

    // 横梁
    const beamGeo = new THREE.BoxGeometry(this.width + 4.2, 1.4, 1.2);
    const beam = new THREE.Mesh(beamGeo, pillarMat);
    beam.position.set(0, 8.2, -110);
    beam.castShadow = true;
    archGroup.add(beam);

    // 顶部发车标牌 "MARIO KART GP"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = '#fbc02d';
    sCtx.fillRect(0, 0, 512, 128);
    sCtx.lineWidth = 8;
    sCtx.strokeStyle = '#d32f2f';
    sCtx.strokeRect(4, 4, 504, 120);

    sCtx.fillStyle = '#d32f2f';
    sCtx.font = 'bold 54px Impact, Arial Black, sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('★ MARIO KART 3D ★', 256, 64);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), signMat);
    signMesh.position.set(0, 9.8, -110);
    archGroup.add(signMesh);

    // 反面也展示
    const signMeshBack = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), signMat);
    signMeshBack.position.set(0, 9.8, -110);
    signMeshBack.rotation.y = Math.PI;
    archGroup.add(signMeshBack);

    this.scene.add(archGroup);
  }

  // 5. 加速带（Boost Pads）
  _buildBoostPads() {
    // 选取 5 处关键路段安放加速带
    const stepIndices = [45, 115, 195, 260, 315];

    // 发光动态箭头纹理
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.moveTo(128, 30);
    ctx.lineTo(230, 130);
    ctx.lineTo(170, 130);
    ctx.lineTo(170, 220);
    ctx.lineTo(86, 220);
    ctx.lineTo(86, 130);
    ctx.lineTo(26, 130);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffd600';
    ctx.beginPath();
    ctx.moveTo(128, 65);
    ctx.lineTo(200, 135);
    ctx.lineTo(160, 135);
    ctx.lineTo(160, 205);
    ctx.lineTo(96, 205);
    ctx.lineTo(96, 135);
    ctx.lineTo(56, 135);
    ctx.closePath();
    ctx.fill();

    const boostTex = new THREE.CanvasTexture(canvas);
    const padMat = new THREE.MeshBasicMaterial({
      map: boostTex,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -3
    });

    stepIndices.forEach(idx => {
      const p = this.curvePoints[idx];
      const nextIdx = (idx + 1) % this.curvePoints.length;
      const tangent = new THREE.Vector3().subVectors(this.curvePoints[nextIdx], p).normalize();
      const angle = Math.atan2(tangent.x, tangent.z);

      const padGeo = new THREE.PlaneGeometry(6.5, 7.5);
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.rotation.z = -angle;
      padMesh.position.set(p.x, 0.08, p.z);

      this.scene.add(padMesh);
      this.boostPads.push({
        position: new THREE.Vector3(p.x, 0.08, p.z),
        radius: 3.8
      });
    });
  }

  // 6. 赛道旋转发光金币（Coins）
  _buildCoins() {
    // 24 枚硬币分散在赛道各段
    const coinIndices = [
      12, 16, 20, 60, 65, 70, 100, 105, 110,
      140, 145, 150, 180, 185, 220, 225, 230,
      270, 275, 280, 330, 335, 340, 345
    ];

    const coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.22, 18);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0xffa000,
      emissiveIntensity: 0.25
    });

    coinIndices.forEach(idx => {
      const p = this.curvePoints[idx];
      const nextIdx = (idx + 1) % this.curvePoints.length;
      const tangent = new THREE.Vector3().subVectors(this.curvePoints[nextIdx], p).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // 在路面略微左右偏离
      const offset = (Math.random() - 0.5) * (this.width - 4.5);
      const pos = new THREE.Vector3().copy(p).addScaledVector(normal, offset);
      pos.y = 1.1;

      const coinMesh = new THREE.Mesh(coinGeo, coinMat);
      coinMesh.rotation.x = Math.PI / 2;
      coinMesh.position.copy(pos);
      coinMesh.castShadow = true;

      this.scene.add(coinMesh);
      this.coins.push({
        mesh: coinMesh,
        originalPos: pos.clone(),
        collected: false,
        respawnTimer: 0,
        radius: 1.6
      });
    });
  }

  // 7. 问号道具箱（Item Boxes）
  _buildItemBoxes() {
    const boxIndices = [35, 90, 165, 245, 305];
    const boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xffa000,
      roughness: 0.3,
      metalness: 0.4,
      transparent: true,
      opacity: 0.88,
      emissive: 0xff6f00,
      emissiveIntensity: 0.4
    });

    boxIndices.forEach(idx => {
      // 一组排布 2 个横向箱子
      [-3.0, 3.0].forEach(offset => {
        const p = this.curvePoints[idx];
        const nextIdx = (idx + 1) % this.curvePoints.length;
        const tangent = new THREE.Vector3().subVectors(this.curvePoints[nextIdx], p).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const pos = new THREE.Vector3().copy(p).addScaledVector(normal, offset);
        pos.y = 1.4;

        const boxGroup = new THREE.Group();
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        boxGroup.add(boxMesh);

        // 内部问号小金片
        const innerGeo = new THREE.OctahedronGeometry(0.55);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        boxGroup.add(innerMesh);

        boxGroup.position.copy(pos);
        this.scene.add(boxGroup);

        this.itemBoxes.push({
          group: boxGroup,
          mesh: boxMesh,
          inner: innerMesh,
          originalPos: pos.clone(),
          active: true,
          respawnTimer: 0,
          radius: 1.8
        });
      });
    });
  }

  // 8. 检查点（Checkpoints）
  _buildCheckpoints() {
    const numCheckpoints = 24;
    for (let i = 0; i < numCheckpoints; i++) {
      const idx = Math.floor((i / numCheckpoints) * this.curvePoints.length);
      const p = this.curvePoints[idx];
      this.checkpoints.push({
        index: i,
        position: new THREE.Vector2(p.x, p.z),
        radius: this.width * 0.95
      });
    }
  }

  // 逐帧更新道具自转、浮动与刷新计时器
  update(delta) {
    const time = performance.now() * 0.003;

    // 金币旋转与上下浮动
    this.coins.forEach(coin => {
      if (coin.collected) {
        coin.respawnTimer -= delta;
        if (coin.respawnTimer <= 0) {
          coin.collected = false;
          coin.mesh.visible = true;
          coin.mesh.scale.set(1, 1, 1);
        }
      } else {
        coin.mesh.rotation.z += 2.5 * delta;
        coin.mesh.position.y = coin.originalPos.y + Math.sin(time + coin.originalPos.x) * 0.15;
      }
    });

    // 道具箱旋转浮动与刷新
    this.itemBoxes.forEach(item => {
      if (!item.active) {
        item.respawnTimer -= delta;
        if (item.respawnTimer <= 0) {
          item.active = true;
          item.group.visible = true;
          item.group.scale.set(1, 1, 1);
        }
      } else {
        item.group.rotation.y += 2.2 * delta;
        item.group.rotation.x = Math.sin(time) * 0.12;
        item.inner.rotation.y -= 4.0 * delta;
        item.group.position.y = item.originalPos.y + Math.cos(time + item.originalPos.z) * 0.18;
      }
    });
  }
}
