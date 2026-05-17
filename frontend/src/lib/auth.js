const TOKEN_KEY = 'watt_token'
const USER_KEY = 'watt_user'

export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
export const isAuthenticated = () => !!getToken()

export const setStoredUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user))
export const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
}
