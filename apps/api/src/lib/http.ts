import axios from 'axios'
import axiosRetry from 'axios-retry'

// Create a centralized Axios instance
// 使用 fetch 适配器：在 Cloudflare Workers 上没有 node:http 客户端栈，
// fetch 适配器在 Node/Docker 环境同样可用（Node 18+ 内置 fetch）。
export const httpClient = axios.create({
  adapter: 'fetch',
  timeout: 15000,
  headers: {
    'User-Agent': 'DIY-Nav'
  }
})

// Configure Resilience (Retries)
axiosRetry(httpClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: error => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED'
  }
})
