const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'teams.json');
const PLATFORM_FILE = path.join(__dirname, 'platform.json');
const sessions = new Set();
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => { const origin = process.env.FRONTEND_ORIGIN; if (origin) res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

function clean(value, max = 40) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, max); }
function readTeams() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function writeTeams(teams) { fs.writeFileSync(DATA_FILE, JSON.stringify(teams, null, 2)); }
function readPlatform() { try { return JSON.parse(fs.readFileSync(PLATFORM_FILE, 'utf8')); } catch { const data = { players: [], tournaments: [], matches: [], results: [], announcements: [] }; fs.writeFileSync(PLATFORM_FILE, JSON.stringify(data, null, 2)); return data; } }
function writePlatform(data) { fs.writeFileSync(PLATFORM_FILE, JSON.stringify(data, null, 2)); }
function makeId(prefix) { return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`; }
function tokenFrom(req) { return (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers.cookie?.match(/ffarena_session=([^;]+)/)?.[1]; }
function requireAdmin(req, res, next) { const token = tokenFrom(req); if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Admin login required.' }); next(); }
function publicTeam(team) { const { phone, roomId, roomPassword, ...safe } = team; return safe; }
function validateTeam(body) {
  const format = ['solo', 'duo', 'squad'].includes(body.format) ? body.format : 'squad';
  const playerCount = { solo: 0, duo: 1, squad: 3 }[format];
  const values = { format, teamName: clean(body.teamName, 32), captain: clean(body.captain), phone: clean(body.phone, 20), players: [clean(body.player2), clean(body.player3), clean(body.player4)].slice(0, playerCount) };
  if (!values.teamName || !values.captain || !values.phone || values.players.length !== playerCount || values.players.some(player => !player)) return { error: 'Complete every registration field.' };
  if (!/^[0-9+() -]{7,20}$/.test(values.phone)) return { error: 'Enter a valid captain mobile number.' };
  return values;
}

app.post('/api/auth/login', (req, res) => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(503).json({ error: 'Admin login is not configured. Set ADMIN_PASSWORD on the server.' });
  if (String(req.body.password || '') !== password) return res.status(401).json({ error: 'Invalid admin password.' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.add(token);
  res.setHeader('Set-Cookie', `ffarena_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
  res.json({ authenticated: true });
});
app.post('/api/auth/logout', (req, res) => { sessions.delete(tokenFrom(req)); res.setHeader('Set-Cookie', 'ffarena_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); res.json({ authenticated: false }); });
app.get('/api/auth/session', (req, res) => res.json({ authenticated: Boolean(tokenFrom(req) && sessions.has(tokenFrom(req))) }));

app.get('/api/teams', (req, res) => res.json(readTeams().map(publicTeam)));
app.get('/api/teams/:id', (req, res) => { const team = readTeams().find(item => item.id === req.params.id); if (!team) return res.status(404).json({ error: 'Team not found.' }); res.json(publicTeam(team)); });
app.get('/api/admin/teams', requireAdmin, (req, res) => res.json(readTeams()));
app.post('/api/teams', (req, res) => {
  const values = validateTeam(req.body);
  if (values.error) return res.status(400).json({ error: values.error });
  const teams = readTeams();
  const team = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...values, status: 'pending', roomId: '', roomPassword: '', points: 0, registeredAt: new Date().toISOString() };
  teams.push(team); writeTeams(teams); res.status(201).json(publicTeam(team));
});
app.put('/api/teams/:id', requireAdmin, (req, res) => {
  const teams = readTeams(); const index = teams.findIndex(team => team.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Team not found.' });
  const allowed = {}; if (['pending', 'approved', 'rejected'].includes(req.body.status)) allowed.status = req.body.status;
  if (req.body.roomId !== undefined) allowed.roomId = clean(req.body.roomId, 30);
  if (req.body.roomPassword !== undefined) allowed.roomPassword = clean(req.body.roomPassword, 30);
  if (req.body.points !== undefined && Number.isFinite(Number(req.body.points))) allowed.points = Math.max(0, Math.min(9999, Number(req.body.points)));
  teams[index] = { ...teams[index], ...allowed }; writeTeams(teams); res.json(teams[index]);
});
app.delete('/api/teams/:id', requireAdmin, (req, res) => { const teams = readTeams(); const next = teams.filter(team => team.id !== req.params.id); if (next.length === teams.length) return res.status(404).json({ error: 'Team not found.' }); writeTeams(next); res.json({ message: 'Team deleted.' }); });
function resourceRoutes(name, prefix) {
  app.get(`/api/${prefix}`, (req, res) => { const data = readPlatform(); let records = data[name] || []; if (req.query.tournamentId) records = records.filter(record => record.tournamentId === req.query.tournamentId); res.json(records); });
  app.post(`/api/${prefix}`, requireAdmin, (req, res) => { const data = readPlatform(); const record = { id: makeId(prefix.slice(0, -1)), ...req.body, createdAt: new Date().toISOString() }; data[name].push(record); writePlatform(data); res.status(201).json(record); });
  app.put(`/api/${prefix}/:id`, requireAdmin, (req, res) => { const data = readPlatform(); const index = data[name].findIndex(record => record.id === req.params.id); if (index < 0) return res.status(404).json({ error: 'Record not found.' }); data[name][index] = { ...data[name][index], ...req.body, id: req.params.id }; writePlatform(data); res.json(data[name][index]); });
  app.delete(`/api/${prefix}/:id`, requireAdmin, (req, res) => { const data = readPlatform(); const before = data[name].length; data[name] = data[name].filter(record => record.id !== req.params.id); if (data[name].length === before) return res.status(404).json({ error: 'Record not found.' }); writePlatform(data); res.json({ message: 'Record deleted.' }); });
}
resourceRoutes('players', 'players');
resourceRoutes('tournaments', 'tournaments');
resourceRoutes('matches', 'matches');
resourceRoutes('announcements', 'announcements');

app.get('/api/results', requireAdmin, (req, res) => res.json(readPlatform().results));
app.post('/api/results', requireAdmin, (req, res) => { const data = readPlatform(); if (!req.body.teamId || !req.body.matchId) return res.status(400).json({ error: 'Team and match are required.' }); if (data.results.some(result => result.teamId === req.body.teamId && result.matchId === req.body.matchId && result.id !== req.body.id)) return res.status(409).json({ error: 'A result for this team and match already exists.' }); const result = { id: req.body.id || makeId('result'), ...req.body, placementPoints: Number(req.body.placementPoints || 0), killPoints: Number(req.body.killPoints || 0), totalPoints: Number(req.body.placementPoints || 0) + Number(req.body.killPoints || 0), createdAt: new Date().toISOString() }; const index = data.results.findIndex(item => item.id === result.id); if (index >= 0) data.results[index] = { ...data.results[index], ...result }; else data.results.push(result); writePlatform(data); res.status(index >= 0 ? 200 : 201).json(result); });
app.put('/api/results/:id', requireAdmin, (req, res) => { const data = readPlatform(); const index = data.results.findIndex(result => result.id === req.params.id); if (index < 0) return res.status(404).json({ error: 'Result not found.' }); data.results[index] = { ...data.results[index], ...req.body, id: req.params.id }; data.results[index].placementPoints = Number(data.results[index].placementPoints || 0); data.results[index].killPoints = Number(data.results[index].killPoints || 0); data.results[index].totalPoints = data.results[index].placementPoints + data.results[index].killPoints; writePlatform(data); res.json(data.results[index]); });
app.delete('/api/results/:id', requireAdmin, (req, res) => { const data = readPlatform(); const before = data.results.length; data.results = data.results.filter(result => result.id !== req.params.id); if (data.results.length === before) return res.status(404).json({ error: 'Result not found.' }); writePlatform(data); res.json({ message: 'Result deleted.' }); });
app.get('/api/leaderboard', (req, res) => { const data = readPlatform(); const rows = readTeams().map(team => { const results = data.results.filter(result => result.teamId === team.id && (!req.query.tournamentId || result.tournamentId === req.query.tournamentId)); const placementPoints = results.reduce((sum, result) => sum + Number(result.placementPoints || 0), 0); const killPoints = results.reduce((sum, result) => sum + Number(result.killPoints || 0), 0); return { teamId: team.id, team: team.teamName, matches: results.length, kills: results.reduce((sum, result) => sum + Number(result.kills || 0), 0), placementPoints, killPoints, totalPoints: placementPoints + killPoints }; }).sort((a, b) => b.totalPoints - a.totalPoints || b.kills - a.kills || a.team.localeCompare(b.team)).map((row, index) => ({ rank: index + 1, ...row })); res.json(rows); });

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong.' }); });
app.listen(PORT, () => console.log(`FF Arena running at http://localhost:${PORT}`));