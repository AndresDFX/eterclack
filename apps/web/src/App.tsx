import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './lib/auth';
import type { Role } from './lib/api';

import { HomePage } from './pages/Home';
import { PhotographersPage } from './pages/Photographers';
import { PhotographerDetailPage } from './pages/PhotographerDetail';
import { HowItWorksPage } from './pages/HowItWorks';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { VerifyEmailPage } from './pages/VerifyEmail';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { ResetPasswordPage } from './pages/ResetPassword';
import { ReservarPage } from './pages/Reservar';
import { CitasPage } from './pages/Citas';
import { OrdenPage } from './pages/Orden';
import { PhotographerPanelPage } from './pages/PhotographerPanel';
import { PanelAgendaPage } from './pages/PanelAgenda';
import { AdminPanelPage } from './pages/AdminPanel';
import { AdminUsuariosPage } from './pages/AdminUsuarios';
import { NotFoundPage } from './pages/NotFound';

function Protected({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24">
        <div className="skeleton h-8 w-64" />
      </div>
    );
  }
  if (!user) return <Navigate to="/ingresar" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="fotografos" element={<PhotographersPage />} />
        <Route path="fotografos/:slug" element={<PhotographerDetailPage />} />
        <Route path="fotografos/:slug/reservar" element={<ReservarPage />} />
        <Route path="como-funciona" element={<HowItWorksPage />} />

        <Route path="ingresar" element={<LoginPage />} />
        <Route path="registro" element={<RegisterPage />} />
        <Route path="verificar" element={<VerifyEmailPage />} />
        <Route path="recuperar" element={<ForgotPasswordPage />} />
        <Route path="restablecer" element={<ResetPasswordPage />} />

        <Route
          path="mis-citas"
          element={
            <Protected roles={['CLIENT']}>
              <CitasPage role="CLIENT" />
            </Protected>
          }
        />
        <Route
          path="ordenes/:id"
          element={
            <Protected roles={['CLIENT', 'PHOTOGRAPHER', 'ADMIN']}>
              <OrdenPage />
            </Protected>
          }
        />

        <Route
          path="panel"
          element={
            <Protected roles={['PHOTOGRAPHER']}>
              <PhotographerPanelPage />
            </Protected>
          }
        />
        <Route
          path="panel/citas"
          element={
            <Protected roles={['PHOTOGRAPHER']}>
              <CitasPage role="PHOTOGRAPHER" />
            </Protected>
          }
        />
        <Route
          path="panel/agenda"
          element={
            <Protected roles={['PHOTOGRAPHER']}>
              <PanelAgendaPage />
            </Protected>
          }
        />
        <Route
          path="admin"
          element={
            <Protected roles={['ADMIN']}>
              <AdminPanelPage />
            </Protected>
          }
        />
        <Route
          path="admin/usuarios"
          element={
            <Protected roles={['ADMIN']}>
              <AdminUsuariosPage />
            </Protected>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
