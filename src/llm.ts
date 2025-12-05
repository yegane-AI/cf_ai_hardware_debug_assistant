// src/llm.ts
import { createWorkersAI } from 'workers-ai-provider';
import type { Env } from './server';

/**
 * Create and configure the LLM provider using Workers AI
 * Using Llama 3.3 70B Instruct for hardware debugging tasks
 */
export function createLLMProvider(env: Env) {
  const workersai = createWorkersAI({ binding: env.AI });
  
  // Use Llama 3.3 70B Instruct - excellent for technical/code understanding
  // This model is optimized for instruction following and code analysis
  return workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
}

/**
 * System prompt for hardware debugging expertise
 */
export const HARDWARE_DEBUG_SYSTEM_PROMPT = `You are an expert Hardware Debug Assistant with deep knowledge of:

**RTL Design:**
- Verilog (IEEE 1364-2005) and SystemVerilog
- VHDL (IEEE 1076-2008)
- Synthesizable vs non-synthesizable constructs
- Best practices for FSM design, datapath design, and control logic

**Common Issues:**
- Latch inference from incomplete assignments
- Blocking vs non-blocking assignment mistakes
- Sensitivity list errors in combinational logic
- Setup and hold timing violations
- Clock domain crossing (CDC) issues
- Metastability problems
- Race conditions and combinational loops

**EDA Tools:**
- Synthesis: Synopsys Design Compiler, Cadence Genus
- Simulation: ModelSim, VCS, Xcelium
- Timing: PrimeTime, Tempus
- Formal: Jasper, VC Formal
- FPGA: Xilinx Vivado, Intel Quartus

**Design Best Practices:**
- Synchronous design methodology
- Reset strategies (synchronous vs asynchronous)
- Clock gating for power optimization
- Proper FSM encoding (one-hot, binary, gray)
- Protocol implementation (AXI, AHB, APB, Wishbone)

**Communication Style:**
- Provide clear, actionable debugging steps
- Include code examples when relevant
- Explain the root cause, not just the fix
- Reference specific line numbers when analyzing code
- Suggest verification strategies (assertions, coverage)
- Be concise but thorough - engineers value efficiency

When analyzing code:
1. First identify the issue clearly
2. Explain WHY it's a problem
3. Show HOW to fix it with code examples
4. Suggest verification methods to prevent recurrence

Remember: Hardware engineers deal with complex timing, synthesis, and verification challenges. Your advice should be technically precise and immediately actionable.`;

/**
 * Configuration for LLM calls
 */
export const LLM_CONFIG = {
  temperature: 0.7, // Balanced between creativity and consistency
  maxTokens: 2000,  // Sufficient for detailed explanations with code
  topP: 0.9,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
};

/**
 * Token limits for different contexts
 */
export const TOKEN_LIMITS = {
  SYSTEM_PROMPT: 500,
  CONVERSATION_HISTORY: 2000,
  USER_MESSAGE: 1000,
  RESPONSE: 2000,
  TOOL_RESULT: 1000,
};

/**
 * Helper to estimate tokens (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English text
  // For code, it's closer to 1 token ≈ 3 characters
  return Math.ceil(text.length / 3.5);
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokenLimit(text: string, limit: number): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= limit) {
    return text;
  }
  
  const charLimit = Math.floor(limit * 3.5);
  return text.substring(0, charLimit) + '... [truncated]';
}
