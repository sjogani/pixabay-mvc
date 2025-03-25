const express = require('express');
const bodyParser = require('body-parser');
const songRoutes = require('./routes/songRoutes');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use('/api', songRoutes);

// Home Route
app.get('/', (req, res) => {
  res.send('🎵 Welcome to Pixabay Song Scraper API 🎧');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
