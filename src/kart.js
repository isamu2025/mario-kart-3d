import * as THREE from 'three';

export class Kart {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();

    // 内部独立可动子构件
    this.bodyGroup = new THREE.Group(); // 用于悬挂侧倾与俯仰
    this.frontLeftPivot = null;
    this.frontRightPivot = null;
    this.frontLeftWheel = null;
    this.frontRightWheel = null;
    this.rearLeftWheel = null;
    this.rearRightWheel = null;
    this.steeringWheel = null;
    this.boostFlames = [];

    this._buildModel();
    this.scene.add(this.group);
  }

  _buildModel() {
    // 经典任天堂马里奥卡丁车配色材质
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xe52521,
      roughness: 0.25,
      metalness: 0.2
    });

    const darkRedMat = new THREE.MeshStandardMaterial({
      color: 0x9b111e,
      roughness: 0.35
    });

    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      roughness: 0.2,
      metalness: 0.1
    });

    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.8
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.85,
      roughness: 0.15
    });

    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xffd600,
      roughness: 0.3,
      metalness: 0.3
    });

    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x1976d2,
      roughness: 0.4
    });

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffcc80,
      roughness: 0.55
    });

    // 0. 地面接触软阴影贴片（让赛车完美贴地沉稳，不漂浮）
    const shadowGeo = new THREE.PlaneGeometry(2.2, 3.2);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMesh = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.75, depthWrite: false })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.04;
    this.group.add(shadowMesh);

    // 1. 卡丁车核心底盘与车架
    const chassisGeo = new THREE.BoxGeometry(1.4, 0.42, 2.4);
    const chassis = new THREE.Mesh(chassisGeo, redMat);
    chassis.position.set(0, 0.48, 0.05);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.bodyGroup.add(chassis);

    // 前流线车鼻锥（弧度倾斜）
    const noseGeo = new THREE.BoxGeometry(1.2, 0.32, 0.9);
    const nose = new THREE.Mesh(noseGeo, redMat);
    nose.position.set(0, 0.42, 1.25);
    nose.rotation.x = 0.12;
    nose.castShadow = true;
    this.bodyGroup.add(nose);

    // 前保险杠防撞唇（Front Splitter）
    const splitterGeo = new THREE.BoxGeometry(1.5, 0.1, 0.35);
    const splitter = new THREE.Mesh(splitterGeo, blackMat);
    splitter.position.set(0, 0.22, 1.6);
    splitter.castShadow = true;
    this.bodyGroup.add(splitter);

    // 白色经典中央赛车拉花
    const stripeGeo = new THREE.BoxGeometry(0.36, 0.44, 2.4);
    const stripe = new THREE.Mesh(stripeGeo, whiteMat);
    stripe.position.set(0, 0.49, 0.3);
    this.bodyGroup.add(stripe);

    // 车前盖马里奥 "M" 标志徽章
    const emblemGroup = new THREE.Group();
    emblemGroup.position.set(0, 0.62, 1.2);
    emblemGroup.rotation.x = -0.3;

    const emblemBg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 16), whiteMat);
    emblemBg.rotation.x = Math.PI / 2;
    emblemGroup.add(emblemBg);

    // M 标志中心红圆心
    const mLetter = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), darkRedMat);
    mLetter.rotation.x = Math.PI / 2;
    emblemGroup.add(mLetter);
    this.bodyGroup.add(emblemGroup);

    // 双侧动感进气侧翼（Side Pods）
    [-0.82, 0.82].forEach(x => {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 1.5), redMat);
      pod.position.set(x, 0.44, -0.05);
      pod.castShadow = true;
      this.bodyGroup.add(pod);

      // 侧翼进气孔
      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.08), blackMat);
      intake.position.set(x, 0.44, 0.71);
      this.bodyGroup.add(intake);
    });

    // 前车灯（明亮复古黄）
    [-0.45, 0.45].forEach(x => {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), yellowMat);
      light.position.set(x, 0.46, 1.6);
      this.bodyGroup.add(light);
    });

    // 2. 驾驶舱与方向盘
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.2), blackMat);
    seatBack.position.set(0, 0.82, -0.42);
    seatBack.rotation.x = -0.15;
    this.bodyGroup.add(seatBack);

    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.2, 0.6), blackMat);
    seatBase.position.set(0, 0.52, -0.15);
    this.bodyGroup.add(seatBase);

    // 方向盘联动架
    const steerPivot = new THREE.Group();
    steerPivot.position.set(0, 0.75, 0.45);
    steerPivot.rotation.x = -0.45;

    const steerShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), chromeMat);
    steerShaft.rotation.x = Math.PI / 2;
    steerPivot.add(steerShaft);

    const steerRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 8, 16), yellowMat);
    steerRing.position.z = 0.2;
    steerPivot.add(steerRing);

    this.bodyGroup.add(steerPivot);
    this.steeringWheel = steerPivot;

    // 3. 马里奥车手（Mario Kart Driver）
    const driverGroup = new THREE.Group();
    driverGroup.position.set(0, 0.75, -0.18);

    // 蓝色背带裤身体
    const bodyTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.55, 12), blueMat);
    bodyTorso.position.y = 0.28;
    bodyTorso.castShadow = true;
    driverGroup.add(bodyTorso);

    // 红色内衬 T 恤
    const innerShirt = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 12), redMat);
    innerShirt.position.y = 0.5;
    driverGroup.add(innerShirt);

    // 双手手握方向盘（白手套）
    [-0.26, 0.26].forEach(x => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.4, 8), redMat);
      arm.position.set(x, 0.48, 0.25);
      arm.rotation.x = Math.PI / 3;
      arm.rotation.z = -Math.sign(x) * 0.2;
      driverGroup.add(arm);

      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), whiteMat);
      glove.position.set(x * 0.7, 0.58, 0.45);
      driverGroup.add(glove);
    });

    // 车手头部
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), skinMat);
    head.position.y = 0.85;
    head.castShadow = true;
    driverGroup.add(head);

    // 经典大鼻子
    const noseM = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skinMat);
    noseM.position.set(0, 0.84, 0.32);
    driverGroup.add(noseM);

    // 翘胡子
    const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.12), blackMat);
    mustache.position.set(0, 0.76, 0.3);
    driverGroup.add(mustache);

    // 红色赛车软帽
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
      redMat
    );
    cap.position.y = 0.92;
    cap.castShadow = true;
    driverGroup.add(cap);

    // 帽檐（朝前平伸）
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.25), redMat);
    brim.position.set(0, 0.92, 0.32);
    brim.rotation.x = -0.15;
    driverGroup.add(brim);

    // 帽子上的白色标志
    const capEmblem = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), whiteMat);
    capEmblem.position.set(0, 1.05, 0.28);
    capEmblem.rotation.x = -0.4;
    driverGroup.add(capEmblem);

    this.bodyGroup.add(driverGroup);

    // 4. 后部金属发动机舱、粗双排气管与赛车扰流尾翼
    const engineBox = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.7), chromeMat);
    engineBox.position.set(0, 0.55, -0.85);
    engineBox.castShadow = true;
    this.bodyGroup.add(engineBox);

    // 扰流尾翼立柱
    [-0.5, 0.5].forEach(x => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.1), blackMat);
      strut.position.set(x, 0.92, -1.05);
      this.bodyGroup.add(strut);
    });

    // 红色主尾翼板
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.45), redMat);
    spoiler.position.set(0, 1.18, -1.08);
    spoiler.rotation.x = -0.12; // 下压力负迎角
    spoiler.castShadow = true;
    this.bodyGroup.add(spoiler);

    // 左右垂直尾翼端板
    [-0.82, 0.82].forEach(x => {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.45), blackMat);
      endplate.position.set(x, 1.18, -1.08);
      this.bodyGroup.add(endplate);
    });

    // 双出粗铬排气管与尾焰发光锥
    [-0.38, 0.38].forEach(x => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.55, 12), chromeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, 0.44, -1.25);
      pipe.castShadow = true;
      this.bodyGroup.add(pipe);

      // 内置氮气加速喷火锥
      const flameGeo = new THREE.ConeGeometry(0.18, 1.4, 10);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.92 });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(x, 0.44, -1.85);
      flame.scale.set(0.001, 0.001, 0.001);
      this.bodyGroup.add(flame);
      this.boostFlames.push(flame);
    });

    this.group.add(this.bodyGroup);

    // 5. 四轮独立运动总成（前轮可转向，四轮可滚动）
    const wheelRadius = 0.44;
    const wheelWidth = 0.36;

    const buildWheelMesh = () => {
      const wGroup = new THREE.Group();
      // 黑色橡胶深沟宽胎
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24),
        blackMat
      );
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wGroup.add(tire);

      // 银色铝合金五辐轮毂
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelRadius * 0.68, wheelRadius * 0.68, wheelWidth + 0.02, 16),
        chromeMat
      );
      rim.rotation.z = Math.PI / 2;
      wGroup.add(rim);

      // 金色中央防脱螺帽
      const nut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, wheelWidth + 0.04, 12),
        yellowMat
      );
      nut.rotation.z = Math.PI / 2;
      wGroup.add(nut);

      return { group: wGroup, tire };
    };

    // 前左轮（转向节 + 轮子）
    this.frontLeftPivot = new THREE.Group();
    this.frontLeftPivot.position.set(-0.95, wheelRadius, 1.05);
    const fl = buildWheelMesh();
    this.frontLeftWheel = fl.group;
    this.frontLeftPivot.add(this.frontLeftWheel);
    this.group.add(this.frontLeftPivot);

    // 前右轮（转向节 + 轮子）
    this.frontRightPivot = new THREE.Group();
    this.frontRightPivot.position.set(0.95, wheelRadius, 1.05);
    const fr = buildWheelMesh();
    this.frontRightWheel = fr.group;
    this.frontRightPivot.add(this.frontRightWheel);
    this.group.add(this.frontRightPivot);

    // 后左轮（轮距更宽更稳定）
    const rl = buildWheelMesh();
    this.rearLeftWheel = rl.group;
    this.rearLeftWheel.position.set(-1.02, wheelRadius, -0.95);
    this.group.add(this.rearLeftWheel);

    // 后右轮
    const rr = buildWheelMesh();
    this.rearRightWheel = rr.group;
    this.rearRightWheel.position.set(1.02, wheelRadius, -0.95);
    this.group.add(this.rearRightWheel);
  }

  // 获取双排气管在世界坐标系下的绝对发射位置
  getExhaustPositions() {
    const leftPos = new THREE.Vector3(-0.38, 0.44, -1.35);
    const rightPos = new THREE.Vector3(0.38, 0.44, -1.35);
    this.group.localToWorld(leftPos);
    this.group.localToWorld(rightPos);
    return [leftPos, rightPos];
  }

  // 获取后轮在世界坐标系下的绝对接地位置（用于漂移火花发射）
  getRearWheelPositions() {
    const leftPos = new THREE.Vector3(-1.02, 0.12, -0.95);
    const rightPos = new THREE.Vector3(1.02, 0.12, -0.95);
    this.group.localToWorld(leftPos);
    this.group.localToWorld(rightPos);
    return [leftPos, rightPos];
  }

  // 逐帧更新动画（轮子滚动、前轮偏转、悬挂俯仰与侧倾、氮气火焰）
  update(physics, delta) {
    if (!physics) return;

    // 1. 同步赛车整体世界坐标与偏航角（严密容错校验）
    const pX = isNaN(physics.position.x) ? 0 : physics.position.x;
    const pY = isNaN(physics.position.y) ? 0 : physics.position.y;
    const pZ = isNaN(physics.position.z) ? 0 : physics.position.z;
    const yaw = isNaN(physics.yaw) ? 0 : physics.yaw;

    this.group.position.set(pX, pY, pZ);
    this.group.rotation.y = yaw;

    // 2. 悬挂动态反馈：转弯侧倾 + 加减速俯仰（绝对防 NaN 锁定）
    const latG = isNaN(physics.lateralG) ? 0 : Math.max(-3.0, Math.min(3.0, physics.lateralG));
    const accG = isNaN(physics.accelG) ? 0 : Math.max(-5.0, Math.min(5.0, physics.accelG));

    const targetRoll = -latG * 0.055;
    const targetPitch = accG * 0.025;

    if (isNaN(this.bodyGroup.rotation.z)) this.bodyGroup.rotation.z = 0;
    if (isNaN(this.bodyGroup.rotation.x)) this.bodyGroup.rotation.x = 0;

    this.bodyGroup.rotation.z += (targetRoll - this.bodyGroup.rotation.z) * 0.2;
    this.bodyGroup.rotation.x += (targetPitch - this.bodyGroup.rotation.x) * 0.2;

    // 3. 前轮转向角偏转
    const steer = isNaN(physics.steerAngle) ? 0 : physics.steerAngle;
    this.frontLeftPivot.rotation.y = steer;
    this.frontRightPivot.rotation.y = steer;

    // 方向盘联动旋转
    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -steer * 1.8;
    }

    // 4. 四轮根据车速真实滚动转动
    const spd = isNaN(physics.speed) ? 0 : physics.speed;
    const dt = isNaN(delta) || delta <= 0 ? 0.016 : delta;
    const rollAngle = (spd * dt) / 0.44;

    this.frontLeftWheel.rotation.x += rollAngle;
    this.frontRightWheel.rotation.x += rollAngle;
    this.rearLeftWheel.rotation.x += rollAngle;
    this.rearRightWheel.rotation.x += rollAngle;

    // 5. 氮气推进火焰特效与色彩变化
    const isBoosting = !!physics.isBoosting;
    const isOrangeTurbo = physics.boostStage === 2;
    this.boostFlames.forEach(flame => {
      if (isBoosting) {
        const pulse = 1.0 + Math.random() * 0.35;
        flame.scale.set(pulse, pulse * 1.5, pulse);
        flame.material.color.setHex(isOrangeTurbo ? 0xff3d00 : 0x00e5ff);
      } else {
        flame.scale.set(0.001, 0.001, 0.001);
      }
    });
  }
}
