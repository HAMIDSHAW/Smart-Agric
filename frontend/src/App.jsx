import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import './i18n'

import Landing         from './pages/Landing'
import Login           from './pages/Login'
import Register        from './pages/Register'
import Dashboard       from './pages/Dashboard'
import DashboardLayout from './components/DashboardLayout'
import CommunityMapPage from './pages/CommunityMapPage'
import ImpactDashboard  from './pages/ImpactDashboard'
import HistoryPage      from './pages/HistoryPage'
import ProfilePage      from './pages/ProfilePage'
import ForgotPassword      from './pages/ForgotPassword'
import QuickScan          from './pages/QuickScan'
import ComingSoonFeatures from './pages/ComingSoonFeatures'

import AdminLayout from './components/AdminLayout'
import AdminOverview from './pages/admin/AdminOverview'
import AdminUsers from './pages/admin/AdminUsers'
import AdminRoles from './pages/admin/AdminRoles'
import AdminAI from './pages/admin/AdminAI'
import AdminSystem from './pages/admin/AdminSystem'
import AdminAudit from './pages/admin/AdminAudit'
import AdminReports from './pages/admin/AdminReports'
import AdminFeedback from './pages/admin/AdminFeedback'
import MarketLayout from './pages/market/MarketLayout'
import MarketHome from './pages/market/MarketHome'
import MarketSearch from './pages/market/MarketSearch'
import ProductPage from './pages/market/ProductPage'
import Storefront from './pages/market/Storefront'
import CartPage from './pages/market/CartPage'
import Checkout from './pages/market/Checkout'
import { OrderList, OrderDetail } from './pages/market/Orders'
import { MessageList, MessageThread } from './pages/market/Messages'
import Requests from './pages/market/Requests'
import { SellLayout, SellDashboard } from './pages/market/Sell'
import { SellProducts, ProductForm } from './pages/market/SellProducts'
import { SellOrders, SellOrderDetail } from './pages/market/SellOrders'
import { RequireLogin } from './components/market/bits'
import AdminMarketplace from './pages/admin/AdminMarketplace'
import DiseaseProgressModule from './modules/DiseaseProgressModule'
import DiseaseModule      from './modules/DiseaseModule'
import RecommendModule    from './modules/RecommendModule'
import FertilizerModule   from './modules/FertilizerModule'
import LandModule         from './modules/LandModule'
import PestModule         from './modules/PestModule'
import ChatbotModule      from './modules/ChatbotModule'
import SoilModule         from './modules/SoilModule'
import CropCalendarModule from './modules/CropCalendarModule'
import PostHarvestModule  from './modules/PostHarvestModule'
import CropCompareModule       from './modules/CropCompareModule'
import FieldIntelligenceModule from './modules/FieldIntelligenceModule'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sand-light">
      <div className="text-center">
        <div className="text-5xl mb-4">🌿</div>
        <div style={{ width:28,height:28,border:'3px solid rgba(20,83,45,0.2)',borderTopColor:'#14532D',borderRadius:'50%',animation:'spin 0.7s linear infinite',margin:'0 auto' }} />
        <p className="mt-3 text-agri-muted text-sm font-medium">Loading SmartAgri...</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to={user.is_staff ? '/admin' : '/dashboard'} replace />
  return children
}

// UI guard only. Every admin API call is authorised again on the server.
export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_staff) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" toastOptions={{
            style: { background:'#0F172A', color:'#FEFDF9', borderRadius:'10px', fontSize:'0.875rem', fontFamily:'DM Sans, sans-serif' },
            success: { iconTheme: { primary:'#4CAF50', secondary:'#FEFDF9' } },
            error:   { iconTheme: { primary:'#C0392B', secondary:'#FEFDF9' } },
          }} />
          <Routes>
            <Route path="/"        element={<Landing />} />
            <Route path="/login"   element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/scan" element={<QuickScan />} />

            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index              element={<Dashboard />} />
              <Route path="disease"     element={<DiseaseModule />} />
              <Route path="progress"      element={<DiseaseProgressModule />} />
              <Route path="recommend"   element={<RecommendModule />} />
              <Route path="fertilizer"  element={<FertilizerModule />} />
              <Route path="land"        element={<LandModule />} />
              <Route path="pest"        element={<PestModule />} />
              <Route path="chatbot"     element={<ChatbotModule />} />
              <Route path="soil"        element={<SoilModule />} />
              <Route path="calendar"    element={<CropCalendarModule />} />
              <Route path="post-harvest" element={<PostHarvestModule />} />
              <Route path="compare"     element={<CropCompareModule />} />
              <Route path="field"       element={<FieldIntelligenceModule />} />
              <Route path="map"         element={<CommunityMapPage />} />
              <Route path="impact"      element={<ImpactDashboard />} />
              <Route path="history"      element={<HistoryPage />} />
              <Route path="coming-soon"   element={<ComingSoonFeatures />} />
              <Route path="profile"     element={<ProfilePage />} />
            </Route>

            <Route path="/market" element={<MarketLayout />}>
              <Route index element={<MarketHome />} />
              <Route path="search" element={<MarketSearch />} />
              <Route path="product/:id" element={<ProductPage />} />
              <Route path="seller/:id" element={<Storefront />} />
              <Route path="requests" element={<Requests />} />
              <Route path="cart" element={<RequireLogin><CartPage /></RequireLogin>} />
              <Route path="checkout" element={<RequireLogin><Checkout /></RequireLogin>} />
              <Route path="orders" element={<RequireLogin><OrderList /></RequireLogin>} />
              <Route path="orders/:id" element={<RequireLogin><OrderDetail /></RequireLogin>} />
              <Route path="messages" element={<RequireLogin><MessageList /></RequireLogin>} />
              <Route path="messages/:id" element={<RequireLogin><MessageThread /></RequireLogin>} />
              <Route path="sell" element={<SellLayout />}>
                <Route index element={<SellDashboard />} />
                <Route path="products" element={<SellProducts />} />
                <Route path="products/new" element={<ProductForm />} />
                <Route path="products/:id" element={<ProductForm />} />
                <Route path="orders" element={<SellOrders />} />
                <Route path="orders/:id" element={<SellOrderDetail />} />
              </Route>
            </Route>

            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index            element={<AdminOverview />} />
              <Route path="users"     element={<AdminUsers />} />
              <Route path="roles"     element={<AdminRoles />} />
              <Route path="ai"        element={<AdminAI />} />
              <Route path="system"    element={<AdminSystem />} />
              <Route path="audit"     element={<AdminAudit />} />
              <Route path="reports"   element={<AdminReports />} />
              <Route path="feedback"  element={<AdminFeedback />} />
              <Route path="marketplace" element={<AdminMarketplace />} />
              <Route path="profile"   element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
