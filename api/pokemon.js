const pokemon = require('../backend/data/pokemon.json');
const moves = require('../backend/data/moves.json');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/pokemon or /api/pokemon?id=X
  const { id } = req.query;

  if (id) {
    const poke = pokemon.find(p => p.id === parseInt(id));
    if (!poke) return res.status(404).json({ error: 'Pokemon not found' });

    const enriched = {
      ...poke,
      moves: poke.moves.map(moveId => {
        const move = moves[moveId];
        return move || { id: moveId, name: moveId, type: 'normal', power: 40, accuracy: 100 };
      })
    };
    return res.json(enriched);
  }

  res.json(pokemon);
};
