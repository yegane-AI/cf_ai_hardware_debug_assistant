# 🔧 Hardware Debug Assistant

**AI-powered RTL debugging assistant for Verilog & VHDL engineers**

Built with Cloudflare's Agents SDK, this application provides intelligent assistance for hardware design debugging, synthesis error analysis, and timing optimization.

---

## Project Overview

This application was developed for the Cloudflare SWE Internship application, demonstrating:

- ✅ **LLM Integration**: Llama 3.3 on Workers AI for intelligent code analysis
- ✅ **Workflow/Coordination**: Cloudflare Agents SDK with Durable Objects
- ✅ **User Input**: Real-time chat interface with streaming responses
- ✅ **Memory/State**: Persistent conversation history and design context

---

## Features

### Core Capabilities
- 🐛 **Debug RTL Code** - Analyze Verilog/VHDL syntax and logic issues
- ⏱️ **Timing Analysis** - Identify setup/hold violations and critical paths
- 🔒 **Latch Detection** - Explain and fix inferred latches
- 🔄 **CDC Issues** - Clock domain crossing best practices
- 📊 **Synthesis Guidance** - Interpret EDA tool errors and warnings
- 💾 **Design Context** - Maintains state of current modules and recent issues

### Technical Features
- Real-time streaming responses via WebSocket
- Persistent chat history using Durable Objects SQL
- Dark/Light theme support
- Code snippet highlighting
- Context-aware suggestions based on design state
- Quick example prompts for common issues

---

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────┐
│                 React Frontend                  │
│  (Vite + TypeScript + Tailwind CSS)            │
└────────────────┬────────────────────────────────┘
                 │ WebSocket
┌────────────────┴────────────────────────────────┐
│         Cloudflare Workers (server.ts)          │
│  • Request routing                               │
│  • WebSocket handling                            │
│  • Agent instantiation                           │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────┐
│    HardwareDebugAgent (Durable Object)          │
│  • Chat coordination                             │
│  • State management (this.setState)              │
│  • SQL database (conversation history)           │
│  • Tool execution                                │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────┐
│           Workers AI (LLM Provider)             │
│  • Llama 3.3 70B Instruct                       │
│  • Streaming responses                           │
│  • Function calling for tools                    │
└─────────────────────────────────────────────────┘
```

### Why This Stack?

**Cloudflare Agents SDK**: Built-in state management, WebSocket support, and SQL storage make it perfect for conversational AI applications.

**Workers AI (Llama 3.3)**: 
- Runs on Cloudflare's network for low latency
- No external API dependencies or costs
- Strong performance on technical/code understanding tasks

**Durable Objects**: 
- Each chat session gets its own isolated instance
- Automatic state persistence
- SQL database for conversation history

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Cloudflare account
- Wrangler CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/yegane-AI/cf_ai_hardware_debug_assistant
cd hardware-debug-assistant

# Install dependencies
npm install

# Set up environment variables
cp .dev.vars.example .dev.vars
# Edit .dev.vars if needed (Workers AI requires no API key)

# Run locally
npm start

# Open http://localhost:8787
```

### Deployment

```bash
# Deploy to Cloudflare
npm run deploy

# Your app will be live at: https://hardware-debug-assistant.<your-subdomain>.workers.dev
```

---

## 📁 Project Structure

```
hardware-debug-assistant/
├── src/
│   ├── app.tsx              # React UI (chat interface)
│   ├── server.ts            # Cloudflare Worker (request handler)
│   ├── agent.ts             # HardwareDebugAgent class
│   ├── tools.ts             # Tool definitions (code analysis, etc.)
│   ├── llm.ts               # LLM provider configuration
│   ├── utils.ts             # Helper functions
│   └── styles.css           # Tailwind styling
├── public/                   # Static assets
├── wrangler.jsonc           # Cloudflare configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🛠️ Key Implementation Details

### 1. LLM Integration (Llama 3.3 on Workers AI)

```typescript
// src/llm.ts
import { createWorkersAI } from 'workers-ai-provider';

export function createLLMProvider(env: Env) {
  const workersai = createWorkersAI({ binding: env.AI });
  return workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
}
```

### 2. Agent with Memory/State

```typescript
// src/agent.ts
export class HardwareDebugAgent extends Agent {
  async handleChat(message: string) {
    // Store message in SQL
    await this.sql.exec(
      'INSERT INTO messages (role, content, timestamp) VALUES (?, ?, ?)',
      ['user', message, Date.now()]
    );
    
    // Update state (syncs to client automatically)
    await this.setState({ 
      lastMessage: message,
      messageCount: this.state.messageCount + 1 
    });
    
    // Get conversation history for context
    const history = await this.sql
      .prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10')
      .all();
    
    // Call LLM with context
    const response = await this.callLLM(message, history);
    
    return response;
  }
}
```

### 3. WebSocket Real-time Communication

```typescript
// src/server.ts
export default {
  async fetch(request: Request, env: Env) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const id = env.HardwareDebugAgent.idFromName('session-123');
      const agent = env.HardwareDebugAgent.get(id);
      return agent.fetch(request);
    }
    // ... HTTP handling
  }
}
```

### 4. Tools for Hardware Analysis

```typescript
// src/tools.ts
export const analyzeVerilogTool = tool({
  description: "Analyze Verilog/VHDL code for common issues",
  parameters: z.object({
    code: z.string(),
    language: z.enum(['verilog', 'vhdl'])
  }),
  execute: async ({ code, language }) => {
    // Perform static analysis
    const issues = detectCommonIssues(code, language);
    return { issues, suggestions: generateSuggestions(issues) };
  }
});
```

---

## 🎓 Technical Highlights Relevant to My Background

As a PhD student in Computer Science at UCSB with expertise in:

- **SoC Protocol Verification** → Understanding hardware communication patterns helps the assistant provide accurate advice on bus protocols (AXI, AHB)
- **Hardware Security (Logic Locking)** → Knowledge of secure design practices informs suggestions on protecting IP
- **ML for Hardware** → Using ML models (LLMs) to analyze and debug hardware designs bridges both domains
- **RTL Design & Synthesis** → First-hand experience with Verilog, synthesis tools, and timing analysis

This project demonstrates:
1. **Domain expertise** in hardware design translating to user-facing tools
2. **Full-stack development** capabilities (React + TypeScript + Cloudflare platform)
3. **AI integration** skills with modern LLM frameworks
4. **Production-ready code** with proper error handling, state management, and UX

---

## 🧪 Example Interactions

**User**: "I'm getting a latch inferred warning for this code:
```verilog
always @(a or b) begin
  if (a) 
    out = b;
end
```"

**Assistant**: "I see the issue! You have an incomplete conditional assignment. When `a` is false, `out` doesn't get assigned, causing the synthesizer to infer a latch to hold the previous value.

**Fix**: Add an else clause:
```verilog
always @(a or b) begin
  if (a) 
    out = b;
  else
    out = 1'b0;  // or whatever default value you need
end
```

Or use a default assignment before the if:
```verilog
always @(a or b) begin
  out = 1'b0;  // default
  if (a) 
    out = b;
end
```"

---

## 📊 Meeting the Requirements

| Requirement | Implementation | Technology |
|------------|----------------|------------|
| **LLM** | ✅ Llama 3.3 70B Instruct | Workers AI |
| **Workflow/Coordination** | ✅ Agent class with state management | Agents SDK + Durable Objects |
| **User Input (Chat)** | ✅ Real-time WebSocket chat interface | React + WebSocket API |
| **Memory/State** | ✅ SQL storage + state sync | Durable Objects SQL + setState() |

---

## 🚀 Future Enhancements

- [ ] Upload Verilog/VHDL files directly
- [ ] Integration with GitHub for pull request reviews
- [ ] Voice input support (Speech-to-Text API)
- [ ] Multi-user collaboration sessions
- [ ] Connect to real EDA tools via workflows
- [ ] Formal verification suggestions using Rosette/Z3

---
