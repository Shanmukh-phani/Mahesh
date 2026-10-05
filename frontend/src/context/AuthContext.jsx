import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import socket, { roomForUser, setSocketRoom } from '../services/socket';
import { logoutSession } from '../services/activity';

export const AuthContext = createContext();

export const homeForRole = (role) => {
  if (role === 'ADMIN') return '/admin';
  if (role === 'EXECUTIVE') return '/executive';
  return '/store';
};

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

  // Pull the latest role / admin level / store assignments (they can change while logged in)
  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch {
      /* a 401 is handled by the api interceptor */
    }
  }, []);

  useEffect(() => {
    if (user) refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    logoutSession();
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
