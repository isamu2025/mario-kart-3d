import * as THREE from 'three';

export class Kart {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();

    // 内部独立可动子构件
    this.bodyGroup = new THREE.Group(); // 用于悬挂侧倾与俯仰
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
    // 基础尺寸
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.25, metalness: 0.3 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.7, metalness: 0.2 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.85, roughness: 0.15 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfbc02d, roughness: 0.3, metalness: 0.5 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });

    // 1. 底盘与主车体
    const chassisGeo = new THREE.BoxGeometry(1.6, 0.45, 2.6);
    const chassis = new THREE.Mesh(chassisGeo, redMat);
    chassis.position.y = 0.45;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.bodyGroup.add(chassis);

    // 车鼻锥（前端流线型）
    const noseGeo = new THREE.CylinderGeometry(0.5, 0.8, 1.1, 16);
    const nose = new THREE.Mesh(noseGeo, redMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.42, 1.4);
    nose.scale.set(1.1, 1, 0.5);
    nose.castShadow = true;
    this.bodyGroup.add(nose);

    // 白色中央经典赛车条纹
    const stripeGeo = new THREE.BoxGeometry(0.32, 0.47, 2.8);
    const stripe = new THREE.Mesh(stripeGeo, whiteMat);
    stripe.position.set(0, 0.46, 0.4);
    this.bodyGroup.add(stripe);

    // 左右进气侧翼（Side Pods）
    [-0.88, 0.88].forEach(x => {
      const podGeo = new THREE.BoxGeometry(0.35, 0.35, 1.6);
      const pod = new THREE.Mesh(podGeo, redMat);
      pod.position.set(x, 0.4, 0.1);
      pod.castShadow = true;
      this.bodyGroup.add(pod);

      // 进气口暗色网格
      const ventGeo = new THREE.BoxGeometry(0.25, 0.25, 0.1);
      const vent = new THREE.Mesh(ventGeo, darkMat);
      vent.position.set(x, 0.4, 0.91);
      this.bodyGroup.add(vent);
    });

    // 2. 驾驶舱与方向盘
    const seatGeo = new THREE.BoxGeometry(0.7, 0.65, 0.6);
    const seat = new THREE.Mesh(seatGeo, darkMat);
    seat.position.set(0, 0.68, -0.35);
    this.bodyGroup.add(seat);

    // 倾角方向盘支架与轮盘
    const steerPivot = new THREE.Group();
    steerPivot.position.set(0, 0.65, 0.4);
    steerPivot.rotation.x = -Math.PI / 5;

    const steerRingGeo = new THREE.TorusGeometry(0.22, 0.04, 8, 16);
    const steerRing = new THREE.Mesh(steerRingGeo, yellowMat);
    steerRing.position.z = 0.15;
    steerPivot.add(steerRing);
    this.bodyGroup.add(steerPivot);
    this.steeringWheel = steerPivot;

    // 3. 经典马里奥风车手驾驶员（红帽、大眼睛与红白衣着）
    const driverGroup = new THREE.Group();
    driverGroup.position.set(0, 0.85, -0.15);

    // 头部肉色
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc80, roughness: 0.6 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), skinMat);
    head.position.y = 0.55;
    head.castShadow = true;
    driverGroup.add(head);

    // 经典红色赛车鸭舌帽
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      redMat
    );
    cap.position.y = 0.62;
    cap.castShadow = true;
    driverGroup.add(cap);

    // 帽檐
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 16, 1, false, 0, Math.PI), redMat);
    brim.rotation.y = -Math.PI / 2;
    brim.rotation.x = 0.2;
    brim.position.set(0, 0.62, 0.22);
    driverGroup.add(brim);

    // 帽子正面白色圆形标志
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), whiteMat);
    emblem.position.set(0, 0.72, 0.28);
    emblem.rotation.x = -0.3;
    driverGroup.add(emblem);

    // 躯干（红白赛车服）
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.55, 12), redMat);
    torso.position.y = 0.2;
    torso.castShadow = true;
    driverGroup.add(torso);

    this.bodyGroup.add(driverGroup);

    // 4. 尾翼与金属排气管
    const wingStruts = [-0.55, 0.55];
    wingStruts.forEach(x => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), chromeMat);
      strut.position.set(x, 0.85, -1.15);
      this.bodyGroup.add(strut);
    });

    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.45), redMat);
    wing.position.set(0, 1.1, -1.18);
    wing.rotation.x = -0.15; // 产生下压力倾角
    wing.castShadow = true;
    this.bodyGroup.add(wing);

    // 双出金属粗排气管与尾焰发光锥
    [-0.42, 0.42].forEach(x => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.5, 12), chromeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, 0.42, -1.35);
      pipe.castShadow = true;
      this.bodyGroup.add(pipe);

      // 内嵌氮气加速火焰网格（平时隐藏，加速时缩放激活）
      const flameMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9 });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.1, 10), flameMat);
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(x, 0.42, -1.9);
      flame.scale.set(0.001, 0.001, 0.001);
      this.bodyGroup.add(flame);
      this.boostFlames.push(flame);
    });

    this.group.add(this.bodyGroup);

    // 5. 四轮独立总成（前轮支持左右偏转，四轮均支持真实转动滚动）
    const wheelRadius = 0.42;
    const wheelWidth = 0.38;

    const createWheel = () => {
      const wheelGroup = new THREE.Group();
      // 橡胶厚胎
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20),
        tireMat
      );
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelGroup.add(tire);

      // 银色高亮运动轮毂
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelRadius * 0.65, wheelRadius * 0.65, wheelWidth + 0.02, 16),
        chromeMat
      );
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);

      // 金色中央轴心
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, wheelWidth + 0.04, 12),
        yellowMat
      );
      cap.rotation.z = Math.PI / 2;
      wheelGroup.add(cap);

      return { group: wheelGroup, tire };
    };

    // 前左轮
    this.frontLeftPivot = new THREE.Group();
    this.frontLeftPivot.position.set(-1.05, wheelRadius, 1.05);
    const flW = createWheel();
    this.frontLeftWheel = flW.group;
    this.frontLeftPivot.add(this.frontLeftWheel);
    this.group.add(this.frontLeftPivot);

    // 前右轮
    this.frontRightPivot = new THREE.Group();
    this.frontRightPivot.position.set(1.05, wheelRadius, 1.05);
    const frW = createWheel();
    this.frontRightWheel = frW.group;
    this.frontRightPivot.add(this.frontRightWheel);
    this.group.add(this.frontRightPivot);

    // 后左轮（轮距更宽更具抓地感）
    const rlW = createWheel();
    this.rearLeftWheel = rlW.group;
    this.rearLeftWheel.position.set(-1.12, wheelRadius, -0.95);
    this.group.add(this.rearLeftWheel);

    // 后右轮
    const rrW = createWheel();
    this.rearRightWheel = rrW.group;
    this.rearRightWheel.position.set(1.12, wheelRadius, -0.95);
    this.group.add(this.rearRightWheel);
  }

  // 获取双排气管在世界坐标系下的绝对发射位置
  getExhaustPositions() {
    const leftPos = new THREE.Vector3(-0.42, 0.42, -1.45);
    const rightPos = new THREE.Vector3(0.42, 0.42, -1.45);
    this.group.localToWorld(leftPos);
    this.group.localToWorld(rightPos);
    return [leftPos, rightPos];
  }

  // 获取后轮在世界坐标系下的绝对接地位置（用于漂移火花发射）
  getRearWheelPositions() {
    const leftPos = new THREE.Vector3(-1.12, 0.1, -0.95);
    const rightPos = new THREE.Vector3(1.12, 0.1, -0.95);
    this.group.localToWorld(leftPos);
    this.group.localToWorld(rightPos);
    return [leftPos, rightPos];
  }

  // 逐帧更新动画（轮子转动、前轮转向转角、车身悬挂俯仰与侧倾、氮气火焰）
  update(physics, delta) {
    // 1. 同步赛车整体世界坐标与主朝向偏航角
    this.group.position.set(physics.position.x, physics.position.y, physics.position.z);
    this.group.rotation.y = physics.yaw;

    // 2. 悬挂动态反馈：转弯侧倾 + 加减速俯仰
    const targetRoll = -physics.lateralG * 0.07;
    const targetPitch = physics.accelG * 0.035;
    this.bodyGroup.rotation.z += (targetRoll - this.bodyGroup.rotation.z) * 0.2;
    this.bodyGroup.rotation.x += (targetPitch - this.bodyGroup.rotation.x) * 0.2;

    // 3. 前轮转向角偏转
    this.frontLeftPivot.rotation.y = physics.steerAngle;
    this.frontRightPivot.rotation.y = physics.steerAngle;

    // 方向盘联动旋转
    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -physics.steerAngle * 1.8;
    }

    // 4. 四轮根据车速真实转动
    const rollAngle = (physics.speed * delta) / 0.42;
    this.frontLeftWheel.rotation.x += rollAngle;
    this.frontRightWheel.rotation.x += rollAngle;
    this.rearLeftWheel.rotation.x += rollAngle;
    this.rearRightWheel.rotation.x += rollAngle;

    // 5. 氮气推进火焰特效与色彩变化
    const isBoosting = physics.isBoosting;
    const isOrangeTurbo = physics.boostStage === 2;
    this.boostFlames.forEach(flame => {
      if (isBoosting) {
        const pulse = 1.0 + Math.random() * 0.4;
        flame.scale.set(pulse, pulse * 1.4, pulse);
        flame.material.color.setHex(isOrangeTurbo ? 0xff3d00 : 0x00e5ff);
      } else {
        flame.scale.set(0.001, 0.001, 0.001);
      }
    });
  }
}
