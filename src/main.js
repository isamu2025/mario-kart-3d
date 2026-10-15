import * as THREE from 'three';
import { Environment } from './environment.js';
import { Track } from './track.js';
import { Kart } from './kart.js';
import { KartPhysics } from './physics.js';
import { ParticleSystem } from './particles.js';
import { sound } from './audio.js';

class Game {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // 子系统
    this.environment = null;
    this.track = null;
    this.kart = null;
    this.physics = null;
    this.particles = null;

    // 摄像机视角模式 (0: 默认正常追尾, 1: 远距离全景追尾, 2: 紧凑第一人称机盖视角)
    this.cameraMode = 0;
    this.currentCameraPos = new THREE.Vector3();
    this.currentCameraLookAt = new THREE.Vector3();
    this.cameraShake = 0;

    // 游戏流程状态 ('COUNTDOWN', 'RACING', 'FINISHED')
    this.gameState = 'COUNTDOWN';
    this.countdownTimer = 3.8;
    this.topSpeedEver = 0;

    // 输入捕获状态
    this.inputs = {
      throttle: false,
      brake: false,
      left: false,
      right: false,
      drift: false,
      useItem: false
    };

    // 雷达地图与 HUD 元素缓存
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

    this.hudSpeed = document.getElementById('hud-speed');
    this.hudLap = document.getElementById('hud-lap');
    this.hudTimer = document.getElementById('hud-timer');
    this.hudCoins = document.getElementById('hud-coins');
    this.hudTurboBar = document.getElementById('hud-turbo-bar');
    this.hudItem = document.getElementById('hud-item');
    this.hudItemIcon = document.getElementById('hud-item-icon');
    this.alertBanner = document.getElementById('alert-banner');

    this.clock = new THREE.Clock();

    this.initThree();
    this.initSubsystems();
    this.bindInputs();
    this.bindUI();
    this.startCountdown();

    window.addEventListener('resize', () => this.onResize());
    requestAnimationFrame((t) => this.render(t));
  }

  // 1. 初始化 Three.js 核心视口与渲染管线
  initThree() {
    this.scene = new THREE.Scene();

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 1200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);
  }

  // 2. 初始化各模块子系统
  initSubsystems() {
    this.environment = new Environment(this.scene);
    this.track = new Track(this.scene);
    this.kart = new Kart(this.scene);
    this.physics = new KartPhysics();
    this.particles = new ParticleSystem(this.scene);

    // 初始位置放置在发车线
    this.physics.resetToTrack(new THREE.Vector3(0, 0, -110), 0);
  }

  // 3. 键盘与触屏输入事件绑定
  bindInputs() {
    const handleKey = (code, isDown) => {
      sound.resume();
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          this.inputs.throttle = isDown;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.inputs.brake = isDown;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.inputs.left = isDown;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.inputs.right = isDown;
          break;
        case 'Space':
        case 'ShiftLeft':
        case 'ShiftRight':
          this.inputs.drift = isDown;
          break;
        case 'KeyE':
        case 'KeyF':
          if (isDown) this.triggerUseItem();
          break;
        case 'KeyR':
          if (isDown) this.resetPlayerToTrack();
          break;
        case 'KeyC':
          if (isDown) this.cycleCameraView();
          break;
        case 'KeyM':
          if (isDown) this.toggleMute();
          break;
      }
    };

    window.addEventListener('keydown', (e) => {
      if (!e.repeat) handleKey(e.code, true);
    });
    window.addEventListener('keyup', (e) => {
      handleKey(e.code, false);
    });

    // 移动端多点触控绑定
    const bindTouch = (id, keyName) => {
      const el = document.getElementById(id);
      if (!el) return;
      const start = (ev) => {
        ev.preventDefault();
        sound.resume();
        this.inputs[keyName] = true;
        el.classList.add('pressed');
      };
      const end = (ev) => {
        ev.preventDefault();
        this.inputs[keyName] = false;
        el.classList.remove('pressed');
      };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
    };

    bindTouch('touch-left', 'left');
    bindTouch('touch-right', 'right');
    bindTouch('touch-gas', 'throttle');
    bindTouch('touch-brake', 'brake');
    bindTouch('touch-drift', 'drift');
  }

  // 4. UI 按钮交互绑定
  bindUI() {
    const btnSound = document.getElementById('btn-sound');
    if (btnSound) {
      btnSound.addEventListener('click', () => this.toggleMute());
    }

    const btnCamera = document.getElementById('btn-camera');
    if (btnCamera) {
      btnCamera.addEventListener('click', () => this.cycleCameraView());
    }

    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => this.resetPlayerToTrack());
    }

    const btnHelp = document.getElementById('btn-help');
    const helpModal = document.getElementById('help-modal');
    const btnCloseHelp = document.getElementById('btn-close-help');
    if (btnHelp && helpModal) {
      btnHelp.addEventListener('click', () => {
        helpModal.style.display = 'flex';
      });
    }
    if (btnCloseHelp && helpModal) {
      btnCloseHelp.addEventListener('click', () => {
        helpModal.style.display = 'none';
      });
    }

    if (this.hudItem) {
      this.hudItem.addEventListener('click', () => this.triggerUseItem());
    }

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => this.restartGame());
    }
  }

  // 静音切换
  toggleMute() {
    sound.resume();
    const isMuted = sound.toggleMute();
    const btnSound = document.getElementById('btn-sound');
    if (btnSound) {
      btnSound.innerHTML = isMuted ? '🔇 静音' : '🔊 声音';
    }
  }

  // 切换视角
  cycleCameraView() {
    this.cameraMode = (this.cameraMode + 1) % 3;
    const names = ['🎥 视角 (正常)', '🎥 视角 (远景)', '🎥 视角 (车前)'];
    const btn = document.getElementById('btn-camera');
    if (btn) btn.innerHTML = names[this.cameraMode];
  }

  // 使用持有道具
  triggerUseItem() {
    if (this.physics.hasItem) {
      const used = this.physics.useCurrentItem();
      if (used === 'mushroom') {
        sound.playBoost();
        this.cameraShake = 0.35;
        this.showAlertBanner('🍄 MUSHROOM BOOST!', 1.2);
      }
      this.updateItemHUD();
    }
  }

  // 复位回赛道
  resetPlayerToTrack() {
    // 找到最近的样条检查点
    const p = new THREE.Vector2(this.physics.position.x, this.physics.position.z);
    let nearestIdx = 0;
    let minDist = Infinity;
    this.track.curvePoints.forEach((pt, i) => {
      const d = p.distanceTo(new THREE.Vector2(pt.x, pt.z));
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    });

    const resetPt = this.track.curvePoints[nearestIdx];
    const nextPt = this.track.curvePoints[(nearestIdx + 1) % this.track.curvePoints.length];
    const dir = new THREE.Vector3().subVectors(nextPt, resetPt).normalize();
    const yaw = Math.atan2(dir.x, dir.z);

    this.physics.resetToTrack(new THREE.Vector3(resetPt.x, 0, resetPt.z), yaw);
    this.showAlertBanner('🔄 赛车已复位', 1.0);
  }

  // 发车倒计时流程
  startCountdown() {
    this.gameState = 'COUNTDOWN';
    this.countdownTimer = 3.6;
    let lastSecond = 4;

    const tick = () => {
      if (this.gameState !== 'COUNTDOWN') return;
      const currentSec = Math.ceil(this.countdownTimer);

      if (currentSec !== lastSecond && currentSec > 0) {
        lastSecond = currentSec;
        if (currentSec <= 3) {
          this.showAlertBanner(currentSec.toString(), 0.85);
          sound.playCountdown(false);
        }
      }

      if (this.countdownTimer <= 0) {
        this.gameState = 'RACING';
        this.showAlertBanner('GO! 🏁', 1.0);
        sound.playCountdown(true);
        sound.startBGM();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }

  // 弹出居中大幅横幅文字
  showAlertBanner(text, duration = 1.0) {
    if (!this.alertBanner) return;
    this.alertBanner.innerText = text;
    this.alertBanner.classList.add('show');
    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this._alertTimeout = setTimeout(() => {
      this.alertBanner.classList.remove('show');
    }, duration * 1000);
  }

  // 重启完整比赛
  restartGame() {
    const modal = document.getElementById('finish-modal');
    if (modal) modal.style.display = 'none';

    this.physics.resetToTrack(new THREE.Vector3(0, 0, -110), 0);
    this.physics.currentLap = 1;
    this.physics.lapFinished = false;
    this.physics.lapTimer = 0;
    this.physics.totalRaceTime = 0;
    this.physics.coins = 0;
    this.topSpeedEver = 0;

    this.startCountdown();
  }

  // 完赛弹出胜利奖杯与战绩清单
  onRaceFinished() {
    this.gameState = 'FINISHED';
    sound.playVictory();

    const modal = document.getElementById('finish-modal');
    if (modal) {
      document.getElementById('res-best-lap').innerText = this.formatTime(this.physics.bestLapTime || this.physics.lapTimer);
      document.getElementById('res-total-time').innerText = this.formatTime(this.physics.totalRaceTime);
      document.getElementById('res-coins').innerText = `${this.physics.coins} 枚`;
      document.getElementById('res-top-speed').innerText = `${Math.round(this.topSpeedEver)} km/h`;
      modal.style.display = 'flex';
    }
  }

  // 格式化毫秒计时
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds * 1000) % 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  // 5. 逐帧核心主循环
  render() {
    const delta = Math.min(0.05, this.clock.getDelta());

    // 状态机处理
    if (this.gameState === 'COUNTDOWN') {
      this.countdownTimer -= delta;
      // 允许玩家在发车线上空轰油门（街机惯例）
      const activeInputs = { ...this.inputs, left: false, right: false, drift: false };
      // 锁死位移
      const oldPos = this.physics.position.clone();
      this.physics.update(activeInputs, this.track, delta);
      this.physics.position.copy(oldPos);
    } else if (this.gameState === 'RACING') {
      this.physics.update(this.inputs, this.track, delta);

      // 圈数触发事件
      if (this.physics.lapEvent) {
        if (this.physics.lapEvent === 'new_lap') {
          if (this.physics.currentLap === 3) {
            this.showAlertBanner('⚠️ FINAL LAP! ⚠️', 1.8);
            sound.playLapSound();
          } else {
            this.showAlertBanner(`LAP ${this.physics.currentLap} / 3`, 1.2);
            sound.playLapSound();
          }
        } else if (this.physics.lapEvent === 'race_finished') {
          this.onRaceFinished();
        }
        this.physics.lapEvent = null;
      }
    } else if (this.gameState === 'FINISHED') {
      // 完赛后自动滑行制动并缓慢盘旋运镜
      this.inputs.throttle = false;
      this.inputs.brake = true;
      this.physics.update(this.inputs, this.track, delta);
    }

    // 更新各子系统
    this.track.update(delta);
    this.environment.update(delta, this.physics.position);
    this.kart.update(this.physics, delta);
    this.particles.update(delta);

    // 碰撞音效与火花处理
    if (this.physics.collisionEvents.length > 0) {
      this.physics.collisionEvents.forEach(evt => {
        sound.playCrash(evt.intensity);
        this.particles.emitCollisionSparks(evt.position, evt.normal, 14);
        this.cameraShake = Math.min(0.5, 0.15 + evt.intensity * 0.25);
      });
    }

    // 拾取金币与道具事件
    if (this.physics.coinPickupEvent) {
      sound.playCoin();
      this.particles.emitCoinBurst(this.physics.coinPickupEvent);
      this.physics.coinPickupEvent = null;
    }
    if (this.physics.itemBoxPickupEvent) {
      sound.playItemBox();
      this.particles.emitBoxShatter(this.physics.itemBoxPickupEvent);
      this.physics.itemBoxPickupEvent = null;
      this.updateItemHUD();
    }
    if (this.physics.boostEvent) {
      sound.playBoost();
      this.cameraShake = 0.25;
      this.physics.boostEvent = null;
    }

    // 粒子发射：排气烟雾与漂移火花
    this._handleParticleEmissions(delta);

    // 音频动态调节（引擎音与漂移胎噪）
    const speedRatio = this.physics.speed / this.physics.maxSpeed;
    sound.updateEngine(speedRatio, this.inputs.throttle, this.inputs.brake);
    sound.updateDriftSound(this.physics.isDrifting ? 1.0 : (this.inputs.brake && Math.abs(this.physics.speed) > 10 ? 0.7 : 0.0));

    // 摄像机平滑追尾与动态 FOV
    this.updateCamera(delta);

    // 同步更新 2D 小地图雷达与 HUD
    this.drawMinimap();
    this.updateHUD();

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.render());
  }

  // 粒子发射逻辑
  _handleParticleEmissions(delta) {
    // 1. 排气尾烟（正常行驶中每 0.08 秒喷一团）
    this._smokeTimer = (this._smokeTimer || 0) + delta;
    if (this._smokeTimer > 0.06 && Math.abs(this.physics.speed) > 2.0) {
      this._smokeTimer = 0;
      const exhausts = this.kart.getExhaustPositions();
      const carDir = new THREE.Vector3(Math.sin(this.physics.yaw), 0, Math.cos(this.physics.yaw));
      exhausts.forEach(p => this.particles.emitExhaustSmoke(p, carDir));
    }

    // 2. 漂移火花（蓝火 / 橙火）
    if (this.physics.isDrifting && this.physics.driftStage > 0) {
      const wheels = this.kart.getRearWheelPositions();
      const isStage2 = this.physics.driftStage === 2;
      wheels.forEach(w => this.particles.emitDriftSparks(w, isStage2));
    }
  }

  // 摄像机弹性阻尼跟踪系统
  updateCamera(delta) {
    const carPos = this.physics.position;
    const yaw = this.physics.yaw;
    const speedKmh = Math.abs(this.physics.speed * 3.6);

    // 动态 FOV（高速与加速带下镜头广角拉伸，极具速度压迫感）
    let targetFov = 62 + (speedKmh / 220) * 18;
    if (this.physics.isBoosting) targetFov += 10;
    this.camera.fov += (targetFov - this.camera.fov) * 8.0 * delta;
    this.camera.updateProjectionMatrix();

    // 镜头抖动衰减
    let shakeOffset = new THREE.Vector3();
    if (this.cameraShake > 0) {
      shakeOffset.set(
        (Math.random() - 0.5) * this.cameraShake,
        (Math.random() - 0.5) * this.cameraShake,
        (Math.random() - 0.5) * this.cameraShake
      );
      this.cameraShake -= 1.8 * delta;
      if (this.cameraShake < 0) this.cameraShake = 0;
    }

    // 目标摄像机坐标与视线焦点
    let camOffsetDistance = 6.8;
    let camHeight = 3.2;
    let lookHeight = 1.3;

    if (this.cameraMode === 1) {
      // 远景视角
      camOffsetDistance = 10.5;
      camHeight = 5.0;
    } else if (this.cameraMode === 2) {
      // 第一人称车前盖视角
      camOffsetDistance = -0.5;
      camHeight = 1.4;
      lookHeight = 1.2;
    }

    // 摄像机放置在赛车车身后上方
    const targetCamX = carPos.x - Math.sin(yaw) * camOffsetDistance;
    const targetCamZ = carPos.z - Math.cos(yaw) * camOffsetDistance;
    const targetCamY = carPos.y + camHeight;

    const targetLookAtX = carPos.x + Math.sin(yaw) * 4.0;
    const targetLookAtZ = carPos.z + Math.cos(yaw) * 4.0;
    const targetLookAtY = carPos.y + lookHeight;

    // 弹簧平滑阻尼插值 (Lerp)
    const lerpSpeed = this.cameraMode === 2 ? 25.0 : 8.5;
    this.currentCameraPos.x += (targetCamX - this.currentCameraPos.x) * lerpSpeed * delta;
    this.currentCameraPos.y += (targetCamY - this.currentCameraPos.y) * lerpSpeed * delta;
    this.currentCameraPos.z += (targetCamZ - this.currentCameraPos.z) * lerpSpeed * delta;

    this.currentCameraLookAt.x += (targetLookAtX - this.currentCameraLookAt.x) * 12.0 * delta;
    this.currentCameraLookAt.y += (targetLookAtY - this.currentCameraLookAt.y) * 12.0 * delta;
    this.currentCameraLookAt.z += (targetLookAtZ - this.currentCameraLookAt.z) * 12.0 * delta;

    this.camera.position.copy(this.currentCameraPos).add(shakeOffset);
    this.camera.lookAt(this.currentCameraLookAt);
  }

  // 实时 2D 小地图雷达绘制
  drawMinimap() {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // 赛道映射缩放比例 (赛道范围约 -150 到 150)
    const scale = 0.42;
    const cx = w / 2;
    const cy = h / 2;

    // 1. 绘制灰色赛道基底轮廓
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.track.curvePoints.forEach((p, idx) => {
      const mx = cx + p.x * scale;
      const my = cy + p.z * scale;
      if (idx === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.closePath();
    ctx.stroke();

    // 2. 绘制金色赛道路面中心线
    ctx.strokeStyle = '#fbc02d';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 3. 绘制起终点黑白指示点
    const startP = this.track.curvePoints[0];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + startP.x * scale, cy + startP.z * scale, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 4. 绘制玩家卡丁车红色定位小圆点与朝向指针
    const pX = cx + this.physics.position.x * scale;
    const pZ = cy + this.physics.position.z * scale;

    ctx.save();
    ctx.translate(pX, pZ);
    ctx.rotate(this.physics.yaw);

    // 自车三角形车标
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-4, -5);
    ctx.lineTo(4, -5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // 同步更新各类 HUD 文字与能量进度条
  updateHUD() {
    const speedKmh = Math.round(Math.abs(this.physics.speed * 3.6));
    if (speedKmh > this.topSpeedEver) this.topSpeedEver = speedKmh;

    if (this.hudSpeed) this.hudSpeed.innerText = speedKmh.toString();
    if (this.hudLap) this.hudLap.innerText = `${this.physics.currentLap}/3`;
    if (this.hudTimer) this.hudTimer.innerText = this.formatTime(this.physics.lapTimer);
    if (this.hudCoins) this.hudCoins.innerText = this.physics.coins.toString().padStart(2, '0');

    // 漂移蓄力能量槽
    if (this.hudTurboBar) {
      let pct = 0;
      if (this.physics.isDrifting) {
        pct = Math.min(100, (this.physics.driftTimer / 2.4) * 100);
      } else if (this.physics.isBoosting) {
        pct = 100;
      }
      this.hudTurboBar.style.width = `${pct}%`;
    }
  }

  // 更新道具显示插槽
  updateItemHUD() {
    if (!this.hudItem) return;
    if (this.physics.hasItem === 'mushroom') {
      this.hudItem.classList.remove('item-empty');
      this.hudItemIcon.innerText = '🍄';
      this.hudItem.style.boxShadow = '0 0 20px #ff3d00';
    } else {
      this.hudItem.classList.add('item-empty');
      this.hudItemIcon.innerText = '?';
      this.hudItem.style.boxShadow = 'none';
    }
  }

  // 窗口尺寸自适应
  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

// 启动游戏实例
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
