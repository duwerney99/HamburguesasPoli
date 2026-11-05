import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ADMIN_ROUTES, normalizePath } from '../../router.js';
import AdminDashboard from './AdminDashboard.jsx';
import AdminProducts from './AdminProducts.jsx';
import AdminCampaigns from './AdminCampaigns.jsx';
import AdminUsers from './AdminUsers.jsx';
import AdminClients from './AdminClients.jsx';
import AdminAudit from './AdminAudit.jsx';

export default function AdminLayout() {
  const location = useLocation();

  const normalizedPath = normalizePath(location.pathname);
  const activeRoute =
    ADMIN_ROUTES.find(route => route.path === normalizedPath) || ADMIN_ROUTES[0];

  return (
    <main className="admin-page">
      <div className="admin-title admin-hero-banner">
        <div>
          <div className="admin-breadcrumb-row">
            <span className="eyebrow">BACKOFFICE · SECRET BITE</span>
            <code className="admin-route-pill">{activeRoute.path}</code>
          </div>
          <h1>Centro de control · {activeRoute.label}</h1>
          <p>{activeRoute.description}</p>
        </div>
      </div>

      <nav className="admin-subnav" aria-label="Rutas del panel de administración">
        {ADMIN_ROUTES.map(route => (
          <NavLink
            key={route.path}
            to={route.path}
            className={({ isActive }) => `admin-subnav-link ${isActive ? 'active' : ''}`}
          >
            <span>{route.label}</span>
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="productos" element={<AdminProducts />} />
        <Route path="votaciones" element={<AdminCampaigns />} />
        <Route path="usuarios" element={<AdminUsers />} />
        <Route path="clientes" element={<AdminClients />} />
        <Route path="trazabilidad" element={<AdminAudit />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </main>
  );
}
