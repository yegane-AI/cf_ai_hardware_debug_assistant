// src/server.ts
import { HardwareDebugAgent } from './agent';

export interface Env {
  HardwareDebugAgent: DurableObjectNamespace<HardwareDebugAgent>;
  AI: any; // Workers AI binding
}

/**
 * Main Worker fetch handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade for chat
    if (url.pathname === '/api/chat') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader === 'websocket') {
        return handleWebSocket(request, env);
      }
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Handle HTTP requests for static content
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return await fetch(request);
    }

    // API endpoints
    if (url.pathname.startsWith('/api/')) {
      return handleAPIRequest(request, env, url);
    }

    // Serve static assets
    return await fetch(request);
  },
};

/**
 * Handle WebSocket connections
 */
async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  // Get or create agent instance
  // Use a consistent ID for demo, in production you might use user sessions
  const agentId = env.HardwareDebugAgent.idFromName('demo-session');
  const agent = env.HardwareDebugAgent.get(agentId);

  // Forward the request to the agent
  return agent.fetch(request);
}

/**
 * Handle API requests
 */
async function handleAPIRequest(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const agentId = env.HardwareDebugAgent.idFromName('demo-session');
  const agent = env.HardwareDebugAgent.get(agentId);

  // Health check
  if (url.pathname === '/api/health') {
    return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get agent state
  if (url.pathname === '/api/state' && request.method === 'GET') {
    const response = await agent.fetch(
      new Request('http://internal/state', { method: 'GET' })
    );
    return response;
  }

  // Reset agent state
  if (url.pathname === '/api/reset' && request.method === 'POST') {
    const response = await agent.fetch(
      new Request('http://internal/reset', { method: 'POST' })
    );
    return response;
  }

  return new Response('Not found', { status: 404 });
}

/**
 * Export the Durable Object class
 */
export { HardwareDebugAgent };
