/**
 * app.js — Main app logic: screen navigation, Pokemon selection, game flow
 *          Enhanced with: dual types, stat bars, animated sprites, ability tooltips
 */

const App = (() => {
  // Sprite URLs
  const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
  const SPRITE_BACK_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/';
  const ANIMATED_SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/';
  const ANIMATED_BACK_SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/';

  // Pokemon sprite IDs
  const SPRITE_IDS = {
    pikachu: 25,
    charizard: 6,
    blastoise: 9,
    venusaur: 3,
    gengar: 94,
    snorlax: 143,
  };

  // Pokemon type data (from RESEARCH-DEEP.md)
  const POKEMON_TYPES = {
    pikachu: ['electric'],
    charizard: ['fire', 'flying'],
    blastoise: ['water'],
    venusaur: ['grass', 'poison'],
    gengar: ['ghost', 'poison'],
    snorlax: ['normal'],
  };

  // Pokemon abilities (from RESEARCH-DEEP.md)
  const POKEMON_ABILITIES = {
    pikachu: { name: 'Static', description: 'When hit by a contact move, 30% chance the attacker becomes paralyzed.' },
    charizard: { name: 'Blaze', description: 'When HP drops below 1/3, Fire-type moves deal 1.5× damage.' },
    blastoise: { name: 'Torrent', description: 'When HP drops below 1/3, Water-type moves deal 1.5× damage.' },
    venusaur: { name: 'Overgrow', description: 'When HP drops below 1/3, Grass-type moves deal 1.5× damage.' },
    gengar: { name: 'Cursed Body', description: 'When hit, 30% chance the attacker\'s move becomes disabled for 4 turns.' },
    snorlax: { name: 'Thick Fat', description: 'Fire-type and Ice-type moves deal 0.5× damage to this Pokémon.' },
  };

  // Pokemon base stats (from RESEARCH-DEEP.md)
  const POKEMON_STATS = {
    pikachu: { hp: 35, attack: 55, defense: 40, spAtk: 50, spDef: 50, speed: 90 },
    charizard: { hp: 78, attack: 84, defense: 78, spAtk: 109, spDef: 85, speed: 100 },
    blastoise: { hp: 79, attack: 83, defense: 100, spAtk: 85, spDef: 105, speed: 78 },
    venusaur: { hp: 80, attack: 82, defense: 83, spAtk: 100, spDef: 100, speed: 80 },
    gengar: { hp: 60, attack: 65, defense: 60, spAtk: 130, spDef: 75, speed: 110 },
    snorlax: { hp: 160, attack: 110, defense: 65, spAtk: 65, spDef: 110, speed: 30 },
  };

  // Max base stat for bar scaling (Snorlax HP = 160)
  const MAX_BASE_STAT = 160;

  // State
  let allPokemon = [];
  let selectedPokemonId = null;

  /**
   * Get sprite URL — prefer animated GIF, fallback to static PNG
   */
  function getSpriteUrl(pokemon, back = false) {
    const name = pokemon.name?.toLowerCase();
    const spriteId = SPRITE_IDS[name] || pokemon.spriteId || pokemon.id;

    if (back) {
      return `${ANIMATED_BACK_SPRITE_URL}${spriteId}.gif`;
    }
    return `${ANIMATED_SPRITE_URL}${spriteId}.gif`;
  }

  /**
   * Get static sprite URL (for select screen cards)
   */
  function getStaticSpriteUrl(pokemon) {
    const name = pokemon.name?.toLowerCase();
    const spriteId = SPRITE_IDS[name] || pokemon.spriteId || pokemon.id;
    return `${SPRITE_URL}${spriteId}.png`;
  }

  /**
   * Get types for a pokemon
   */
  function getTypes(pokemon) {
    const name = pokemon.name?.toLowerCase();
    // Prefer backend data, fallback to local data
    if (pokemon.types && Array.isArray(pokemon.types) && pokemon.types.length > 0) {
      return pokemon.types.map(t => typeof t === 'string' ? t : t.name || t.type || 'normal');
    }
    return POKEMON_TYPES[name] || [pokemon.type || 'normal'];
  }

  /**
   * Get ability for a pokemon
   */
  function getAbility(pokemon) {
    const name = pokemon.name?.toLowerCase();
    if (pokemon.ability) return pokemon.ability;
    return POKEMON_ABILITIES[name] || null;
  }

  /**
   * Get all 6 base stats for a pokemon
   */
  function getBaseStats(pokemon) {
    const name = pokemon.name?.toLowerCase();
    // Prefer backend stats
    if (pokemon.stats && typeof pokemon.stats === 'object') {
      return {
        hp: pokemon.stats.hp || 0,
        attack: pokemon.stats.attack || pokemon.stats.atk || 0,
        defense: pokemon.stats.defense || pokemon.stats.def || 0,
        spAtk: pokemon.stats.spAtk || pokemon.stats.specialAttack || pokemon.stats['sp.atk'] || pokemon.stats.spa || 0,
        spDef: pokemon.stats.spDef || pokemon.stats.specialDefense || pokemon.stats['sp.def'] || pokemon.stats.spd || 0,
        speed: pokemon.stats.speed || pokemon.stats.spe || 0,
      };
    }
    return POKEMON_STATS[name] || { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 };
  }

  /**
   * Get stat bar color based on value
   */
  function getStatColor(value) {
    if (value >= 120) return '#4caf50';      // green - excellent
    if (value >= 90) return '#8bc34a';       // light green - good
    if (value >= 70) return '#ffeb3b';       // yellow - average
    if (value >= 50) return '#ff9800';       // orange - below average
    return '#f44336';                         // red - low
  }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
  }

  /**
   * Render Pokemon selection cards with dual types, stat bars, abilities
   */
  function renderPokemonGrid(pokemonList) {
    const grid = document.getElementById('pokemon-roster');
    grid.innerHTML = '';

    pokemonList.forEach(pokemon => {
      const card = document.createElement('div');
      card.className = 'pokemon-card';
      card.dataset.id = pokemon.id;

      const types = getTypes(pokemon);
      const ability = getAbility(pokemon);
      const stats = getBaseStats(pokemon);
      const spriteUrl = getStaticSpriteUrl(pokemon);

      // Build type badges HTML
      const typeBadgesHtml = types.map(t =>
        `<span class="card-type type-${t.toLowerCase()}">${t.toLowerCase()}</span>`
      ).join('');

      // Build stat bars HTML
      const statEntries = [
        { label: 'HP', value: stats.hp },
        { label: 'ATK', value: stats.attack },
        { label: 'DEF', value: stats.defense },
        { label: 'SPA', value: stats.spAtk },
        { label: 'SPD', value: stats.spDef },
        { label: 'SPE', value: stats.speed },
      ];

      const statBarsHtml = statEntries.map(s => {
        const pct = Math.min(100, (s.value / MAX_BASE_STAT) * 100);
        const color = getStatColor(s.value);
        return `
          <div class="card-stat-row">
            <span class="card-stat-label">${s.label}</span>
            <div class="card-stat-bar-bg">
              <div class="card-stat-bar-fill" style="width:${pct}%; background:${color}"></div>
            </div>
            <span class="card-stat-value">${s.value}</span>
          </div>
        `;
      }).join('');

      // Ability HTML
      const abilityHtml = ability ? `
        <span class="card-ability">
          ${ability.name}
          <span class="ability-tooltip">${ability.description}</span>
        </span>
      ` : '';

      card.innerHTML = `
        <img class="card-sprite" src="${spriteUrl}" alt="${pokemon.name}" loading="lazy">
        <span class="card-name">${pokemon.name}</span>
        <div class="card-types">${typeBadgesHtml}</div>
        ${abilityHtml}
        <div class="card-stat-bars">${statBarsHtml}</div>
      `;

      card.addEventListener('click', () => {
        AudioManager.buttonClick();
        selectPokemon(pokemon, card);
      });
      grid.appendChild(card);
    });
  }

  /**
   * Handle Pokemon selection
   */
  function selectPokemon(pokemon, cardElement) {
    document.querySelectorAll('.pokemon-card').forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');
    selectedPokemonId = pokemon.id;

    const preview = document.getElementById('selected-preview');
    const sprite = document.getElementById('selected-sprite');
    const name = document.getElementById('selected-name');
    const typesContainer = document.getElementById('selected-types');

    sprite.src = getStaticSpriteUrl(pokemon);
    name.textContent = pokemon.name;

    // Render dual types in preview
    const types = getTypes(pokemon);
    typesContainer.innerHTML = types.map(t =>
      `<span class="card-type type-${t.toLowerCase()}">${t.toLowerCase()}</span>`
    ).join('');

    preview.classList.remove('hidden');
  }

  /**
   * Start battle
   */
  async function startBattle() {
    if (!selectedPokemonId) return;

    const btn = document.getElementById('btn-battle');
    btn.textContent = 'LOADING...';
    btn.disabled = true;

    try {
      const battleState = await API.startBattle(selectedPokemonId);
      const playerPokemon = allPokemon.find(p => p.id === selectedPokemonId) || {};

      // Enrich with local type/ability data
      const name = playerPokemon.name?.toLowerCase();
      if (!playerPokemon.types) playerPokemon.types = POKEMON_TYPES[name] || [playerPokemon.type || 'normal'];
      if (!playerPokemon.ability) playerPokemon.ability = POKEMON_ABILITIES[name] || null;

      // Also enrich opponent
      const opponent = battleState.opponent || battleState.opponentPokemon || battleState.cpu || {};
      const oppName = opponent.name?.toLowerCase();
      if (!opponent.types) opponent.types = POKEMON_TYPES[oppName] || [opponent.type || 'normal'];
      if (!opponent.ability) opponent.ability = POKEMON_ABILITIES[oppName] || null;

      // Write enriched data back
      if (battleState.opponent) {
        battleState.opponent.types = opponent.types;
        battleState.opponent.ability = opponent.ability;
      } else if (battleState.cpu) {
        battleState.cpu.types = opponent.types;
        battleState.cpu.ability = opponent.ability;
      }

      Battle.init(battleState, playerPokemon, getSpriteUrl, SPRITE_IDS);
      showScreen('battle-screen');
    } catch (err) {
      console.error('Failed to start battle:', err);
      alert(`Failed to start battle: ${err.message}`);
    } finally {
      btn.textContent = 'BATTLE!';
      btn.disabled = false;
    }
  }

  /**
   * Show result screen
   */
  function showResult(won, playerPokemon, opponentPokemon) {
    const resultSprite = document.getElementById('result-sprite');
    const resultTitle = document.getElementById('result-title');
    const resultMessage = document.getElementById('result-message');

    if (won) {
      resultSprite.src = getSpriteUrl(playerPokemon, false);
      resultSprite.onerror = function() {
        this.src = getStaticSpriteUrl(playerPokemon);
      };
      resultTitle.textContent = 'YOU WIN!';
      resultTitle.className = 'result-title win';
      resultMessage.textContent = `${playerPokemon.name} defeated ${opponentPokemon.name}!`;
    } else {
      resultSprite.src = getSpriteUrl(opponentPokemon, false);
      resultSprite.onerror = function() {
        this.src = getStaticSpriteUrl(opponentPokemon);
      };
      resultTitle.textContent = 'YOU LOSE...';
      resultTitle.className = 'result-title lose';
      resultMessage.textContent = `${opponentPokemon.name} defeated ${playerPokemon.name}...`;
    }

    showScreen('result-screen');
  }

  /**
   * Reset and go back to select screen
   */
  function playAgain() {
    selectedPokemonId = null;
    document.querySelectorAll('.pokemon-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('selected-preview').classList.add('hidden');
    showScreen('select-screen');
  }

  /**
   * Initialize the app
   */
  async function init() {
    showScreen('loading-screen');

    try {
      const data = await API.getAllPokemon();
      allPokemon = Array.isArray(data) ? data : (data.pokemon || data.data || []);

      if (allPokemon.length === 0) {
        throw new Error('No Pokemon data received from server');
      }

      // Enrich pokemon with local type/stat data
      allPokemon.forEach(p => {
        const name = p.name?.toLowerCase();
        if (!p.types) p.types = POKEMON_TYPES[name] || [p.type || 'normal'];
        if (!p.ability) p.ability = POKEMON_ABILITIES[name] || null;
        if (!p.stats || Object.keys(p.stats).length < 6) {
          const localStats = POKEMON_STATS[name];
          if (localStats) {
            p.stats = { ...localStats, ...(p.stats || {}) };
          }
        }
      });

      renderPokemonGrid(allPokemon);

      document.getElementById('btn-battle').addEventListener('click', () => {
        AudioManager.buttonClick();
        startBattle();
      });
      document.getElementById('btn-play-again').addEventListener('click', () => {
        AudioManager.buttonClick();
        playAgain();
      });

      setTimeout(() => showScreen('select-screen'), 800);
    } catch (err) {
      console.error('Failed to initialize:', err);
      document.querySelector('.loading-text').textContent = `Error: ${err.message}`;
      document.querySelector('.loading-text').style.color = '#f44336';
    }
  }

  return {
    init,
    showScreen,
    showResult,
    getSpriteUrl,
    SPRITE_IDS,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
