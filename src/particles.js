import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];

    // 粒子共享几何体与材质（轻量高效，单网格实例化或动态顶点批处理）
    this.sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
    this.blueSparkMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    this.orangeSparkMat = new THREE.MeshBasicMaterial({ color: 0xff6d00 });
    this.coinSparkMat = new THREE.MeshBasicMaterial({ color: 0xffd600 });
    this.smokeGeo = new THREE.DodecahedronGeometry(0.25, 0);
    this.smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.55 });
    this.flameGeo = new THREE.ConeGeometry(0.28, 1.2, 8);
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0x00b0ff });
  }

  // 1. 排气管排气尾烟
  emitExhaustSmoke(pos, dir) {
    if (this.particles.length > 250) return;
    const mesh = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
    mesh.position.copy(pos);
    mesh.scale.set(0.6, 0.6, 0.6);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.8 - dir.x * 2.5,
        0.5 + Math.random() * 0.8,
        (Math.random() - 0.5) * 0.8 - dir.z * 2.5
      ),
      rotVel: (Math.random() - 0.5) * 3,
      life: 0.5,
      maxLife: 0.5,
      scaleGrowth: 2.2,
      isSmoke: true
    });
  }

  // 2. 漂移火花（蓝火 / 橙火）
  emitDriftSparks(pos, isStage2 = false) {
    if (this.particles.length > 280) return;
    const mat = isStage2 ? this.orangeSparkMat : this.blueSparkMat;
    const count = isStage2 ? 3 : 2;

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.4,
        pos.y + 0.1,
        pos.z + (Math.random() - 0.5) * 0.4
      );
      this.scene.add(mesh);

      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          2.0 + Math.random() * 4.5,
          (Math.random() - 0.5) * 6
        ),
        life: 0.28,
        maxLife: 0.28,
        gravity: -18,
        isSpark: true
      });
    }
  }

  // 3. 撞墙碰撞火花飞溅
  emitCollisionSparks(pos, normal, count = 12) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.coinSparkMat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      // 沿法线与切线方向放射
      const spreadX = normal.x * (4 + Math.random() * 8) + (Math.random() - 0.5) * 6;
      const spreadZ = normal.y * (4 + Math.random() * 8) + (Math.random() - 0.5) * 6;

      this.particles.push({
        mesh,
        vel: new THREE.Vector3(spreadX, 3 + Math.random() * 5, spreadZ),
        life: 0.35,
        maxLife: 0.35,
        gravity: -22,
        isSpark: true
      });
    }
  }

  // 4. 金币拾取金色星芒爆裂
  emitCoinBurst(pos) {
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.coinSparkMat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      const angle = (i / 16) * Math.PI * 2;
      const speed = 4 + Math.random() * 4;

      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          3 + Math.random() * 4,
          Math.sin(angle) * speed
        ),
        life: 0.45,
        maxLife: 0.45,
        gravity: -12,
        isSpark: true
      });
    }
  }

  // 5. 道具箱粉碎多彩晶片
  emitBoxShatter(pos) {
    const colors = [0xff1744, 0x00e676, 0x2979ff, 0xffea00, 0xd500f9];
    for (let i = 0; i < 18; i++) {
      const color = colors[i % colors.length];
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      const angle = (i / 18) * Math.PI * 2;
      const spd = 5 + Math.random() * 6;

      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * spd,
          4 + Math.random() * 5,
          Math.sin(angle) * spd
        ),
        life: 0.55,
        maxLife: 0.55,
        gravity: -16,
        rotVel: (Math.random() - 0.5) * 12
      });
    }
  }

  // 逐帧更新与销毁回收
  update(delta) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.mesh.geometry && !p.mesh.geometry._isShared) p.mesh.geometry.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // 重力与位移
      if (p.gravity) {
        p.vel.y += p.gravity * delta;
      }
      p.mesh.position.addScaledVector(p.vel, delta);

      // 旋转
      if (p.rotVel) {
        p.mesh.rotation.y += p.rotVel * delta;
        p.mesh.rotation.x += p.rotVel * 0.5 * delta;
      }

      // 衰减缩放与透明度
      const progress = 1 - (p.life / p.maxLife);
      if (p.isSmoke) {
        const s = 0.6 + progress * p.scaleGrowth;
        p.mesh.scale.set(s, s, s);
        p.mesh.material.opacity = (1 - progress) * 0.55;
      } else if (p.isSpark) {
        const s = Math.max(0.01, 1 - progress);
        p.mesh.scale.set(s, s, s);
      }
    }
  }
}
