/**
 * api.js — API calls to backend at http://localhost:3001
 * Handles all communication with the Pokemon Battle API server.
 */

const API = (() => {
  const BASE_URL = 'http://localhost:3001/api';

  /**
   * Generic fetch wrapper with error handling
   */
  async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Is the backend running on port 3001?');
      }
      throw err;
    }
  }

  return {
    /**
     * GET /api/pokemon — List all available Pokemon
     * @returns {Promise<Array>} Array of pokemon objects
     */
    async getAllPokemon() {
      return request('/pokemon');
    },

    /**
     * GET /api/pokemon/:id — Get a specific Pokemon's details
     * @param {string|number} id - Pokemon ID
     * @returns {Promise<Object>} Pokemon detail object
     */
    async getPokemon(id) {
      return request(`/pokemon/${id}`);
    },

    /**
     * POST /api/battle/start — Start a new battle
     * @param {string|number} pokemonId - The player's chosen Pokemon ID
     * @returns {Promise<Object>} Battle state with battleId, player, opponent info
     */
    async startBattle(pokemonId) {
      return request('/battle/start', {
        method: 'POST',
        body: JSON.stringify({ pokemonId }),
      });
    },

    /**
     * POST /api/battle/move — Execute a move in battle
     * @param {string} battleId - The current battle ID
     * @param {string} moveId - The move to use
     * @returns {Promise<Object>} Updated battle state with results
     */
    async executeMove(battleId, moveId) {
      return request('/battle/move', {
        method: 'POST',
        body: JSON.stringify({ battleId, moveId }),
      });
    },

    /**
     * GET /api/battle/:id — Get current battle state
     * @param {string} battleId - The battle ID
     * @returns {Promise<Object>} Current battle state
     */
    async getBattleState(battleId) {
      return request(`/battle/${battleId}`);
    },
  };
})();
