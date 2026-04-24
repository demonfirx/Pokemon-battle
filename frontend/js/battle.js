/**
 * battle.js — Battle UI: HP bar updates, move buttons, attack animations,
 *             damage numbers, effectiveness text, win/lose flow
 */

const Battle = (() => {
  // State
  let battleId = null;
  let playerPokemon = null;
  let opponentPokemon = null;
  let playerCurrentHp = 0;
  let playerMaxHp = 0;
  let opponentCurrentHp = 0;
  let opponentMaxHp = 0;
  let isAnimating = false;
  let getSpriteUrl = null;
  let spriteIds = {};
  let typewriterTimeout = null; // track active typewriter

  // DOM refs (cached on init)
  const $ = (id) => document.getElementById(id);

  /**
   * Initialize battle screen with data from API
   */
  function init(battleState, playerData, spriteUrlFn, spriteIdMap) {
    getSpriteUrl = spriteUrlFn;
    spriteIds = spriteIdMap;
    battleId = battleState.battleId || battleState.id;

    // Extract player & opponent from battle state
    const player = battleState.player || battleState.playerPokemon || {};
    const opponent = battleState.opponent || battleState.opponentPokemon || battleState.cpu || {};

    // Build pokemon objects with all needed info
    playerPokemon = {
      id: player.id || playerData.id,
      name: player.name || playerData.name,
      type: player.type || playerData.type || 'normal',
      moves: player.moves || playerData.moves || [],
      spriteId: spriteIds[(player.name || playerData.name || '').toLowerCase()] || player.id || playerData.id,
    };

    opponentPokemon = {
      id: opponent.id,
      name: opponent.name,
      type: opponent.type || 'normal',
      spriteId: spriteIds[(opponent.name || '').toLowerCase()] || opponent.id,
    };

    // HP
    playerMaxHp = player.hp || player.maxHp || playerData.stats?.hp || playerData.hp || 100;
    playerCurrentHp = player.currentHp ?? player.hp ?? playerMaxHp;
    opponentMaxHp = opponent.hp || opponent.maxHp || 100;
    opponentCurrentHp = opponent.currentHp ?? opponent.hp ?? opponentMaxHp;

    // Set up UI
    setupBattleUI();
    renderMoves(playerPokemon.moves);
    setMessage(`A wild ${opponentPokemon.name} appeared!`);

    // Reset animations
    $('player-sprite').className = 'pokemon-sprite player-sprite';
    $('opponent-sprite').className = 'pokemon-sprite opponent-sprite';
    isAnimating = false;

    // Init PP bar
    updatePpBar();
  }

  /**
   * Set up battle UI elements
   */
  function setupBattleUI() {
    // Names
    $('player-name').textContent = playerPokemon.name;
    $('opponent-name').textContent = opponentPokemon.name;

    // Sprites
    const playerSpriteUrl = getSpriteUrl(playerPokemon, true); // back sprite for player
    const opponentSpriteUrl = getSpriteUrl(opponentPokemon, false); // front sprite for opponent

    $('player-sprite').src = playerSpriteUrl;
    // Fallback: if back sprite fails, use front sprite flipped (CSS handles flip)
    $('player-sprite').onerror = function () {
      this.src = getSpriteUrl(playerPokemon, false);
    };
    $('opponent-sprite').src = opponentSpriteUrl;

    // HP bars
    updateHpBar('player', playerCurrentHp, playerMaxHp);
    updateHpBar('opponent', opponentCurrentHp, opponentMaxHp);
  }

  /**
   * Update PP bar in player info panel
   */
  function updatePpBar() {
    if (!playerPokemon?._battleMoves) return;
    const moves = playerPokemon._battleMoves;
    let totalCurrent = 0;
    let totalMax = 0;
    moves.forEach(m => {
      totalCurrent += (m.currentPp ?? m.pp ?? 0);
      totalMax += (m.maxPp ?? m.pp ?? 15);
    });
    const percent = totalMax > 0 ? Math.max(0, Math.min(100, (totalCurrent / totalMax) * 100)) : 0;
    const bar = $('player-pp-bar');
    const text = $('player-pp-text');
    if (bar) {
      bar.style.width = `${percent}%`;
      if (percent > 50) bar.style.backgroundColor = '#64b5f6';
      else if (percent > 20) bar.style.backgroundColor = '#ffa726';
      else bar.style.backgroundColor = '#ef5350';
    }
    if (text) text.textContent = `${totalCurrent} / ${totalMax}`;
  }

  /**
   * Update HP bar visuals
   */
  function updateHpBar(who, current, max) {
    const percent = Math.max(0, Math.min(100, (current / max) * 100));
    const bar = $(`${who}-hp-bar`);
    const text = $(`${who}-hp-text`);

    bar.style.width = `${percent}%`;

    // Color based on HP percentage
    if (percent > 50) {
      bar.style.backgroundColor = 'var(--hp-green)';
    } else if (percent > 20) {
      bar.style.backgroundColor = 'var(--hp-yellow)';
    } else {
      bar.style.backgroundColor = 'var(--hp-red)';
    }

    text.textContent = `${Math.max(0, Math.ceil(current))} / ${max}`;
  }

  /**
   * Render move buttons — tracks current PP locally
   */
  function renderMoves(moves) {
    const grid = $('move-buttons');
    grid.innerHTML = '';

    if (!moves || moves.length === 0) {
      moves = [{ id: 'struggle', name: 'Struggle', type: 'normal', pp: 99 }];
    }

    // Initialize currentPp on first render
    moves.forEach(move => {
      if (move.currentPp === undefined) {
        move.currentPp = move.pp || 15;
      }
      if (move.maxPp === undefined) {
        move.maxPp = move.pp || 15;
      }
    });

    // Store moves reference for PP tracking
    playerPokemon._battleMoves = moves;

    moves.forEach(move => {
      const btn = document.createElement('button');
      const moveType = (move.type || 'normal').toLowerCase();
      btn.className = `move-btn move-${moveType}`;
      btn.dataset.moveId = move.id || move.name;

      const noPp = move.currentPp <= 0;
      btn.innerHTML = `
        ${move.name}
        <span class="move-pp">PP ${move.currentPp}/${move.maxPp}</span>
      `;
      if (noPp) btn.disabled = true;
      btn.addEventListener('click', () => handleMoveClick(move));
      grid.appendChild(btn);
    });
  }

  /**
   * Handle move button click
   */
  async function handleMoveClick(move) {
    if (isAnimating) return;
    if (move.currentPp !== undefined && move.currentPp <= 0) return;
    isAnimating = true;
    disableMoves(true);

    try {
      // Decrement PP locally
      if (move.currentPp !== undefined) {
        move.currentPp = Math.max(0, move.currentPp - 1);
      }

      // Call API
      const result = await API.executeMove(battleId, move.id || move.name);

      // Process turn results
      await processTurnResult(result, move);

      // Re-render moves to update PP display
      if (playerPokemon._battleMoves) {
        renderMoves(playerPokemon._battleMoves);
      }
      updatePpBar();
    } catch (err) {
      console.error('Move failed:', err);
      setMessage(`Error: ${err.message}`);
      isAnimating = false;
      disableMoves(false);
    }
  }

  /**
   * Parse turn log from backend to extract damage and effectiveness
   */
  function parseTurnLog(turnLog, attackerName) {
    const info = { damage: 0, effectiveness: 1, missed: false, moveName: '' };
    if (!turnLog || !Array.isArray(turnLog)) return info;

    for (const line of turnLog) {
      // Extract move name: "Pikachu used Thunderbolt!"
      const moveMatch = line.match(new RegExp(`${attackerName} used (.+)!`));
      if (moveMatch) info.moveName = moveMatch[1];

      // Missed
      if (line.includes('missed')) info.missed = true;

      // Immune / no effect
      if (line.includes("doesn't affect")) {
        info.damage = 0;
        info.effectiveness = 0;
      }

      // Super effective
      if (line.includes('super effective')) {
        info.effectiveness = 2;
        const dmgMatch = line.match(/(\d+) damage/);
        if (dmgMatch) info.damage = parseInt(dmgMatch[1]);
      }

      // Not very effective
      if (line.includes('not very effective')) {
        info.effectiveness = 0.5;
        const dmgMatch = line.match(/(\d+) damage/);
        if (dmgMatch) info.damage = parseInt(dmgMatch[1]);
      }

      // Neutral damage: "52 damage."
      if (line.match(/^\d+ damage/) && info.effectiveness === 1) {
        const dmgMatch = line.match(/(\d+) damage/);
        if (dmgMatch) info.damage = parseInt(dmgMatch[1]);
      }
    }
    return info;
  }

  /**
   * Process the result of a turn from the API
   * Backend returns: { player, cpu, turnLog, playerMove, cpuMove, playerFirst, status, winner }
   */
  async function processTurnResult(result, playerMove) {
    const turnLog = result.turnLog || [];
    const playerFirst = result.playerFirst !== undefined ? result.playerFirst : true;

    // Parse turn log to extract damage info for each side
    const playerAttackInfo = parseTurnLog(turnLog, playerPokemon.name);
    const cpuAttackInfo = parseTurnLog(turnLog, opponentPokemon.name);

    // Get new HP values from backend (authoritative)
    const newPlayerHp = result.player?.currentHp ?? playerCurrentHp;
    const newOpponentHp = result.cpu?.currentHp ?? opponentCurrentHp;

    // Calculate actual damage dealt from HP changes
    const actualPlayerDmgTaken = playerCurrentHp - newPlayerHp;
    const actualOpponentDmgTaken = opponentCurrentHp - newOpponentHp;

    // Use parsed damage or fall back to HP diff
    if (playerAttackInfo.damage === 0 && actualOpponentDmgTaken > 0) {
      playerAttackInfo.damage = actualOpponentDmgTaken;
    }
    if (cpuAttackInfo.damage === 0 && actualPlayerDmgTaken > 0) {
      cpuAttackInfo.damage = actualPlayerDmgTaken;
    }

    // Get move info
    const cpuMoveData = result.cpuMove || {};
    const cpuMoveName = cpuAttackInfo.moveName || cpuMoveData.name || 'Attack';

    // Determine attack order
    const firstAttacker = playerFirst ? 'player' : 'opponent';
    const secondAttacker = playerFirst ? 'opponent' : 'player';

    const firstInfo = playerFirst ? playerAttackInfo : cpuAttackInfo;
    const secondInfo = playerFirst ? cpuAttackInfo : playerAttackInfo;
    const firstMove = playerFirst ? playerMove : { type: cpuMoveData.type || opponentPokemon.type };
    const secondMove = playerFirst ? { type: cpuMoveData.type || opponentPokemon.type } : playerMove;
    const firstName = playerFirst ? playerPokemon.name : opponentPokemon.name;
    const secondName = playerFirst ? opponentPokemon.name : playerPokemon.name;

    // --- First attack ---
    setMessage(`${firstName} used ${firstInfo.moveName || firstMove.name || 'Attack'}!`);
    await delay(400);
    await animateAttack(firstAttacker, firstInfo, firstMove);

    // Update HP for first attack's target
    if (playerFirst) {
      await animateHpChange('opponent', opponentCurrentHp, Math.max(0, newOpponentHp), opponentMaxHp);
      opponentCurrentHp = Math.max(0, newOpponentHp);
    } else {
      await animateHpChange('player', playerCurrentHp, Math.max(0, newPlayerHp), playerMaxHp);
      playerCurrentHp = Math.max(0, newPlayerHp);
    }

    // Check if first attack KO'd
    if (result.status === 'finished' && playerFirst && newOpponentHp <= 0) {
      await animateFaint('opponent');
      setMessage(`${opponentPokemon.name} fainted!`);
      await delay(1500);
      App.showResult(true, playerPokemon, opponentPokemon);
      return;
    }
    if (result.status === 'finished' && !playerFirst && newPlayerHp <= 0) {
      await animateFaint('player');
      setMessage(`${playerPokemon.name} fainted!`);
      await delay(1500);
      App.showResult(false, playerPokemon, opponentPokemon);
      return;
    }

    // --- Second attack ---
    await delay(600);
    setMessage(`${secondName} used ${secondInfo.moveName || secondMove.name || 'Attack'}!`);
    await delay(400);
    await animateAttack(secondAttacker, secondInfo, secondMove);

    // Update HP for second attack's target
    if (playerFirst) {
      await animateHpChange('player', playerCurrentHp, Math.max(0, newPlayerHp), playerMaxHp);
      playerCurrentHp = Math.max(0, newPlayerHp);
    } else {
      await animateHpChange('opponent', opponentCurrentHp, Math.max(0, newOpponentHp), opponentMaxHp);
      opponentCurrentHp = Math.max(0, newOpponentHp);
    }

    // Check if second attack KO'd
    if (result.status === 'finished') {
      if (result.winner === 'player') {
        await animateFaint('opponent');
        setMessage(`${opponentPokemon.name} fainted!`);
        await delay(1500);
        App.showResult(true, playerPokemon, opponentPokemon);
      } else {
        await animateFaint('player');
        setMessage(`${playerPokemon.name} fainted!`);
        await delay(1500);
        App.showResult(false, playerPokemon, opponentPokemon);
      }
      return;
    }

    // Don't overwrite local PP-tracked moves from backend response

    // Ready for next turn
    await delay(300);
    setMessage('What will you do?');
    isAnimating = false;
    disableMoves(false);
  }

  /**
   * Animate an attack
   */
  async function animateAttack(attacker, result, move) {
    const isPlayer = attacker === 'player';
    const attackerSprite = $(isPlayer ? 'player-sprite' : 'opponent-sprite');
    const targetSprite = $(isPlayer ? 'opponent-sprite' : 'player-sprite');
    const targetDmgEl = $(isPlayer ? 'opponent-damage-number' : 'player-damage-number');

    const moveType = (move?.type || result?.move?.type || result?.moveType || 'normal').toLowerCase();
    const damage = result?.damage ?? 0;
    const effectiveness = result?.effectiveness || result?.typeEffectiveness || 1;

    // 1. Attacker lunges forward
    const attackClass = isPlayer ? 'sprite-attack-right' : 'sprite-attack-left';
    attackerSprite.classList.add(attackClass);

    await delay(300);

    // 2. Screen flash based on move type
    showFlash(moveType);

    await delay(200);

    // 3. Target gets hit
    targetSprite.classList.add('sprite-hit');

    // 4. Show damage number
    showDamageNumber(targetDmgEl, damage, result?.missed);

    // 5. Show effectiveness text
    if (effectiveness > 1) {
      showEffectivenessText("It's super effective!", true);
    } else if (effectiveness < 1 && effectiveness > 0) {
      showEffectivenessText("It's not very effective...", false);
    }

    await delay(600);

    // Cleanup animations
    attackerSprite.classList.remove(attackClass);
    targetSprite.classList.remove('sprite-hit');
  }

  /**
   * Show screen flash for attack type
   */
  function showFlash(type) {
    const overlay = $('flash-overlay');
    overlay.className = 'flash-overlay';
    // Force reflow to restart animation
    void overlay.offsetWidth;
    overlay.classList.add(`flash-${type}`);

    setTimeout(() => {
      overlay.className = 'flash-overlay hidden';
    }, 500);
  }

  /**
   * Show floating damage number
   */
  function showDamageNumber(element, damage, missed) {
    element.className = 'damage-number';

    if (missed) {
      element.textContent = 'MISS';
      element.classList.add('miss');
    } else if (damage === 0) {
      element.textContent = 'No effect';
      element.classList.add('miss');
    } else {
      element.textContent = `-${damage}`;
    }

    // Force reflow
    void element.offsetWidth;
    element.classList.add('show');

    setTimeout(() => {
      element.className = 'damage-number hidden';
    }, 1200);
  }

  /**
   * Show effectiveness text in the arena
   */
  function showEffectivenessText(text, isSuper) {
    const arena = document.querySelector('.battle-arena');
    const el = document.createElement('div');
    el.className = `effectiveness-text ${isSuper ? 'super-effective' : 'not-effective'}`;
    el.textContent = text;
    arena.appendChild(el);

    setTimeout(() => el.remove(), 1500);
  }

  /**
   * Animate HP bar change smoothly
   */
  function animateHpChange(who, fromHp, toHp, maxHp) {
    return new Promise(resolve => {
      const duration = 800;
      const startTime = performance.now();

      function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Ease out
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentHp = fromHp + (toHp - fromHp) * eased;

        updateHpBar(who, currentHp, maxHp);

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          updateHpBar(who, toHp, maxHp);
          resolve();
        }
      }

      requestAnimationFrame(tick);
    });
  }

  /**
   * Animate pokemon fainting
   */
  async function animateFaint(who) {
    const sprite = $(who === 'player' ? 'player-sprite' : 'opponent-sprite');
    sprite.classList.add('sprite-faint');
    await delay(800);
  }

  /**
   * Set battle message with typewriter-ish feel
   * Cancels any previous typewriter before starting new one
   */
  function setMessage(text) {
    return new Promise(resolve => {
      const el = $('battle-message');

      // Cancel previous typewriter
      if (typewriterTimeout) {
        clearTimeout(typewriterTimeout);
        typewriterTimeout = null;
      }

      el.textContent = '';
      el.classList.add('typewriter');

      let i = 0;
      const speed = 25;

      function type() {
        if (i < text.length) {
          el.textContent += text.charAt(i);
          i++;
          typewriterTimeout = setTimeout(type, speed);
        } else {
          el.classList.remove('typewriter');
          typewriterTimeout = null;
          resolve();
        }
      }

      type();
    });
  }

  /**
   * Enable/disable move buttons
   */
  function disableMoves(disabled) {
    document.querySelectorAll('.move-btn').forEach(btn => {
      btn.disabled = disabled;
    });
  }

  /**
   * Utility: delay
   */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API
  return {
    init,
  };
})();
