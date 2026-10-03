const { Server } = require('socket.io');

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*', // For development, allow all. In production, restrict to frontend URL.
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    }
  });

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Clients can join rooms based on their roles/IDs
    socket.on('join_room', (room) => {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room ${room}`);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
};

module.exports = setupSocket;
