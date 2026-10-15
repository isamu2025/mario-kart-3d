import * as THREE from 'three';

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.width = 15.0;       // 15米开阔标准赛道
    this.wallHeight = 2.4;   // 2.4米坚固防撞墙

    // 碰撞线段集合（内墙和外墙，每条线段包含 p1, p2, normal）
    this.wallSegments = [];
    // 检查点集合
    this.checkpoints = [];
    // 互动实体
    this.coins = [];
    this.boostPads = [];
    this.itemBoxes = [];

    // 创建起跑直道完全正对 +Z 的封闭赛道曲线
    this.curve = this._buildTrackCurve();
    this.numSteps = 320;
    this.curvePoints = this.curve.getSpacedPoints(this.numSteps);

    // 构建赛道三维网格
    this._buildRoadMesh();
    this._buildCurbsAndWalls();
    this._buildStartArch();
    this._buildBoostPads();
    this._buildCoins();
    this._buildItemBoxes();
    this._buildCheckpoints();
  }

  // 获取发车线绝对坐标与偏航角朝向
  getStartPosition() {
    const p0 = this.curvePoints[0];
    const p1 = this.curvePoints[1];
    const tan = new THREE.Vector3().subVectors(p1, p0).normalize();
    const yaw = Math.atan2(tan.x, tan.z);
    return {
      position: new THREE.Vector3(p0.x, 0.05, p0.z),
      yaw: yaw
    };
  }

  // 1. 构建经典封闭赛道控制点（起跑线至大直道，长达 150 米正前方无遮挡大直道）
  _buildTrackCurve() {
    const rawPoints = [
      new THREE.Vector3(0, 0, -60),     // 起始线与发车拱门
      new THREE.Vector3(0, 0, -10),
      new THREE.Vector3(0, 0, 40),
      new THREE.Vector3(0, 0, 90),      // 直道末端进入大弧度高速右弯
      new THREE.Vector3(40, 0, 135),
      new THREE.Vector3(90, 0, 145),
      new THREE.Vector3(135, 0, 115),   // 1号弯顶点
      new THREE.Vector3(150, 0, 60),
      new THREE.Vector3(130, 0, 10),
      new THREE.Vector3(95, 0, -20),    // S弯入口
      new THREE.Vector3(60, 0, -15),
      new THREE.Vector3(35, 0, 20),     // S弯折返
      new THREE.Vector3(10, 0, 50),
      new THREE.Vector3(-30, 0, 55),
      new THREE.Vector3(-75, 0, 30),    // 惊险发卡弯入口
      new THREE.Vector3(-110, 0, -15),
      new THREE.Vector3(-115, 0, -65),  // 发卡弯折返
      new THREE.Vector3(-90, 0, -115),  // 回航大弧弯
      new THREE.Vector3(-45, 0, -120),
      new THREE.Vector3(0, 0, -110)     // 直道平滑衔接前导点
    ];

    return new THREE.CatmullRomCurve3(rawPoints, true, 'centripetal', 0.5);
  }

  // 2. 铺设高质量沥青路面
  _buildRoadMesh() {
    const num = this.numSteps;
    const halfW = this.width / 2;

    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= num; i++) {
      const idx = i % num;
      const nextIdx = (idx + 1) % num;
      const p = this.curvePoints[idx];
      const nextP = this.curvePoints[nextIdx];

      const tangent = new THREE.Vector3().subVectors(nextP, p).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const leftP = new THREE.Vector3().copy(p).addScaledVector(normal, -halfW);
      const rightP = new THREE.Vector3().copy(p).addScaledVector(normal, halfW);

      vertices.push(leftP.x, 0.02, leftP.z);
      vertices.push(rightP.x, 0.02, rightP.z);

      const v = (i / num) * 50;
      uvs.push(0, v);
      uvs.push(1, v);

      if (i < num) {
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

    // 绘制高清沥青纹理（含路边双白线与中央黄色分道线）
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#263238';
    ctx.fillRect(0, 0, 512, 512);

    // 沥青噪点
    for (let j = 0; j < 3500; j++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#37474f' : '#1e272c';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // 两侧白色边界线
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(16, 0, 10, 512);
    ctx.fillRect(512 - 26, 0, 10, 512);

    // 中央黄色虚线
    ctx.fillStyle = '#ffca28';
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(251, y + 8, 10, 48);
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

  // 3. 构建闭合路肩与坚固防撞墙
  _buildCurbsAndWalls() {
    const num = this.numSteps;
    const halfW = this.width / 2;
    const curbW = 1.3;
    const wallH = this.wallHeight;

    const innerPoints = [];
    const outerPoints = [];

    const curbVerts = [];
    const curbColors = [];
    const curbIndices = [];

    const wallVerts = [];
    const wallColors = [];
    const wallIndices = [];

    const redColor = new THREE.Color(0xd32f2f);
    const whiteColor = new THREE.Color(0xffffff);
    const wallBaseColor = new THREE.Color(0x37474f);
    const wallTopColor = new THREE.Color(0xffca28); // 醒目金黄顶边

    for (let i = 0; i <= num; i++) {
      const idx = i % num;
      const nextIdx = (idx + 1) % num;
      const p = this.curvePoints[idx];
      const nextP = this.curvePoints[nextIdx];

      const tangent = new THREE.Vector3().subVectors(nextP, p).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const innerRoadP = new THREE.Vector3().copy(p).addScaledVector(normal, -halfW);
      const innerWallP = new THREE.Vector3().copy(p).addScaledVector(normal, -(halfW + curbW));

      const outerRoadP = new THREE.Vector3().copy(p).addScaledVector(normal, halfW);
      const outerWallP = new THREE.Vector3().copy(p).addScaledVector(normal, halfW + curbW);

      if (i < num) {
        innerPoints.push(innerWallP);
        outerPoints.push(outerWallP);
      }

      const isRed = Math.floor(i / 4) % 2 === 0;
      const col = isRed ? redColor : whiteColor;

      // 路肩顶点
      const cIdxStart = curbVerts.length / 3;
      curbVerts.push(innerRoadP.x, 0.03, innerRoadP.z);
      curbVerts.push(innerWallP.x, 0.16, innerWallP.z);
      curbColors.push(col.r, col.g, col.b, col.r, col.g, col.b);

      curbVerts.push(outerRoadP.x, 0.03, outerRoadP.z);
      curbVerts.push(outerWallP.x, 0.16, outerWallP.z);
      curbColors.push(col.r, col.g, col.b, col.r, col.g, col.b);

      if (i < num) {
        curbIndices.push(cIdxStart, cIdxStart + 1, cIdxStart + 4);
        curbIndices.push(cIdxStart + 1, cIdxStart + 5, cIdxStart + 4);

        curbIndices.push(cIdxStart + 2, cIdxStart + 6, cIdxStart + 3);
        curbIndices.push(cIdxStart + 3, cIdxStart + 6, cIdxStart + 7);
      }

      // 防撞墙顶点
      const wIdxStart = wallVerts.length / 3;
      // 内墙
      wallVerts.push(innerWallP.x, 0, innerWallP.z);
      wallVerts.push(innerWallP.x, wallH, innerWallP.z);
      wallColors.push(wallBaseColor.r, wallBaseColor.g, wallBaseColor.b);
      wallColors.push(wallTopColor.r, wallTopColor.g, wallTopColor.b);

      // 外墙
      wallVerts.push(outerWallP.x, 0, outerWallP.z);
      wallVerts.push(outerWallP.x, wallH, outerWallP.z);
      wallColors.push(wallBaseColor.r, wallBaseColor.g, wallBaseColor.b);
      wallColors.push(wallTopColor.r, wallTopColor.g, wallTopColor.b);

      if (i < num) {
        // 内墙面朝向赛道中心
        wallIndices.push(wIdxStart, wIdxStart + 4, wIdxStart + 1);
        wallIndices.push(wIdxStart + 1, wIdxStart + 4, wIdxStart + 5);

        // 外墙面朝向赛道中心
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

    const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const curbMesh = new THREE.Mesh(curbGeo, curbMat);
    curbMesh.receiveShadow = true;
    this.scene.add(curbMesh);

    // 组装墙体网格
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3));
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallColors, 3));
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();

    const wallMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.15,
      side: THREE.DoubleSide
    });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    this.scene.add(wallMesh);

    // 提取闭合线段碰撞体集合
    for (let i = 0; i < innerPoints.length; i++) {
      const p1 = innerPoints[i];
      const p2 = innerPoints[(i + 1) % innerPoints.length];
      const edge = new THREE.Vector2(p2.x - p1.x, p2.z - p1.z);
      const len = edge.length();
      if (len > 0.001) {
        const normal = new THREE.Vector2(edge.y / len, -edge.x / len);
        this.wallSegments.push({
          p1: new THREE.Vector2(p1.x, p1.z),
          p2: new THREE.Vector2(p2.x, p2.z),
          normal,
          type: 'inner'
        });
      }
    }

    for (let i = 0; i < outerPoints.length; i++) {
      const p1 = outerPoints[i];
      const p2 = outerPoints[(i + 1) % outerPoints.length];
      const edge = new THREE.Vector2(p2.x - p1.x, p2.z - p1.z);
      const len = edge.length();
      if (len > 0.001) {
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

  // 4. 精确横跨发车线的起终点拱门与黑白棋盘格终点线
  _buildStartArch() {
    const p0 = this.curvePoints[0];
    const p1 = this.curvePoints[1];
    const tangent = new THREE.Vector3().subVectors(p1, p0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const yaw = Math.atan2(tangent.x, tangent.z);

    const archGroup = new THREE.Group();
    archGroup.position.copy(p0);
    archGroup.rotation.y = yaw;

    // 黑白棋盘终点线（沿 normal 轴横跨赛道）
    const finishLineGeo = new THREE.PlaneGeometry(this.width, 3.6);
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
    const flMat = new THREE.MeshBasicMaterial({ map: flTex, depthWrite: false });
    const finishLine = new THREE.Mesh(finishLineGeo, flMat);
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.rotation.z = Math.PI / 2; // 横跨赛道两侧
    finishLine.position.y = 0.06;
    archGroup.add(finishLine);

    // 红色金属拱门立柱（分别置于两侧护栏外）
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, metalness: 0.5, roughness: 0.3 });
    const pillarGeo = new THREE.CylinderGeometry(0.7, 0.8, 9.0, 14);

    const postOffset = this.width / 2 + 1.8;
    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-postOffset, 4.5, 0);
    leftPillar.castShadow = true;
    archGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(postOffset, 4.5, 0);
    rightPillar.castShadow = true;
    archGroup.add(rightPillar);

    // 跨道横梁
    const beamGeo = new THREE.BoxGeometry(this.width + 4.5, 1.5, 1.2);
    const beam = new THREE.Mesh(beamGeo, pillarMat);
    beam.position.set(0, 8.8, 0);
    beam.castShadow = true;
    archGroup.add(beam);

    // 发车门头招牌 "★ MARIO KART 3D ★"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = '#ffca28';
    sCtx.fillRect(0, 0, 512, 128);
    sCtx.lineWidth = 10;
    sCtx.strokeStyle = '#d32f2f';
    sCtx.strokeRect(5, 5, 502, 118);

    sCtx.fillStyle = '#d32f2f';
    sCtx.font = 'bold 50px Arial Black, Impact, sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('★ MARIO KART 3D ★', 256, 64);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });

    const signMeshFront = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 3.2), signMat);
    signMeshFront.position.set(0, 10.4, 0.65);
    archGroup.add(signMeshFront);

    const signMeshBack = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 3.2), signMat);
    signMeshBack.position.set(0, 10.4, -0.65);
    signMeshBack.rotation.y = Math.PI;
    archGroup.add(signMeshBack);

    this.scene.add(archGroup);
  }

  // 5. 加速带（Boost Pads）
  _buildBoostPads() {
    const stepIndices = [45, 105, 175, 235, 285];

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.moveTo(128, 25);
    ctx.lineTo(235, 130);
    ctx.lineTo(170, 130);
    ctx.lineTo(170, 230);
    ctx.lineTo(86, 230);
    ctx.lineTo(86, 130);
    ctx.lineTo(21, 130);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffd600';
    ctx.beginPath();
    ctx.moveTo(128, 65);
    ctx.lineTo(205, 135);
    ctx.lineTo(160, 135);
    ctx.lineTo(160, 215);
    ctx.lineTo(96, 215);
    ctx.lineTo(96, 135);
    ctx.lineTo(51, 135);
    ctx.closePath();
    ctx.fill();

    const boostTex = new THREE.CanvasTexture(canvas);
    const padMat = new THREE.MeshBasicMaterial({
      map: boostTex,
      transparent: true,
      depthWrite: false
    });

    stepIndices.forEach(idx => {
      const p = this.curvePoints[idx];
      const nextIdx = (idx + 1) % this.numSteps;
      const tangent = new THREE.Vector3().subVectors(this.curvePoints[nextIdx], p).normalize();
      const angle = Math.atan2(tangent.x, tangent.z);

      const padGeo = new THREE.PlaneGeometry(7.0, 8.0);
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.rotation.z = -angle;
      padMesh.position.set(p.x, 0.08, p.z);

      this.scene.add(padMesh);
      this.boostPads.push({
        position: new THREE.Vector3(p.x, 0.08, p.z),
        radius: 4.2
      });
    });
  }

  // 6. 旋转金币（Coins）
  _buildCoins() {
    const coinIndices = [
      12, 16, 20, 24, 60, 64, 68, 120, 124, 128,
      155, 159, 163, 195, 199, 203, 248, 252, 256,
      295, 299, 303, 307, 311
    ];

    const coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.22, 18);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0xffa000,
      emissiveIntensity: 0.3
    });

    coinIndices.forEach(idx => {
      const p = this.curvePoints[idx];
      const nextIdx = (idx + 1) % this.numSteps;
      const tangent = new THREE.Vector3().subVectors(this.curvePoints[nextIdx], p).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const offset = (Math.sin(idx * 0.4) * 0.5) * (this.width - 5.0);
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
        radius: 1.8
      });
    });
  }

  // 7. 问号道具箱（Item Boxes）
  _buildItemBoxes() {
    const boxIndices = [35, 88, 145, 215, 270];
    const boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xffa000,
      roughness: 0.25,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85,
      emissive: 0xff8f00,
      emissiveIntensity: 0.4
    });

    boxIndices.forEach(idx => {
      [-3.2, 3.2].forEach(offset => {
        const p = this.curvePoints[idx];
        const nextIdx = (idx + 1) % this.numSteps;
        const tangent = new THREE.Vector3().subVectors(this.curvePoints[nextIdx], p).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const pos = new THREE.Vector3().copy(p).addScaledVector(normal, offset);
        pos.y = 1.4;

        const boxGroup = new THREE.Group();
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        boxGroup.add(boxMesh);

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
          radius: 1.9
        });
      });
    });
  }

  // 8. 检查点（Checkpoints）
  _buildCheckpoints() {
    const numCheckpoints = 24;
    for (let i = 0; i < numCheckpoints; i++) {
      const idx = Math.floor((i / numCheckpoints) * this.numSteps);
      const p = this.curvePoints[idx];
      this.checkpoints.push({
        index: i,
        position: new THREE.Vector2(p.x, p.z),
        radius: this.width * 1.1
      });
    }
  }

  // 逐帧更新道具自转、浮动与刷新
  update(delta) {
    const time = performance.now() * 0.003;

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
