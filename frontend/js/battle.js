/**
 * battle.js — Battle UI: HP bar updates, move buttons, attack animations,
 *             damage numbers, effectiveness text, win/lose flow,
 *             status conditions, critical hits, STAB, battle log,
 *             turn order, type effectiveness popups, sound effects
 *
 * Performance: debounced move clicks, cached DOM refs, DocumentFragment for log,
 *              requestAnimationFrame for HP animations, object pool for damage numbers
 */

/* === SECTION: Battle Module === */
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
  let typewriterTimeout = null;
  let turnNumber = 0;
  let moveClickPending = false; // Debounce guard for move clicks

  // Status tracking
  let playerStatus = null;  // 'brn', 'par', 'psn', 'slp', 'frz', 'cnf' or null
  let opponentStatus = null;

  // Stat stages tracking
  let playerStatStages = { attack: 0, defense: 0, speed: 0, spAtk: 0, spDef: 0 };
  let opponentStatStages = { attack: 0, defense: 0, speed: 0, spAtk: 0, spDef: 0 };

  // Status display map
  const STATUS_DISPLAY = {
    brn: { label: 'BRN', emoji: '🔥', css: 'status-brn' },
    par: { label: 'PAR', emoji: '⚡', css: 'status-par' },
    psn: { label: 'PSN', emoji: '☠️', css: 'status-psn' },
    slp: { label: 'SLP', emoji: '💤', css: 'status-slp' },
    frz: { label: 'FRZ', emoji: '❄️', css: 'status-frz' },
    cnf: { label: 'CNF', emoji: '🌀', css: 'status-cnf' },
  };

  // Move category data (from RESEARCH-DEEP.md)
  const MOVE_CATEGORIES = {
    'thunderbolt': 'special', 'quick attack': 'physical', 'iron tail': 'physical',
    'electro ball': 'special', 'flamethrower': 'special', 'air slash': 'special',
    'dragon claw': 'physical', 'fire punch': 'physical', 'hydro pump': 'special',
    'ice beam': 'special', 'bite': 'physical', 'water pulse': 'special',
    'solar beam': 'special', 'sludge bomb': 'special', 'razor leaf': 'physical',
    'body slam': 'physical', 'shadow ball': 'special', 'dark pulse': 'special',
    'earthquake': 'physical', 'ice punch': 'physical', 'crunch': 'physical',
    'swords dance': 'status', 'iron defense': 'status', 'agility': 'status',
    'growl': 'status', 'scary face': 'status', 'tail whip': 'status',
    'struggle': 'physical',
  };

  const CATEGORY_ICONS = {
    physical: '⚔️',
    special: '🔮',
    status: '📊',
  };

  // DOM refs — use DOMCache for frequently accessed elements
  const $ = (id) => DOMCache.get(id) || document.getElementById(id);

  /**
   * Initialize battle screen with data from API
   */
  function init(battleState, playerData, spriteUrlFn, spriteIdMap) {
    getSpriteUrl = spriteUrlFn;
    spriteIds = spriteIdMap;
    battleId = battleState.battleId || battleState.id;
    turnNumber = 0;

    const player = battleState.player || battleState.playerPokemon || {};
    const opponent = battleState.opponent || battleState.opponentPokemon || battleState.cpu || {};

    playerPokemon = {
      id: player.id || playerData.id,
      name: player.name || playerData.name,
      type: player.type || playerData.type || 'normal',
      types: player.types || playerData.types || [player.type || playerData.type || 'normal'],
      moves: player.moves || playerData.moves || [],
      spriteId: spriteIds[(player.name || playerData.name || '').toLowerCase()] || player.id || playerData.id,
      ability: player.ability || playerData.ability || null,
    };

    opponentPokemon = {
      id: opponent.id,
      name: opponent.name,
      type: opponent.type || 'normal',
      types: opponent.types || [opponent.type || 'normal'],
      spriteId: spriteIds[(opponent.name || '').toLowerCase()] || opponent.id,
      ability: opponent.ability || null,
    };

    // Ensure types is always an array
    if (typeof playerPokemon.types === 'string') playerPokemon.types = [playerPokemon.types];
    if (typeof opponentPokemon.types === 'string') opponentPokemon.types = [opponentPokemon.types];

    // HP
    playerMaxHp = player.hp || player.maxHp || playerData.stats?.hp || playerData.hp || 100;
    playerCurrentHp = player.currentHp ?? player.hp ?? playerMaxHp;
    opponentMaxHp = opponent.hp || opponent.maxHp || 100;
    opponentCurrentHp = opponent.currentHp ?? opponent.hp ?? opponentMaxHp;

    // Reset status
    playerStatus = null;
    opponentStatus = null;
    updateStatusBadge('player', null);
    updateStatusBadge('opponent', null);

    // Set up UI
    setupBattleUI();
    renderMoves(playerPokemon.moves);
    setMessage(`A wild ${opponentPokemon.name} appeared!`);

    // Reset animations
    $('player-sprite').className = 'pokemon-sprite player-sprite';
    $('opponent-sprite').className = 'pokemon-sprite opponent-sprite';
    isAnimating = false;

    // Reset stat stages
    playerStatStages = { attack: 0, defense: 0, speed: 0, spAtk: 0, spDef: 0 };
    opponentStatStages = { attack: 0, defense: 0, speed: 0, spAtk: 0, spDef: 0 };
    renderStatStages('player', playerStatStages);
    renderStatStages('opponent', opponentStatStages);

    // Init PP bar
    updatePpBar();

    // Clear battle log
    clearBattleLog();
    addBattleLogEntry(`A wild ${opponentPokemon.name} appeared!`, 'info');

    // Setup log toggle
    setupLogToggle();

    // Collapse battle log by default on mobile
    if (window.innerWidth <= 480) {
      const log = $('battle-log');
      if (log) log.classList.add('collapsed');
    }

    // Init audio on first interaction
    AudioManager.ensureInit();
  }

  /**
   * Set up battle UI elements
   */
  function setupBattleUI() {
    $('player-name').textContent = playerPokemon.name;
    $('opponent-name').textContent = opponentPokemon.name;

    // Type badges in battle info bars
    renderBattleTypeBadges('player', playerPokemon.types);
    renderBattleTypeBadges('opponent', opponentPokemon.types);

    // Sprites — use animated GIFs with fallback
    const playerSpriteUrl = getSpriteUrl(playerPokemon, true);
    const opponentSpriteUrl = getSpriteUrl(opponentPokemon, false);

    $('player-sprite').src = playerSpriteUrl;
    $('player-sprite').onerror = function () {
      // Fallback to static
      const staticUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${playerPokemon.spriteId}.png`;
      if (this.src !== staticUrl) {
        this.src = staticUrl;
      }
    };
    $('opponent-sprite').src = opponentSpriteUrl;
    $('opponent-sprite').onerror = function () {
      const staticUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${opponentPokemon.spriteId}.png`;
      if (this.src !== staticUrl) {
        this.src = staticUrl;
      }
    };

    // HP bars
    updateHpBar('player', playerCurrentHp, playerMaxHp);
    updateHpBar('opponent', opponentCurrentHp, opponentMaxHp);
  }

  /**
   * Render type badges in battle info bar
   */
  function renderBattleTypeBadges(who, types) {
    const container = $(`${who}-type-badges`);
    if (!container) return;
    container.innerHTML = '';
    (types || []).forEach(t => {
      const badge = document.createElement('span');
      badge.className = `battle-type-badge type-${t.toLowerCase()}`;
      badge.textContent = t.toUpperCase();
      container.appendChild(badge);
    });
  }

  /**
   * Update status condition badge
   */
  function updateStatusBadge(who, status) {
    const badge = $(`${who}-status-badge`);
    if (!badge) return;

    if (!status) {
      badge.classList.add('hidden');
      badge.className = 'status-badge hidden';
      badge.textContent = '';
      return;
    }

    const info = STATUS_DISPLAY[status.toLowerCase()];
    if (!info) {
      badge.classList.add('hidden');
      return;
    }

    badge.className = `status-badge ${info.css}`;
    badge.textContent = `${info.label} ${info.emoji}`;
    badge.classList.remove('hidden');
  }

  /**
   * Show floating status text
   */
  function showFloatingStatusText(text) {
    const el = $('floating-status-text');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    // Force reflow
    void el.offsetWidth;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    el.classList.remove('hidden');

    setTimeout(() => {
      el.classList.add('hidden');
    }, 2000);
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
   * Render move buttons with category icons
   * Uses DocumentFragment for batch DOM insertion
   */
  function renderMoves(moves) {
    const grid = $('move-buttons');
    grid.innerHTML = '';

    if (!moves || moves.length === 0) {
      moves = [{ id: 'struggle', name: 'Struggle', type: 'normal', pp: 99 }];
    }

    moves.forEach(move => {
      if (move.currentPp === undefined) {
        move.currentPp = move.pp || 15;
      }
      if (move.maxPp === undefined) {
        move.maxPp = move.pp || 15;
      }
    });

    playerPokemon._battleMoves = moves;

    const fragment = createFragment();

    moves.forEach(move => {
      const btn = document.createElement('button');
      const moveType = (move.type || 'normal').toLowerCase();
      const moveName = (move.name || '').toLowerCase();
      const category = move.category || MOVE_CATEGORIES[moveName] || 'physical';
      const catIcon = CATEGORY_ICONS[category] || '';

      btn.className = `move-btn move-${moveType} move-cat-${category}`;
      btn.dataset.moveId = move.id || move.name;

      const noPp = move.currentPp <= 0;

      // Use textContent + createElement where possible to minimize innerHTML
      const iconSpan = document.createElement('span');
      iconSpan.className = 'move-category-icon';
      iconSpan.textContent = catIcon;
      btn.appendChild(iconSpan);
      btn.appendChild(document.createTextNode(` ${move.name}`));

      if (category === 'status') {
        const statusLabel = document.createElement('span');
        statusLabel.className = 'move-status-label';
        statusLabel.textContent = 'STATUS';
        btn.appendChild(statusLabel);
      }

      const ppSpan = document.createElement('span');
      ppSpan.className = 'move-pp';
      ppSpan.textContent = `PP ${move.currentPp}/${move.maxPp}`;
      btn.appendChild(ppSpan);

      if (noPp) btn.disabled = true;

      btn.addEventListener('click', () => {
        AudioManager.buttonClick();
        handleMoveClick(move);
      });
      fragment.appendChild(btn);
    });

    grid.appendChild(fragment);
  }

  /**
   * Handle move button click — debounced to prevent double-fire
   */
  async function handleMoveClick(move) {
    if (isAnimating || moveClickPending) return;
    if (move.currentPp !== undefined && move.currentPp <= 0) return;
    isAnimating = true;
    moveClickPending = true;
    disableMoves(true);

    try {
      if (move.currentPp !== undefined) {
        move.currentPp = Math.max(0, move.currentPp - 1);
      }

      const result = await API.executeMove(battleId, move.id || move.name);

      await processTurnResult(result, move);

      parseAndApplyStatChanges(result.turnLog || []);

      if (playerPokemon._battleMoves) {
        renderMoves(playerPokemon._battleMoves);
      }
      updatePpBar();
    } catch (err) {
      if (DEBUG) console.error('Move failed:', err);
      setMessage(`Error: ${err.message}`);
      isAnimating = false;
      disableMoves(false);
    } finally {
      moveClickPending = false;
    }
  }

  /**
   * Parse turn log from backend to extract damage, effectiveness, critical, STAB
   */
  function parseTurnLog(turnLog, attackerName) {
    const info = {
      damage: 0,
      effectiveness: 1,
      missed: false,
      moveName: '',
      critical: false,
      stab: false,
      statusApplied: null,
      statusDamage: false,
      flinched: false,
      statChanges: [],
    };
    if (!turnLog || !Array.isArray(turnLog)) return info;

    for (const line of turnLog) {
      const lower = line.toLowerCase();

      // Extract move name
      const moveMatch = line.match(new RegExp(`${attackerName} used (.+)!`, 'i'));
      if (moveMatch) info.moveName = moveMatch[1];

      // Missed
      if (lower.includes('missed') || lower.includes('attack missed')) info.missed = true;

      // Immune / no effect
      if (lower.includes("doesn't affect") || lower.includes('no effect') || lower.includes('had no effect')) {
        info.damage = 0;
        info.effectiveness = 0;
      }

      // Super effective
      if (lower.includes('super effective')) {
        info.effectiveness = 2;
        const dmgMatch = line.match(/(\d+)\s*damage/i);
        if (dmgMatch) info.damage = parseInt(dmgMatch[1]);
      }

      // Not very effective
      if (lower.includes('not very effective')) {
        info.effectiveness = 0.5;
        const dmgMatch = line.match(/(\d+)\s*damage/i);
        if (dmgMatch) info.damage = parseInt(dmgMatch[1]);
      }

      // Critical hit
      if (lower.includes('critical hit')) {
        info.critical = true;
      }

      // STAB
      if (lower.includes('stab') || lower.includes('same type attack bonus')) {
        info.stab = true;
      }

      // Status conditions applied
      if (lower.includes('is paralyzed') || lower.includes('was paralyzed')) {
        info.statusApplied = 'par';
      }
      if (lower.includes('was burned') || lower.includes('is burned')) {
        info.statusApplied = 'brn';
      }
      if (lower.includes('was poisoned') || lower.includes('is poisoned')) {
        info.statusApplied = 'psn';
      }
      if (lower.includes('fell asleep') || lower.includes('is asleep')) {
        info.statusApplied = 'slp';
      }
      if (lower.includes('was frozen') || lower.includes('is frozen')) {
        info.statusApplied = 'frz';
      }
      if (lower.includes('became confused') || lower.includes('is confused')) {
        info.statusApplied = 'cnf';
      }

      // Status damage
      if (lower.includes('hurt by') || lower.includes('burn damage') || lower.includes('poison damage') || lower.includes('took damage from')) {
        info.statusDamage = true;
      }

      // Flinch
      if (lower.includes('flinched')) {
        info.flinched = true;
      }

      // Neutral damage
      if (line.match(/^\d+\s*damage/i) && info.effectiveness === 1) {
        const dmgMatch = line.match(/(\d+)\s*damage/i);
        if (dmgMatch) info.damage = parseInt(dmgMatch[1]);
      }

      // Also catch "dealt X damage" pattern
      const dealtMatch = line.match(/dealt\s+(\d+)\s*damage/i);
      if (dealtMatch && info.damage === 0) {
        info.damage = parseInt(dealtMatch[1]);
      }
    }
    return info;
  }

  /**
   * Parse turn log for stat stage changes
   */
  function parseAndApplyStatChanges(turnLog) {
    if (!turnLog || !Array.isArray(turnLog)) return;

    const statMap = {
      'attack': 'attack', 'atk': 'attack',
      'defense': 'defense', 'def': 'defense',
      'speed': 'speed', 'spd': 'speed',
      'special attack': 'spAtk', 'sp. atk': 'spAtk', 'sp.atk': 'spAtk',
      'special defense': 'spDef', 'sp. def': 'spDef', 'sp.def': 'spDef',
    };

    for (const line of turnLog) {
      const roseMatch = line.match(/(.+?)'s\s+(\w[\w\s.]*?)\s+(sharply\s+)?rose/i);
      const fellMatch = line.match(/(.+?)'s\s+(\w[\w\s.]*?)\s+(sharply\s+)?fell/i);

      if (roseMatch) {
        const pokeName = roseMatch[1].trim();
        const statName = roseMatch[2].trim().toLowerCase();
        const sharply = !!roseMatch[3];
        const delta = sharply ? 2 : 1;
        const stat = statMap[statName];
        if (!stat) continue;

        const isPlayer = pokeName.toLowerCase() === playerPokemon.name.toLowerCase();
        const stages = isPlayer ? playerStatStages : opponentStatStages;
        const who = isPlayer ? 'player' : 'opponent';

        stages[stat] = Math.min(6, stages[stat] + delta);
        renderStatStages(who, stages);
        showStatOverlay(who, 'buff');

        const label = stat.charAt(0).toUpperCase() + stat.slice(1);
        const text = sharply ? `${label} sharply rose!` : `${label} rose!`;
        showStatChangeText(text, true);
      }

      if (fellMatch) {
        const pokeName = fellMatch[1].trim();
        const statName = fellMatch[2].trim().toLowerCase();
        const sharply = !!fellMatch[3];
        const delta = sharply ? 2 : 1;
        const stat = statMap[statName];
        if (!stat) continue;

        const isPlayer = pokeName.toLowerCase() === playerPokemon.name.toLowerCase();
        const stages = isPlayer ? playerStatStages : opponentStatStages;
        const who = isPlayer ? 'player' : 'opponent';

        stages[stat] = Math.max(-6, stages[stat] - delta);
        renderStatStages(who, stages);
        showStatOverlay(who, 'debuff');

        const label = stat.charAt(0).toUpperCase() + stat.slice(1);
        const text = sharply ? `${label} sharply fell!` : `${label} fell!`;
        showStatChangeText(text, false);
      }
    }
  }

  /**
   * Render stat stage badges
   */
  function renderStatStages(who, stages) {
    const container = $(`${who}-stat-stages`);
    if (!container) return;
    container.innerHTML = '';

    const labels = { attack: 'ATK', defense: 'DEF', speed: 'SPD', spAtk: 'SPA', spDef: 'SPD' };

    for (const [stat, stage] of Object.entries(stages)) {
      if (stage === 0) continue;

      const badge = document.createElement('span');
      const isBuff = stage > 0;
      badge.className = `stat-badge ${isBuff ? 'buff' : 'debuff'}`;

      const label = labels[stat] || stat.substring(0, 3).toUpperCase();
      const absStage = Math.abs(stage);
      const arrows = isBuff
        ? '▲'.repeat(Math.min(absStage, 3))
        : '▼'.repeat(Math.min(absStage, 3));

      badge.innerHTML = `${label}<span class="stage-arrows">${arrows}</span>`;
      container.appendChild(badge);
    }
  }

  function showStatOverlay(who, type) {
    const spriteContainer = document.querySelector(
      who === 'player' ? '.player-sprite-container' : '.opponent-sprite-container'
    );
    if (!spriteContainer) return;

    const existing = spriteContainer.querySelector('.buff-overlay, .debuff-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = type === 'buff' ? 'buff-overlay' : 'debuff-overlay';
    spriteContainer.appendChild(overlay);
    setTimeout(() => overlay.remove(), 850);
  }

  function showStatChangeText(text, isBuff) {
    const arena = document.querySelector('.battle-arena');
    const el = document.createElement('div');
    el.className = `effectiveness-text ${isBuff ? 'buff-text' : 'debuff-text'}`;
    el.textContent = text;
    arena.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ==================== BATTLE LOG ====================

  function clearBattleLog() {
    const content = $('battle-log-content');
    if (content) content.innerHTML = '';
  }

  function addBattleLogEntry(text, type = 'info') {
    const content = $('battle-log-content');
    if (!content) return;

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = text;
    content.appendChild(entry);

    // Auto-scroll using requestAnimationFrame to batch with rendering
    requestAnimationFrame(() => {
      content.scrollTop = content.scrollHeight;
    });
  }

  function setupLogToggle() {
    const header = document.querySelector('.battle-log-header');
    const log = $('battle-log');
    if (!header || !log) return;

    // Remove old listeners by cloning
    const newHeader = header.cloneNode(true);
    header.parentNode.replaceChild(newHeader, header);

    newHeader.addEventListener('click', () => {
      log.classList.toggle('collapsed');
    });
  }

  /**
   * Add turn log entries to battle log with color coding
   */
  function addTurnLogEntries(turnLog) {
    if (!turnLog || !Array.isArray(turnLog)) return;

    for (const line of turnLog) {
      const lower = line.toLowerCase();
      let type = 'info';

      if (lower.includes('damage') && !lower.includes('status')) type = 'damage';
      if (lower.includes('heal') || lower.includes('restored')) type = 'heal';
      if (lower.includes('paralyz') || lower.includes('burn') || lower.includes('poison') ||
          lower.includes('asleep') || lower.includes('frozen') || lower.includes('confus')) type = 'status';
      if (lower.includes('super effective')) type = 'super';
      if (lower.includes('not very effective')) type = 'not-effective';
      if (lower.includes('critical hit')) type = 'critical';
      if (lower.includes('no effect') || lower.includes("doesn't affect")) type = 'immune';
      if (lower.includes('fainted')) type = 'faint';
      if (lower.includes('used ')) type = 'move';

      addBattleLogEntry(line, type);
    }
  }

  // ==================== TURN ORDER ====================

  function showTurnOrder(firstName, secondName, playerFirst) {
    const indicator = $('turn-order-indicator');
    if (!indicator) return;

    indicator.innerHTML = `<span class="speed-arrow">▶</span> ${firstName} moves first!`;
    indicator.classList.remove('hidden');

    // Force animation restart
    indicator.style.animation = 'none';
    void indicator.offsetWidth;
    indicator.style.animation = '';

    AudioManager.turnOrder();

    setTimeout(() => {
      indicator.classList.add('hidden');
    }, 1500);
  }

  // ==================== EFFECTIVENESS POPUP ====================

  function showEffectivenessPopup(type, text) {
    const popup = $('effectiveness-popup');
    if (!popup) return;

    popup.innerHTML = '';
    const textEl = document.createElement('div');
    textEl.className = `popup-text ${type}`;

    if (type === 'immune') {
      textEl.innerHTML = `<span class="immune-x">✕</span><br>${text}`;
    } else {
      textEl.textContent = text;
    }

    popup.appendChild(textEl);
    popup.classList.remove('hidden');

    // Screen flash for super effective
    if (type === 'super') {
      const arena = $('battle-arena');
      if (arena) {
        arena.classList.add('screen-flash-super');
        setTimeout(() => arena.classList.remove('screen-flash-super'), 400);
      }
    }

    setTimeout(() => {
      popup.classList.add('hidden');
    }, 1200);
  }

  // ==================== PROCESS TURN RESULT ====================

  /**
   * Process the result of a turn from the API
   * Backend returns: { player, cpu, turnLog, playerMove, cpuMove, playerFirst, status, winner }
   * Enhanced parsing for: critical, effectiveness, stab, status conditions
   */
  async function processTurnResult(result, playerMove) {
    turnNumber++;
    const turnLog = result.turnLog || [];
    const playerFirst = result.playerFirst !== undefined ? result.playerFirst : true;

    // Add turn separator to battle log
    addBattleLogEntry(`--- Turn ${turnNumber} ---`, 'info');

    // Parse turn log for each side
    const playerAttackInfo = parseTurnLog(turnLog, playerPokemon.name);
    const cpuAttackInfo = parseTurnLog(turnLog, opponentPokemon.name);

    // Check for explicit critical/effectiveness from backend
    if (result.playerCritical !== undefined) playerAttackInfo.critical = result.playerCritical;
    if (result.cpuCritical !== undefined) cpuAttackInfo.critical = result.cpuCritical;
    if (result.playerEffectiveness !== undefined) playerAttackInfo.effectiveness = result.playerEffectiveness;
    if (result.cpuEffectiveness !== undefined) cpuAttackInfo.effectiveness = result.cpuEffectiveness;
    if (result.playerStab !== undefined) playerAttackInfo.stab = result.playerStab;
    if (result.cpuStab !== undefined) cpuAttackInfo.stab = result.cpuStab;

    // Get FINAL HP values from backend (after BOTH attacks in this turn)
    const finalPlayerHp = result.player?.currentHp ?? playerCurrentHp;
    const finalOpponentHp = result.cpu?.currentHp ?? opponentCurrentHp;

    // Get status from backend
    const newPlayerStatus = result.player?.status || null;
    const newOpponentStatus = result.cpu?.status || null;

    // Fix damage parsing: use parsed damage from turnLog, fallback to total HP diff
    if (playerAttackInfo.damage === 0) {
      playerAttackInfo.damage = Math.max(0, opponentCurrentHp - finalOpponentHp);
    }
    if (cpuAttackInfo.damage === 0) {
      cpuAttackInfo.damage = Math.max(0, playerCurrentHp - finalPlayerHp);
    }

    // Calculate INTERMEDIATE HP (after first attack only, before second)
    let hpAfterFirst_player = playerCurrentHp;
    let hpAfterFirst_opponent = opponentCurrentHp;
    if (playerFirst) {
      hpAfterFirst_opponent = Math.max(0, opponentCurrentHp - playerAttackInfo.damage);
    } else {
      hpAfterFirst_player = Math.max(0, playerCurrentHp - cpuAttackInfo.damage);
    }

    // Alias for backward compat in rest of function
    const newPlayerHp = finalPlayerHp;
    const newOpponentHp = finalOpponentHp;

    // Get move info
    const cpuMoveData = result.cpuMove || {};
    const cpuMoveName = cpuAttackInfo.moveName || cpuMoveData.name || 'Attack';

    // Determine attack order
    const firstAttacker = playerFirst ? 'player' : 'opponent';
    const secondAttacker = playerFirst ? 'opponent' : 'player';
    const firstInfo = playerFirst ? playerAttackInfo : cpuAttackInfo;
    const secondInfo = playerFirst ? cpuAttackInfo : playerAttackInfo;
    const firstMove = playerFirst ? playerMove : { type: cpuMoveData.type || opponentPokemon.type, name: cpuMoveName };
    const secondMove = playerFirst ? { type: cpuMoveData.type || opponentPokemon.type, name: cpuMoveName } : playerMove;
    const firstName = playerFirst ? playerPokemon.name : opponentPokemon.name;
    const secondName = playerFirst ? opponentPokemon.name : playerPokemon.name;

    // Show turn order indicator
    showTurnOrder(firstName, secondName, playerFirst);
    await delay(1200);

    // --- First attack ---
    const firstMoveName = firstInfo.moveName || firstMove.name || 'Attack';
    setMessage(`${firstName} used ${firstMoveName}!`);
    addBattleLogEntry(`${firstName} used ${firstMoveName}!`, 'move');
    await delay(400);

    await animateAttack(firstAttacker, firstInfo, firstMove);

    // Show effectiveness popup for first attack
    await showAttackEffects(firstInfo);

    // Update HP for first attack's target (use INTERMEDIATE hp, not final)
    if (playerFirst) {
      await animateHpChange('opponent', opponentCurrentHp, hpAfterFirst_opponent, opponentMaxHp);
      opponentCurrentHp = hpAfterFirst_opponent;
    } else {
      await animateHpChange('player', playerCurrentHp, hpAfterFirst_player, playerMaxHp);
      playerCurrentHp = hpAfterFirst_player;
    }

    // Handle status applied by first attack
    await handleStatusChanges(playerFirst ? newOpponentStatus : newPlayerStatus,
                               playerFirst ? 'opponent' : 'player',
                               playerFirst ? opponentPokemon.name : playerPokemon.name,
                               firstInfo);

    // Add turn log entries
    addTurnLogEntries(turnLog.filter(l => {
      const lower = l.toLowerCase();
      return lower.includes(firstName.toLowerCase());
    }));

    // Check if first attack KO'd
    if (result.status === 'finished' && playerFirst && newOpponentHp <= 0) {
      AudioManager.faint();
      await animateFaint('opponent');
      setMessage(`${opponentPokemon.name} fainted!`);
      addBattleLogEntry(`${opponentPokemon.name} fainted!`, 'faint');
      await delay(1500);
      AudioManager.victory();
      App.showResult(true, playerPokemon, opponentPokemon);
      return;
    }
    if (result.status === 'finished' && !playerFirst && newPlayerHp <= 0) {
      AudioManager.faint();
      await animateFaint('player');
      setMessage(`${playerPokemon.name} fainted!`);
      addBattleLogEntry(`${playerPokemon.name} fainted!`, 'faint');
      await delay(1500);
      App.showResult(false, playerPokemon, opponentPokemon);
      return;
    }

    // --- Second attack ---
    await delay(600);
    const secondMoveName = secondInfo.moveName || secondMove.name || 'Attack';
    setMessage(`${secondName} used ${secondMoveName}!`);
    addBattleLogEntry(`${secondName} used ${secondMoveName}!`, 'move');
    await delay(400);

    await animateAttack(secondAttacker, secondInfo, secondMove);

    // Show effectiveness popup for second attack
    await showAttackEffects(secondInfo);

    // Update HP for second attack's target
    if (playerFirst) {
      await animateHpChange('player', playerCurrentHp, Math.max(0, newPlayerHp), playerMaxHp);
      playerCurrentHp = Math.max(0, newPlayerHp);
    } else {
      await animateHpChange('opponent', opponentCurrentHp, Math.max(0, newOpponentHp), opponentMaxHp);
      opponentCurrentHp = Math.max(0, newOpponentHp);
    }

    // Handle status applied by second attack
    await handleStatusChanges(playerFirst ? newPlayerStatus : newOpponentStatus,
                               playerFirst ? 'player' : 'opponent',
                               playerFirst ? playerPokemon.name : opponentPokemon.name,
                               secondInfo);

    // Also update the first attacker's status (in case of recoil status etc)
    await handleStatusChanges(playerFirst ? newPlayerStatus : newOpponentStatus,
                               playerFirst ? 'player' : 'opponent',
                               playerFirst ? playerPokemon.name : opponentPokemon.name,
                               { statusApplied: null }); // just sync

    // Sync both statuses from backend
    if (newPlayerStatus !== playerStatus) {
      playerStatus = newPlayerStatus;
      updateStatusBadge('player', playerStatus);
    }
    if (newOpponentStatus !== opponentStatus) {
      opponentStatus = newOpponentStatus;
      updateStatusBadge('opponent', opponentStatus);
    }

    // Add remaining turn log entries
    addTurnLogEntries(turnLog.filter(l => {
      const lower = l.toLowerCase();
      return lower.includes(secondName.toLowerCase()) && !lower.includes(firstName.toLowerCase());
    }));

    // Check if second attack KO'd
    if (result.status === 'finished') {
      if (result.winner === 'player') {
        AudioManager.faint();
        await animateFaint('opponent');
        setMessage(`${opponentPokemon.name} fainted!`);
        addBattleLogEntry(`${opponentPokemon.name} fainted!`, 'faint');
        await delay(1500);
        AudioManager.victory();
        App.showResult(true, playerPokemon, opponentPokemon);
      } else {
        AudioManager.faint();
        await animateFaint('player');
        setMessage(`${playerPokemon.name} fainted!`);
        addBattleLogEntry(`${playerPokemon.name} fainted!`, 'faint');
        await delay(1500);
        App.showResult(false, playerPokemon, opponentPokemon);
      }
      return;
    }

    // Ready for next turn
    await delay(300);
    setMessage('What will you do?');
    isAnimating = false;
    moveClickPending = false;
    disableMoves(false);
  }

  /**
   * Show attack effects (effectiveness popup, critical, etc.)
   */
  async function showAttackEffects(info) {
    if (info.missed) return;

    // Critical hit
    if (info.critical) {
      AudioManager.critical();
      showEffectivenessPopup('critical', 'CRITICAL HIT!');
      addBattleLogEntry('A critical hit!', 'critical');
      await delay(800);
    }

    // Effectiveness
    if (info.effectiveness >= 2) {
      AudioManager.superEffective();
      showEffectivenessPopup('super', 'SUPER EFFECTIVE!');
      addBattleLogEntry("It's super effective!", 'super');
      await delay(800);
    } else if (info.effectiveness > 0 && info.effectiveness < 1) {
      AudioManager.notVeryEffective();
      showEffectivenessPopup('not-effective', 'Not very effective...');
      addBattleLogEntry("It's not very effective...", 'not-effective');
      await delay(800);
    } else if (info.effectiveness === 0) {
      AudioManager.immune();
      showEffectivenessPopup('immune', 'It had no effect!');
      addBattleLogEntry('It had no effect!', 'immune');
      await delay(800);
    }
  }

  /**
   * Handle status condition changes
   */
  async function handleStatusChanges(newStatus, who, pokeName, attackInfo) {
    const currentStatus = who === 'player' ? playerStatus : opponentStatus;

    // Check if a new status was applied
    const appliedStatus = attackInfo.statusApplied || (newStatus && newStatus !== currentStatus ? newStatus : null);

    if (appliedStatus && appliedStatus !== currentStatus) {
      if (who === 'player') playerStatus = appliedStatus;
      else opponentStatus = appliedStatus;

      updateStatusBadge(who, appliedStatus);

      const statusInfo = STATUS_DISPLAY[appliedStatus.toLowerCase()];
      if (statusInfo) {
        const statusText = getStatusAppliedText(pokeName, appliedStatus);
        showFloatingStatusText(statusText);
        AudioManager.statusApplied(appliedStatus);
        addBattleLogEntry(statusText, 'status');
        await delay(800);
      }
    }

    // Status damage
    if (attackInfo.statusDamage) {
      const dmgText = getStatusDamageText(pokeName, currentStatus || newStatus);
      if (dmgText) {
        addBattleLogEntry(dmgText, 'damage');
      }
    }
  }

  function getStatusAppliedText(pokeName, status) {
    switch (status) {
      case 'par': return `${pokeName} is paralyzed! It may be unable to move!`;
      case 'brn': return `${pokeName} was burned!`;
      case 'psn': return `${pokeName} was poisoned!`;
      case 'slp': return `${pokeName} fell asleep!`;
      case 'frz': return `${pokeName} was frozen solid!`;
      case 'cnf': return `${pokeName} became confused!`;
      default: return `${pokeName} was afflicted with ${status}!`;
    }
  }

  function getStatusDamageText(pokeName, status) {
    switch (status) {
      case 'brn': return `${pokeName} is hurt by its burn!`;
      case 'psn': return `${pokeName} is hurt by poison!`;
      default: return null;
    }
  }

  // ==================== ANIMATIONS ====================

  /**
   * Animate an attack with critical/STAB/effectiveness support
   * Now uses AttackEffects VFX engine for per-type visual effects
   */
  async function animateAttack(attacker, result, move) {
    const isPlayer = attacker === 'player';
    const attackerSprite = $(isPlayer ? 'player-sprite' : 'opponent-sprite');
    const targetSprite = $(isPlayer ? 'opponent-sprite' : 'player-sprite');
    const targetDmgEl = $(isPlayer ? 'opponent-damage-number' : 'player-damage-number');

    const moveType = (move?.type || result?.move?.type || result?.moveType || 'normal').toLowerCase();
    const damage = result?.damage ?? 0;
    const effectiveness = result?.effectiveness || result?.typeEffectiveness || 1;
    const isCritical = result?.critical || false;
    const isStab = result?.stab || false;

    // 1. Attacker lunges forward
    const attackClass = isPlayer ? 'sprite-attack-right' : 'sprite-attack-left';
    attackerSprite.classList.add(attackClass);

    await delay(250);

    // 2. Play per-type VFX (replaces simple flash)
    if (typeof AttackEffects !== 'undefined') {
      const attackerSide = isPlayer ? 'player' : 'opponent';
      const defenderSide = isPlayer ? 'opponent' : 'player';
      // Fire VFX in parallel with hit animation
      const vfxPromise = AttackEffects.play(moveType, attackerSide, defenderSide);

      // 3. Target gets hit — use critical hit animation if applicable
      await delay(150);
      if (isCritical) {
        targetSprite.classList.add('sprite-hit-critical');
      } else {
        targetSprite.classList.add('sprite-hit');
      }

      // 4. Play appropriate sound
      if (result?.missed) {
        AudioManager.miss();
      } else if (effectiveness === 0) {
        AudioManager.immune();
      } else if (isCritical) {
        AudioManager.critical();
      } else if (effectiveness >= 2) {
        AudioManager.superEffective();
      } else if (effectiveness < 1 && effectiveness > 0) {
        AudioManager.notVeryEffective();
      } else if (damage > 0) {
        AudioManager.hit();
      }

      // 5. Show damage number with critical/STAB styling
      showDamageNumber(targetDmgEl, damage, result?.missed, isCritical, isStab);

      // 6. Show effectiveness text in arena
      if (effectiveness > 1) {
        showEffectivenessText("It's super effective!", true);
      } else if (effectiveness < 1 && effectiveness > 0) {
        showEffectivenessText("It's not very effective...", false);
      }

      // Wait for VFX to complete
      await vfxPromise;
    } else {
      // Fallback: original simple flash
      showFlash(moveType);
      await delay(200);

      if (isCritical) {
        targetSprite.classList.add('sprite-hit-critical');
      } else {
        targetSprite.classList.add('sprite-hit');
      }

      if (result?.missed) {
        AudioManager.miss();
      } else if (effectiveness === 0) {
        AudioManager.immune();
      } else if (isCritical) {
        AudioManager.critical();
      } else if (effectiveness >= 2) {
        AudioManager.superEffective();
      } else if (effectiveness < 1 && effectiveness > 0) {
        AudioManager.notVeryEffective();
      } else if (damage > 0) {
        AudioManager.hit();
      }

      showDamageNumber(targetDmgEl, damage, result?.missed, isCritical, isStab);

      if (effectiveness > 1) {
        showEffectivenessText("It's super effective!", true);
      } else if (effectiveness < 1 && effectiveness > 0) {
        showEffectivenessText("It's not very effective...", false);
      }

      await delay(600);
    }

    // Cleanup
    attackerSprite.classList.remove(attackClass);
    targetSprite.classList.remove('sprite-hit');
    targetSprite.classList.remove('sprite-hit-critical');
  }

  function showFlash(type) {
    const overlay = $('flash-overlay');
    overlay.className = 'flash-overlay';
    void overlay.offsetWidth;
    overlay.classList.add(`flash-${type}`);
    setTimeout(() => {
      overlay.className = 'flash-overlay hidden';
    }, 500);
  }

  /**
   * Show floating damage number with critical/STAB styling
   */
  function showDamageNumber(element, damage, missed, isCritical, isStab) {
    element.className = 'damage-number';

    if (missed) {
      element.textContent = 'MISS';
      element.classList.add('miss');
    } else if (damage === 0) {
      element.textContent = 'No effect';
      element.classList.add('miss');
    } else {
      element.textContent = `-${damage}`;
      if (isCritical) element.classList.add('critical-dmg');
      if (isStab && !isCritical) element.classList.add('stab-dmg');
    }

    void element.offsetWidth;
    element.classList.add('show');

    setTimeout(() => {
      element.className = 'damage-number hidden';
    }, 1200);
  }

  function showEffectivenessText(text, isSuper) {
    const arena = document.querySelector('.battle-arena');
    const el = document.createElement('div');
    el.className = `effectiveness-text ${isSuper ? 'super-effective' : 'not-effective'}`;
    el.textContent = text;
    arena.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  function animateHpChange(who, fromHp, toHp, maxHp) {
    return new Promise(resolve => {
      const duration = 800;
      const startTime = performance.now();

      function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
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

  async function animateFaint(who) {
    const sprite = $(who === 'player' ? 'player-sprite' : 'opponent-sprite');
    sprite.classList.add('sprite-faint');
    await delay(800);
  }

  function setMessage(text) {
    return new Promise(resolve => {
      const el = $('battle-message');

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

  function disableMoves(disabled) {
    document.querySelectorAll('.move-btn').forEach(btn => {
      btn.disabled = disabled;
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API
  return {
    init,
  };
})();
