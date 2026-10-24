import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

client.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("nm_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem("nm_token");
      localStorage.removeItem("nm_user");
    }
    return Promise.reject(err);
  }
);

export default client;
