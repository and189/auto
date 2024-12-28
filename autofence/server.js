import express from 'express';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const port = 3010;

app.use(cors()); // Enable CORS for all routes

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

app.get('/api/spawnpoints', async (req, res) => {
  const { north, south, east, west } = req.query;
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60); // 30 days in seconds

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      'SELECT id, lat, lon FROM spawnpoint WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND last_seen >= ?',
      [south, north, west, east, thirtyDaysAgo]
    );
    res.json(rows);
    await connection.end();
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});

