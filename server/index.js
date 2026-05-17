const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');

dotenv.config();

const authRoutes = require('./routes/auth');
const videosRoutes = require('./routes/videos');
const optimizationsRoutes = require('./routes/optimizations');
const monitoringRoutes = require('./routes/monitoring');
const verdictsRoutes = require('./routes/verdicts');
require('./db');

const app = express();
const port = 3005;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/optimizations', optimizationsRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/verdicts', verdictsRoutes);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
