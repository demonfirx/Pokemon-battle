const express = require('express');
const router = express.Router();
const pokemon = require('../data/pokemon.json');
const moves = require('../data/moves.json');
const types = require('../data/types.json');
const abilities = require('../data/abilities.json');

// In-memory battle store
const battles = {};

// Helper: generate battle ID
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// Helper: clone pokemon for battle with full stat split
function createBattlePokemon(poke) {
  return {
    ...poke,
    currentHp: poke.hp,
    maxHp: poke.hp,
    statStages: { attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
    status: null,           // burn, paralysis, poison, freeze, sleep
    statusTurns: 0,         // turns remaining for sleep
    volatileStatus: {},     // { confusion: turnsLeft, flinch: true }
    moves: poke.moves.map(moveId => {
      const move = moves[moveId];
      return move || { id: moveId, name: moveId, type: 'normal', category: 'physical', power: 40, accuracy: 100, priority: 0, contact: false };
    })
  };
}

// Stat stage multiplier table
function getStatMultiplier(stages) {
  if (stages >= 0) return (2 + stages) / 2;
  return 2 / (2 + Math.abs(stages));
}

// Get effective stat value considering stages, burn, paralysis
function getEffectiveStat(poke, stat) {
  const base = poke[stat];
  let multiplier = getStatMultiplier(poke.statStages[stat] || 0);

  // Burn halves physical attack
  if (stat === 'attack' && poke.status === 'burn') {
    multiplier *= 0.5;
  }
  // Paralysis quarters speed (Gen 1-6 style for more impact)
  if (stat === 'speed' && poke.status === 'paralysis') {
    multiplier *= 0.25;
  }

  return Math.floor(base * multiplier);
}

// Get stage change description
function getStageChangeText(pokemonName, stat, stages) {
  const statNames = {
    attack: 'Attack', defense: 'Defense', spAtk: 'Sp. Atk',
    spDef: 'Sp. Def', speed: 'Speed'
  };
  const statName = statNames[stat] || stat;
  if (stages >= 3) return `${pokemonName}'s ${statName} rose drastically!`;
  if (stages >= 2) return `${pokemonName}'s ${statName} sharply rose!`;
  if (stages === 1) return `${pokemonName}'s ${statName} rose!`;
  if (stages <= -3) return `${pokemonName}'s ${statName} severely fell!`;
  if (stages <= -2) return `${pokemonName}'s ${statName} harshly fell!`;
  if (stages === -1) return `${pokemonName}'s ${statName} fell!`;
  return '';
}

// Apply stat stage change (clamped to -6..+6)
function applyStatChange(poke, stat, stages) {
  if (!poke.statStages[stat] && poke.statStages[stat] !== 0) {
    poke.statStages[stat] = 0;
  }
  const oldStage = poke.statStages[stat];
  poke.statStages[stat] = Math.max(-6, Math.min(6, oldStage + stages));
  return poke.statStages[stat] - oldStage;
}

// Type effectiveness: supports dual types
function getTypeMultiplier(moveType, defenderTypes) {
  const attackType = types[moveType];
  if (!attackType) return 1;

  let multiplier = 1;
  for (const defType of defenderTypes) {
    if (attackType.immune && attackType.immune.includes(defType)) return 0;
    if (attackType.strong && attackType.strong.includes(defType)) multiplier *= 2;
    else if (attackType.weak && attackType.weak.includes(defType)) multiplier *= 0.5;
  }
  return multiplier;
}

// STAB check: move type matches any of attacker's types
function getSTAB(moveType, attackerTypes) {
  return attackerTypes.includes(moveType) ? 1.5 : 1.0;
}

// Critical hit check
function checkCritical(move) {
  const highCrit = move.highCrit || false;
  const critRate = highCrit ? (1 / 8) : (1 / 24);
  return Math.random() < critRate;
}

// Ability power boost (Blaze/Torrent/Overgrow)
function getAbilityBoost(attacker, move) {
  const ability = abilities[attacker.ability];
  if (!ability || ability.trigger !== 'onAttack') return 1.0;
  const eff = ability.effect;
  if (eff.type === 'powerBoost' && move.type === eff.moveType) {
    if (eff.condition === 'hpBelow33' && attacker.currentHp <= attacker.maxHp / 3) {
      return eff.multiplier;
    }
  }
  return 1.0;
}

// Full damage calculation (Gen V+ formula with physical/special split)
function calculateDamage(attacker, defender, move, turnLog) {
  const level = 50;
  const power = move.power;
  if (!power || power === 0) return { damage: 0, typeMultiplier: 1, effectiveness: 'neutral', critical: false };

  const isPhysical = move.category === 'physical';
  const isCritical = checkCritical(move);

  // Get attack and defense stats
  let atk, def;
  if (isPhysical) {
    // Crit ignores negative attack stages and positive defense stages
    const atkStage = isCritical ? Math.max(0, attacker.statStages.attack) : attacker.statStages.attack;
    const defStage = isCritical ? Math.min(0, defender.statStages.defense) : defender.statStages.defense;
    atk = Math.floor(attacker.attack * getStatMultiplier(atkStage));
    def = Math.floor(defender.defense * getStatMultiplier(defStage));
    // Burn halves physical attack (unless crit)
    if (attacker.status === 'burn' && !isCritical) {
      atk = Math.floor(atk * 0.5);
    }
  } else {
    const atkStage = isCritical ? Math.max(0, attacker.statStages.spAtk) : attacker.statStages.spAtk;
    const defStage = isCritical ? Math.min(0, defender.statStages.spDef) : defender.statStages.spDef;
    atk = Math.floor(attacker.spAtk * getStatMultiplier(atkStage));
    def = Math.floor(defender.spDef * getStatMultiplier(defStage));
  }

  const typeMultiplier = getTypeMultiplier(move.type, defender.types);
  const stab = getSTAB(move.type, attacker.types);
  const critMultiplier = isCritical ? 1.5 : 1.0;
  const random = Math.random() * (1.0 - 0.85) + 0.85;
  const abilityBoost = getAbilityBoost(attacker, move);

  const baseDamage = ((2 * level / 5 + 2) * power * atk / def) / 50 + 2;
  const finalDamage = Math.floor(baseDamage * stab * typeMultiplier * critMultiplier * random * abilityBoost);

  const effectiveness = typeMultiplier === 0 ? 'immune' :
                        typeMultiplier >= 2 ? 'super-effective' :
                        typeMultiplier > 0 && typeMultiplier < 1 ? 'not-very-effective' : 'neutral';

  return {
    damage: typeMultiplier === 0 ? 0 : Math.max(1, finalDamage),
    typeMultiplier,
    effectiveness,
    critical: isCritical,
    stab: stab > 1
  };
}

// Check if a pokemon is immune to a status based on type or ability
function isStatusImmune(poke, statusType) {
  // Ability immunity
  if (poke.ability === 'immunity' && statusType === 'poison') return true;

  const pokeTypes = poke.types;
  // Type immunities
  if (statusType === 'burn' && pokeTypes.includes('fire')) return true;
  if (statusType === 'paralysis' && pokeTypes.includes('electric')) return true;
  if (statusType === 'poison' && (pokeTypes.includes('poison') || pokeTypes.includes('steel'))) return true;
  if (statusType === 'freeze' && pokeTypes.includes('ice')) return true;

  return false;
}

// Apply a non-volatile status condition
function applyStatus(poke, statusType, turnLog) {
  // Can only have one non-volatile status
  if (poke.status) {
    return false;
  }
  if (isStatusImmune(poke, statusType)) {
    return false;
  }

  poke.status = statusType;
  if (statusType === 'sleep') {
    poke.statusTurns = Math.floor(Math.random() * 3) + 1; // 1-3 turns
  }

  const statusNames = {
    burn: 'burned', paralysis: 'paralyzed', poison: 'poisoned',
    freeze: 'frozen solid', sleep: 'fell asleep'
  };
  turnLog.push(`${poke.name} was ${statusNames[statusType]}!`);
  return true;
}

// Apply secondary effects after damage
function applySecondaryEffect(attacker, defender, move, turnLog, defenderMovedFirst) {
  const effect = move.secondaryEffect;
  if (!effect) return;

  const roll = Math.random() * 100;
  if (roll >= effect.chance) return;

  if (effect.type === 'status') {
    applyStatus(defender, effect.status, turnLog);
  } else if (effect.type === 'volatile') {
    if (effect.status === 'flinch') {
      // Flinch only works if the target hasn't moved yet
      if (!defenderMovedFirst) {
        defender.volatileStatus.flinch = true;
      }
    } else if (effect.status === 'confusion') {
      if (!defender.volatileStatus.confusion) {
        defender.volatileStatus.confusion = Math.floor(Math.random() * 4) + 1; // 1-4 turns
        turnLog.push(`${defender.name} became confused!`);
      }
    }
  } else if (effect.type === 'statChange') {
    const target = effect.target === 'defender' ? defender : attacker;
    const actualChange = applyStatChange(target, effect.stat, effect.stages);
    if (actualChange !== 0) {
      turnLog.push(getStageChangeText(target.name, effect.stat, effect.stages));
    }
  }
}

// Apply contact ability effects (Static, Cursed Body)
function applyContactAbility(attacker, defender, move, turnLog) {
  if (!move.contact) return;

  // Defender's ability triggers on being hit by contact
  const defAbility = abilities[defender.ability];
  if (defAbility && defAbility.trigger === 'onContactHit') {
    const eff = defAbility.effect;
    if (Math.random() * 100 < eff.chance) {
      if (eff.type === 'status' && eff.status === 'paralysis') {
        applyStatus(attacker, 'paralysis', turnLog);
        if (attacker.status === 'paralysis') {
          turnLog.push(`${defender.name}'s Static!`);
        }
      }
    }
  }

  // Cursed Body triggers on any hit (contact or not, but we check on hit)
  if (defender.ability === 'cursed-body') {
    if (Math.random() * 100 < 30) {
      turnLog.push(`${defender.name}'s Cursed Body disabled ${attacker.name}'s ${move.name}!`);
    }
  }
}

// Process start-of-turn status effects. Returns true if pokemon can act.
function processPreTurnStatus(poke, turnLog) {
  // Check flinch first
  if (poke.volatileStatus.flinch) {
    delete poke.volatileStatus.flinch;
    turnLog.push(`${poke.name} flinched and couldn't move!`);
    return false;
  }

  // Freeze: 20% thaw chance
  if (poke.status === 'freeze') {
    if (Math.random() < 0.2) {
      poke.status = null;
      turnLog.push(`${poke.name} thawed out!`);
    } else {
      turnLog.push(`${poke.name} is frozen solid!`);
      return false;
    }
  }

  // Sleep: decrement counter
  if (poke.status === 'sleep') {
    poke.statusTurns--;
    if (poke.statusTurns <= 0) {
      poke.status = null;
      turnLog.push(`${poke.name} woke up!`);
    } else {
      turnLog.push(`${poke.name} is fast asleep.`);
      return false;
    }
  }

  // Paralysis: 25% can't move
  if (poke.status === 'paralysis') {
    if (Math.random() < 0.25) {
      turnLog.push(`${poke.name} is paralyzed! It can't move!`);
      return false;
    }
  }

  // Confusion: 33% hit self
  if (poke.volatileStatus.confusion) {
    poke.volatileStatus.confusion--;
    if (poke.volatileStatus.confusion <= 0) {
      delete poke.volatileStatus.confusion;
      turnLog.push(`${poke.name} snapped out of its confusion!`);
    } else {
      turnLog.push(`${poke.name} is confused!`);
      if (Math.random() < 1 / 3) {
        // Hit self: 40 power typeless physical, own atk vs own def
        const selfDmg = Math.max(1, Math.floor(
          ((2 * 50 / 5 + 2) * 40 * poke.attack / poke.defense) / 50 + 2
        ));
        poke.currentHp = Math.max(0, poke.currentHp - selfDmg);
        turnLog.push(`It hurt itself in its confusion! ${selfDmg} damage.`);
        return false;
      }
    }
  }

  return true;
}

// Process end-of-turn status damage
function processEndOfTurnStatus(poke, turnLog) {
  if (poke.currentHp <= 0) return;

  if (poke.status === 'burn') {
    const dmg = Math.max(1, Math.floor(poke.maxHp / 16));
    poke.currentHp = Math.max(0, poke.currentHp - dmg);
    turnLog.push(`${poke.name} was hurt by its burn! ${dmg} damage.`);
  }

  if (poke.status === 'poison') {
    const dmg = Math.max(1, Math.floor(poke.maxHp / 8));
    poke.currentHp = Math.max(0, poke.currentHp - dmg);
    turnLog.push(`${poke.name} was hurt by poison! ${dmg} damage.`);
  }
}

// Check accuracy
function checkAccuracy(move) {
  if (move.accuracy > 100) return true; // Status moves that always hit
  return Math.random() * 100 < move.accuracy;
}

// Determine turn order considering priority and speed
function determineTurnOrder(playerPoke, cpuPoke, playerMove, cpuMove) {
  const playerPriority = playerMove.priority || 0;
  const cpuPriority = cpuMove.priority || 0;

  if (playerPriority !== cpuPriority) {
    return playerPriority > cpuPriority;
  }

  // Same priority: compare effective speed
  const playerSpeed = getEffectiveStat(playerPoke, 'speed');
  const cpuSpeed = getEffectiveStat(cpuPoke, 'speed');

  if (playerSpeed !== cpuSpeed) {
    return playerSpeed > cpuSpeed;
  }

  // Speed tie: random
  return Math.random() < 0.5;
}

// CPU AI: pick best move
function cpuPickMove(cpuPokemon, playerPokemon) {
  const validMoves = cpuPokemon.moves.filter(m => m && m.id);
  if (validMoves.length === 0) return validMoves[0];

  // Calculate expected damage for each move
  const scored = validMoves.map(move => {
    if (move.category === 'status') {
      // Use status moves strategically
      if (move.effect && move.effect.target === 'self') {
        // Buff moves: use when HP > 70%
        if (cpuPokemon.currentHp > cpuPokemon.maxHp * 0.7) {
          return { move, score: 30 };
        }
        return { move, score: 5 };
      } else {
        // Debuff moves: use occasionally
        return { move, score: 15 };
      }
    }

    const typeEff = getTypeMultiplier(move.type, playerPokemon.types);
    if (typeEff === 0) return { move, score: 0 }; // Don't use immune moves

    const stab = getSTAB(move.type, cpuPokemon.types);
    const power = move.power || 0;
    const accuracy = (move.accuracy > 100 ? 100 : move.accuracy) / 100;
    const abilityBoost = getAbilityBoost(cpuPokemon, move);

    const score = power * typeEff * stab * accuracy * abilityBoost;
    return { move, score };
  });

  // Pick highest scoring move (with small random factor)
  scored.sort((a, b) => b.score - a.score);

  // 80% chance to pick best move, 20% chance for second best (if available)
  if (scored.length > 1 && Math.random() < 0.2 && scored[1].score > 0) {
    return scored[1].move;
  }

  return scored[0].move;
}

// Execute a single attack
function executeAttack(action, turnLog, otherMovedFirst) {
  const { attacker, defender, move, label } = action;
  const attackerName = attacker.name;

  // Pre-turn status check
  if (!processPreTurnStatus(attacker, turnLog)) {
    return { damage: 0, statusBlocked: true };
  }

  turnLog.push(`${attackerName} used ${move.name}!`);

  // Fire moves thaw the user
  if (attacker.status === 'freeze' && move.type === 'fire') {
    attacker.status = null;
    turnLog.push(`${attackerName} thawed out by using ${move.name}!`);
  }

  // Handle status moves
  if (move.category === 'status' && move.effect) {
    if (!checkAccuracy(move)) {
      turnLog.push(`${attackerName}'s attack missed!`);
      return { damage: 0, missed: true };
    }

    const effect = move.effect;
    const target = effect.target === 'self' ? attacker : defender;
    const actualChange = applyStatChange(target, effect.stat, effect.stages);

    if (actualChange === 0) {
      const statNames = {
        attack: 'Attack', defense: 'Defense', spAtk: 'Sp. Atk',
        spDef: 'Sp. Def', speed: 'Speed'
      };
      const statName = statNames[effect.stat] || effect.stat;
      turnLog.push(`${target.name}'s ${statName} won't go any ${effect.stages > 0 ? 'higher' : 'lower'}!`);
    } else {
      turnLog.push(getStageChangeText(target.name, effect.stat, effect.stages));
    }

    return { damage: 0, statusMove: true };
  }

  // Check accuracy for attacking moves
  if (!checkAccuracy(move)) {
    turnLog.push(`${attackerName}'s attack missed!`);
    return { damage: 0, missed: true };
  }

  // Calculate damage
  const result = calculateDamage(attacker, defender, move, turnLog);

  if (result.typeMultiplier === 0) {
    turnLog.push(`It doesn't affect ${defender.name}...`);
    return { damage: 0, immune: true };
  }

  // Apply damage
  defender.currentHp = Math.max(0, defender.currentHp - result.damage);

  // Log critical hit
  if (result.critical) {
    turnLog.push(`A critical hit!`);
  }

  // Log effectiveness
  if (result.effectiveness === 'super-effective') {
    turnLog.push(`It's super effective! ${result.damage} damage!`);
  } else if (result.effectiveness === 'not-very-effective') {
    turnLog.push(`It's not very effective... ${result.damage} damage.`);
  } else {
    turnLog.push(`${result.damage} damage.`);
  }

  // Apply secondary effects (only if target didn't faint)
  if (defender.currentHp > 0) {
    applySecondaryEffect(attacker, defender, move, turnLog, otherMovedFirst);

    // Apply contact ability effects
    applyContactAbility(attacker, defender, move, turnLog);
  }

  return result;
}

// POST /api/battle/start
router.post('/start', (req, res) => {
  const { pokemonId } = req.body;

  if (!pokemonId) {
    return res.status(400).json({ error: 'pokemonId is required' });
  }

  const playerPoke = pokemon.find(p => p.id === parseInt(pokemonId));
  if (!playerPoke) {
    return res.status(404).json({ error: 'Pokemon not found' });
  }

  const available = pokemon.filter(p => p.id !== playerPoke.id);
  const cpuPoke = available[Math.floor(Math.random() * available.length)];

  const battleId = generateId();
  const battle = {
    id: battleId,
    status: 'active',
    turn: 1,
    player: createBattlePokemon(playerPoke),
    cpu: createBattlePokemon(cpuPoke),
    log: [
      `Battle started! ${playerPoke.name} vs ${cpuPoke.name}!`
    ],
    winner: null
  };

  battles[battleId] = battle;
  res.json(battle);
});

// POST /api/battle/move
router.post('/move', (req, res) => {
  const { battleId, moveId } = req.body;

  if (!battleId || !moveId) {
    return res.status(400).json({ error: 'battleId and moveId are required' });
  }

  const battle = battles[battleId];
  if (!battle) {
    return res.status(404).json({ error: 'Battle not found' });
  }

  if (battle.status !== 'active') {
    return res.status(400).json({ error: 'Battle is already over', battle });
  }

  // Find player's move
  const playerMove = battle.player.moves.find(m => m.id === moveId);
  if (!playerMove) {
    return res.status(400).json({ error: 'Invalid move for this Pokemon' });
  }

  // CPU picks a move (smart AI)
  const cpuMove = cpuPickMove(battle.cpu, battle.player);

  const turnLog = [];

  // Clear flinch from previous turn
  delete battle.player.volatileStatus.flinch;
  delete battle.cpu.volatileStatus.flinch;

  // Determine turn order (priority + speed)
  const playerFirst = determineTurnOrder(battle.player, battle.cpu, playerMove, cpuMove);

  const first = playerFirst
    ? { attacker: battle.player, defender: battle.cpu, move: playerMove, label: 'player' }
    : { attacker: battle.cpu, defender: battle.player, move: cpuMove, label: 'cpu' };

  const second = playerFirst
    ? { attacker: battle.cpu, defender: battle.player, move: cpuMove, label: 'cpu' }
    : { attacker: battle.player, defender: battle.cpu, move: playerMove, label: 'player' };

  // Execute first attack (otherMovedFirst = false since this is the first mover)
  executeAttack(first, turnLog, false);

  // Check if defender fainted
  if (first.defender.currentHp <= 0) {
    first.defender.currentHp = 0;
    battle.status = 'finished';
    battle.winner = first.label;
    const winnerName = first.label === 'player' ? battle.player.name : battle.cpu.name;
    const loserName = first.label === 'player' ? battle.cpu.name : battle.player.name;
    turnLog.push(`${loserName} fainted!`);
    turnLog.push(`${winnerName} wins!`);
  } else {
    // Execute second attack (otherMovedFirst = true since first already moved)
    executeAttack(second, turnLog, true);

    if (second.defender.currentHp <= 0) {
      second.defender.currentHp = 0;
      battle.status = 'finished';
      battle.winner = second.label;
      const winnerName = second.label === 'player' ? battle.player.name : battle.cpu.name;
      const loserName = second.label === 'player' ? battle.cpu.name : battle.player.name;
      turnLog.push(`${loserName} fainted!`);
      turnLog.push(`${winnerName} wins!`);
    }
  }

  // End-of-turn status damage (if battle still active)
  if (battle.status === 'active') {
    // Process in speed order
    const speedOrder = playerFirst
      ? [battle.player, battle.cpu]
      : [battle.cpu, battle.player];

    for (const poke of speedOrder) {
      processEndOfTurnStatus(poke, turnLog);
      if (poke.currentHp <= 0) {
        poke.currentHp = 0;
        battle.status = 'finished';
        const isPlayer = poke === battle.player;
        battle.winner = isPlayer ? 'cpu' : 'player';
        turnLog.push(`${poke.name} fainted!`);
        const winnerPoke = isPlayer ? battle.cpu : battle.player;
        turnLog.push(`${winnerPoke.name} wins!`);
        break;
      }
    }
  }

  battle.log.push(...turnLog);
  battle.turn++;

  res.json({
    ...battle,
    turnLog,
    playerMove,
    cpuMove,
    playerFirst
  });
});

// GET /api/battle/:id
router.get('/:id', (req, res) => {
  const battle = battles[req.params.id];
  if (!battle) {
    return res.status(404).json({ error: 'Battle not found' });
  }
  res.json(battle);
});

module.exports = router;
