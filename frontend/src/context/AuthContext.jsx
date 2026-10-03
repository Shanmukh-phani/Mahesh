import React, { createContext, useState, useEffect } from 'react';
import api from '../services/api';
import socket, { roomForUser, setSocketRoom } from '../services/socket';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setSocketRoom(roomForUser(user));
    } else {
      setSocketRoom(null);
      socket.disconnect();
    }
  }, [user]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      setUser(res.data.user);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
