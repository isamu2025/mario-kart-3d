// Web Audio API 纯程序化拟真音效与 BGM 合成引擎
// 零外部音频文件依赖，杜绝加载失败与跨域问题

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;

    // 引擎声源节点
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;

    // 轮胎摩擦声
    this.driftNoiseNode = null;
    this.driftFilter = null;
    this.driftGain = null;

    // 主音量
    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;

    // BGM 状态
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.bgmPlaying = false;
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // 主控增益
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.45, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      this._setupEngineAudio();
      this._setupDriftAudio();
      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio init failed:', e);
    }
  }

  resume() {
    if (!this.isInitialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  // 1. 发动机轰鸣声设置
  _setupEngineAudio() {
    if (!this.ctx) return;

    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineGain = this.ctx.createGain();

    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';

    this.engineOsc1.frequency.setValueAtTime(55, this.ctx.currentTime);
    this.engineOsc2.frequency.setValueAtTime(110, this.ctx.currentTime);

    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
    this.engineFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    this.engineGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  // 动态更新引擎音调（根据车速 0 ~ 200 km/h）
  updateEngine(speedRatio, isThrottling, isBraking) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;

    const baseFreq = 52;
    const maxFreq = 340;
    const targetFreq = baseFreq + Math.pow(Math.abs(speedRatio), 0.85) * (maxFreq - baseFreq) + (isThrottling ? 25 : 0);

    const now = this.ctx.currentTime;
    this.engineOsc1.frequency.setTargetAtTime(targetFreq, now, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(targetFreq * 1.5, now, 0.08);

    // 滤波器截止频率随油门增强
    const cutoff = 260 + speedRatio * 850 + (isThrottling ? 300 : 0);
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.08);

    const targetGain = 0.05 + Math.abs(speedRatio) * 0.12 + (isThrottling ? 0.04 : 0);
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.06);
  }

  // 2. 轮胎摩擦与漂移胎噪
  _setupDriftAudio() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 1.5;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.driftFilter = this.ctx.createBiquadFilter();
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
    this.driftFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    whiteNoise.connect(this.driftFilter);
    this.driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.sfxGain);

    whiteNoise.start();
  }

  updateDriftSound(intensity) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const targetGain = Math.min(0.28, intensity * 0.28);
    this.driftGain.gain.setTargetAtTime(targetGain, now, 0.04);
    this.driftFilter.frequency.setTargetAtTime(1100 + intensity * 600, now, 0.05);
  }

  // 3. 金币清脆 Ding 声
  playCoin() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // 经典任天堂金币双音极速跳跃 (B5 -> E6)
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  // 4. 加速带/蘑菇超级推进喷火音效
  playBoost() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 冲击低频重音
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.45);
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.5);

    // 喷射呼啸白噪
    const bufferSize = this.ctx.sampleRate * 0.8;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.8);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.85);
  }

  // 5. 撞墙碰撞金属与阻尼音
  playCrash(intensity = 1.0) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.22);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, now);

    const crashVol = Math.min(0.45, 0.15 + intensity * 0.3);
    gain.gain.setValueAtTime(crashVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  // 6. 问号道具箱破裂与获取道具
  playItemBox() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 琶音
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.2, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.22);
    });
  }

  // 7. 发车倒计时提示音
  playCountdown(isFinal = false) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = isFinal ? 880 : 440; // 3, 2, 1 为低音，GO 为高音
    const duration = isFinal ? 0.6 : 0.25;

    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // 7.5 新圈数提示号角 (Lap Chime Fanfare)
  playLapSound(isFinal = false) {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // 经典马里奥大奖赛进圈号角 C5-E5-G5-C6，Final Lap 采用更高昂的 D5-G5-A5-D6
    const notes = isFinal ? [587.33, 783.99, 880.00, 1174.66] : [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.3, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.38);
    });
  }

  // 8. 冲过终点/升级音效
  playVictory() {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.08);
      gain.gain.setValueAtTime(0.25, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.4);
    });
  }

  // 9. 纯代码实时生成的马里奥风欢快街机 BGM (Mario Kart Circuit Style)
  startBGM() {
    if (this.bgmPlaying || !this.ctx) return;
    this.bgmPlaying = true;
    this.bgmStep = 0;

    // 欢快 C 大调旋律与贝斯步进
    const melodySeq = [
      { f: 523.25, d: 0.18 }, { f: 659.25, d: 0.18 }, { f: 783.99, d: 0.18 }, { f: 1046.5, d: 0.28 },
      { f: 880.00, d: 0.18 }, { f: 1046.5, d: 0.18 }, { f: 783.99, d: 0.35 }, { f: 0, d: 0.1 },
      { f: 659.25, d: 0.18 }, { f: 587.33, d: 0.18 }, { f: 523.25, d: 0.28 }, { f: 587.33, d: 0.18 },
      { f: 659.25, d: 0.18 }, { f: 783.99, d: 0.28 }, { f: 659.25, d: 0.18 }, { f: 523.25, d: 0.35 },
      { f: 698.46, d: 0.18 }, { f: 880.00, d: 0.18 }, { f: 1046.5, d: 0.28 }, { f: 987.77, d: 0.18 },
      { f: 880.00, d: 0.18 }, { f: 783.99, d: 0.28 }, { f: 659.25, d: 0.18 }, { f: 587.33, d: 0.35 }
    ];

    const bassSeq = [
      130.81, 196.00, 130.81, 196.00,
      174.61, 220.00, 174.61, 220.00,
      146.83, 220.00, 146.83, 220.00,
      196.00, 246.94, 196.00, 246.94
    ];

    const stepInterval = 210; // BPM ~ 140

    const playStep = () => {
      if (!this.bgmPlaying || !this.ctx || this.isMuted) {
        this.bgmTimer = setTimeout(playStep, stepInterval);
        return;
      }

      const now = this.ctx.currentTime;

      // 旋律音轨 (Square 脉冲波，浓郁经典复古风)
      const mel = melodySeq[this.bgmStep % melodySeq.length];
      if (mel.f > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(mel.f, now);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + mel.d);

        osc.connect(gain);
        gain.connect(this.bgmGain);
        osc.start(now);
        osc.stop(now + mel.d + 0.02);
      }

      // 贝斯音轨 (Triangle 波，跳跃律动)
      const bassFreq = bassSeq[this.bgmStep % bassSeq.length];
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(bassFreq, now);

      bassGain.gain.setValueAtTime(0.18, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      bassOsc.connect(bassGain);
      bassGain.connect(this.bgmGain);
      bassOsc.start(now);
      bassOsc.stop(now + 0.2);

      // 轻快踩镲鼓点 (Hi-hat)
      if (this.bgmStep % 2 === 1) {
        this._playHiHat(now);
      }

      this.bgmStep++;
      this.bgmTimer = setTimeout(playStep, stepInterval);
    };

    playStep();
  }

  _playHiHat(time) {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    const bufferSize = this.ctx.sampleRate * 0.04;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    gain.gain.setValueAtTime(0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    noise.start(time);
    noise.stop(time + 0.045);
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const sound = new SoundSystem();
