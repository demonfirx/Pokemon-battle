/**
 * effects.js — Attack VFX Engine for Pokemon Battle
 * Per-type visual effects using CSS animations + DOM particles
 * 
 * Usage: await AttackEffects.play(moveType, attackerSide, defenderSide)
 */

const AttackEffects = (() => {
  // Detect mobile for reduced particle counts
  const isMobile = window.innerWidth <= 480;
  const particleScale = isMobile ? 0.6 : 1;

  // Effects layer reference
  let effectsLayer = null;
  let arena = null;

  function getEffectsLayer() {
    if (!effectsLayer) effectsLayer = document.getElementById('effects-layer');
    return effectsLayer;
  }

  function getArena() {
    if (!arena) arena = document.getElementById('battle-arena');
    return arena;
  }

  /**
   * Get sprite position relative to the arena
   */
  function getSpritePos(side) {
    const sprite = document.getElementById(side === 'player' ? 'player-sprite' : 'opponent-sprite');
    const arenaEl = getArena();
    if (!sprite || !arenaEl) return { x: 0, y: 0, w: 0, h: 0 };

    const spriteRect = sprite.getBoundingClientRect();
    const arenaRect = arenaEl.getBoundingClientRect();

    return {
      x: spriteRect.left - arenaRect.left + spriteRect.width / 2,
      y: spriteRect.top - arenaRect.top + spriteRect.height / 2,
      w: spriteRect.width,
      h: spriteRect.height,
      top: spriteRect.top - arenaRect.top,
      left: spriteRect.left - arenaRect.left,
      right: spriteRect.right - arenaRect.left,
      bottom: spriteRect.bottom - arenaRect.top,
    };
  }

  /**
   * Create a particle element and add to effects layer
   */
  function createParticle(className, styles = {}) {
    const el = document.createElement('div');
    el.className = `vfx-particle ${className}`;
    Object.assign(el.style, styles);
    getEffectsLayer().appendChild(el);
    return el;
  }

  /**
   * Remove all particles after delay
   */
  function cleanupAfter(elements, delayMs) {
    setTimeout(() => {
      elements.forEach(el => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    }, delayMs);
  }

  /**
   * Screen shake effect
   */
  function screenShake(intensity = 'medium', duration = 400) {
    const arenaEl = getArena();
    if (!arenaEl) return;
    const cls = `vfx-shake-${intensity}`;
    arenaEl.classList.add(cls);
    setTimeout(() => arenaEl.classList.remove(cls), duration);
  }

  /**
   * Screen tint overlay
   */
  function screenTint(color, duration = 300, opacity = 0.15) {
    const el = createParticle('vfx-screen-tint', {
      background: color,
      opacity: '0',
    });
    // Trigger animation
    requestAnimationFrame(() => {
      el.style.opacity = String(opacity);
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
      }, duration);
    });
    return el;
  }

  /**
   * Screen dim overlay (for ghost/dark)
   */
  function screenDim(duration = 400) {
    return screenTint('rgba(0,0,0,0.6)', duration, 0.6);
  }

  /**
   * Strobe flash effect (for electric)
   */
  function strobeFlash(count = 3, interval = 80) {
    return new Promise(resolve => {
      let i = 0;
      const flash = () => {
        if (i >= count) { resolve(); return; }
        const el = createParticle('vfx-strobe');
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, interval * 0.7);
        i++;
        setTimeout(flash, interval);
      };
      flash();
    });
  }

  /**
   * Frost tint on defender sprite
   */
  function frostTint(side, duration = 600) {
    const sprite = document.getElementById(side === 'player' ? 'player-sprite' : 'opponent-sprite');
    if (!sprite) return;
    sprite.classList.add('vfx-frost-tint');
    setTimeout(() => sprite.classList.remove('vfx-frost-tint'), duration);
  }

  // ==================== UTILITY MATH ====================

  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

  function pCount(base) { return Math.max(3, Math.round(base * particleScale)); }

  // ==================== TYPE EFFECTS ====================

  /**
   * 🔥 FIRE — Flame particles + ember burst
   */
  async function fireEffect(from, to) {
    const particles = [];
    const count = pCount(14);

    // Screen tint orange
    particles.push(screenTint('rgba(240, 128, 48, 0.25)', 500, 0.25));

    // Flame particles shooting from attacker to defender
    for (let i = 0; i < count; i++) {
      const delay = i * 30;
      const size = rand(12, 24) * particleScale;
      const offsetX = rand(-20, 20);
      const offsetY = rand(-15, 15);
      const dx = to.x - from.x + rand(-30, 30);
      const dy = to.y - from.y + rand(-20, 20);
      const dur = rand(350, 500);

      const el = createParticle('vfx-flame', {
        left: `${from.x + offsetX}px`,
        top: `${from.y + offsetY}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${dx}px`,
        '--dy': `${dy}px`,
        animationDuration: `${dur}ms`,
        animationDelay: `${delay}ms`,
      });
      particles.push(el);
    }

    // Ember burst on impact (delayed)
    setTimeout(() => {
      const emberCount = pCount(10);
      for (let i = 0; i < emberCount; i++) {
        const size = rand(4, 10) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(30, 80);
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;

        const el = createParticle('vfx-ember', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${dx}px`,
          '--dy': `${dy}px`,
        });
        particles.push(el);
      }
    }, 350);

    cleanupAfter(particles, 1000);
    return delay(700);
  }

  /**
   * 💧 WATER — Stream + splash + ripple
   */
  async function waterEffect(from, to) {
    const particles = [];
    const count = pCount(12);

    particles.push(screenTint('rgba(104, 144, 240, 0.2)', 400, 0.2));

    // Water stream particles
    for (let i = 0; i < count; i++) {
      const d = i * 25;
      const size = rand(8, 18) * particleScale;
      const dx = to.x - from.x + rand(-15, 15);
      const dy = to.y - from.y + rand(-10, 10);
      const dur = rand(300, 450);

      const el = createParticle('vfx-water-drop', {
        left: `${from.x + rand(-10, 10)}px`,
        top: `${from.y + rand(-10, 10)}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${dx}px`,
        '--dy': `${dy}px`,
        animationDuration: `${dur}ms`,
        animationDelay: `${d}ms`,
      });
      particles.push(el);
    }

    // Splash on impact
    setTimeout(() => {
      const splashCount = pCount(8);
      for (let i = 0; i < splashCount; i++) {
        const size = rand(4, 10) * particleScale;
        const dx = rand(-50, 50);
        const dy = rand(-80, -20);

        const el = createParticle('vfx-splash', {
          left: `${to.x + rand(-15, 15)}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${dx}px`,
          '--dy': `${dy}px`,
        });
        particles.push(el);
      }

      // Ripple rings
      for (let i = 0; i < 3; i++) {
        const el = createParticle('vfx-ripple', {
          left: `${to.x}px`,
          top: `${to.y + 20}px`,
          animationDelay: `${i * 100}ms`,
        });
        particles.push(el);
      }
    }, 300);

    cleanupAfter(particles, 1000);
    return delay(700);
  }

  /**
   * ⚡ ELECTRIC — Lightning bolts + sparks + strobe
   */
  async function electricEffect(from, to) {
    const particles = [];

    screenShake('hard', 500);

    // Lightning bolts from top to defender
    const boltCount = pCount(4);
    for (let i = 0; i < boltCount; i++) {
      const el = createLightningBolt(to.x + rand(-30, 30), 0, to.y, rand(150, 250));
      particles.push(el);
    }

    // Strobe flash
    await strobeFlash(4, 70);

    // Electric sparks around defender
    const sparkCount = pCount(12);
    for (let i = 0; i < sparkCount; i++) {
      const size = rand(3, 7) * particleScale;
      const angle = rand(0, Math.PI * 2);
      const dist = rand(20, 60);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;

      const el = createParticle('vfx-spark', {
        left: `${to.x + rand(-20, 20)}px`,
        top: `${to.y + rand(-20, 20)}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${dx}px`,
        '--dy': `${dy}px`,
        animationDelay: `${rand(0, 200)}ms`,
      });
      particles.push(el);
    }

    cleanupAfter(particles, 900);
    return delay(600);
  }

  function createLightningBolt(x, startY, endY, duration) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'vfx-lightning-svg');
    svg.style.left = `${x - 40}px`;
    svg.style.top = `${startY}px`;
    svg.style.width = '80px';
    svg.style.height = `${endY - startY + 20}px`;
    svg.style.animationDuration = `${duration}ms`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const totalH = endY - startY;
    const segments = randInt(5, 8);
    let d = 'M 40 0';
    let cy = 0;
    for (let i = 1; i <= segments; i++) {
      cy = (totalH / segments) * i;
      const cx = 40 + rand(-30, 30);
      d += ` L ${cx} ${cy}`;
    }
    path.setAttribute('d', d);
    path.setAttribute('class', 'vfx-lightning-path');
    svg.appendChild(path);

    // Glow duplicate
    const glow = path.cloneNode();
    glow.setAttribute('class', 'vfx-lightning-glow');
    svg.insertBefore(glow, path);

    getEffectsLayer().appendChild(svg);
    return svg;
  }

  /**
   * 🌿 GRASS — Leaves + green beam
   */
  async function grassEffect(from, to) {
    const particles = [];

    particles.push(screenTint('rgba(120, 200, 80, 0.2)', 400, 0.2));

    // Green energy beam
    const beamEl = createParticle('vfx-grass-beam', {
      left: `${from.x}px`,
      top: `${from.y}px`,
      '--dx': `${to.x - from.x}px`,
      '--dy': `${to.y - from.y}px`,
      '--len': `${Math.hypot(to.x - from.x, to.y - from.y)}px`,
      '--angle': `${Math.atan2(to.y - from.y, to.x - from.x)}rad`,
    });
    particles.push(beamEl);

    // Leaf particles
    const leafCount = pCount(10);
    for (let i = 0; i < leafCount; i++) {
      const d = i * 35;
      const size = rand(10, 18) * particleScale;
      const dx = to.x - from.x + rand(-30, 30);
      const dy = to.y - from.y + rand(-20, 20);

      const el = createParticle('vfx-leaf', {
        left: `${from.x + rand(-15, 15)}px`,
        top: `${from.y + rand(-15, 15)}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${dx}px`,
        '--dy': `${dy}px`,
        animationDelay: `${d}ms`,
      });
      particles.push(el);
    }

    // Scatter on impact
    setTimeout(() => {
      const scatterCount = pCount(6);
      for (let i = 0; i < scatterCount; i++) {
        const size = rand(6, 12) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(25, 60);

        const el = createParticle('vfx-leaf-scatter', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }
    }, 350);

    cleanupAfter(particles, 1000);
    return delay(700);
  }

  /**
   * 👻 GHOST — Shadow ball + tendrils + dark explosion
   */
  async function ghostEffect(from, to) {
    const particles = [];

    // Screen dim
    const dimEl = screenDim(500);
    particles.push(dimEl);

    // Shadow ball growing and flying
    const ball = createParticle('vfx-shadow-ball', {
      left: `${from.x}px`,
      top: `${from.y}px`,
      '--dx': `${to.x - from.x}px`,
      '--dy': `${to.y - from.y}px`,
    });
    particles.push(ball);

    // Trailing wisps
    const wispCount = pCount(6);
    for (let i = 0; i < wispCount; i++) {
      const d = i * 40;
      const el = createParticle('vfx-wisp', {
        left: `${from.x + rand(-10, 10)}px`,
        top: `${from.y + rand(-10, 10)}px`,
        '--dx': `${(to.x - from.x) * 0.7 + rand(-20, 20)}px`,
        '--dy': `${(to.y - from.y) * 0.7 + rand(-20, 20)}px`,
        animationDelay: `${d}ms`,
      });
      particles.push(el);
    }

    // Dark explosion on impact
    setTimeout(() => {
      const burstCount = pCount(10);
      for (let i = 0; i < burstCount; i++) {
        const size = rand(6, 14) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(20, 70);

        const el = createParticle('vfx-dark-burst', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }
    }, 400);

    cleanupAfter(particles, 1100);
    return delay(750);
  }

  /**
   * 🥊 NORMAL — Shockwave + star sparks
   */
  async function normalEffect(from, to) {
    const particles = [];

    screenShake('medium', 300);

    // Shockwave rings
    for (let i = 0; i < 3; i++) {
      const el = createParticle('vfx-shockwave', {
        left: `${to.x}px`,
        top: `${to.y}px`,
        animationDelay: `${i * 80}ms`,
      });
      particles.push(el);
    }

    // Star/spark particles
    const sparkCount = pCount(8);
    for (let i = 0; i < sparkCount; i++) {
      const size = rand(6, 14) * particleScale;
      const angle = rand(0, Math.PI * 2);
      const dist = rand(30, 70);

      const el = createParticle('vfx-star-spark', {
        left: `${to.x}px`,
        top: `${to.y}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${Math.cos(angle) * dist}px`,
        '--dy': `${Math.sin(angle) * dist}px`,
      });
      particles.push(el);
    }

    cleanupAfter(particles, 800);
    return delay(600);
  }

  /**
   * ❄️ ICE — Beam + crystals + frost
   */
  async function iceEffect(from, to, defenderSide) {
    const particles = [];

    particles.push(screenTint('rgba(152, 216, 216, 0.2)', 400, 0.2));

    // Ice beam
    const beamEl = createParticle('vfx-ice-beam', {
      left: `${from.x}px`,
      top: `${from.y}px`,
      '--dx': `${to.x - from.x}px`,
      '--dy': `${to.y - from.y}px`,
      '--len': `${Math.hypot(to.x - from.x, to.y - from.y)}px`,
      '--angle': `${Math.atan2(to.y - from.y, to.x - from.x)}rad`,
    });
    particles.push(beamEl);

    // Ice crystal particles along beam
    const crystalCount = pCount(8);
    for (let i = 0; i < crystalCount; i++) {
      const t = i / crystalCount;
      const cx = lerp(from.x, to.x, t) + rand(-15, 15);
      const cy = lerp(from.y, to.y, t) + rand(-15, 15);
      const size = rand(6, 14) * particleScale;

      const el = createParticle('vfx-ice-crystal', {
        left: `${cx}px`,
        top: `${cy}px`,
        width: `${size}px`,
        height: `${size}px`,
        animationDelay: `${t * 300}ms`,
      });
      particles.push(el);
    }

    // Frost on impact + frost tint
    setTimeout(() => {
      frostTint(defenderSide, 800);

      const frostCount = pCount(8);
      for (let i = 0; i < frostCount; i++) {
        const size = rand(8, 16) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(15, 50);

        const el = createParticle('vfx-snowflake', {
          left: `${to.x + Math.cos(angle) * dist * 0.3}px`,
          top: `${to.y + Math.sin(angle) * dist * 0.3}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }
    }, 350);

    cleanupAfter(particles, 1000);
    return delay(700);
  }

  /**
   * 🐉 DRAGON — Claw slashes + aura + explosion
   */
  async function dragonEffect(from, to) {
    const particles = [];

    particles.push(screenTint('rgba(112, 56, 248, 0.2)', 400, 0.2));

    // Dragon aura around attacker
    const aura = createParticle('vfx-dragon-aura', {
      left: `${from.x}px`,
      top: `${from.y}px`,
    });
    particles.push(aura);

    // 3 claw slash marks on defender
    setTimeout(() => {
      for (let i = 0; i < 3; i++) {
        const el = createParticle('vfx-claw-slash', {
          left: `${to.x - 30 + i * 20}px`,
          top: `${to.y - 40}px`,
          animationDelay: `${i * 80}ms`,
        });
        particles.push(el);
      }

      // Purple explosion particles
      const burstCount = pCount(10);
      for (let j = 0; j < burstCount; j++) {
        const size = rand(5, 12) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(25, 65);

        const el = createParticle('vfx-dragon-burst', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
          animationDelay: `${rand(50, 150)}ms`,
        });
        particles.push(el);
      }
    }, 300);

    cleanupAfter(particles, 1100);
    return delay(750);
  }

  /**
   * ☠️ POISON — Toxic blobs + splatter + bubbles
   */
  async function poisonEffect(from, to) {
    const particles = [];

    particles.push(screenTint('rgba(160, 64, 160, 0.2)', 400, 0.2));

    // Toxic blobs in arc
    const blobCount = pCount(8);
    for (let i = 0; i < blobCount; i++) {
      const d = i * 40;
      const size = rand(12, 22) * particleScale;
      const dx = to.x - from.x + rand(-20, 20);
      const dy = to.y - from.y;
      const arcHeight = rand(-60, -30);

      const el = createParticle('vfx-toxic-blob', {
        left: `${from.x + rand(-10, 10)}px`,
        top: `${from.y}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${dx}px`,
        '--dy': `${dy}px`,
        '--arc': `${arcHeight}px`,
        animationDelay: `${d}ms`,
      });
      particles.push(el);
    }

    // Splatter + bubbles on impact
    setTimeout(() => {
      const splatCount = pCount(6);
      for (let i = 0; i < splatCount; i++) {
        const size = rand(6, 14) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(20, 50);

        const el = createParticle('vfx-toxic-splat', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }

      // Rising bubbles
      const bubbleCount = pCount(6);
      for (let i = 0; i < bubbleCount; i++) {
        const size = rand(4, 10) * particleScale;
        const el = createParticle('vfx-toxic-bubble', {
          left: `${to.x + rand(-25, 25)}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          animationDelay: `${i * 80}ms`,
        });
        particles.push(el);
      }
    }, 350);

    cleanupAfter(particles, 1100);
    return delay(700);
  }

  /**
   * 🌑 DARK — Dark rings + shadow + screen darken
   */
  async function darkEffect(from, to) {
    const particles = [];

    const dimEl = screenTint('rgba(0,0,0,0.4)', 500, 0.4);
    particles.push(dimEl);

    // Dark energy rings pulsing from attacker
    for (let i = 0; i < 4; i++) {
      const el = createParticle('vfx-dark-ring', {
        left: `${from.x}px`,
        top: `${from.y}px`,
        '--dx': `${to.x - from.x}px`,
        '--dy': `${to.y - from.y}px`,
        animationDelay: `${i * 80}ms`,
      });
      particles.push(el);
    }

    // Shadow overlay on defender
    setTimeout(() => {
      const shadow = createParticle('vfx-dark-shadow', {
        left: `${to.x}px`,
        top: `${to.y}px`,
      });
      particles.push(shadow);
    }, 250);

    cleanupAfter(particles, 1000);
    return delay(700);
  }

  /**
   * ⚔️ STEEL — Metallic flash + sparks + shockwave
   */
  async function steelEffect(from, to) {
    const particles = [];

    // Metallic flash/gleam
    const flash = createParticle('vfx-metal-flash', {
      left: `${to.x}px`,
      top: `${to.y}px`,
    });
    particles.push(flash);

    screenShake('medium', 300);

    // Impact sparks (white/silver)
    setTimeout(() => {
      const sparkCount = pCount(10);
      for (let i = 0; i < sparkCount; i++) {
        const size = rand(3, 8) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(25, 65);

        const el = createParticle('vfx-metal-spark', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }

      // Metallic shockwave
      const wave = createParticle('vfx-metal-wave', {
        left: `${to.x}px`,
        top: `${to.y}px`,
      });
      particles.push(wave);
    }, 150);

    cleanupAfter(particles, 900);
    return delay(650);
  }

  /**
   * 🦅 FLYING — Wind slashes + air waves + feathers
   */
  async function flyingEffect(from, to) {
    const particles = [];

    // Wind slash arcs
    for (let i = 0; i < 3; i++) {
      const el = createParticle('vfx-wind-slash', {
        left: `${lerp(from.x, to.x, 0.3 + i * 0.15)}px`,
        top: `${lerp(from.y, to.y, 0.3 + i * 0.15) + rand(-20, 20)}px`,
        animationDelay: `${i * 100}ms`,
      });
      particles.push(el);
    }

    // Air pressure waves
    for (let i = 0; i < 3; i++) {
      const el = createParticle('vfx-air-wave', {
        left: `${to.x}px`,
        top: `${to.y}px`,
        animationDelay: `${i * 70}ms`,
      });
      particles.push(el);
    }

    // Feather particles
    const featherCount = pCount(6);
    for (let i = 0; i < featherCount; i++) {
      const size = rand(8, 16) * particleScale;
      const el = createParticle('vfx-feather', {
        left: `${to.x + rand(-30, 30)}px`,
        top: `${to.y + rand(-20, 20)}px`,
        width: `${size}px`,
        height: `${size * 0.5}px`,
        '--dx': `${rand(-40, 40)}px`,
        '--dy': `${rand(-60, -20)}px`,
        animationDelay: `${rand(100, 300)}ms`,
      });
      particles.push(el);
    }

    cleanupAfter(particles, 900);
    return delay(650);
  }

  /**
   * 🌍 GROUND — Heavy shake + cracks + dust
   */
  async function groundEffect(from, to) {
    const particles = [];
    const arenaEl = getArena();
    const arenaH = arenaEl ? arenaEl.offsetHeight : 300;

    // Heavy screen shake
    screenShake('heavy', 700);

    // Ground crack lines at bottom
    for (let i = 0; i < 5; i++) {
      const el = createParticle('vfx-ground-crack', {
        left: `${to.x + rand(-60, 60)}px`,
        top: `${arenaH - rand(5, 30)}px`,
        animationDelay: `${i * 60}ms`,
      });
      particles.push(el);
    }

    // Dust/debris rising from bottom
    const dustCount = pCount(14);
    for (let i = 0; i < dustCount; i++) {
      const size = rand(6, 16) * particleScale;
      const el = createParticle('vfx-dust', {
        left: `${to.x + rand(-80, 80)}px`,
        top: `${arenaH - 10}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dy': `${rand(-80, -30)}px`,
        '--dx': `${rand(-20, 20)}px`,
        animationDelay: `${rand(0, 300)}ms`,
      });
      particles.push(el);
    }

    // Brown impact at defender
    const impact = createParticle('vfx-ground-impact', {
      left: `${to.x}px`,
      top: `${to.y + 20}px`,
    });
    particles.push(impact);

    cleanupAfter(particles, 1100);
    return delay(750);
  }

  /**
   * 🥊 FIGHTING — Similar to normal but more intense
   */
  async function fightingEffect(from, to) {
    const particles = [];

    screenShake('hard', 400);
    particles.push(screenTint('rgba(192, 48, 40, 0.2)', 300, 0.2));

    // Impact burst
    const burst = createParticle('vfx-fighting-burst', {
      left: `${to.x}px`,
      top: `${to.y}px`,
    });
    particles.push(burst);

    // Speed lines from attacker to defender
    const lineCount = pCount(6);
    for (let i = 0; i < lineCount; i++) {
      const el = createParticle('vfx-speed-line', {
        left: `${from.x}px`,
        top: `${from.y + rand(-30, 30)}px`,
        '--dx': `${to.x - from.x}px`,
        '--dy': `${rand(-10, 10)}px`,
        animationDelay: `${i * 30}ms`,
      });
      particles.push(el);
    }

    // Star sparks on impact
    setTimeout(() => {
      const sparkCount = pCount(8);
      for (let i = 0; i < sparkCount; i++) {
        const size = rand(6, 14) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(25, 60);

        const el = createParticle('vfx-star-spark vfx-fighting-spark', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }
    }, 200);

    cleanupAfter(particles, 900);
    return delay(650);
  }

  /**
   * 🔮 PSYCHIC — Pink energy waves + mind blast
   */
  async function psychicEffect(from, to) {
    const particles = [];

    particles.push(screenTint('rgba(248, 88, 136, 0.2)', 400, 0.2));

    // Psychic waves
    for (let i = 0; i < 4; i++) {
      const el = createParticle('vfx-psychic-wave', {
        left: `${from.x}px`,
        top: `${from.y}px`,
        '--dx': `${to.x - from.x}px`,
        '--dy': `${to.y - from.y}px`,
        animationDelay: `${i * 80}ms`,
      });
      particles.push(el);
    }

    // Mind blast on impact
    setTimeout(() => {
      const blastCount = pCount(8);
      for (let i = 0; i < blastCount; i++) {
        const size = rand(5, 12) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(20, 55);

        const el = createParticle('vfx-psychic-burst', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }
    }, 350);

    cleanupAfter(particles, 1000);
    return delay(700);
  }

  /**
   * 🪲 BUG — Swarm particles
   */
  async function bugEffect(from, to) {
    const particles = [];

    const count = pCount(10);
    for (let i = 0; i < count; i++) {
      const size = rand(5, 10) * particleScale;
      const dx = to.x - from.x + rand(-30, 30);
      const dy = to.y - from.y + rand(-30, 30);

      const el = createParticle('vfx-bug-particle', {
        left: `${from.x + rand(-15, 15)}px`,
        top: `${from.y + rand(-15, 15)}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${dx}px`,
        '--dy': `${dy}px`,
        animationDelay: `${i * 40}ms`,
      });
      particles.push(el);
    }

    cleanupAfter(particles, 900);
    return delay(650);
  }

  /**
   * 🪨 ROCK — Rock chunks + dust
   */
  async function rockEffect(from, to) {
    const particles = [];

    screenShake('medium', 400);

    const rockCount = pCount(8);
    for (let i = 0; i < rockCount; i++) {
      const size = rand(10, 22) * particleScale;
      const dx = to.x - from.x + rand(-20, 20);
      const dy = to.y - from.y + rand(-15, 15);

      const el = createParticle('vfx-rock-chunk', {
        left: `${from.x + rand(-10, 10)}px`,
        top: `${from.y + rand(-10, 10)}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${dx}px`,
        '--dy': `${dy}px`,
        animationDelay: `${i * 40}ms`,
      });
      particles.push(el);
    }

    // Debris scatter on impact
    setTimeout(() => {
      const debrisCount = pCount(6);
      for (let i = 0; i < debrisCount; i++) {
        const size = rand(4, 10) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(20, 50);

        const el = createParticle('vfx-rock-debris', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }
    }, 300);

    cleanupAfter(particles, 1000);
    return delay(700);
  }

  /**
   * 🧚 FAIRY — Sparkle + pink stars
   */
  async function fairyEffect(from, to) {
    const particles = [];

    particles.push(screenTint('rgba(238, 153, 172, 0.2)', 400, 0.2));

    // Sparkle trail
    const sparkleCount = pCount(12);
    for (let i = 0; i < sparkleCount; i++) {
      const t = i / sparkleCount;
      const cx = lerp(from.x, to.x, t) + rand(-20, 20);
      const cy = lerp(from.y, to.y, t) + rand(-20, 20);
      const size = rand(5, 12) * particleScale;

      const el = createParticle('vfx-fairy-sparkle', {
        left: `${cx}px`,
        top: `${cy}px`,
        width: `${size}px`,
        height: `${size}px`,
        animationDelay: `${t * 400}ms`,
      });
      particles.push(el);
    }

    // Pink star burst on impact
    setTimeout(() => {
      const starCount = pCount(8);
      for (let i = 0; i < starCount; i++) {
        const size = rand(6, 14) * particleScale;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(20, 55);

        const el = createParticle('vfx-fairy-star', {
          left: `${to.x}px`,
          top: `${to.y}px`,
          width: `${size}px`,
          height: `${size}px`,
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist}px`,
        });
        particles.push(el);
      }
    }, 350);

    cleanupAfter(particles, 1000);
    return delay(700);
  }

  // ==================== GENERIC FALLBACK ====================

  async function genericEffect(from, to) {
    const particles = [];

    // Simple impact burst
    const burstCount = pCount(8);
    for (let i = 0; i < burstCount; i++) {
      const size = rand(5, 12) * particleScale;
      const angle = rand(0, Math.PI * 2);
      const dist = rand(20, 55);

      const el = createParticle('vfx-generic-burst', {
        left: `${to.x}px`,
        top: `${to.y}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--dx': `${Math.cos(angle) * dist}px`,
        '--dy': `${Math.sin(angle) * dist}px`,
      });
      particles.push(el);
    }

    cleanupAfter(particles, 800);
    return delay(600);
  }

  // ==================== TYPE ROUTER ====================

  const TYPE_EFFECTS = {
    fire: fireEffect,
    water: waterEffect,
    electric: electricEffect,
    grass: grassEffect,
    ghost: ghostEffect,
    normal: normalEffect,
    ice: iceEffect,
    dragon: dragonEffect,
    poison: poisonEffect,
    dark: darkEffect,
    steel: steelEffect,
    flying: flyingEffect,
    ground: groundEffect,
    fighting: fightingEffect,
    psychic: psychicEffect,
    bug: bugEffect,
    rock: rockEffect,
    fairy: fairyEffect,
  };

  // ==================== PUBLIC API ====================

  /**
   * Play attack effect
   * @param {string} moveType - Pokemon type (fire, water, etc.)
   * @param {string} attackerSide - 'player' or 'opponent'
   * @param {string} defenderSide - 'player' or 'opponent'
   * @returns {Promise} resolves when animation completes
   */
  async function play(moveType, attackerSide, defenderSide) {
    const layer = getEffectsLayer();
    if (!layer) {
      console.warn('[effects] No effects layer found');
      return;
    }

    const type = (moveType || 'normal').toLowerCase();
    const from = getSpritePos(attackerSide);
    const to = getSpritePos(defenderSide);

    const effectFn = TYPE_EFFECTS[type] || genericEffect;

    try {
      // Ice effect needs defenderSide for frost tint
      if (type === 'ice') {
        await effectFn(from, to, defenderSide);
      } else {
        await effectFn(from, to);
      }
    } catch (err) {
      console.warn('[effects] Effect error:', err);
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return { play };
})();
