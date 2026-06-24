import axios from 'axios'

// URL base: localStorage → env var → proxy Vite/nginx (/api)
// En dev, /api es proxeado por Vite a http://127.0.0.1:3090 (evita CORS).
const getBaseUrl = () => {
  return (
    localStorage.getItem('snowq_api_url') ||
    (import.meta.env.VITE_API_BASE_URL as string) ||
    '/api'
  )
}

// Token: localStorage → env var → vacío
const getToken = () => {
  return (
    localStorage.getItem('snowq_api_token') ||
    (import.meta.env.VITE_API_TOKEN as string) ||
    ''
  )
}

export const apiClient = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - actualiza baseURL y token dinámicamente
apiClient.interceptors.request.use((config) => {
  const baseUrl = getBaseUrl()
  const token = getToken()

  // Actualizar baseURL siempre
  config.baseURL = baseUrl

  // Agregar token si existe
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor - sin redirección a login por ahora
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Solo loguear errores, no redirigir
    if (error.response?.status === 401) {
      console.warn('Auth error: Token inválido o expirado')
    }
    return Promise.reject(error)
  }
)
