import * as THREE from 'three';

export class KartPhysics {
  constructor(config = {}) {
    this.maxSpeed = config.maxSpeed || 42.0;            // ~151 km/h
    this.maxReverseSpeed = config.maxReverseSpeed || -12.0;
    this.turboSpeed = config.turboSpeed || 62.0;        // ~223 km/h
    this.acceleration = config.acceleration || 26.0;
    this.reverseAccel = config.reverseAccel || 14.0;
    this.brakeDecel = config.brakeDecel || 48.0;
    this.rollingDrag = config.rollingDrag || 8.5;
    this.airDragCoeff = config.airDragCoeff || 0.0035;
    this.turnRate = config.turnRate || 2.5;
    this.collisionRadius = 1.30;

    // 状态量
    this.position = new THREE.Vector3(0, 0, -80);
    this.yaw = 0;
    this.speed = 0;
    this.velocity = new THREE.Vector2(0, 0);
    this.steerAngle = 0;
    this.lateralG = 0;
    this.accelG = 0;

    // 漂移与 Mini-Turbo
    this.isDrifting = false;
    this.driftDirection = 0;
    this.driftTimer = 0;
    this.driftStage = 0;
    this.isBoosting = false;
    this.boostTimer = 0;
    this.boostStage = 0;

    // 道具与金币
    this.coins = 0;
    this.hasItem = null;

    // 圈数与检查点
    this.currentLap = 1;
    this.totalLaps = 3;
    this.lapFinished = false;
    this.lastCheckpoint = 0;
    this.lapTimer = 0;
    this.bestLapTime = 0;
    this.totalRaceTime = 0;

    this.collisionEvents = [];
  }

  resetToTrack(pos = null, yaw = 0) {
    if (pos) {
      this.position.copy(pos);
      this.yaw = isNaN(yaw) ? 0 : yaw;
    } else {
      this.position.set(0, 0.05, -80);
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

  update(inputs, track, rawDelta) {
    this.collisionEvents = [];
    const delta = (!rawDelta || isNaN(rawDelta) || rawDelta <= 0.0001) ? 0.016 : Math.min(0.08, rawDelta);

    if (!this.lapFinished) {
      this.lapTimer += delta;
      this.totalRaceTime += delta;
    }

    if (this.isBoosting) {
      this.boostTimer -= delta;
      if (this.boostTimer <= 0) {
        this.isBoosting = false;
        this.boostStage = 0;
      }
    }

    const coinFactor = 1.0 + Math.min(10, this.coins) * 0.012;
    let curMaxSpeed = this.maxSpeed * coinFactor;
    if (this.isBoosting) {
      curMaxSpeed = this.turboSpeed;
    }

    const throttle = inputs.throttle ? 1.0 : 0.0;
    const brake = inputs.brake ? 1.0 : 0.0;
    // inputs.left = 向左转向 (-1), inputs.right = 向右转向 (+1)
    const rawSteer = (inputs.left ? -1.0 : 0.0) + (inputs.right ? 1.0 : 0.0);

    const oldSpeed = isNaN(this.speed) ? 0 : this.speed;

    if (throttle > 0 && brake === 0) {
      if (this.speed < 0) {
        this.speed += this.brakeDecel * delta;
      } else if (this.speed < curMaxSpeed) {
        const accelForce = this.isBoosting ? this.acceleration * 1.5 : this.acceleration;
        this.speed += accelForce * throttle * delta;
        if (this.speed > curMaxSpeed) this.speed = curMaxSpeed;
      }
    } else if (brake > 0 && throttle === 0) {
      if (this.speed > 0) {
        this.speed -= this.brakeDecel * brake * delta;
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed > this.maxReverseSpeed) {
        this.speed -= this.reverseAccel * brake * delta;
      }
    } else {
      const drag = this.rollingDrag + this.airDragCoeff * this.speed * this.speed;
      if (this.speed > 0) {
        this.speed -= drag * delta;
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed < 0) {
        this.speed += drag * delta;
        if (this.speed > 0) this.speed = 0;
      }
    }

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

    if (this.isDrifting) {
      this.driftTimer += delta;
      if (this.driftTimer > 2.4) {
        this.driftStage = 2;
      } else if (this.driftTimer > 1.2) {
        this.driftStage = 1;
      }
    }

    const speedRatio = Math.min(1.0, Math.abs(this.speed) / this.maxSpeed);
    const steerSens = (1.1 - speedRatio * 0.45);
    let targetSteerAngle = rawSteer * 0.52;

    if (this.isDrifting) {
      targetSteerAngle = this.driftDirection * 0.42 + rawSteer * 0.25;
    }

    this.steerAngle += (targetSteerAngle - this.steerAngle) * 12.0 * delta;
    if (isNaN(this.steerAngle)) this.steerAngle = 0;

    // 【核心修复】：纠正左右转向符号！
    // 当按 D/右键时 rawSteer=+1，必须使偏航角 yaw 减小以向屏幕右侧(-X)转动；
    // 当按 A/左键时 rawSteer=-1，必须使偏航角 yaw 增大以向屏幕左侧(+X)转动。
    let effectiveTurn = -this.steerAngle * this.turnRate * steerSens;
    if (this.speed < 0) effectiveTurn = -effectiveTurn; // 倒车反打
    this.yaw += effectiveTurn * delta;
    if (isNaN(this.yaw)) this.yaw = 0;

    // 横向离心加速度
    this.lateralG = effectiveTurn * (this.speed / 10.0);
    if (isNaN(this.lateralG)) this.lateralG = 0;

    // 6. 速度矢量分解
    let moveYaw = this.yaw;
    if (this.isDrifting) {
      moveYaw += -this.driftDirection * 0.25;
    }

    const forwardX = Math.sin(moveYaw);
    const forwardZ = Math.cos(moveYaw);
    this.velocity.set(forwardX * this.speed, forwardZ * this.speed);

    // 7. 防穿墙连续子步进检测
    this._substeppingCollisionResolution(track, delta);

    // 8. 检查点与圈数判定
    this._checkLapProgress(track);

    // 9. 道具与金币交互
    this._checkPickups(track);
  }

  _substeppingCollisionResolution(track, delta) {
    if (!track || !track.wallSegments || track.wallSegments.length === 0) {
      this.position.x += this.velocity.x * delta;
      this.position.z += this.velocity.y * delta;
      return;
    }

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

          this.position.x += nx * overlap;
          this.position.z += nz * overlap;

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

  _checkPickups(track) {
    if (!track) return;
    const p = this.position;

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
