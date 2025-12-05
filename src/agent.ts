// src/agent.ts
import { Agent } from 'agents';
import { streamText } from 'ai';
import { analyzeVerilogTool, timingAnalysisTool, detectCDCIssuesTool } from './tools';

export interface DesignContext {
  currentModule: string;
  recentErrors: string[];
  codeSnippets: Array<{ code: string; timestamp: number }>;
  syntaxPreferences: {
    language: 'verilog' | 'vhdl';
    style: 'ieee' | 'industry';
  };
}

export class HardwareDebugAgent extends Agent {
  /**
   * Initialize the agent and set up the database schema
   */
  async initialize() {
    // Create messages table for conversation history
    await this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      )
    `);

    // Create design_context table for tracking design state
    await this.sql.exec(`
      CREATE TABLE IF NOT EXISTS design_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_name TEXT,
        error_type TEXT,
        code_snippet TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // Initialize state
    await this.setState({
      conversationCount: 0,
      lastInteraction: Date.now(),
      designContext: {
        currentModule: 'none',
        recentErrors: [],
        codeSnippets: [],
        syntaxPreferences: {
          language: 'verilog',
          style: 'industry',
        },
      } as DesignContext,
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
      return;
    }

    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'chat':
          await this.handleChatMessage(ws, data.content);
          break;
        case 'analyze_code':
          await this.handleCodeAnalysis(ws, data.code, data.language);
          break;
        case 'get_history':
          await this.sendChatHistory(ws);
          break;
        case 'clear_history':
          await this.clearHistory();
          ws.send(JSON.stringify({ type: 'history_cleared' }));
          break;
        default:
          ws.send(JSON.stringify({ error: 'Unknown message type' }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ 
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  /**
   * Handle chat message with streaming response
   */
  private async handleChatMessage(ws: WebSocket, userMessage: string) {
    // Store user message in database
    await this.sql.exec(
      'INSERT INTO messages (role, content, timestamp) VALUES (?, ?, ?)',
      ['user', userMessage, Date.now()]
    );

    // Update conversation count
    const currentState = this.state;
    await this.setState({
      ...currentState,
      conversationCount: (currentState.conversationCount || 0) + 1,
      lastInteraction: Date.now(),
    });

    // Extract design context from message
    await this.updateDesignContext(userMessage);

    // Get conversation history for context
    const history = await this.getConversationHistory(10);

    // Build system prompt with hardware debugging expertise
    const systemPrompt = this.buildSystemPrompt(currentState.designContext);

    // Stream response from LLM
    try {
      const result = await streamText({
        model: this.getModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userMessage },
        ],
        tools: {
          analyzeVerilog: analyzeVerilogTool,
          timingAnalysis: timingAnalysisTool,
          detectCDCIssues: detectCDCIssuesTool,
        },
        temperature: 0.7,
        maxTokens: 2000,
      });

      let fullResponse = '';

      // Stream response chunks to client
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        ws.send(JSON.stringify({
          type: 'stream',
          content: chunk,
        }));
      }

      // Store assistant response in database
      await this.sql.exec(
        'INSERT INTO messages (role, content, timestamp) VALUES (?, ?, ?)',
        ['assistant', fullResponse, Date.now()]
      );

      // Send completion signal
      ws.send(JSON.stringify({ type: 'stream_end' }));

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to generate response',
        details: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  /**
   * Handle code analysis requests
   */
  private async handleCodeAnalysis(ws: WebSocket, code: string, language: 'verilog' | 'vhdl') {
    try {
      const analysis = await analyzeVerilogTool.execute({ code, language });
      
      // Store in design context
      await this.sql.exec(
        'INSERT INTO design_context (code_snippet, timestamp) VALUES (?, ?)',
        [code, Date.now()]
      );

      ws.send(JSON.stringify({
        type: 'analysis_result',
        analysis,
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Code analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  /**
   * Build system prompt with hardware expertise
   */
  private buildSystemPrompt(designContext: DesignContext): string {
    return `You are an expert Hardware Debug Assistant specializing in RTL design with Verilog and VHDL.

Your expertise includes:
- Digital logic design and synthesis
- Timing analysis (setup/hold violations, clock domain crossing)
- Common pitfalls (latch inference, combinational loops, metastability)
- EDA tool usage (Synopsys, Cadence, Xilinx)
- Best practices for synthesizable code
- FSM design and optimization
- Protocol implementations (AXI, AHB, APB)

Current design context:
- Active module: ${designContext.currentModule}
- Recent issues: ${designContext.recentErrors.join(', ') || 'none'}
- Preferred language: ${designContext.syntaxPreferences.language}

Guidelines:
1. Provide clear, actionable debugging advice
2. Include code examples when relevant
3. Explain WHY issues occur, not just HOW to fix them
4. Reference specific line numbers when analyzing code
5. Suggest verification strategies
6. Be concise but thorough

When analyzing code:
- Check for synthesizability
- Identify timing issues
- Look for coding style problems
- Suggest optimizations`;
  }

  /**
   * Update design context based on user message
   */
  private async updateDesignContext(message: string) {
    const lowerMessage = message.toLowerCase();
    const currentState = this.state;
    const designContext = currentState.designContext as DesignContext;

    // Extract module name if mentioned
    const moduleMatch = message.match(/module\s+(\w+)/i);
    if (moduleMatch) {
      designContext.currentModule = moduleMatch[1];
      
      await this.sql.exec(
        'INSERT INTO design_context (module_name, timestamp) VALUES (?, ?)',
        [moduleMatch[1], Date.now()]
      );
    }

    // Track error types
    const errorKeywords = ['error', 'warning', 'violation', 'latch', 'timing'];
    for (const keyword of errorKeywords) {
      if (lowerMessage.includes(keyword)) {
        designContext.recentErrors.push(keyword);
        if (designContext.recentErrors.length > 5) {
          designContext.recentErrors.shift();
        }

        await this.sql.exec(
          'INSERT INTO design_context (error_type, timestamp) VALUES (?, ?)',
          [keyword, Date.now()]
        );
        break;
      }
    }

    // Update state
    await this.setState({
      ...currentState,
      designContext,
    });
  }

  /**
   * Get conversation history from database
   */
  private async getConversationHistory(limit: number = 10) {
    const result = await this.sql
      .prepare('SELECT role, content FROM messages ORDER BY timestamp DESC LIMIT ?')
      .bind(limit)
      .all();

    return result.results
      .reverse()
      .map((row: any) => ({
        role: row.role as 'user' | 'assistant' | 'system',
        content: row.content,
      }));
  }

  /**
   * Send chat history to client
   */
  private async sendChatHistory(ws: WebSocket) {
    const history = await this.getConversationHistory(50);
    ws.send(JSON.stringify({
      type: 'history',
      messages: history,
    }));
  }

  /**
   * Clear conversation history
   */
  private async clearHistory() {
    await this.sql.exec('DELETE FROM messages');
    await this.sql.exec('DELETE FROM design_context');
    
    // Reset state
    await this.setState({
      conversationCount: 0,
      lastInteraction: Date.now(),
      designContext: {
        currentModule: 'none',
        recentErrors: [],
        codeSnippets: [],
        syntaxPreferences: {
          language: 'verilog',
          style: 'industry',
        },
      } as DesignContext,
    });
  }

  /**
   * Get the configured LLM model
   */
  private getModel() {
    // This will be configured with Workers AI in llm.ts
    // For now, return a placeholder that will be replaced
    return (this.env as any).AI_MODEL;
  }

  /**
   * Handle WebSocket connection
   */
  async webSocketOpen(ws: WebSocket) {
    // Send welcome message with current state
    ws.send(JSON.stringify({
      type: 'connected',
      state: this.state,
    }));
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    // Cleanup if needed
    console.log(`WebSocket closed: ${code} - ${reason}`);
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, error: Error) {
    console.error('WebSocket error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Connection error occurred',
    }));
  }
}
