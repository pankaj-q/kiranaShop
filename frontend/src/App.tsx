import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './state/auth'
import { useAuth } from './hooks/useAuth'
import { ToastProvider } from './state/toast'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import CustomerLogin from './pages/CustomerLogin'
import CustomerHome from './pages/CustomerHome'
import NewOrder from './pages/NewOrder'
import OrderDetail from './pages/OrderDetail'
import OwnerLogin from './pages/OwnerLogin'
import OwnerDashboard from './pages/OwnerDashboard'
import OwnerOrderDetail from './pages/OwnerOrderDetail'
import OwnerCatalogue from './pages/OwnerCatalogue'
import OwnerSettings from './pages/OwnerSettings'

function CustomerGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="center"><span className="spinner" /></div>
  if (!user || user.role !== 'CUSTOMER') return <Navigate to="/login" replace />
  return <>{children}</>
}

function OwnerGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="center"><span className="spinner" /></div>
  if (!user || user.role !== 'OWNER') return <Navigate to="/admin/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<CustomerLogin />} />
          <Route path="/admin/login" element={<OwnerLogin />} />
          <Route element={<Layout />}>
            <Route
              path="/"
              element={
                <CustomerGuard>
                  <CustomerHome />
                </CustomerGuard>
              }
            />
            <Route
              path="/orders/new"
              element={
                <CustomerGuard>
                  <NewOrder />
                </CustomerGuard>
              }
            />
            <Route
              path="/orders/:id"
              element={
                <CustomerGuard>
                  <OrderDetail />
                </CustomerGuard>
              }
            />
            <Route
              path="/admin"
              element={
                <OwnerGuard>
                  <OwnerDashboard />
                </OwnerGuard>
              }
            />
            <Route
              path="/admin/orders/:id"
              element={
                <OwnerGuard>
                  <OwnerOrderDetail />
                </OwnerGuard>
              }
            />
            <Route
              path="/admin/catalogue"
              element={
                <OwnerGuard>
                  <OwnerCatalogue />
                </OwnerGuard>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <OwnerGuard>
                  <OwnerSettings />
                </OwnerGuard>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
    </ErrorBoundary>
  )
}
