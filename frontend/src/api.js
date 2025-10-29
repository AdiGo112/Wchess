import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api", // backend baseURL (adjust if needed)
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
