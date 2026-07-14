const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

const apiBaseUrl = configuredBaseUrl
  ? configuredBaseUrl.replace(/\/+$/, "")
  : "";

export default apiBaseUrl;
