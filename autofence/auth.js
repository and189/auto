// auth.js

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import DiscordStrategy from 'passport-discord';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();
const app = express();

// Discord OAuth2 Konfiguration
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: 'http://localhost:3010/auth/discord/callback',
    scope: ['identify']
  },
  async (accessToken, refreshToken, profile, done) => {
    // Hier speichern wir die Benutzerinformationen in der Sitzung
    return done(null, profile);
  }
));

// Session initialisieren
app.use(session({ secret: 'your_secret_key', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// Authentifizierungsrouten
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    // Erfolgreiche Authentifizierung
    res.redirect('/'); // Hier sollten Sie auf die Hauptseite umleiten
  }
);

// Logout Route
app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

// Route um Fences zu speichern
app.post('/api/fences', async (req, res) => {
  const userId = req.user.id; // Die Benutzer-ID von Passport
  const geojson = req.body.geojson; // GeoJSON von der Frontend-Anfrage

  // Überprüfen, ob der Benutzer bereits eine Fence hat
  const connection = await mysql.createConnection(dbConfig);
  const [exists] = await connection.execute(
    'SELECT COUNT(*) as count FROM fences WHERE user_id = ?',
    [userId]
  );

  if (exists[0].count > 0) {
    return res.status(400).json({ error: 'Sie haben bereits eine Fence erstellt.' });
  }

  // Speichern der neuen Fence in der Datenbank
  await connection.execute(
    'INSERT INTO fences (user_id, geojson) VALUES (?, ?)',
    [userId, JSON.stringify(geojson)]
  );
  
  res.status(201).json({ message: 'Fence erstellt' });
});

// Route um Fences abzurufen
app.get('/api/fences', async (req, res) => {
  const connection = await mysql.createConnection(dbConfig);
  const [rows] = await connection.execute('SELECT * FROM fences');
  res.json(rows);
});

export default app;
