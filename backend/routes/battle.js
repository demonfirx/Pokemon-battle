const express = require('express');
const router = express.Router();
const pokemon = require('../data/pokemon.json');
const moves = require('../data/moves.json');
const types = require('../data/types.json');

// In-memory battle store
const battles = {};

// Helper: generate battle ID
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// Helper: clone pokemon for battle (add currentHp + statStages)
function createBattlePokemon(poke) {
  return {
    ...poke,
    currentHp: poke.hp,
    maxHp: poke.hp,
    statStages: { attack: 0, defense: 0, speed: 0 },
    moves: poke.moves.map(moveId => {
      const move = moves[moveId];
      return move || { id: moveId, name: moveId, type: 'normal', power: 40, accuracy: 100 };
    })
  };
}

// Helper: get stat stage multiplier
function getStatMultiplier(stages) {
  return stages >= 0 ? (2 + stages) / 2 : 2 / (2 + Math.abs(stages));
}

// Helper: get effective speed (base speed * stage multiplier)
function getEffectiveSpeed(pokemon) {
  return pokemon.speed * getStatMultiplier(pokemon.statStages.speed);
}

// Helper: get stage change description
function getStageChangeText(pokemonName, stat, stages) {
  const statName = stat.charAt(0).toUpperCase() + stat.slice(1);
  if (stages >= 2) return `${pokemonName}'s ${statName} sharply rose!`;
  if (stages === 1) return `${pokemonName}'s ${statName} rose!`;
  if (stages <= -2) return `${pokemonName}'s ${statName} sharply fell!`;
  if (stages === -1) return `${pokemonName}'s ${statName} fell!`;
  return '';
}

// Helper: apply stat stage change (clamped to -6..+6)
function applyStatChange(pokemon, stat, stages) {
  const oldStage = pokemon.statStages[stat];
  pokemon.statStages[stat] = Math.max(-6, Math.min(6, oldStage + stages));
  return pokemon.statStages[stat] - oldStage; // actual change applied
}

// Helper: get type effectiveness multiplier
function getTypeMultiplier(moveType, defenderType) {
  const attackType = types[moveType];
  if (!attackType) return 1;

  // Check immunity first
  if (attackType.immune && attackType.immune.includes(defenderType)) return 0;
  if (attackType.strong && attackType.strong.includes(defenderType)) return 2;
  if (attackType.weak && attackType.weak.includes(defenderType)) return 0.5;

  return 1;
}

// Helper: calculate damage (with stat stage multipliers)
// Formula from README: ((2 * Level / 5 + 2) * Power * Atk/Def) / 50 + 2) * TypeMultiplier * Random(0.85-1.0)
function calculateDamage(attacker, defender, move) {
  const level = 50; // Fixed level for v1
  const power = move.power;
  const atk = attacker.attack * getStatMultiplier(attacker.statStages.attack);
  const def = defender.defense * getStatMultiplier(defender.statStages.defense);
  const typeMultiplier = getTypeMultiplier(move.type, defender.type);
  const random = Math.random() * (1.0 - 0.85) + 0.85;

  const baseDamage = ((2 * level / 5 + 2) * power * atk / def) / 50 + 2;
  const finalDamage = Math.floor(baseDamage * typeMultiplier * random);

  return {
    damage: Math.max(1, finalDamage), // Minimum 1 damage (unless immune)
    typeMultiplier,
    effectiveness: typeMultiplier === 0 ? 'immune' :
                   typeMultiplier >= 2 ? 'super-effective' :
                   typeMultiplier < 1 ? 'not-very-effective' : 'neutral'
  };
}

// Helper: CPU picks a move (random for v1)
function cpuPickMove(cpuPokemon) {
  const moveIndex = Math.floor(Math.random() * cpuPokemon.moves.length);
  return cpuPokemon.moves[moveIndex];
}

// Helper: check accuracy
function checkAccuracy(move) {
  return Math.random() * 100 < move.accuracy;
}

// POST /api/battle/start — start a new battle
router.post('/start', (req, res) => {
  const { pokemonId } = req.body;

  if (!pokemonId) {
    return res.status(400).json({ error: 'pokemonId is required' });
  }

  const playerPoke = pokemon.find(p => p.id === parseInt(pokemonId));
  if (!playerPoke) {
    return res.status(404).json({ error: 'Pokemon not found' });
  }

  // CPU picks a random pokemon (different from player)
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

// POST /api/battle/move — execute a move
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

  // CPU picks a move
  const cpuMove = cpuPickMove(battle.cpu);

  const turnLog = [];

  // Determine turn order by effective speed (base speed * stage multiplier)
  const playerFirst = getEffectiveSpeed(battle.player) >= getEffectiveSpeed(battle.cpu);

  const first = playerFirst
    ? { attacker: battle.player, defender: battle.cpu, move: playerMove, label: 'player' }
    : { attacker: battle.cpu, defender: battle.player, move: cpuMove, label: 'cpu' };

  const second = playerFirst
    ? { attacker: battle.cpu, defender: battle.player, move: cpuMove, label: 'cpu' }
    : { attacker: battle.player, defender: battle.cpu, move: playerMove, label: 'player' };

  // Execute first attack
  const firstResult = executeAttack(first, turnLog);

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
    // Execute second attack
    const secondResult = executeAttack(second, turnLog);

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

  battle.log.push(...turnLog);
  battle.turn++;

  res.json({
    ...battle,
    turnLog,
    playerMove: playerMove,
    cpuMove: cpuMove,
    playerFirst
  });
});

// Execute a single attack (or status move)
function executeAttack(action, turnLog) {
  const { attacker, defender, move, label } = action;
  const attackerName = attacker.name;

  turnLog.push(`${attackerName} used ${move.name}!`);

  // Handle status moves (power === 0 with effect)
  if (move.power === 0 && move.effect) {
    // Check accuracy first
    if (!checkAccuracy(move)) {
      turnLog.push(`${attackerName}'s attack missed!`);
      return { damage: 0, missed: true };
    }

    const effect = move.effect;
    const target = effect.target === 'self' ? attacker : defender;
    const actualChange = applyStatChange(target, effect.stat, effect.stages);

    if (actualChange === 0) {
      const statName = effect.stat.charAt(0).toUpperCase() + effect.stat.slice(1);
      turnLog.push(`${target.name}'s ${statName} won't go any ${effect.stages > 0 ? 'higher' : 'lower'}!`);
    } else {
      turnLog.push(getStageChangeText(target.name, effect.stat, effect.stages));
    }

    return { damage: 0, statusMove: true };
  }

  // Check accuracy
  if (!checkAccuracy(move)) {
    turnLog.push(`${attackerName}'s attack missed!`);
    return { damage: 0, missed: true };
  }

  const result = calculateDamage(attacker, defender, move);

  if (result.typeMultiplier === 0) {
    turnLog.push(`It doesn't affect ${defender.name}...`);
    return { damage: 0, immune: true };
  }

  defender.currentHp = Math.max(0, defender.currentHp - result.damage);

  if (result.effectiveness === 'super-effective') {
    turnLog.push(`It's super effective! ${result.damage} damage!`);
  } else if (result.effectiveness === 'not-very-effective') {
    turnLog.push(`It's not very effective... ${result.damage} damage.`);
  } else {
    turnLog.push(`${result.damage} damage.`);
  }

  return result;
}

// GET /api/battle/:id — get battle state
router.get('/:id', (req, res) => {
  const battle = battles[req.params.id];
  if (!battle) {
    return res.status(404).json({ error: 'Battle not found' });
  }
  res.json(battle);
});

module.exports = router;
