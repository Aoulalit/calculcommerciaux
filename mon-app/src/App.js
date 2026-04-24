import React from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";

import ExcelReader from "./ExcelReader";
import LoginPage from "./pages/LoginPage";
import AdminUsersPage from "./pages/AdminUsersPage";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

import "./App.css";

function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar-top">
            <div className="logo-box">E</div>
            <div>
              <div className="sidebar-title">EDI Flow</div>
              <div className="sidebar-subtitle">Administration</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Calculateur
            </NavLink>

            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Gestion des users
            </NavLink>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="user-box">
            <div className="user-email">{user?.email}</div>
            <div className="user-role">{user?.role}</div>
          </div>

          <button className="btn btn-danger" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ExcelReader />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/users"
            element={
              <ProtectedRoute adminOnly>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<Layout />} />
      </Routes>
    </AuthProvider>
  );
}