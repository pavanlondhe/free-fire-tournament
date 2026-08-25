const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'teams.json');
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

function clean(value, max = 40) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, max); }
function readTeams() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function writeTeams(teams) { fs.writeFileSync(DATA_FILE, JSON.stringify(teams, null, 2)); }
function validateTeam(body) {
  const values = { teamName: clean(body.teamName, 32), captain: clean(body.captain), phone: clean(body.phone, 20), players: [clean(body.player2), clean(body.player3), clean(body.player4)] };
  if (!values.teamName || !values.captain || !values.phone || values.players.some(player => !player)) return { error: 'Complete every registration field.' };
  if (!/^[0-9+() -]{7,20}$/.test(values.phone)) return { error: 'Enter a valid captain mobile number.' };
  return values;
}

app.get('/api/teams', (req, res) => res.json(readTeams()));
app.post('/api/teams', (req, res) => {
  const values = validateTeam(req.body);
  if (values.error) return res.status(400).json({ error: values.error });
  const teams = readTeams();
  const team = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...values, status: 'pending', roomId: '', roomPassword: '', points: 0, registeredAt: new Date().toISOString() };
  teams.push(team); writeTeams(teams); res.status(201).json(team);
});
app.put('/api/teams/:id', (req, res) => {
  const teams = readTeams(); const index = teams.findIndex(team => team.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Team not found.' });
  const allowed = {}; if (['pending', 'approved', 'rejected'].includes(req.body.status)) allowed.status = req.body.status;
  if (req.body.roomId !== undefined) allowed.roomId = clean(req.body.roomId, 30);
  if (req.body.roomPassword !== undefined) allowed.roomPassword = clean(req.body.roomPassword, 30);
  if (req.body.points !== undefined && Number.isFinite(Number(req.body.points))) allowed.points = Math.max(0, Math.min(9999, Number(req.body.points)));
  teams[index] = { ...teams[index], ...allowed }; writeTeams(teams); res.json(teams[index]);
});
app.delete('/api/teams/:id', (req, res) => { const teams = readTeams(); const next = teams.filter(team => team.id !== req.params.id); if (next.length === teams.length) return res.status(404).json({ error: 'Team not found.' }); writeTeams(next); res.json({ message: 'Team deleted.' }); });
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong.' }); });
app.listen(PORT, () => console.log(`FF Arena running at http://localhost:${PORT}`));