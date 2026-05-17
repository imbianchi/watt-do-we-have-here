import axios from 'axios'
import { getToken, removeToken } from './auth'

const BASE_URL = import.meta.env.VITE_API_URL || ''
// When BASE_URL is empty, axios uses relative URLs — Vite proxies `/api`.
// When BASE_URL is a full origin (staging/prod), requests target it directly.
const api = axios.create({ baseURL: BASE_URL ? `${BASE_URL}/api` : '/api' })

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      removeToken()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const Auth = {
  register: (data) => api.post('/auth/register', data).then((r) => r.data),
  login: (data) => api.post('/auth/login', data).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
}

export const Devices = {
  list: () => api.get('/devices').then(r => r.data),
  add: (data) => api.post('/devices', data).then(r => r.data),
  test: (data) => api.post('/devices/test', data).then(r => r.data),
  update: (id, data) => api.put(`/devices/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/devices/${id}`).then(r => r.data),
  status: (id) => api.get(`/devices/${id}/status`).then(r => r.data),
  switch: (id, state) => api.post(`/devices/${id}/switch`, { state }).then(r => r.data),
  setMode: (id, mode) => api.post(`/devices/${id}/mode`, { mode }).then(r => r.data),
  readings: (id, params) => api.get(`/devices/${id}/readings`, { params }).then(r => r.data),
  insights: (id, params) => api.get(`/devices/${id}/insights`, { params }).then(r => r.data),
  info: (id) => api.get(`/devices/${id}/info`).then(r => r.data),
  alerts: (id) => api.get(`/devices/${id}/alerts`).then(r => r.data),
  alertConfig: (id) => api.get(`/devices/${id}/alert-config`).then(r => r.data),
  setAlertConfig: (id, data) => api.put(`/devices/${id}/alert-config`, data).then(r => r.data),
}

export const Shelly = {
  listSchedules: (deviceId) => api.get(`/devices/${deviceId}/shelly/schedules`).then(r => r.data),
  createSchedule: (deviceId, data) => api.post(`/devices/${deviceId}/shelly/schedules`, data).then(r => r.data),
  updateSchedule: (deviceId, jobId, data) => api.put(`/devices/${deviceId}/shelly/schedules/${jobId}`, data).then(r => r.data),
  deleteSchedule: (deviceId, jobId) => api.delete(`/devices/${deviceId}/shelly/schedules/${jobId}`).then(r => r.data),
  setTimer: (deviceId, data) => api.post(`/devices/${deviceId}/shelly/timer`, data).then(r => r.data),
  cancelTimer: (deviceId) => api.delete(`/devices/${deviceId}/shelly/timer`).then(r => r.data),
  listWebhooks: (deviceId) => api.get(`/devices/${deviceId}/shelly/webhooks`).then(r => r.data),
  createWebhook: (deviceId, data) => api.post(`/devices/${deviceId}/shelly/webhooks`, data).then(r => r.data),
  deleteWebhook: (deviceId, hookId) => api.delete(`/devices/${deviceId}/shelly/webhooks/${hookId}`).then(r => r.data),
  listScripts: (deviceId) => api.get(`/devices/${deviceId}/shelly/scripts`).then(r => r.data),
  createScript: (deviceId, name) => api.post(`/devices/${deviceId}/shelly/scripts`, { name }).then(r => r.data),
  getScript: (deviceId, scriptId) => api.get(`/devices/${deviceId}/shelly/scripts/${scriptId}`).then(r => r.data),
  putScript: (deviceId, scriptId, code) => api.put(`/devices/${deviceId}/shelly/scripts/${scriptId}`, { code }).then(r => r.data),
  deleteScript: (deviceId, scriptId) => api.delete(`/devices/${deviceId}/shelly/scripts/${scriptId}`).then(r => r.data),
  runScript: (deviceId, scriptId) => api.post(`/devices/${deviceId}/shelly/scripts/${scriptId}/run`).then(r => r.data),
  stopScript: (deviceId, scriptId) => api.post(`/devices/${deviceId}/shelly/scripts/${scriptId}/stop`).then(r => r.data),
  config: (deviceId) => api.get(`/devices/${deviceId}/shelly/config`).then(r => r.data),
  wifi: (deviceId) => api.get(`/devices/${deviceId}/shelly/wifi`).then(r => r.data),
  info: (deviceId) => api.get(`/devices/${deviceId}/shelly/info`).then(r => r.data),
  reboot: (deviceId) => api.post(`/devices/${deviceId}/shelly/reboot`).then(r => r.data),
  setPowerLimit: (deviceId, data) => api.post(`/devices/${deviceId}/shelly/power-limit`, data).then(r => r.data),
  factoryReset: (deviceId) => api.post(`/devices/${deviceId}/shelly/factory-reset`).then(r => r.data),
}

export const Aggregate = {
  status: () => api.get('/aggregate/status').then(r => r.data),
  insights: (params) => api.get('/aggregate/insights', { params }).then(r => r.data),
  readings: (params) => api.get('/aggregate/readings', { params }).then(r => r.data),
}
