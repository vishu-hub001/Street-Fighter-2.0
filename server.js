const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(require('path').join(__dirname, 'index.html')));
const server = http.createServer(app);
const io = new Server(server);
const rooms = {}; // code -> { ids:[], info:{id:{char,ready}} }

const code = () => {
  let c;
  do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); }
  while (rooms[c]);
  return c;
};
const sync = (c) => {
  const r = rooms[c]; if (!r) return;
  io.to(c).emit('room', { code: c, players: r.ids.map(id => ({ id, ...r.info[id] })) });
};
function leave(s) {
  const c = s.data.room; if (!c || !rooms[c]) return;
  const r = rooms[c];
  r.ids = r.ids.filter(i => i !== s.id); delete r.info[s.id];
  s.leave(c); s.data.room = null;
  if (!r.ids.length) delete rooms[c]; else { r.ids.forEach(i => r.info[i].ready = false); sync(c); }
}
function enter(s, c) {
  s.join(c); s.data.room = c;
  rooms[c].ids.push(s.id); rooms[c].info[s.id] = { char: 'wizard', ready: false };
  sync(c);
}

io.on('connection', (s) => {
  s.on('create', (cb) => { leave(s); const c = code(); rooms[c] = { ids: [], info: {} }; enter(s, c); cb({ code: c }); });
  s.on('join', (c, cb) => {
    leave(s);
    const r = rooms[c];
    if (!r) return cb({ err: 'Room not found' });
    if (r.ids.length >= 2) return cb({ err: 'Room is full' });
    enter(s, c); cb({ code: c });
  });
  s.on('pick', (ch) => { const r = rooms[s.data.room]; if (r && r.info[s.id]) { r.info[s.id].char = ch; r.info[s.id].ready = false; sync(s.data.room); } });
  s.on('ready', (v) => {
    const c = s.data.room, r = rooms[c]; if (!r) return;
    r.info[s.id].ready = !!v; sync(c);
    if (r.ids.length === 2 && r.ids.every(i => r.info[i].ready)) {
      io.to(c).emit('start', { players: r.ids.map(id => ({ id, char: r.info[id].char })) });
      r.ids.forEach(i => r.info[i].ready = false); sync(c);
    }
  });
  s.on('rel', (d) => { if (s.data.room) (d.k === 'st' ? s.to(s.data.room).volatile : s.to(s.data.room)).emit('rel', d); });
  s.on('disconnect', () => leave(s));
});
server.listen(process.env.PORT || 3000, () => console.log('Clash Arena running'));
