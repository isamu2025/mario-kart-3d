import * as THREE from 'three';

export class KartPhysics {
  constructor(config = {}) {
    // 物理参数
    this.maxSpeed = config.maxSpeed || 42.0;            // ~151 km/h
    this.maxReverseSpeed = config.maxReverseSpeed || -12.0;
    this.turboSpeed = config.turboSpeed || 62.0;        // ~223 km/h
    this.acceleration = config.acceleration || 26.0;
    this.reverseAccel = config.reverseAccel || 14.0;
    this.brakeDecel = config.brakeDecel || 48.0;
    this.rollingDrag = config.rollingDrag || 8.5;
    this.airDragCoeff = config.airDragCoeff || 0.0035;
    this.turnRate = config.turnRate || 2.5;
    this.collisionRadius = 1.30; // 碰撞胶囊半径

    // 状态量
    this.position = new THREE.Vector3(0, 0, -60);       // 发车线默认原点
    this.yaw = 0;                                       // 偏航角 (0 = 朝向 +Z 顺着大直道)
    this.speed = 0;                                     // 当前前进线速度 (m/s)
    this.velocity = new THREE.Vector2(0, 0);            // 水平动量矢量
    this.steerAngle = 0;                                // 前轮偏转角 (-0.52 ~ +0.52 rad)
    this.lateralG = 0;                                  // 横向加速度（用于悬挂倾角）
    this.accelG = 0;                                    // 纵向加速度（用于起步/刹车俯仰）

    // 漂移与 Mini-Turbo 状态
    this.isDrifting = false;
    this.driftDirection = 0;                            // -1 = 左漂, 1 = 右漂
    this.driftTimer = 0;                                // 漂移蓄力时间
    this.driftStage = 0;                                // 0: 无, 1: 蓝火, 2: 橙火
    this.isBoosting = false;                            // 是否处于氮气推进中
    this.boostTimer = 0;
    this.boostStage = 0;

    // 道具与金币
    this.coins = 0;                                     // 收集硬币数（上限 10）
    this.hasItem = null;                                // 当前持有道具 ('mushroom', 'star')

    // 比赛进度与防作弊检查点
    this.currentLap = 1;
    this.totalLaps = 3;
    this.lapFinished = false;
    this.lastCheckpoint = 0;
    this.lapTimer = 0;
    this.bestLapTime = 0;
    this.totalRaceTime = 0;

    // 碰撞检测事件（给外部粒子与音效读取）
    this.collisionEvents = [];
  }

  // 重置车辆到赛道安全位置与朝向
  resetToTrack(pos = null, yaw = 0) {
    if (pos) {
      this.position.copy(pos);
      this.yaw = isNaN(yaw) ? 0 : yaw;
    } else {
      this.position.set(0, 0.05, -60);
      this.yaw = 0;
    }
    this.speed = 0;
    this.velocity.set(0, 0);
    this.steerAngle = 0;
    this.lateralG = 0;
    this.accelG = 0;
    this.isDrifting = false;
    this.isBoosting = false;
    this.boostTimer = 0;
  }

  // 核心物理逐帧步进
  update(inputs, track, rawDelta) {
    this.collisionEvents = [];
    const delta = (!rawDelta || isNaN(rawDelta) || rawDelta <= 0.0001) ? 0.016 : Math.min(0.08, rawDelta);

    // 1. 计时器更新
    if (!this.lapFinished) {
      this.lapTimer += delta;
      this.totalRaceTime += delta;
    }

    // 2. 加速带/蘑菇推进计时器
    if (this.isBoosting) {
      this.boostTimer -= delta;
      if (this.boostTimer <= 0) {
        this.isBoosting = false;
        this.boostStage = 0;
      }
    }

    // 3. 计算极限速度（金币增益 + 氮气增益）
    const coinFactor = 1.0 + Math.min(10, this.coins) * 0.012; // 顶多增益 12%
    let curMaxSpeed = this.maxSpeed * coinFactor;
    if (this.isBoosting) {
      curMaxSpeed = this.turboSpeed;
    }

    // 4. 输入驱动力与制动力
    const throttle = inputs.throttle ? 1.0 : 0.0;
    const brake = inputs.brake ? 1.0 : 0.0;
    const rawSteer = (inputs.left ? -1.0 : 0.0) + (inputs.right ? 1.0 : 0.0);

    const oldSpeed = isNaN(this.speed) ? 0 : this.speed;

    // 前进加速
    if (throttle > 0 && brake === 0) {
      if (this.speed < 0) {
        // 倒车中踩油门：制动
        this.speed += this.brakeDecel * delta;
      } else if (this.speed < curMaxSpeed) {
        const accelForce = this.isBoosting ? this.acceleration * 1.5 : this.acceleration;
        this.speed += accelForce * throttle * delta;
        if (this.speed > curMaxSpeed) this.speed = curMaxSpeed;
      }
    } else if (brake > 0 && throttle === 0) {
      // 刹车或倒车
      if (this.speed > 0) {
        // 高速急刹
        this.speed -= this.brakeDecel * brake * delta;
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed > this.maxReverseSpeed) {
        // 倒车加速
        this.speed -= this.reverseAccel * brake * delta;
      }
    } else {
      // 松开油门与刹车：自然摩擦与空气阻力衰减
      const drag = this.rollingDrag + this.airDragCoeff * this.speed * this.speed;
      if (this.speed > 0) {
        this.speed -= drag * delta;
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed < 0) {
        this.speed += drag * delta;
        if (this.speed > 0) this.speed = 0;
      }
    }

    // 纵向加速度 G 值（绝对防除以零与防 NaN）
    if (delta > 0.0001) {
      this.accelG = (this.speed - oldSpeed) / delta;
      if (isNaN(this.accelG)) this.accelG = 0;
    } else {
      this.accelG = 0;
    }

    // 5. 漂移与转向逻辑
    if (inputs.drift && Math.abs(rawSteer) > 0.1 && this.speed > 6.0 && !this.isDrifting) {
      this.isDrifting = true;
      this.driftDirection = rawSteer > 0 ? 1 : -1;
      this.driftTimer = 0;
      this.driftStage = 0;
    }

    // 退出漂移并触发 Mini-Turbo 爆发
    if (!inputs.drift && this.isDrifting) {
      if (this.driftStage === 1) {
        this.isBoosting = true;
        this.boostTimer = 1.2;
        this.boostStage = 1;
        this.speed = Math.max(this.speed, curMaxSpeed * 1.15);
      } else if (this.driftStage === 2) {
        this.isBoosting = true;
        this.boostTimer = 2.2;
        this.boostStage = 2;
        this.speed = Math.max(this.speed, this.turboSpeed);
      }
      this.isDrifting = false;
      this.driftTimer = 0;
      this.driftStage = 0;
    }

    // 漂移蓄力计算
    if (this.isDrifting) {
      this.driftTimer += delta;
      if (this.driftTimer > 2.4) {
        this.driftStage = 2; // 橙火
      } else if (this.driftTimer > 1.2) {
        this.driftStage = 1; // 蓝火
      }
    }

    // 转向角速度随车速动态缩放（低速敏捷，高速抗推头）
    const speedRatio = Math.min(1.0, Math.abs(this.speed) / this.maxSpeed);
    const steerSens = (1.1 - speedRatio * 0.45);
    let targetSteerAngle = rawSteer * 0.52;

    if (this.isDrifting) {
      targetSteerAngle = this.driftDirection * 0.42 + rawSteer * 0.25;
    }

    // 平滑前轮转向角
    this.steerAngle += (targetSteerAngle - this.steerAngle) * 12.0 * delta;
    if (isNaN(this.steerAngle)) this.steerAngle = 0;

    // 改变偏航角
    let effectiveTurn = this.steerAngle * this.turnRate * steerSens;
    if (this.speed < 0) effectiveTurn = -effectiveTurn;
    this.yaw += effectiveTurn * delta;
    if (isNaN(this.yaw)) this.yaw = 0;

    // 横向离心加速度
    this.lateralG = effectiveTurn * (this.speed / 10.0);
    if (isNaN(this.lateralG)) this.lateralG = 0;

    // 6. 速度矢量分解（朝向向量与漂移横移角）
    let moveYaw = this.yaw;
    if (this.isDrifting) {
      moveYaw += this.driftDirection * 0.28;
    }

    const forwardX = Math.sin(moveYaw);
    const forwardZ = Math.cos(moveYaw);
    this.velocity.set(forwardX * this.speed, forwardZ * this.speed);

    // 7. 【核心】绝对防穿墙连续碰撞检测 (Continuous Sub-stepping Collision Detection)
    this._substeppingCollisionResolution(track, delta);

    // 8. 检查点与圈数判定
    this._checkLapProgress(track);

    // 9. 加速带、金币与问号箱拾取
    this._checkPickups(track);
  }

  // 细分多步进防穿墙算法：无论多快速度绝对杜绝穿模穿墙！
  _substeppingCollisionResolution(track, delta) {
    if (!track || !track.wallSegments || track.wallSegments.length === 0) return;

    const moveDist = this.velocity.length() * delta;
    const subSteps = Math.min(20, Math.max(6, Math.ceil(moveDist / 0.12)));
    const dt = delta / subSteps;
    const r = this.collisionRadius;

    for (let step = 0; step < subSteps; step++) {
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.y * dt;

      const pX = this.position.x;
      const pZ = this.position.z;

      for (let w = 0; w < track.wallSegments.length; w++) {
        const seg = track.wallSegments[w];
        const p1 = seg.p1;
        const p2 = seg.p2;

        const vx = p2.x - p1.x;
        const vz = p2.y - p1.y;
        const segLenSq = vx * vx + vz * vz;
        if (segLenSq < 0.0001) continue;

        let t = ((pX - p1.x) * vx + (pZ - p1.y) * vz) / segLenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const qX = p1.x + t * vx;
        const qZ = p1.y + t * vz;

        const dx = pX - qX;
        const dz = pZ - qZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < r * r) {
          const dist = Math.sqrt(distSq) || 0.001;
          const overlap = r - dist + 0.02;

          let nx = dx / dist;
          let nz = dz / dist;

          // 1. 强制外推锁死在墙外
          this.position.x += nx * overlap;
          this.position.z += nz * overlap;

          // 2. 动量投影：消除垂直于墙面速度，计算微弹性反弹与切向摩擦
          const vDotN = this.velocity.x * nx + this.velocity.y * nz;
          if (vDotN < 0) {
            const restitution = 0.22;
            const friction = 0.65;

            const vNormX = vDotN * nx;
            const vNormZ = vDotN * nz;
            const vTanX = this.velocity.x - vNormX;
            const vTanZ = this.velocity.y - vNormZ;

            this.velocity.x = vTanX * friction - vNormX * restitution;
            this.velocity.y = vTanZ * friction - vNormZ * restitution;

            this.speed = Math.sign(this.speed) * Math.min(Math.abs(this.speed) * 0.75, this.velocity.length());

            if (this.coins > 0 && Math.random() < 0.2) {
              this.coins = Math.max(0, this.coins - 1);
            }

            this.collisionEvents.push({
              position: new THREE.Vector3(qX, 0.4, qZ),
              normal: new THREE.Vector2(nx, nz),
              intensity: Math.abs(vDotN) / 20.0
            });
          }
        }
      }
    }
  }

  // 检查点顺次判定（防作弊）
  _checkLapProgress(track) {
    if (!track || !track.checkpoints || track.checkpoints.length === 0) return;
    const p = new THREE.Vector2(this.position.x, this.position.z);
    const numCp = track.checkpoints.length;

    const nextCpIdx = (this.lastCheckpoint + 1) % numCp;
    const nextCp = track.checkpoints[nextCpIdx];

    const dist = p.distanceTo(nextCp.position);
    if (dist < nextCp.radius) {
      this.lastCheckpoint = nextCpIdx;

      if (nextCpIdx === 0 && this.lastCheckpoint === 0) {
        if (!this.bestLapTime || this.lapTimer < this.bestLapTime) {
          this.bestLapTime = this.lapTimer;
        }
        this.lapTimer = 0;

        if (this.currentLap < this.totalLaps) {
          this.currentLap++;
          this.lapEvent = 'new_lap';
        } else {
          this.lapFinished = true;
          this.lapEvent = 'race_finished';
        }
      }
    }
  }

  // 拾取与机关交互
  _checkPickups(track) {
    if (!track) return;
    const p = this.position;

    // 1. 加速带
    if (track.boostPads) {
      track.boostPads.forEach(pad => {
        const dist = Math.hypot(p.x - pad.position.x, p.z - pad.position.z);
        if (dist < pad.radius) {
          this.isBoosting = true;
          this.boostTimer = 2.4;
          this.boostStage = 2;
          this.speed = this.turboSpeed;
          this.boostEvent = true;
        }
      });
    }

    // 2. 金币拾取
    if (track.coins) {
      track.coins.forEach(coin => {
        if (!coin.collected) {
          const dist = Math.hypot(p.x - coin.originalPos.x, p.z - coin.originalPos.z);
          if (dist < coin.radius) {
            coin.collected = true;
            coin.respawnTimer = 20.0;
            coin.mesh.visible = false;
            if (this.coins < 10) this.coins++;
            this.coinPickupEvent = coin.originalPos.clone();
          }
        }
      });
    }

    // 3. 道具箱
    if (track.itemBoxes) {
      track.itemBoxes.forEach(box => {
        if (box.active) {
          const dist = Math.hypot(p.x - box.originalPos.x, p.z - box.originalPos.z);
          if (dist < box.radius) {
            box.active = false;
            box.respawnTimer = 6.0;
            box.group.visible = false;
            this.hasItem = 'mushroom';
            this.itemBoxPickupEvent = box.originalPos.clone();
          }
        }
      });
    }
  }

  // 激活道具
  useCurrentItem() {
    if (!this.hasItem) return false;
    if (this.hasItem === 'mushroom') {
      this.isBoosting = true;
      this.boostTimer = 2.5;
      this.boostStage = 2;
      this.speed = this.turboSpeed;
      this.hasItem = null;
      return 'mushroom';
    }
    return false;
  }
}
