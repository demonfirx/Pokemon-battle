/**
 * audio.js — Sound effects using Web Audio API
 * Lightweight synthesized sounds, no external audio files needed
 * Performance: Lazy AudioContext init (only on first user interaction)
 */

/* === SECTION: Audio Module === */
const AudioManager = (() => {
  let ctx = null;
  let muted = false;
  let initialized = false;

  /**
   * Lazy init AudioContext — only created on first actual sound request
   * This is required by browsers (Chrome, Safari) which block AudioContext
   * creation before user gesture.
   */
  function getCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        if (DEBUG) console.warn('AudioContext creation failed:', e);
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  function ensureInit() {
    if (initialized) return;
    initialized = true;
    // Create mute button
    const btn = document.createElement('button');
    btn.id = 'mute-btn';
    btn.className = 'mute-btn';
    btn.textContent = '🔊';
    btn.title = 'Toggle Sound';
    btn.addEventListener('click', () => {
      muted = !muted;
      btn.textContent = muted ? '🔇' : '🔊';
      btn.classList.toggle('muted', muted);
    });
    document.body.appendChild(btn);
  }

  // ---- Utility helpers ----

  function playTone(freq, duration, type = 'square', gainVal = 0.15, detune = 0) {
    if (muted) return;
    const ac = getCtx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;
    gain.gain.setValueAtTime(gainVal, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  }

  function playNoise(duration, gainVal = 0.12, filterFreq = 3000) {
    if (muted) return;
    const ac = getCtx();
    if (!ac) return;
    const bufferSize = ac.sampleRate * duration;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(gainVal, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start(ac.currentTime);
    source.stop(ac.currentTime + duration);
  }

  // ---- Public sound effects ----

  function hit() {
    ensureInit();
    if (muted) return;
    playNoise(0.12, 0.18, 4000);
    playTone(200, 0.08, 'square', 0.1);
  }

  function superEffective() {
    ensureInit();
    if (muted) return;
    playNoise(0.1, 0.15, 6000);
    playTone(500, 0.1, 'square', 0.12);
    setTimeout(() => playTone(700, 0.12, 'square', 0.1), 60);
  }

  function notVeryEffective() {
    ensureInit();
    if (muted) return;
    playNoise(0.15, 0.08, 800);
    playTone(120, 0.15, 'triangle', 0.08);
  }

  function critical() {
    ensureInit();
    if (muted) return;
    playNoise(0.06, 0.2, 8000);
    playTone(800, 0.06, 'sawtooth', 0.15);
    setTimeout(() => {
      playTone(1000, 0.08, 'sawtooth', 0.12);
      playNoise(0.08, 0.15, 6000);
    }, 50);
  }

  function statusApplied(statusType) {
    ensureInit();
    if (muted) return;
    switch (statusType) {
      case 'par':
      case 'paralysis':
        // Electric buzz
        playTone(120, 0.2, 'sawtooth', 0.1);
        playTone(125, 0.2, 'sawtooth', 0.1);
        setTimeout(() => playTone(118, 0.15, 'sawtooth', 0.08), 100);
        break;
      case 'brn':
      case 'burn':
        // Sizzle
        playNoise(0.3, 0.1, 5000);
        playTone(300, 0.15, 'sawtooth', 0.06);
        break;
      case 'psn':
      case 'poison':
        // Bubbling
        playTone(200, 0.1, 'sine', 0.08);
        setTimeout(() => playTone(250, 0.08, 'sine', 0.06), 80);
        setTimeout(() => playTone(180, 0.1, 'sine', 0.07), 160);
        break;
      case 'slp':
      case 'sleep':
        // Descending lullaby
        playTone(400, 0.2, 'sine', 0.08);
        setTimeout(() => playTone(350, 0.2, 'sine', 0.06), 150);
        setTimeout(() => playTone(300, 0.3, 'sine', 0.05), 300);
        break;
      case 'frz':
      case 'freeze':
        // Ice crack
        playNoise(0.05, 0.15, 8000);
        playTone(1200, 0.15, 'sine', 0.08);
        setTimeout(() => playTone(800, 0.2, 'sine', 0.06), 80);
        break;
      case 'cnf':
      case 'confusion':
        // Dizzy warble
        playTone(400, 0.15, 'sine', 0.08);
        setTimeout(() => playTone(500, 0.12, 'sine', 0.07), 80);
        setTimeout(() => playTone(350, 0.15, 'sine', 0.06), 160);
        setTimeout(() => playTone(450, 0.12, 'sine', 0.05), 240);
        break;
      default:
        playTone(300, 0.15, 'triangle', 0.08);
    }
  }

  function faint() {
    ensureInit();
    if (muted) return;
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(500, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.6);
    gain.gain.setValueAtTime(0.12, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.7);
  }

  function victory() {
    ensureInit();
    if (muted) return;
    const notes = [523, 587, 659, 784, 880, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.18, 'square', 0.1), i * 100);
    });
    // Final chord
    setTimeout(() => {
      playTone(1047, 0.4, 'square', 0.08);
      playTone(784, 0.4, 'square', 0.06);
      playTone(523, 0.4, 'square', 0.05);
    }, 650);
  }

  function buttonClick() {
    ensureInit();
    if (muted) return;
    playTone(800, 0.05, 'square', 0.06);
  }

  function immune() {
    ensureInit();
    if (muted) return;
    playTone(200, 0.15, 'triangle', 0.06);
    setTimeout(() => playTone(150, 0.2, 'triangle', 0.05), 100);
  }

  function miss() {
    ensureInit();
    if (muted) return;
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.2);
    gain.gain.setValueAtTime(0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.25);
  }

  function turnOrder() {
    ensureInit();
    if (muted) return;
    playTone(600, 0.08, 'square', 0.06);
    setTimeout(() => playTone(800, 0.08, 'square', 0.06), 80);
  }

  return {
    ensureInit,
    hit,
    superEffective,
    notVeryEffective,
    critical,
    statusApplied,
    faint,
    victory,
    buttonClick,
    immune,
    miss,
    turnOrder,
    isMuted: () => muted,
  };
})();
