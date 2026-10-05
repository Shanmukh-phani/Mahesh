import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from './api';

const HEARTBEAT_MS = 60 * 1000;

const PAGE_TITLES = {
  '/admin': 'Admin dashboard',
  '/admin/requests': 'Medicine requests',
  '/admin/store-updates': 'Store updates',
  '/admin/demand': 'Medicine demand',
  '/admin/inventory': 'Warehouse inventory',
  '/admin/stores': 'Mini stores',
  '/admin/customers': 'Customers',
  '/admin/notifications': 'Notifications',
  '/admin/complaints': 'Complaints',
  '/admin/team': 'Team & access',
  '/admin/activity': 'Activity logs',
  '/executive': 'Executive dashboard',
  '/executive/approvals': 'Approvals',
  '/executive/stores': 'My stores & staff',
  '/executive/complaints': 'Complaints',
  '/executive/notifications': 'Notifications',
  '/executive/activity': 'Activity logs',
  '/executive/expenses': 'Store expenses',
  '/store': 'Store dashboard',
  '/store/search': 'Search medicine',
  '/store/inventory': 'Shelf inventory',
  '/store/requests': 'My requests',
  '/store/updates': 'Main branch updates',
  '/store/create-request': 'New request',
  '/store/notifications': 'Notifications',
  '/store/complaints': 'Complaints',
  '/store/expenses': 'Monthly expenses'
};

export const pageTitle = (path) => PAGE_TITLES[path] || path;

const baseURL = () => api.defaults.baseURL;

// fetch with keepalive so the call survives the tab closing / navigating to the login page
const beacon = (path, body) => {
  const token = localStorage.getItem('token');
  if (!token) return Promise.resolve();
  return fetch(`${baseURL()}${path}`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {})
  }).catch(() => {});
};

export const trackEvent = (event) => {
  if (!localStorage.getItem('token')) return;
  beacon('/activity/track', { events: [event] });
};

export const trackExport = (label, rows) => trackEvent({ type: 'EXPORT', label, rows, path: window.location.pathname });

export const logoutSession = () => beacon('/auth/logout');

// Mounted in each layout: page views + a heartbeat that measures how long the app is open and visible
export const useActivityTracker = () => {
  const location = useLocation();
  const lastPath = useRef('');

  useEffect(() => {
    const path = location.pathname;
    if (path === lastPath.current) return;
    lastPath.current = path;
    trackEvent({ type: 'PAGE_VIEW', path, title: pageTitle(path) });
  }, [location.pathname]);

  useEffect(() => {
    const visible = () => document.visibilityState === 'visible';
    const beat = (extra = {}) => beacon('/activity/heartbeat', { visible: visible(), path: window.location.pathname, ...extra });

    beat();
    const timer = setInterval(() => beat(), HEARTBEAT_MS);
    const onVisibility = () => (visible() ? beat() : beat({ visible: true, ending: true }));
    const onUnload = () => beat({ visible: true, ending: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onUnload);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onUnload);
    };
  }, []);
};
