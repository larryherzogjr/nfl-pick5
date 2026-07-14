import axios from "axios";
import apiBaseUrl from "./baseUrl";

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

export default apiClient;
