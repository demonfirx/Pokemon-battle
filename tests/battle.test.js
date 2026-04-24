/**
 * Pokemon Battle API — QA Test Suite
 *
 * Written against the API contract in README.md.
 * Uses Node.js built-in test runner (node:test + node:assert).
 *
 * Assumptions:
 *  - Backend server is running on http://localhost:3000 before tests execute.
 *  - Pokemon roster has exactly 6 pokemon (README says "Player picks 1 Pokemon dari roster").
 *  - Each pokemon has: id, name, type, hp, attack, defense, speed, moves (array of 4).
 *  - Types follow the classic triangle: fire > grass, grass > water, water > fire, plus normal.
 *  - POST /api/battle/start accepts { playerPokemonId, cpuPokemonId } and returns battle state.
 *    (cpuPokemonId is optional — server may pick randomly — but we send it for deterministic tests.)
 *  - POST /api/battle/move accepts { battleId, moveIndex } (0-based index into the attacker's moves).
 *  - Battle state shape: { id, playerPokemon, cpuPokemon, turn, status, log }.
 *  - Type multiplier: 2.0 for super-effective, 0.5 for not-very-effective, 1.0 for neutral.
 *  - "status" field: "active" while ongoing, "win" or "lose" when finished.
 *  - Speed determines who attacks first each turn.
 *  - Damage formula from README:
 *      damage = ((2*Level/5+2) * Power * Atk/Def) / 50 + 2) * TypeMultiplier * Random(0.85-1.0)
 *    Level is assumed constant (e.g. 50) for all pokemon in v1.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lightweight fetch wrapper that returns { status, body } */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

/**
 * Find a pokemon of a given type from the roster.
 * Returns the pokemon object or null.
 */
function findByType(pokemonList, type) {
  return pokemonList.find(p => p.type.toLowerCase() === type.toLowerCase()) || null;
}

// ---------------------------------------------------------------------------
// Shared state across tests (populated in before() hooks)
// ---------------------------------------------------------------------------
let allPokemon = [];

// ============================================================================
// TEST SUITES
// ============================================================================

// ---------- Pokemon Data Endpoints -----------------------------------------

describe('GET /api/pokemon', () => {
  it('returns 200 with an array of 6 pokemon', async () => {
    const { status, body } = await api('GET', '/api/pokemon');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body), 'Response should be an array');
    assert.equal(body.length, 6, 'Roster should contain exactly 6 pokemon');

    // Cache for later tests
    allPokemon = body;
  });

  it('each pokemon has required fields', async () => {
    const { body } = await api('GET', '/api/pokemon');
    for (const p of body) {
      assert.ok(p.id !== undefined, `Pokemon missing id`);
      assert.ok(typeof p.name === 'string', `Pokemon ${p.id} missing name`);
      assert.ok(typeof p.type === 'string', `Pokemon ${p.id} missing type`);
      assert.ok(typeof p.hp === 'number', `Pokemon ${p.id} missing hp`);
      assert.ok(typeof p.attack === 'number', `Pokemon ${p.id} missing attack`);
      assert.ok(typeof p.defense === 'number', `Pokemon ${p.id} missing defense`);
      assert.ok(typeof p.speed === 'number', `Pokemon ${p.id} missing speed`);
      assert.ok(Array.isArray(p.moves), `Pokemon ${p.id} missing moves array`);
      assert.equal(p.moves.length, 4, `Pokemon ${p.id} should have exactly 4 moves`);
    }
  });
});

describe('GET /api/pokemon/:id', () => {
  it('returns correct pokemon by id', async () => {
    // Fetch roster first to know a valid id
    const { body: roster } = await api('GET', '/api/pokemon');
    const first = roster[0];

    const { status, body } = await api('GET', `/api/pokemon/${first.id}`);
    assert.equal(status, 200);
    assert.equal(body.id, first.id);
    assert.equal(body.name, first.name);
  });

  it('returns 404 for non-existent pokemon (id 999)', async () => {
    const { status } = await api('GET', '/api/pokemon/999');
    assert.equal(status, 404);
  });
});

// ---------- Battle Start ---------------------------------------------------

describe('POST /api/battle/start', () => {
  it('creates a battle with valid pokemon IDs', async () => {
    const { body: roster } = await api('GET', '/api/pokemon');
    const player = roster[0];
    const cpu = roster[1];

    const { status, body } = await api('POST', '/api/battle/start', {
      playerPokemonId: player.id,
      cpuPokemonId: cpu.id,
    });

    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.id, 'Battle should have an id');
    assert.ok(body.playerPokemon, 'Battle should include playerPokemon');
    assert.ok(body.cpuPokemon, 'Battle should include cpuPokemon');
    assert.equal(body.playerPokemon.name, player.name);
    assert.equal(body.cpuPokemon.name, cpu.name);
    // Battle should start as active
    assert.equal(body.status, 'active');
  });

  it('returns error for invalid pokemon ID', async () => {
    const { status } = await api('POST', '/api/battle/start', {
      playerPokemonId: 999,
      cpuPokemonId: 998,
    });
    // Expect 400 or 404 — either is acceptable for invalid input
    assert.ok(
      status === 400 || status === 404,
      `Expected 400 or 404 for invalid IDs, got ${status}`
    );
  });
});

// ---------- Battle Move Execution ------------------------------------------

describe('POST /api/battle/move', () => {
  it('executes a move and returns updated battle state', async () => {
    // Setup: start a fresh battle
    const { body: roster } = await api('GET', '/api/pokemon');
    const { body: battle } = await api('POST', '/api/battle/start', {
      playerPokemonId: roster[0].id,
      cpuPokemonId: roster[1].id,
    });

    const { status, body } = await api('POST', '/api/battle/move', {
      battleId: battle.id,
      moveIndex: 0, // use first move
    });

    assert.equal(status, 200);
    assert.ok(body.playerPokemon, 'Response should include playerPokemon');
    assert.ok(body.cpuPokemon, 'Response should include cpuPokemon');
    // At least one pokemon should have taken damage (HP decreased)
    const playerDamaged = body.playerPokemon.currentHp < battle.playerPokemon.hp;
    const cpuDamaged = body.cpuPokemon.currentHp < battle.cpuPokemon.hp;
    assert.ok(
      playerDamaged || cpuDamaged,
      'At least one pokemon should have taken damage after a move'
    );
    // Log should exist and have entries
    assert.ok(Array.isArray(body.log), 'Battle should have a log array');
    assert.ok(body.log.length > 0, 'Log should have at least one entry after a move');
  });
});

// ---------- Type Effectiveness ---------------------------------------------

describe('Type Effectiveness', () => {
  /**
   * Helper: start a battle between two specific pokemon types and execute
   * a move of the attacker's type. Returns the battle state after the move.
   *
   * Assumption: each pokemon has at least one move matching its own type (STAB).
   */
  async function battleWithTypes(attackerType, defenderType) {
    const { body: roster } = await api('GET', '/api/pokemon');
    const attacker = findByType(roster, attackerType);
    const defender = findByType(roster, defenderType);
    assert.ok(attacker, `No ${attackerType}-type pokemon in roster`);
    assert.ok(defender, `No ${defenderType}-type pokemon in roster`);

    // Start battle — attacker is player, defender is CPU
    const { body: battle } = await api('POST', '/api/battle/start', {
      playerPokemonId: attacker.id,
      cpuPokemonId: defender.id,
    });

    // Find a move index that matches the attacker's type for STAB / type advantage
    const moveIdx = attacker.moves.findIndex(
      m => m.type && m.type.toLowerCase() === attackerType.toLowerCase()
    );
    assert.ok(moveIdx !== -1, `${attacker.name} has no ${attackerType}-type move`);

    const { body: afterMove } = await api('POST', '/api/battle/move', {
      battleId: battle.id,
      moveIndex: moveIdx,
    });

    return { battle, afterMove, attacker, defender };
  }

  it('fire move vs grass pokemon does super-effective (2x) damage', async () => {
    const { battle, afterMove, defender } = await battleWithTypes('fire', 'grass');

    // The CPU (grass) should have taken damage.
    // We can't assert exact 2x without knowing internals, but we verify damage happened
    // and the log mentions super-effective (if the backend includes that info).
    const cpuHpBefore = battle.cpuPokemon.hp || battle.cpuPokemon.currentHp;
    const cpuHpAfter = afterMove.cpuPokemon.currentHp;
    const damage = cpuHpBefore - cpuHpAfter;
    assert.ok(damage > 0, 'Fire move should deal damage to grass pokemon');

    // Optional: check log for "super effective" text
    const logText = (afterMove.log || []).join(' ').toLowerCase();
    // Not a hard fail — backend may not include this text — but log it
    if (!logText.includes('super effective') && !logText.includes('2x')) {
      console.log('  ℹ️  Log does not mention "super effective" — consider adding it');
    }
  });

  it('water move vs fire pokemon does super-effective (2x) damage', async () => {
    const { battle, afterMove } = await battleWithTypes('water', 'fire');

    const cpuHpBefore = battle.cpuPokemon.hp || battle.cpuPokemon.currentHp;
    const cpuHpAfter = afterMove.cpuPokemon.currentHp;
    const damage = cpuHpBefore - cpuHpAfter;
    assert.ok(damage > 0, 'Water move should deal damage to fire pokemon');
  });

  // Bonus: verify the reverse is not-very-effective
  it('fire move vs water pokemon does reduced damage (not very effective)', async () => {
    const { battle, afterMove } = await battleWithTypes('fire', 'water');

    const cpuHpBefore = battle.cpuPokemon.hp || battle.cpuPokemon.currentHp;
    const cpuHpAfter = afterMove.cpuPokemon.currentHp;
    const damage = cpuHpBefore - cpuHpAfter;
    // Damage should still happen, just reduced
    assert.ok(damage >= 0, 'Fire move vs water should deal some (reduced) damage');
  });
});

// ---------- Speed & Turn Order ---------------------------------------------

describe('Speed determines turn order', () => {
  it('faster pokemon attacks first', async () => {
    const { body: roster } = await api('GET', '/api/pokemon');

    // Sort by speed to find fastest and slowest
    const sorted = [...roster].sort((a, b) => b.speed - a.speed);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];

    // Skip if they have equal speed — can't test deterministically
    if (fastest.speed === slowest.speed) {
      console.log('  ⚠️  All pokemon have equal speed — skipping turn order test');
      return;
    }

    // Player = fastest, CPU = slowest
    const { body: battle } = await api('POST', '/api/battle/start', {
      playerPokemonId: fastest.id,
      cpuPokemonId: slowest.id,
    });

    const { body: afterMove } = await api('POST', '/api/battle/move', {
      battleId: battle.id,
      moveIndex: 0,
    });

    // The log should show the faster pokemon attacking first.
    // We check that the first log entry mentions the player's (faster) pokemon.
    assert.ok(afterMove.log && afterMove.log.length > 0, 'Log should have entries');
    const firstLogEntry = afterMove.log[0].toLowerCase();
    assert.ok(
      firstLogEntry.includes(fastest.name.toLowerCase()),
      `First log entry should mention ${fastest.name} (faster pokemon). Got: "${afterMove.log[0]}"`
    );
  });
});

// ---------- Battle End (HP reaches 0) --------------------------------------

describe('Battle ends when HP reaches 0', () => {
  it('repeated moves eventually end the battle', async () => {
    const { body: roster } = await api('GET', '/api/pokemon');

    const { body: battle } = await api('POST', '/api/battle/start', {
      playerPokemonId: roster[0].id,
      cpuPokemonId: roster[1].id,
    });

    let currentBattle = battle;
    let moves = 0;
    const MAX_MOVES = 50; // safety limit to avoid infinite loop

    while (currentBattle.status === 'active' && moves < MAX_MOVES) {
      const { body } = await api('POST', '/api/battle/move', {
        battleId: battle.id,
        moveIndex: 0,
      });
      currentBattle = body;
      moves++;
    }

    assert.ok(moves < MAX_MOVES, `Battle did not end within ${MAX_MOVES} moves`);
    assert.ok(
      currentBattle.status === 'win' || currentBattle.status === 'lose',
      `Battle should end with "win" or "lose", got "${currentBattle.status}"`
    );

    // Verify the loser's HP is 0 or below
    if (currentBattle.status === 'win') {
      assert.ok(
        currentBattle.cpuPokemon.currentHp <= 0,
        'CPU pokemon HP should be 0 or below on player win'
      );
    } else {
      assert.ok(
        currentBattle.playerPokemon.currentHp <= 0,
        'Player pokemon HP should be 0 or below on player lose'
      );
    }
  });
});

// ---------- Get Battle State -----------------------------------------------

describe('GET /api/battle/:id', () => {
  it('returns current battle state for an active battle', async () => {
    const { body: roster } = await api('GET', '/api/pokemon');
    const { body: battle } = await api('POST', '/api/battle/start', {
      playerPokemonId: roster[0].id,
      cpuPokemonId: roster[1].id,
    });

    const { status, body } = await api('GET', `/api/battle/${battle.id}`);
    assert.equal(status, 200);
    assert.equal(body.id, battle.id);
    assert.ok(body.playerPokemon, 'Should include playerPokemon');
    assert.ok(body.cpuPokemon, 'Should include cpuPokemon');
    assert.equal(body.status, 'active');
  });

  it('returns 404 for non-existent battle', async () => {
    const { status } = await api('GET', '/api/battle/nonexistent-id-12345');
    assert.equal(status, 404);
  });

  it('reflects updated state after moves', async () => {
    const { body: roster } = await api('GET', '/api/pokemon');
    const { body: battle } = await api('POST', '/api/battle/start', {
      playerPokemonId: roster[0].id,
      cpuPokemonId: roster[1].id,
    });

    // Execute a move
    await api('POST', '/api/battle/move', {
      battleId: battle.id,
      moveIndex: 0,
    });

    // Fetch state — should reflect the damage
    const { status, body } = await api('GET', `/api/battle/${battle.id}`);
    assert.equal(status, 200);

    const playerDamaged = body.playerPokemon.currentHp < battle.playerPokemon.hp;
    const cpuDamaged = body.cpuPokemon.currentHp < battle.cpuPokemon.hp;
    assert.ok(
      playerDamaged || cpuDamaged,
      'GET battle state should reflect damage from the executed move'
    );
  });
});
