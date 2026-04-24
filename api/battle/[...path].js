const pokemon = require('../../backend/data/pokemon.json');
const moves = require('../../backend/data/moves.json');
const types = require('../../backend/data/types.json');

// Battle state store (in-memory, resets on cold start — fine for demo)
const battles = global._battles || (global._battles = {});

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

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

function getStatMultiplier(stages) {
  return stages >= 0 ? (2 + stages) / 2 : 2 / (2 + Math.abs(stages));
}

function getEffectiveSpeed(pokemon) {
  return pokemon.speed * getStatMultiplier(pokemon.statStages.speed);
}

function getStageChangeText(pokemonName, stat, stages) {
  const statName = stat.charAt(0).toUpperCase() + stat.slice(1);
  if (stages >= 2) return `${pokemonName}'s ${statName} sharply rose!`;
  if (stages === 1) return `${pokemonName}'s ${statName} rose!`;
  if (stages <= -2) return `${pokemonName}'s ${statName} sharply fell!`;
  if (stages === -1) return `${pokemonName}'s ${statName} fell!`;
  return '';
}

function applyStatChange(pokemon, stat, stages) {
  const oldStage = pokemon.statStages[stat];
  pokemon.statStages[stat] = Math.max(-6, Math.min(6, oldStage + stages));
  return pokemon.statStages[stat] - oldStage;
}

function getTypeMultiplier(moveType, defenderType) {
  const attackType = types[moveType];
  if (!attackType) return 1;
  if (attackType.immune && attackType.immune.includes(defenderType)) return 0;
  if (attackType.strong && attackType.strong.includes(defenderType)) return 2;
  if (attackType.weak && attackType.weak.includes(defenderType)) return 0.5;
  return 1;
}

function calculateDamage(attacker, defender, move) {
  const level = 50;
  const power = move.power;
  const atk = attacker.attack * getStatMultiplier(attacker.statStages.attack);
  const def = defender.defense * getStatMultiplier(defender.statStages.defense);
  const typeMultiplier = getTypeMultiplier(move.type, defender.type);
  const random = Math.random() * (1.0 - 0.85) + 0.85;
  const baseDamage = ((2 * level / 5 + 2) * power * atk / def) / 50 + 2;
  const finalDamage = Math.floor(baseDamage * typeMultiplier * random);
  return {
    damage: Math.max(1, finalDamage),
    typeMultiplier,
    effectiveness: typeMultiplier === 0 ? 'immune' :
                   typeMultiplier >= 2 ? 'super-effective' :
                   typeMultiplier < 1 ? 'not-very-effective' : 'neutral'
  };
}

function checkAccuracy(move) {
  return Math.random() * 100 < move.accuracy;
}

function executeAttack(action, turnLog) {
  const { attacker, defender, move } = action;
  turnLog.push(`${attacker.name} used ${move.name}!`);

  // Handle status moves (power === 0 with effect)
  if (move.power === 0 && move.effect) {
    if (!checkAccuracy(move)) {
      turnLog.push(`${attacker.name}'s attack missed!`);
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

  if (!checkAccuracy(move)) {
    turnLog.push(`${attacker.name}'s attack missed!`);
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

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Route based on URL path
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.replace('/api/battle/', '').split('/').filter(Boolean);
  const action = pathParts[0] || '';

  // POST /api/battle/start
  if (req.method === 'POST' && action === 'start') {
    const { pokemonId } = req.body || {};
    if (!pokemonId) return res.status(400).json({ error: 'pokemonId is required' });

    const playerPoke = pokemon.find(p => p.id === parseInt(pokemonId));
    if (!playerPoke) return res.status(404).json({ error: 'Pokemon not found' });

    const available = pokemon.filter(p => p.id !== playerPoke.id);
    const cpuPoke = available[Math.floor(Math.random() * available.length)];

    const battleId = generateId();
    const battle = {
      id: battleId,
      status: 'active',
      turn: 1,
      player: createBattlePokemon(playerPoke),
      cpu: createBattlePokemon(cpuPoke),
      log: [`Battle started! ${playerPoke.name} vs ${cpuPoke.name}!`],
      winner: null
    };
    battles[battleId] = battle;
    return res.json(battle);
  }

  // POST /api/battle/move
  if (req.method === 'POST' && action === 'move') {
    const { battleId, moveId } = req.body || {};
    if (!battleId || !moveId) return res.status(400).json({ error: 'battleId and moveId are required' });

    const battle = battles[battleId];
    if (!battle) return res.status(404).json({ error: 'Battle not found' });
    if (battle.status !== 'active') return res.status(400).json({ error: 'Battle is already over', battle });

    const playerMove = battle.player.moves.find(m => m.id === moveId);
    if (!playerMove) return res.status(400).json({ error: 'Invalid move' });

    const cpuMove = battle.cpu.moves[Math.floor(Math.random() * battle.cpu.moves.length)];
    const turnLog = [];
    const playerFirst = getEffectiveSpeed(battle.player) >= getEffectiveSpeed(battle.cpu);

    const first = playerFirst
      ? { attacker: battle.player, defender: battle.cpu, move: playerMove, label: 'player' }
      : { attacker: battle.cpu, defender: battle.player, move: cpuMove, label: 'cpu' };
    const second = playerFirst
      ? { attacker: battle.cpu, defender: battle.player, move: cpuMove, label: 'cpu' }
      : { attacker: battle.player, defender: battle.cpu, move: playerMove, label: 'player' };

    executeAttack(first, turnLog);

    if (first.defender.currentHp <= 0) {
      first.defender.currentHp = 0;
      battle.status = 'finished';
      battle.winner = first.label;
      turnLog.push(`${first.defender.name} fainted!`);
      turnLog.push(`${first.attacker.name} wins!`);
    } else {
      executeAttack(second, turnLog);
      if (second.defender.currentHp <= 0) {
        second.defender.currentHp = 0;
        battle.status = 'finished';
        battle.winner = second.label;
        turnLog.push(`${second.defender.name} fainted!`);
        turnLog.push(`${second.attacker.name} wins!`);
      }
    }

    battle.log.push(...turnLog);
    battle.turn++;

    return res.json({ ...battle, turnLog, playerMove, cpuMove, playerFirst });
  }

  // GET /api/battle/[id]
  if (req.method === 'GET' && action && action !== 'start' && action !== 'move') {
    const battle = battles[action];
    if (!battle) return res.status(404).json({ error: 'Battle not found' });
    return res.json(battle);
  }

  res.status(400).json({ error: 'Invalid battle endpoint' });
};
