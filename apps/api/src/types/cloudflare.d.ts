/**
 * Minimal type declaration for the Cloudflare Workers "cloudflare:node" module.
 * Provides the official bridge between node:http servers and the Workers fetch handler.
 * https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
 */
declare module 'cloudflare:node' {
  export interface HttpServerHandlerOptions {
    port?: number
  }
  export function httpServerHandler(server: unknown | HttpServerHandlerOptions): ExportedHandler
}
