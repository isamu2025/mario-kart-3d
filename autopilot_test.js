import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.errors = [];
    this.consoleLogs = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        this.consoleLogs.push(msg.params);
      }
    };

    await this.send('Runtime.enable');
    await this.send('Page.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(filename, Buffer.from(res.data, 'base64'));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runAutopilotDrive() {
  console.log('=== 启动自动驾驶员实车环道全赛程跑圈测试 ===');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9228',
    '--user-data-dir=C:\\Users\\ISAMU\\AppData\\Local\\Temp\\edge_cdp_9228',
    '--window-size=1280,720',
    'http://127.0.0.1:5050'
  ], { stdio: 'ignore' });

  let cdpUrl = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9228/json/list');
      const list = await res.json();
      const pageTab = list.find(t => t.type === 'page' && t.url.includes('5050')) || list.find(t => t.type === 'page');
      if (pageTab && pageTab.webSocketDebuggerUrl) {
        cdpUrl = pageTab.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!cdpUrl) {
    edgeProc.kill();
    throw new Error('无法连接 Edge CDP 调试端口 9228');
  }

  const client = new CDPClient(cdpUrl);
  await client.connect();
  console.log('✅ 已成功连接 Edge Headless CDP');

  // 等待发车
  console.log('⏳ 等待 3-2-1 发车倒计时...');
  for (let i = 0; i < 40; i++) {
    const state = await client.eval(`window.game && window.game.gameState`);
    if (state === 'RACING') break;
    await sleep(200);
  }
  console.log('🟢 绿灯亮起，AI 驾驶员开始全油门循迹跑圈...');

  // 注入自动驾驶巡航循环（按道路中线自动打方向盘并加速）
  await client.eval(`
    window.aiDriverActive = true;
    window.aiTelemetry = [];

    const curvePoints = window.game.track.curvePoints;
    let targetIdx = 5;

    window.aiInterval = setInterval(() => {
      if (!window.aiDriverActive || window.game.gameState !== 'RACING') return;

      const p = window.game.physics.position;
      const yaw = window.game.physics.yaw;

      // 寻找前方 15-25 米处的路径引导点
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < curvePoints.length; i++) {
        const cp = curvePoints[i];
        const d = Math.hypot(p.x - cp.x, p.z - cp.z);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }

      // 目标点取前向第 10 个样条采样点
      const lookAhead = 8;
      targetIdx = (closestIdx + lookAhead) % curvePoints.length;
      const targetPoint = curvePoints[targetIdx];

      // 计算车头朝向与目标点方向的夹角
      const dx = targetPoint.x - p.x;
      const dz = targetPoint.z - p.z;
      const targetYaw = Math.atan2(dx, dz);

      let diff = targetYaw - yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      // 自动控制油门与转向
      window.game.inputs.throttle = true;
      window.game.inputs.brake = false;

      // 转向死区与比例控制
      if (diff > 0.08) {
        window.game.inputs.left = true;
        window.game.inputs.right = false;
      } else if (diff < -0.08) {
        window.game.inputs.left = false;
        window.game.inputs.right = true;
      } else {
        window.game.inputs.left = false;
        window.game.inputs.right = false;
      }

      // 遇大弯自动触发漂移
      if (Math.abs(diff) > 0.45 && window.game.physics.speed > 15.0) {
        window.game.inputs.drift = true;
      } else {
        window.game.inputs.drift = false;
      }

      // 记录遥测数据
      if (window.aiTelemetry.length < 200) {
        window.aiTelemetry.push({
          x: p.x.toFixed(2),
          z: p.z.toFixed(2),
          speed: Math.round(window.game.physics.speed * 3.6),
          lap: window.game.physics.currentLap,
          time: window.game.physics.lapTimer.toFixed(2),
          diff: diff.toFixed(2),
          coins: window.game.physics.coins,
          collisions: window.game.physics.collisionEvents.length
        });
      }
    }, 50);
  `);

  // 跑圈 15 秒，期间每 3 秒记录一次状态并截屏
  for (let sec = 1; sec <= 6; sec++) {
    await sleep(3000);
    const telemetry = await client.eval(`({
      pos: { x: window.game.physics.position.x.toFixed(1), z: window.game.physics.position.z.toFixed(1) },
      speed: Math.round(window.game.physics.speed * 3.6),
      lap: window.game.physics.currentLap,
      lapTimer: window.game.physics.lapTimer.toFixed(2),
      coins: window.game.physics.coins,
      isDrifting: window.game.physics.isDrifting,
      fps: Math.round(1 / window.game.clock.getDelta())
    })`);
    console.log(`[第 ${sec * 3} 秒跑圈遥测] 坐标: (${telemetry.pos.x}, ${telemetry.pos.z}) | 速度: ${telemetry.speed} km/h | 圈数: Lap ${telemetry.lap} | 用时: ${telemetry.lapTimer}s | 金币: ${telemetry.coins} | 漂移: ${telemetry.isDrifting}`);
    await client.screenshot(`telemetry_run_${sec * 3}s.png`);
  }

  // 检查是否发生异常
  console.log('跑圈过程中未捕获报错数量:', client.errors.length);
  if (client.errors.length > 0) {
    console.error('跑圈抛错:', client.errors);
  }

  await client.eval(`clearInterval(window.aiInterval);`);
  client.close();
  edgeProc.kill();
  console.log('=== 实车环道测试完毕 ===');
}

runAutopilotDrive().catch(err => {
  console.error('跑车测试异常:', err);
  process.exit(1);
});
