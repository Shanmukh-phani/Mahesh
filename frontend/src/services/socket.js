import { io } from 'socket.io-client';

const getSocketURL = () => {
  if (import.meta.env && import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  return `http://${host}:5001`;
};

const socket = io(getSocketURL(), {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

export const roomForUser = (user) => {
  if (!user) return null;
  if (user.role === 'ADMIN') return 'ADMIN_ROOM';
  if (user.role === 'EXECUTIVE') return user._id ? `EXEC_${user._id}` : null;
  const store = user.store || user.storeId;
  const storeId = typeof store === 'string' ? store : store?._id;
  return storeId ? `STORE_${storeId}` : null;
};

let currentRoom = null;

// Server-side rooms are dropped on every reconnect, so re-join each time.
socket.on('connect', () => {
  if (currentRoom) socket.emit('join_room', currentRoom);
});

export const setSocketRoom = (room) => {
  currentRoom = room || null;
  if (!currentRoom) return;
  if (socket.connected) {
    socket.emit('join_room', currentRoom);
  } else {
    socket.connect();
  }
};

export default socket;
