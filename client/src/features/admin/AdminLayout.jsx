import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ADMIN_ROUTES, normalizePath } from '../../router.js';
import AdminDashboard from './AdminDashboard.jsx';
import AdminProducts from './AdminProducts.jsx';
import AdminCampaigns from './AdminCampaigns.jsx';
import AdminUsers from './AdminUsers.jsx';
import AdminClients from './AdminClients.jsx';
import AdminAudit from './AdminAudit.jsx';

function AdminRouteIcon({ id }) {
  switch (id) {
    case 'dashboard':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="7" height="9" x="3" y="3" rx="1.5" />
          <rect width="7" height="5" x="14" y="3" rx="1.5" />
          <rect width="7" height="9" x="14" y="12" rx="1.5" />
          <rect width="7" height="5" x="3" y="16" rx="1.5" />
        </svg>
      );
    case 'productos':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 11h16a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-1a1 1 0 0 1 1-1Z" />
          <path d="M4 8a8 8 0 0 1 16 0" />
          <path d="M5 19h14" />
        </svg>
      );
    case 'votaciones':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      );
    case 'usuarios':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'clientes':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2.5" />
          <circle cx="12" cy="10" r="3.2" />
          <path d="M7 21v-2a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2" />
        </svg>
      );
    case 'trazabilidad':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AdminLayout({ user, logout }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const normalizedPath = normalizePath(location.pathname);
  const activeRoute =
    ADMIN_ROUTES.find(route => route.path === normalizedPath) || ADMIN_ROUTES[0];

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = e => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="admin-app-layout">
      {/* Backdrop overlay para cerrar en pantallas móviles */}
      {sidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Vertical Estático (100% de la altura de pantalla) */}
      <aside
        className={`admin-sidebar-full ${sidebarOpen ? 'open' : ''}`}
        aria-label="Menú principal de administración"
      >
        {/* Cabecera del Sidebar con Marca de Backoffice */}
        <div className="admin-sidebar-brand-box">
          <Link
            to="/admin/dashboard"
            className="admin-brand-link"
            title="Secret Bite Backoffice"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="brand-mark">SB</span>
            <div className="admin-brand-copy">
              <span className="admin-brand-name">Secret Bite</span>
              <span className="admin-brand-tag">BACKOFFICE</span>
            </div>
          </Link>
          <button
            type="button"
            className="admin-sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú lateral"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Navegación por módulos */}
        <nav className="admin-sidebar-nav" aria-label="Módulos de administración">
          <span className="admin-nav-group-label">Módulos de control</span>
          {ADMIN_ROUTES.map(route => (
            <NavLink
              key={route.path}
              to={route.path}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="admin-nav-icon">
                <AdminRouteIcon id={route.id} />
              </span>
              <span className="admin-nav-label">{route.label}</span>
              {route.id === 'votaciones' && <span className="admin-live-tag">VIVO</span>}
            </NavLink>
          ))}

          <span className="admin-nav-group-label" style={{ marginTop: '1.25rem' }}>Operaciones</span>
          <NavLink
            to="/cocina"
            className="admin-nav-item"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="admin-nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/>
                <line x1="6" x2="18" y1="17" y2="17"/>
              </svg>
            </span>
            <span className="admin-nav-label">Pantalla de Cocina</span>
          </NavLink>
        </nav>

        {/* Pie del Sidebar: Retorno a la tienda */}
        <div className="admin-sidebar-bottom">
          <Link
            to="/"
            className="admin-store-return-btn"
            title="Ir a la tienda y urna digital de votación"
            onClick={() => setSidebarOpen(false)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            <span>Volver al portal público</span>
          </Link>
        </div>
      </aside>

      {/* Viewport Principal (Derecha) */}
      <div className="admin-viewport">
        {/* HEADER DEDICADO DEL PANEL DE ADMINISTRACIÓN */}
        <header className="admin-header">
          <div className="admin-header-left">
            <button
              type="button"
              className="admin-sidebar-toggle-btn"
              onClick={() => setSidebarOpen(prev => !prev)}
              aria-label={sidebarOpen ? 'Cerrar menú lateral' : 'Abrir menú lateral'}
              aria-expanded={sidebarOpen}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="admin-header-crumb">
              <span className="admin-header-crumb-root">Backoffice</span>
              <span className="admin-header-crumb-sep">/</span>
              <span className="admin-header-crumb-leaf">{activeRoute.label}</span>
            </div>
          </div>

          <div className="admin-header-right">
            <div
              className="admin-user-pill"
              title={`${user?.name || 'Administrador'} (Admin)`}
            >
              <span className="admin-user-avatar" aria-hidden="true">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
              </span>
              <div className="admin-user-text">
                <span className="admin-user-name">{user?.name || 'Administrador'}</span>
                <span className="admin-user-badge">ADMIN</span>
              </div>
            </div>

            {logout && (
              <button
                type="button"
                className="admin-header-logout-btn"
                onClick={logout}
                title="Cerrar sesión de administración"
                aria-label="Cerrar sesión"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Salir</span>
              </button>
            )}
          </div>
        </header>

        {/* Contenido del Módulo */}
        <main className="admin-main-content max-w-7xl w-full mx-auto">
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
      </div>
    </div>
  );
}
