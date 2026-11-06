import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  timeout: 30000,
})

API.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

API.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/refresh`,
            {},
            { headers: { Authorization: `Bearer ${refresh}` } }
          )
          localStorage.setItem('access_token', data.access_token)
          original.headers.Authorization = `Bearer ${data.access_token}`
          return API(original)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('user')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default API

export const authAPI = {
  register: (data) => API.post('/api/auth/register', data),
  login: (data) => API.post('/api/auth/login', data),
  getProfile: () => API.get('/api/auth/profile'),
  updateProfile: (data) => API.put('/api/auth/profile', data),
  changePassword: (data) => API.post('/api/auth/change-password', data),
  getDistricts:    () => API.get('/api/auth/districts'),
  forgotPassword:  (email) => API.post('/api/auth/forgot-password', { email }),
  resetPassword:   (token, password) => API.post('/api/auth/reset-password', { token, password }),
  // Admin
  getAdminStats: () => API.get('/api/auth/admin/stats'),
  listUsers: () => API.get('/api/auth/admin/users'),
  createAdmin: (data) => API.post('/api/auth/admin/create-admin', data),
  toggleUser: (userId) => API.post(`/api/auth/admin/toggle-user/${userId}`),
}

export const diseaseAPI = {
  detect: (formData, extra = {}) => API.post('/api/disease/detect', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
    ...extra,
  }),
  getHistory: (page = 1) => API.get(`/api/disease/history?page=${page}`),
}

export const recommendAPI = {
  getCrops: (data) => API.post('/api/recommend/crops', data),
}

export const fertilizerAPI = {
  getPlan: (data) => API.post('/api/fertilizer/plan', data),
}

export const landAPI = {
  assess: (data) => API.post('/api/land/assess', data),
}

export const pestAPI = {
  getAlerts: (district) => API.get(`/api/pest/alerts?district=${encodeURIComponent(district)}`),
}

export const chatAPI = {
  sendMessage: (data) => API.post('/api/chatbot/message', data),
  getHistory: (sessionId) => API.get(`/api/chatbot/history/${sessionId}`),
  getSessions: () => API.get('/api/chatbot/sessions'),
}

export const soilAPI = {
  analyse: (formData, extra = {}) => API.post('/api/soil/analyse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...extra,
  }),
}

export const weatherAPI = {
  getCurrent: (district) => API.get(`/api/weather/current?district=${encodeURIComponent(district)}`),
  getForecast: (district) => API.get(`/api/weather/forecast?district=${encodeURIComponent(district)}`),
}

export const historyAPI = {
  getAll: () => API.get('/api/history/all'),
  getDashboardSummary: () => API.get('/api/history/dashboard-summary'),
}

export const communityAPI = {
  getMapReports: () => API.get('/api/community/reports'),
}

export const impactAPI = {
  getStats: () => API.get('/api/impact/stats'),
}

export const calendarAPI = {
  generate:       (data) => API.post('/api/calendar/generate', data),
  list:           ()     => API.get('/api/calendar/list'),
  createTracker:  (data) => API.post('/api/calendar/harvest-tracker', data),
  listTrackers:   ()     => API.get('/api/calendar/harvest-tracker/list'),
  recordYield:    (id, data) => API.post(`/api/calendar/harvest-tracker/${id}/yield`, data),
}

export const postHarvestAPI = {
  getAdvice: (data) => API.post('/api/post-harvest/advice', data),
  history:   ()     => API.get('/api/post-harvest/history'),
}

export const diseaseProgressAPI = {
  list:      ()           => API.get('/api/disease-progress/tracks'),
  create:    (data)       => API.post('/api/disease-progress/tracks', data),
  addPhoto:  (id, formData, extra = {}) => API.post(`/api/disease-progress/tracks/${id}/photo`, formData, { timeout: 60000, ...extra }),
}

export const cropCompareAPI = {
  compare: (data) => API.post('/api/crop-compare/compare', data),
}

export const fieldAPI = {
  yieldPrediction:  (data) => API.post('/api/field/yield-prediction', data),
  healthScore:      (data) => API.post('/api/field/health-score', data),
  carbonFootprint:  (data) => API.post('/api/field/carbon-footprint', data),
}

export const mediaAPI = {
  deleteDisease:  (id)       => API.delete(`/api/media/disease/${id}`),
  deleteSoil:     (id)       => API.delete(`/api/media/soil/${id}`),
  deleteProgress: (id, idx)  => API.delete(`/api/media/progress/${id}/${idx}`),
}

export const adminAPI = {
  dashboard:     (days = 30)      => API.get('/api/admin/dashboard', { params: { days } }),
  notifications: ()               => API.get('/api/admin/notifications'),
  users:         (params)         => API.get('/api/admin/users', { params }),
  user:          (id)             => API.get(`/api/admin/users/${id}`),
  createUser:    (data)           => API.post('/api/admin/users', data),
  updateUser:    (id, data)       => API.put(`/api/admin/users/${id}`, data),
  setRole:       (id, role)       => API.post(`/api/admin/users/${id}/role`, { role }),
  suspend:       (id, reason)     => API.post(`/api/admin/users/${id}/suspend`, { reason }),
  restore:       (id)             => API.post(`/api/admin/users/${id}/restore`),
  verify:        (id, status)     => API.post(`/api/admin/users/${id}/verify`, { status }),
  resetPassword: (id, new_password) => API.post(`/api/admin/users/${id}/reset-password`, { new_password }),
  deleteUser:    (id)             => API.delete(`/api/admin/users/${id}`),
  setPermissions:(id, body)       => API.put(`/api/admin/users/${id}/permissions`, body),
  roles:         ()               => API.get('/api/admin/roles'),
  audit:         (params)         => API.get('/api/admin/audit', { params }),
  feedback:      (page = 1)       => API.get('/api/admin/feedback', { params: { page } }),
  systemHealth:  ()               => API.get('/api/admin/system/health'),
  aiModels:      (days = 7)       => API.get('/api/admin/ai/models', { params: { days } }),
  aiErrors:      (days = 7)       => API.get('/api/admin/ai/errors', { params: { days } }),
  aiProbe:       (id)             => API.post(`/api/admin/ai/probe/${id}`),
  report:        (name, days = 90) => API.get(`/api/admin/reports/${name}.csv`, { params: { days }, responseType: 'blob' }),
}

const M = '/api/marketplace'
export const marketAPI = {
  categories:   ()            => API.get(`${M}/categories`),
  home:         ()            => API.get(`${M}/home`),
  products:     (params)      => API.get(`${M}/products`, { params }),
  product:      (id)          => API.get(`${M}/products/${id}`),
  priceContext: (id)          => API.get(`${M}/products/${id}/price-context`),
  storefront:   (id)          => API.get(`${M}/sellers/${id}`),
  paymentMethods: ()          => API.get(`${M}/payments/methods`),
  suggestions:  (params)      => API.get(`${M}/suggestions`, { params }),
  cart:         ()            => API.get(`${M}/cart`),
  cartAdd:      (product_id, quantity) => API.post(`${M}/cart`, { product_id, quantity }),
  cartSet:      (id, quantity) => API.put(`${M}/cart/${id}`, { quantity }),
  cartRemove:   (id)          => API.delete(`${M}/cart/${id}`),
  wishlist:     ()            => API.get(`${M}/wishlist`),
  wishAdd:      (id)          => API.post(`${M}/wishlist/${id}`),
  wishRemove:   (id)          => API.delete(`${M}/wishlist/${id}`),
  checkout:     (body)        => API.post(`${M}/checkout`, body),
  orders:       (page = 1)    => API.get(`${M}/orders`, { params: { page } }),
  order:        (id)          => API.get(`${M}/orders/${id}`),
  cancelOrder:  (id, reason)  => API.post(`${M}/orders/${id}/cancel`, { reason }),
  completeOrder:(id)          => API.post(`${M}/orders/${id}/complete`),
  payRef:       (id, reference) => API.post(`${M}/orders/${id}/payment-reference`, { reference }),
  review:       (id, body)    => API.post(`${M}/orders/${id}/review`, body),
  dispute:      (id, body)    => API.post(`${M}/orders/${id}/dispute`, body),
  report:       (body)        => API.post(`${M}/reports`, body),
  enquiries:    ()            => API.get(`${M}/enquiries`),
  enquiry:      (id)          => API.get(`${M}/enquiries/${id}`),
  startEnquiry: (body)        => API.post(`${M}/enquiries`, body),
  replyEnquiry: (id, body)    => API.post(`${M}/enquiries/${id}/messages`, body),
  requests:     ()            => API.get(`${M}/requests`),
  createRequest:(body)        => API.post(`${M}/requests`, body),
  closeRequest: (id)          => API.post(`${M}/requests/${id}/close`),
  // seller
  sellerRegister: (body)      => API.post(`${M}/seller/register`, body),
  sellerProfile:  ()          => API.get(`${M}/seller/profile`),
  sellerUpdate:   (body)      => API.put(`${M}/seller/profile`, body),
  verifyRequest:  (note)      => API.post(`${M}/seller/verification-request`, { note }),
  sellerDashboard:(days = 30) => API.get(`${M}/seller/dashboard`, { params: { days } }),
  myProducts:     ()          => API.get(`${M}/seller/products`),
  createProduct:  (body)      => API.post(`${M}/seller/products`, body),
  updateProduct:  (id, body)  => API.put(`${M}/seller/products/${id}`, body),
  submitProduct:  (id)        => API.post(`${M}/seller/products/${id}/submit`),
  pauseProduct:   (id)        => API.post(`${M}/seller/products/${id}/pause`),
  resumeProduct:  (id)        => API.post(`${M}/seller/products/${id}/resume`),
  setStock:       (id, stock_qty) => API.post(`${M}/seller/products/${id}/stock`, { stock_qty }),
  deleteProduct:  (id)        => API.delete(`${M}/seller/products/${id}`),
  addImages:      (id, formData, extra = {}) => API.post(`${M}/seller/products/${id}/images`, formData, { timeout: 90000, ...extra }),
  deleteImage:    (id, imageId) => API.delete(`${M}/seller/products/${id}/images/${imageId}`),
  aiDescribe:     (body)      => API.post(`${M}/seller/ai/describe`, body),
  sellerOrders:   (params)    => API.get(`${M}/seller/orders`, { params }),
  sellerOrder:    (id)        => API.get(`${M}/seller/orders/${id}`),
  sellerStatus:   (id, status, note) => API.post(`${M}/seller/orders/${id}/status`, { status, note }),
  confirmPayment: (id)        => API.post(`${M}/seller/orders/${id}/confirm-payment`),
  markRefunded:   (id)        => API.post(`${M}/seller/orders/${id}/mark-refunded`),
}
export const adminMarketAPI = {
  overview:   ()           => API.get('/api/admin/marketplace/overview'),
  sellers:    (params)     => API.get('/api/admin/marketplace/sellers', { params }),
  sellerAct:  (id, action, note) => API.post(`/api/admin/marketplace/sellers/${id}/${action}`, { note }),
  products:   (params)     => API.get('/api/admin/marketplace/products', { params }),
  productAct: (id, action, note) => API.post(`/api/admin/marketplace/products/${id}/${action}`, { note }),
  categories: ()           => API.get('/api/admin/marketplace/categories'),
  addCategory:(body)       => API.post('/api/admin/marketplace/categories', body),
  setCategory:(id, body)   => API.put(`/api/admin/marketplace/categories/${id}`, body),
  orders:     (params)     => API.get('/api/admin/marketplace/orders', { params }),
  payments:   (params)     => API.get('/api/admin/marketplace/payments', { params }),
  reports:    (params)     => API.get('/api/admin/marketplace/reports', { params }),
  resolveReport: (id, action, note) => API.post(`/api/admin/marketplace/reports/${id}/resolve`, { action, note }),
  disputes:   (params)     => API.get('/api/admin/marketplace/disputes', { params }),
  resolveDispute: (id, resolution, note) => API.post(`/api/admin/marketplace/disputes/${id}/resolve`, { resolution, note }),
  reviews:    (params)     => API.get('/api/admin/marketplace/reviews', { params }),
  reviewAct:  (id, action) => API.post(`/api/admin/marketplace/reviews/${id}/${action}`),
  settings:   ()           => API.get('/api/admin/marketplace/settings'),
  saveSettings: (body)     => API.put('/api/admin/marketplace/settings', body),
}
