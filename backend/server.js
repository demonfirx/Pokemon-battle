const express = require('express');
const cors = require('cors');
const compression = require('compression');
const pokemonRoutes = require('./routes/pokemon');
const battleRoutes = require('./routes/battle');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(compression()); // Gzip compression for all responses
app.use(express.json());

// Routes
app.use('/api/pokemon', pokemonRoutes);
app.use('/api/battle', battleRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Pokemon Battle API running on http://localhost:${PORT}`);
});

module.exports = app;
