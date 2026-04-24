const express = require('express');
const router = express.Router();
const pokemon = require('../data/pokemon.json');
const moves = require('../data/moves.json');

// GET /api/pokemon — list all pokemon (static data, cacheable)
router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.json(pokemon);
});

// GET /api/pokemon/:id — get pokemon detail with full move data
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const poke = pokemon.find(p => p.id === id);

  if (!poke) {
    return res.status(404).json({ error: 'Pokemon not found' });
  }

  // Enrich with full move data
  const enriched = {
    ...poke,
    moves: poke.moves.map(moveId => {
      const move = moves[moveId];
      return move || { id: moveId, name: moveId, type: 'normal', power: 40, accuracy: 100 };
    })
  };

  res.set('Cache-Control', 'public, max-age=3600');
  res.json(enriched);
});

module.exports = router;
