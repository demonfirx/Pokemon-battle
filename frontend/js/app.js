/**
 * app.js — Main app logic: screen navigation, Pokemon selection, game flow
 */

const App = (() => {
  // Sprite URL builder
  const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
  const SPRITE_BACK_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/';

  // Pokemon sprite IDs (name -> PokeAPI ID)
  const SPRITE_IDS = {
    pikachu: 25,
    charizard: 6,
    blastoise: 9,
    venusaur: 3,
    gengar: 94,
    snorlax: 143,
  };

  // State
  let allPokemon = [];
  let selectedPokemonId = null;

  /**
   * Get sprite URL for a pokemon
   */
  function getSpriteUrl(pokemon, back = false) {
    const name = pokemon.name?.toLowerCase();
    const spriteId = SPRITE_IDS[name] || pokemon.spriteId || pokemon.id;
    const base = back ? SPRITE_BACK_URL : SPRITE_URL;
    return `${base}${spriteId}.png`;
  }

  /**
   * Switch between screens
   */
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
  }

  /**
   * Render Pokemon selection cards
   */
  function renderPokemonGrid(pokemonList) {
    const grid = document.getElementById('pokemon-roster');
    grid.innerHTML = '';

    pokemonList.forEach(pokemon => {
      const card = document.createElement('div');
      card.className = 'pokemon-card';
      card.dataset.id = pokemon.id;

      const typeLower = (pokemon.type || 'normal').toLowerCase();
      const spriteUrl = getSpriteUrl(pokemon);

      card.innerHTML = `
        <img class="card-sprite" src="${spriteUrl}" alt="${pokemon.name}" loading="lazy">
        <span class="card-name">${pokemon.name}</span>
        <span class="card-type type-${typeLower}">${typeLower}</span>
        <div class="card-stats">
          <span>HP<br><span class="stat-value">${pokemon.stats?.hp || pokemon.hp || '?'}</span></span>
          <span>ATK<br><span class="stat-value">${pokemon.stats?.attack || pokemon.attack || '?'}</span></span>
          <span>DEF<br><span class="stat-value">${pokemon.stats?.defense || pokemon.defense || '?'}</span></span>
          <span>SPD<br><span class="stat-value">${pokemon.stats?.speed || pokemon.speed || '?'}</span></span>
        </div>
      `;

      card.addEventListener('click', () => selectPokemon(pokemon, card));
      grid.appendChild(card);
    });
  }

  /**
   * Handle Pokemon selection
   */
  function selectPokemon(pokemon, cardElement) {
    // Deselect previous
    document.querySelectorAll('.pokemon-card').forEach(c => c.classList.remove('selected'));

    // Select new
    cardElement.classList.add('selected');
    selectedPokemonId = pokemon.id;

    // Update preview
    const preview = document.getElementById('selected-preview');
    const sprite = document.getElementById('selected-sprite');
    const name = document.getElementById('selected-name');
    const type = document.getElementById('selected-type');

    sprite.src = getSpriteUrl(pokemon);
    name.textContent = pokemon.name;
    const typeLower = (pokemon.type || 'normal').toLowerCase();
    type.textContent = typeLower;
    type.className = `type-badge type-${typeLower}`;

    preview.classList.remove('hidden');
  }

  /**
   * Start battle with selected Pokemon
   */
  async function startBattle() {
    if (!selectedPokemonId) return;

    const btn = document.getElementById('btn-battle');
    btn.textContent = 'LOADING...';
    btn.disabled = true;

    try {
      const battleState = await API.startBattle(selectedPokemonId);

      // Find player and opponent pokemon data
      const playerPokemon = allPokemon.find(p => p.id === selectedPokemonId) || {};

      // Initialize battle screen
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
      resultSprite.src = getSpriteUrl(playerPokemon);
      resultTitle.textContent = 'YOU WIN!';
      resultTitle.className = 'result-title win';
      resultMessage.textContent = `${playerPokemon.name} defeated ${opponentPokemon.name}!`;
    } else {
      resultSprite.src = getSpriteUrl(opponentPokemon);
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
    // Show loading
    showScreen('loading-screen');

    try {
      // Fetch pokemon list from API
      const data = await API.getAllPokemon();
      // Handle both array response and { pokemon: [...] } response
      allPokemon = Array.isArray(data) ? data : (data.pokemon || data.data || []);

      if (allPokemon.length === 0) {
        throw new Error('No Pokemon data received from server');
      }

      // Render selection grid
      renderPokemonGrid(allPokemon);

      // Bind events
      document.getElementById('btn-battle').addEventListener('click', startBattle);
      document.getElementById('btn-play-again').addEventListener('click', playAgain);

      // Show select screen
      setTimeout(() => showScreen('select-screen'), 800);
    } catch (err) {
      console.error('Failed to initialize:', err);
      // Show error on loading screen
      document.querySelector('.loading-text').textContent = `Error: ${err.message}`;
      document.querySelector('.loading-text').style.color = '#f44336';
    }
  }

  // Public API
  return {
    init,
    showScreen,
    showResult,
    getSpriteUrl,
    SPRITE_IDS,
  };
})();

// Boot the app when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
