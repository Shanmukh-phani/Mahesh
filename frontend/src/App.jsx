import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthContext } from './context/AuthContext';
import Login from './pages/Login';
import AdminLayout from './components/AdminLayout';
import StoreLayout from './components/StoreLayout';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import MedicineRequests from './pages/admin/MedicineRequests';
import MedicineDemand from './pages/admin/MedicineDemand';
import MainInventoryPage from './pages/admin/MainInventoryPage';
import MiniStoresPage from './pages/admin/MiniStoresPage';
import CustomersPage from './pages/admin/CustomersPage';
import NotificationsPage from './pages/admin/NotificationsPage';

// Store Pages
import StoreDashboard from './pages/store/StoreDashboard';
import SearchMedicine from './pages/store/SearchMedicine';
import StoreInventoryPage from './pages/store/StoreInventoryPage';
import StoreRequestsPage from './pages/store/StoreRequestsPage';
import CreateRequest from './pages/store/CreateRequest';

const PrivateRoute = ({ children, allowedRoles }) => {
  const { user } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/store'} />;
  }
  return children;
};

function App() {
  const { user } = useContext(AuthContext);

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '12px', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600 } }} />
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to={user.role === 'ADMIN' ? '/admin' : '/store'} />} />
        
        {/* Admin Routes */}
        <Route path="/admin" element={<PrivateRoute allowedRoles={['ADMIN']}><AdminLayout /></PrivateRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="requests" element={<MedicineRequests />} />
          <Route path="demand" element={<MedicineDemand />} />
          <Route path="inventory" element={<MainInventoryPage />} />
          <Route path="stores" element={<MiniStoresPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>

        {/* Store Routes */}
        <Route path="/store" element={<PrivateRoute allowedRoles={['MINI_STORE']}><StoreLayout /></PrivateRoute>}>
          <Route index element={<StoreDashboard />} />
          <Route path="search" element={<SearchMedicine />} />
          <Route path="inventory" element={<StoreInventoryPage />} />
          <Route path="requests" element={<StoreRequestsPage />} />
          <Route path="create-request" element={<CreateRequest />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
