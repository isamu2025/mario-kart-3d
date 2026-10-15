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

  async keyPress(key, code, isDown) {
    await this.send('Input.dispatchKeyEvent', {
      type: isDown ? 'rawKeyDown' : 'keyUp',
      key: key,
      code: code,
      windowsVirtualKeyCode: code === 'KeyW' ? 87 : code === 'KeyS' ? 83 : code === 'KeyA' ? 65 : code === 'KeyD' ? 68 : code === 'Space' ? 32 : code === 'KeyR' ? 82 : code === 'KeyC' ? 67 : 0
    });
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(filename, Buffer.from(res.data, 'base64'));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runTests() {
  console.log('=== 开始全面本地浏览器自动化测试 ===');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--user-data-dir=C:\\Users\\ISAMU\\AppData\\Local\\Temp\\edge_cdp_9225',
    '--window-size=1280,720',
    'http://127.0.0.1:5050'
  ], { stdio: 'ignore' });

  // 等待 Edge 启动与端口就绪
  let cdpUrl = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9225/json/list');
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
    throw new Error('无法连接 Edge CDP 调试端口 9225');
  }

  const client = new CDPClient(cdpUrl);
  await client.connect();
  console.log('✅ 已成功连接 Edge Headless CDP 调试协议');

  // 等待游戏加载完成
  await sleep(1500);

  const initReady = await client.eval(`
    !!(window.game && window.game.physics && window.game.track)
  `);
  console.log(`[测试 1] 游戏初始化状态: ${initReady ? 'PASS' : 'FAIL'}`);
  if (!initReady) throw new Error('window.game 未正确加载！');

  // 检查控制台异常
  console.log(`[测试 2] 控制台未捕获错误数量: ${client.errors.length}`);
  if (client.errors.length > 0) {
    console.error('发现前端错误:', client.errors);
  }

  // 等待 3, 2, 1, GO! 发车倒计时正式结束
  console.log('⏳ 等待发车拱门 3-2-1 倒计时结束 (GO!)...');
  for (let i = 0; i < 40; i++) {
    const state = await client.eval(`window.game.gameState`);
    if (state === 'RACING') {
      console.log('🟢 比赛正式开始 (RACING)!');
      break;
    }
    await sleep(200);
  }

  // 测试加速向前行驶
  const startPos = await client.eval(`({ x: window.game.physics.position.x, z: window.game.physics.position.z, speed: window.game.physics.speed })`);
  console.log('发车起点车辆坐标:', startPos);

  console.log('▶ 模拟按下油门 (W)...');
  await client.keyPress('w', 'KeyW', true);
  await sleep(1500);
  await client.keyPress('w', 'KeyW', false);

  const afterGasPos = await client.eval(`({ x: window.game.physics.position.x, z: window.game.physics.position.z, speed: window.game.physics.speed, kmh: Math.round(window.game.physics.speed * 3.6) })`);
  console.log('加速后车辆状态:', afterGasPos);
  const gasPassed = afterGasPos.speed > 5.0 && afterGasPos.z > startPos.z + 5.0;
  console.log(`[测试 3] 加速直行测试 (车速: ${afterGasPos.kmh} km/h, 前进位移: ${(afterGasPos.z - startPos.z).toFixed(2)}m): ${gasPassed ? 'PASS' : 'FAIL'}`);

  // 截屏 1: 加速行驶中
  await client.screenshot('test_screen_accelerating.png');

  // 测试右转转向 (D)
  console.log('▶ 模拟右打方向盘 (W + D)...');
  await client.keyPress('w', 'KeyW', true);
  await client.keyPress('d', 'KeyD', true);
  await sleep(1000);
  await client.keyPress('d', 'KeyD', false);
  await client.keyPress('w', 'KeyW', false);

  const afterRightPos = await client.eval(`({ x: window.game.physics.position.x, z: window.game.physics.position.z, yaw: window.game.physics.yaw })`);
  console.log('右转后车辆状态:', afterRightPos);
  // 当面向 +Z 轴时，屏幕右侧为 -X 轴，按 D 后 x 应当减小，yaw 应当为负数
  const rightTurnPassed = afterRightPos.yaw < 0 && (afterRightPos.x - afterGasPos.x) < -1.0;
  console.log(`[测试 4] 右转方向正确性测试 (偏转角: ${afterRightPos.yaw.toFixed(3)} rad, X轴位移: ${(afterRightPos.x - afterGasPos.x).toFixed(2)}m 向右): ${rightTurnPassed ? 'PASS' : 'FAIL'}`);

  // 截屏 2: 右打方向盘
  await client.screenshot('test_screen_steer_right.png');

  // 测试左转转向 (A)
  console.log('▶ 模拟左打方向盘 (W + A)...');
  await client.keyPress('w', 'KeyW', true);
  await client.keyPress('a', 'KeyA', true);
  await sleep(1600);
  await client.keyPress('a', 'KeyA', false);
  await client.keyPress('w', 'KeyW', false);

  const afterLeftPos = await client.eval(`({ x: window.game.physics.position.x, z: window.game.physics.position.z, yaw: window.game.physics.yaw })`);
  console.log('左转后车辆状态:', afterLeftPos);
  const leftTurnPassed = afterLeftPos.yaw > afterRightPos.yaw && (afterLeftPos.x - afterRightPos.x) > 1.0;
  console.log(`[测试 5] 左转方向正确性测试 (偏转角从 ${afterRightPos.yaw.toFixed(3)} 回升至 ${afterLeftPos.yaw.toFixed(3)} rad, X轴位移: ${(afterLeftPos.x - afterRightPos.x).toFixed(2)}m 向左): ${leftTurnPassed ? 'PASS' : 'FAIL'}`);

  // 测试刹车减速与倒车 (S)
  console.log('▶ 模拟刹车减速 (S)...');
  await client.keyPress('s', 'KeyS', true);
  await sleep(1200);
  const afterBrakePos = await client.eval(`({ speed: window.game.physics.speed })`);
  console.log('刹车后车速:', afterBrakePos.speed);
  await sleep(800); // 继续按 S 进入倒车
  const afterReversePos = await client.eval(`({ speed: window.game.physics.speed })`);
  await client.keyPress('s', 'KeyS', false);
  console.log('倒车后车速:', afterReversePos.speed);
  const brakePassed = afterBrakePos.speed <= 0.5 && afterReversePos.speed < 0;
  console.log(`[测试 6] 刹车至静止与倒车响应: ${brakePassed ? 'PASS' : 'FAIL'}`);

  // 测试一键复位赛道 (R)
  console.log('▶ 模拟一键复位 (R)...');
  await client.keyPress('r', 'KeyR', true);
  await sleep(100);
  await client.keyPress('r', 'KeyR', false);
  await sleep(300);

  const resetPos = await client.eval(`({ x: window.game.physics.position.x, y: window.game.physics.position.y, z: window.game.physics.position.z, speed: window.game.physics.speed, yaw: window.game.physics.yaw })`);
  console.log('复位后坐标:', resetPos);
  const resetPassed = Math.abs(resetPos.x) < 0.1 && Math.abs(resetPos.speed) < 0.1 && Math.abs(resetPos.yaw) < 0.1;
  console.log(`[测试 7] 赛道中心一键复位: ${resetPassed ? 'PASS' : 'FAIL'}`);

  // 测试漂移蓄力与火花触发 (W + D + Space)
  console.log('▶ 模拟起步漂移蓄力 (W + D + Space)...');
  await client.keyPress('w', 'KeyW', true);
  await sleep(500);
  await client.keyPress('d', 'KeyD', true);
  await client.keyPress(' ', 'Space', true);
  await sleep(1500); // 漂移蓄力 1.5 秒进入 Stage 1

  const driftState = await client.eval(`({ isDrifting: window.game.physics.isDrifting, driftStage: window.game.physics.driftStage, driftTimer: window.game.physics.driftTimer })`);
  console.log('漂移状态:', driftState);
  await client.keyPress(' ', 'Space', false); // 释放漂移以释放喷火
  await sleep(200);
  const boostState = await client.eval(`({ isBoosting: window.game.physics.isBoosting, boostStage: window.game.physics.boostStage, speed: window.game.physics.speed })`);
  console.log('释放漂移后 Mini-Turbo 爆发状态:', boostState);
  await client.keyPress('d', 'KeyD', false);
  await client.keyPress('w', 'KeyW', false);

  const driftPassed = driftState.isDrifting && driftState.driftStage >= 1 && boostState.isBoosting;
  console.log(`[测试 8] 漂移 Mini-Turbo 蓄力与喷射加速: ${driftPassed ? 'PASS' : 'FAIL'}`);

  // 截屏 3: 漂移爆发
  await client.screenshot('test_screen_boost.png');

  // 测试视角切换 (C)
  console.log('▶ 模拟视角切换 (C)...');
  const cam0 = await client.eval(`window.game.cameraMode`);
  await client.keyPress('c', 'KeyC', true);
  await sleep(100);
  await client.keyPress('c', 'KeyC', false);
  const cam1 = await client.eval(`window.game.cameraMode`);
  await client.keyPress('c', 'KeyC', true);
  await sleep(100);
  await client.keyPress('c', 'KeyC', false);
  const cam2 = await client.eval(`window.game.cameraMode`);
  console.log(`视角模式演进: ${cam0} -> ${cam1} -> ${cam2}`);
  const camPassed = cam0 === 0 && cam1 === 1 && cam2 === 2;
  console.log(`[测试 9] 追尾/远景/引擎盖多视角循环切换: ${camPassed ? 'PASS' : 'FAIL'}`);

  // 截屏 4: 切换后视角
  await client.screenshot('test_screen_camera_mode.png');

  // 测试 10: 跨过终点线进入第 2 圈（验证 sound.playLapSound 与圈数递增不卡死）
  console.log('▶ 模拟完成第 1 圈并跨过发车拱门终点线...');
  await client.eval(`
    (() => {
      for (let i = 1; i < window.game.track.checkpoints.length; i++) {
        window.game.physics.lastCheckpoint = i;
      }
      const cp0 = window.game.track.checkpoints[0];
      window.game.physics.position.x = cp0.position.x;
      window.game.physics.position.z = cp0.position.y;
      window.game.physics.speed = 35.0;
    })()
  `);
  await sleep(1000);

  const afterLap1State = await client.eval(`({
    lap: window.game.physics.currentLap,
    gameState: window.game.gameState,
    banner: document.getElementById('alert-banner')?.innerText
  })`);
  console.log('跨过第 1 圈后状态:', afterLap1State);
  const lap1Passed = afterLap1State.lap === 2 && client.errors.length === 0;
  console.log(`[测试 10] 第 1 圈冲线结算与第 2 圈切换 (进入 Lap ${afterLap1State.lap}, 横幅: ${afterLap1State.banner}): ${lap1Passed ? 'PASS' : 'FAIL'}`);

  // 测试 11: 跨过第 2 圈进入 Final Lap 3
  console.log('▶ 模拟完成第 2 圈并进入 Final Lap...');
  await client.eval(`
    (() => {
      for (let i = 1; i < window.game.track.checkpoints.length; i++) {
        window.game.physics.lastCheckpoint = i;
      }
      const cp0 = window.game.track.checkpoints[0];
      window.game.physics.position.x = cp0.position.x;
      window.game.physics.position.z = cp0.position.y;
    })()
  `);
  await sleep(1000);

  const afterLap2State = await client.eval(`({
    lap: window.game.physics.currentLap,
    gameState: window.game.gameState,
    banner: document.getElementById('alert-banner')?.innerText
  })`);
  console.log('跨过第 2 圈后状态:', afterLap2State);
  const lap2Passed = afterLap2State.lap === 3 && client.errors.length === 0;
  console.log(`[测试 11] Final Lap 冲线切换 (进入 Lap ${afterLap2State.lap}, 横幅: ${afterLap2State.banner}): ${lap2Passed ? 'PASS' : 'FAIL'}`);

  // 测试 12: 跨过第 3 圈完赛并弹出 Victory 结算框
  console.log('▶ 模拟完成第 3 圈冲过终点大获全胜...');
  await client.eval(`
    (() => {
      for (let i = 1; i < window.game.track.checkpoints.length; i++) {
        window.game.physics.lastCheckpoint = i;
      }
      const cp0 = window.game.track.checkpoints[0];
      window.game.physics.position.x = cp0.position.x;
      window.game.physics.position.z = cp0.position.y;
    })()
  `);
  await sleep(1000);

  const finishState = await client.eval(`({
    gameState: window.game.gameState,
    modalVisible: document.getElementById('finish-modal')?.style.display === 'flex',
    totalTime: document.getElementById('res-total-time')?.innerText,
    bestLap: document.getElementById('res-best-lap')?.innerText
  })`);
  console.log('完赛后领奖台状态:', finishState);
  const finishPassed = finishState.gameState === 'FINISHED' && finishState.modalVisible && client.errors.length === 0;
  console.log(`[测试 12] 全圈大奖赛完赛结算与领奖台弹窗 (最佳圈速: ${finishState.bestLap}, 总用时: ${finishState.totalTime}): ${finishPassed ? 'PASS' : 'FAIL'}`);

  // 截屏 5: 完赛结算领奖台
  await client.screenshot('test_screen_victory.png');

  // 清理退出
  client.close();
  edgeProc.kill();

  const allPassed = gasPassed && rightTurnPassed && leftTurnPassed && brakePassed && resetPassed && driftPassed && camPassed && lap1Passed && lap2Passed && finishPassed && client.errors.length === 0;
  console.log('\n=======================================');
  console.log(`本地端到端测试总结: ${allPassed ? '🎉 全部 12 项实操与结算用例 100% 通过！' : '❌ 部分测试未通过'}`);
  console.log('=======================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试异常终止:', err);
  process.exit(1);
});
