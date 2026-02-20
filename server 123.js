  // Notificações de amizade
  socket.on('notify', ({ to, msg }) => {
    const toSocket = onlineUsers[to];
    if (toSocket) {
      io.to(toSocket).emit('notify', { msg });
    }
  });
const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { readMessages, saveMessages } = require('./src/utils/localdb');

const app = express();
const isHttps = process.env.HTTPS === 'true';
const PORT = process.env.PORT || 4000;
// Socket.IO instance will be set after server creation
app.set('io', null);

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rotas
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/messages', require('./src/routes/messages'));

// Página principal
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTPS config
let server;
if (isHttps) {
  const options = {
    key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem')),
  };
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}
}
const io = socketIo(server, {
  cors: { origin: true, credentials: true }
});
app.set('io', io);

// Socket.io
const io = socketIo(server, {
  cors: { origin: true, credentials: true }
});

let onlineUsers = {};
let typingStatus = {};
app.set('onlineUsers', onlineUsers);

io.use((socket, next) => {
  try {
    const token = socket.handshake.headers.cookie?.split(';').find(c => c.trim().startsWith('token='));
    if (!token) return next(new Error('Não autenticado.'));
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token.split('=')[1], process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Não autenticado.'));
  }
});

io.on('connection', (socket) => {
  const username = socket.user.username;
  onlineUsers[username] = socket.id;
  typingStatus[username] = false;

  // Enviar status de todos os usuários
  io.emit('status', {
    online: { ...onlineUsers },
    typing: { ...typingStatus }
  });

  socket.on('typing', (isTyping) => {
    typingStatus[username] = isTyping;
    io.emit('status', {
      online: { ...onlineUsers },
      typing: { ...typingStatus }
    });
  });

  socket.on('chat message', (msg) => {
    const messages = readMessages();
    const message = {
      sender: username,
      content: msg.content,
      isEmoji: msg.isEmoji,
      timestamp: new Date().toISOString()
    };
    messages.push(message);
    saveMessages(messages);
    io.emit('chat message', message);
    typingStatus[username] = false;
    io.emit('status', {
      online: { ...onlineUsers },
      typing: { ...typingStatus }
    });
  });

  socket.on('disconnect', () => {
    delete onlineUsers[username];
    delete typingStatus[username];
    // Atualizar lastOnline
    const { readUsers, saveUsers } = require('./src/utils/localdb');
    let users = readUsers();
    let user = users.find(u => u.username === username);
    if (user) {
      user.lastOnline = new Date().toISOString();
      saveUsers(users);
    }
    io.emit('status', {
      online: { ...onlineUsers },
      typing: { ...typingStatus }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em ${isHttps ? 'https' : 'http'}://localhost:${PORT}`);
});
