// src/tools.ts
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool for analyzing Verilog/VHDL code for common issues
 */
export const analyzeVerilogTool = tool({
  description: `Analyze Verilog or VHDL code for common synthesis and design issues including:
    - Latch inference
    - Incomplete case statements
    - Combinational loops
    - Clock domain crossing issues
    - Blocking vs non-blocking assignments
    - Sensitivity list problems
    - Non-synthesizable constructs`,
  parameters: z.object({
    code: z.string().describe('The Verilog or VHDL code to analyze'),
    language: z.enum(['verilog', 'vhdl']).describe('The hardware description language'),
  }),
  execute: async ({ code, language }) => {
    const issues: Array<{
      type: string;
      severity: 'error' | 'warning' | 'info';
      line?: number;
      message: string;
      suggestion: string;
    }> = [];

    if (language === 'verilog') {
      // Check for latch inference (incomplete if/case statements)
      if (code.includes('if') && !code.includes('else')) {
        const lines = code.split('\n');
        const ifLine = lines.findIndex(l => l.includes('if'));
        issues.push({
          type: 'latch_inference',
          severity: 'warning',
          line: ifLine + 1,
          message: 'Incomplete if statement may cause latch inference',
          suggestion: 'Add an else clause or default assignment before the if statement',
        });
      }

      // Check for blocking assignments in sequential logic
      const hasAlwaysFF = code.match(/always\s*@\s*\(\s*posedge|negedge/);
      const hasBlockingInFF = hasAlwaysFF && code.includes('=') && !code.includes('<=');
      if (hasBlockingInFF) {
        issues.push({
          type: 'blocking_in_sequential',
          severity: 'error',
          message: 'Using blocking assignments (=) in sequential always block',
          suggestion: 'Use non-blocking assignments (<=) for sequential logic',
        });
      }

      // Check for sensitivity list issues
      const alwaysMatch = code.match(/always\s*@\s*\((.*?)\)/);
      if (alwaysMatch) {
        const sensitivityList = alwaysMatch[1];
        if (!sensitivityList.includes('posedge') && !sensitivityList.includes('negedge')) {
          // Combinational logic - check if all signals are in sensitivity list
          const usedSignals = extractSignals(code);
          const listedSignals = sensitivityList.split(/\s+or\s+|\s+,\s+/);
          
          const missing = usedSignals.filter(s => !listedSignals.includes(s));
          if (missing.length > 0) {
            issues.push({
              type: 'incomplete_sensitivity',
              severity: 'warning',
              message: `Potentially incomplete sensitivity list. Missing signals: ${missing.join(', ')}`,
              suggestion: 'Use always @(*) for automatic sensitivity list generation',
            });
          }
        }
      }

      // Check for case statement defaults
      if (code.includes('case') && !code.includes('default')) {
        issues.push({
          type: 'no_case_default',
          severity: 'warning',
          message: 'Case statement without default clause',
          suggestion: 'Add a default clause to handle unexpected values',
        });
      }

      // Check for multiple assignments to same signal
      const assignments = code.match(/(\w+)\s*[<]?=/g);
      if (assignments) {
        const signalCounts = new Map<string, number>();
        assignments.forEach(a => {
          const signal = a.split(/\s*[<]?=/)[0].trim();
          signalCounts.set(signal, (signalCounts.get(signal) || 0) + 1);
        });

        signalCounts.forEach((count, signal) => {
          if (count > 1) {
            issues.push({
              type: 'multiple_assignments',
              severity: 'error',
              message: `Signal '${signal}' assigned multiple times`,
              suggestion: 'Ensure each signal is assigned in only one always block or assign statement',
            });
          }
        });
      }

      // Check for clock domain crossing
      const hasClock = code.match(/@\s*\(posedge\s+(\w+)\)/g);
      if (hasClock && hasClock.length > 1) {
        const clocks = hasClock.map(h => h.match(/posedge\s+(\w+)/)?.[1]);
        if (new Set(clocks).size > 1) {
          issues.push({
            type: 'clock_domain_crossing',
            severity: 'warning',
            message: 'Multiple clock domains detected - potential CDC issues',
            suggestion: 'Use proper synchronizers (two-flop) for single-bit CDC, async FIFOs for data',
          });
        }
      }
    } else if (language === 'vhdl') {
      // VHDL-specific checks
      if (code.includes('process') && !code.includes('else')) {
        issues.push({
          type: 'latch_inference',
          severity: 'warning',
          message: 'Incomplete conditional assignment in process may cause latch',
          suggestion: 'Ensure all signals have default assignments or complete if-else chains',
        });
      }

      // Check for variable vs signal usage in processes
      const hasVariables = code.match(/\s+variable\s+/);
      const hasSignals = code.match(/\s+signal\s+/);
      if (hasVariables && hasSignals) {
        issues.push({
          type: 'mixed_variable_signal',
          severity: 'info',
          message: 'Process uses both variables and signals',
          suggestion: 'Variables update immediately, signals update at end of process - ensure correct usage',
        });
      }
    }

    // Generic checks for both languages
    const lines = code.split('\n');
    const longLines = lines.filter(l => l.length > 120);
    if (longLines.length > 0) {
      issues.push({
        type: 'style',
        severity: 'info',
        message: `${longLines.length} lines exceed 120 characters`,
        suggestion: 'Consider breaking long lines for better readability',
      });
    }

    return {
      totalIssues: issues.length,
      issues,
      summary: generateSummary(issues),
    };
  },
});

/**
 * Tool for timing analysis guidance
 */
export const timingAnalysisTool = tool({
  description: `Provide guidance on timing analysis and optimization including:
    - Setup and hold violations
    - Critical path analysis
    - Clock skew issues
    - Multi-cycle paths
    - False paths
    - Pipeline optimization`,
  parameters: z.object({
    issue: z.string().describe('Description of the timing issue'),
    clockFrequency: z.number().optional().describe('Target clock frequency in MHz'),
    violationType: z.enum(['setup', 'hold', 'both', 'unknown']).optional(),
  }),
  execute: async ({ issue, clockFrequency, violationType = 'unknown' }) => {
    const guidance: Array<{
      step: string;
      description: string;
      commands?: string[];
    }> = [];

    if (violationType === 'setup' || violationType === 'both') {
      guidance.push({
        step: 'Identify Critical Path',
        description: 'Run timing analysis to find the longest combinational path',
        commands: [
          'report_timing -from [all_registers] -to [all_registers] -max_paths 10',
          'report_timing -delay_type max -path_type full_clock',
        ],
      });

      guidance.push({
        step: 'Analyze Path Components',
        description: 'Break down the delay into: logic delay, net delay, and cell delay',
        commands: [
          'report_timing -path full_clock -delay max -nets',
        ],
      });

      guidance.push({
        step: 'Optimization Strategies',
        description: 'Consider these approaches to reduce critical path delay',
        commands: [
          '// Add pipeline stages to break up long paths',
          '// Use faster cells in the critical path',
          '// Reduce fanout of high-fanout nets',
          '// Consider multi-cycle path constraints if applicable',
        ],
      });
    }

    if (violationType === 'hold' || violationType === 'both') {
      guidance.push({
        step: 'Check Hold Violations',
        description: 'Hold violations often indicate clock skew or fast data paths',
        commands: [
          'report_timing -delay_type min',
          'report_clock_skew',
        ],
      });

      guidance.push({
        step: 'Hold Fixing',
        description: 'Tools typically fix hold violations automatically, but you can:',
        commands: [
          '// Add delay buffers in the data path',
          '// Balance clock tree to reduce skew',
          '// Check for inappropriate multi-cycle paths',
        ],
      });
    }

    if (clockFrequency) {
      const period = 1000 / clockFrequency; // in ns
      guidance.push({
        step: 'Clock Period Analysis',
        description: `Target clock period: ${period.toFixed(3)} ns at ${clockFrequency} MHz`,
        commands: [
          `create_clock -period ${period.toFixed(3)} [get_ports clk]`,
        ],
      });
    }

    return {
      issue,
      violationType,
      guidance,
      generalTips: [
        'Use register-to-register paths for best timing',
        'Avoid long combinational clouds',
        'Balance clock tree carefully',
        'Consider using timing exceptions for known multi-cycle paths',
        'Use synthesis constraints to guide optimization',
      ],
    };
  },
});

/**
 * Tool for detecting clock domain crossing issues
 */
export const detectCDCIssuesTool = tool({
  description: `Detect and provide guidance on Clock Domain Crossing (CDC) issues including:
    - Missing synchronizers
    - Improper data bus crossing
    - Metastability risks
    - FIFO usage recommendations`,
  parameters: z.object({
    description: z.string().describe('Description of the CDC scenario'),
    signalType: z.enum(['single-bit', 'multi-bit', 'bus', 'handshake']).optional(),
  }),
  execute: async ({ description, signalType }) => {
    const recommendations: Array<{
      scenario: string;
      solution: string;
      verilogExample?: string;
    }> = [];

    if (signalType === 'single-bit' || !signalType) {
      recommendations.push({
        scenario: 'Single-bit CDC crossing',
        solution: 'Use a two-flop synchronizer',
        verilogExample: `
// Two-flop synchronizer for single-bit signal
reg sync_ff1, sync_ff2;

always @(posedge clk_dest or negedge rst_n) begin
  if (!rst_n) begin
    sync_ff1 <= 1'b0;
    sync_ff2 <= 1'b0;
  end else begin
    sync_ff1 <= signal_from_source_domain;
    sync_ff2 <= sync_ff1;
  end
end

assign synced_signal = sync_ff2;`,
      });
    }

    if (signalType === 'multi-bit' || signalType === 'bus') {
      recommendations.push({
        scenario: 'Multi-bit bus crossing',
        solution: 'Use Gray code encoding or handshake protocol',
        verilogExample: `
// Gray code counter for CDC
function [N-1:0] bin2gray;
  input [N-1:0] bin;
  begin
    bin2gray = bin ^ (bin >> 1);
  end
endfunction

// In source domain
gray_counter <= bin2gray(binary_counter);

// In destination domain (synchronize each bit)
always @(posedge clk_dest) begin
  gray_sync1 <= gray_counter;
  gray_sync2 <= gray_sync1;
end`,
      });

      recommendations.push({
        scenario: 'Data bus with enable signal',
        solution: 'Use toggle-based or handshake protocol',
        verilogExample: `
// Handshake protocol for data bus
// Source domain
always @(posedge clk_src) begin
  if (data_valid && !req) begin
    req <= ~req;  // Toggle request
    data_reg <= data;
  end
end

// Destination domain
always @(posedge clk_dest) begin
  req_sync1 <= req;
  req_sync2 <= req_sync1;
  req_sync3 <= req_sync2;
  
  if (req_sync2 != req_sync3) begin
    // New data available
    data_out <= data_reg;
  end
end`,
      });
    }

    if (signalType === 'handshake') {
      recommendations.push({
        scenario: 'Handshake-based data transfer',
        solution: 'Four-phase handshake with proper synchronization',
        verilogExample: `
// Four-phase handshake CDC
// Source domain
always @(posedge clk_src) begin
  if (send_data && !req && ack_synced) begin
    data_reg <= data_in;
    req <= 1'b1;
  end else if (req && ack_synced) begin
    req <= 1'b0;
  end
end

// Sync ack back to source
always @(posedge clk_src) begin
  ack_sync1 <= ack;
  ack_synced <= ack_sync1;
end

// Destination domain
always @(posedge clk_dest) begin
  req_sync1 <= req;
  req_sync2 <= req_sync1;
  
  if (req_sync2 && !ack) begin
    data_out <= data_reg;
    ack <= 1'b1;
  end else if (!req_sync2 && ack) begin
    ack <= 1'b0;
  end
end`,
      });
    }

    return {
      description,
      signalType,
      recommendations,
      generalGuidelines: [
        'Never cross multi-bit buses without proper synchronization',
        'Use gray code for counters and pointers',
        'Always use at least two flops for synchronization',
        'Consider metastability recovery time (MTBF)',
        'Use async FIFOs for high-bandwidth data transfers',
        'Verify CDC paths with formal tools (Jasper, VC Formal)',
      ],
      toolRecommendations: [
        'Synopsys SpyGlass CDC verification',
        'Cadence JasperGold CDC',
        'Real Intent Meridian CDC',
      ],
    };
  },
});

/**
 * Helper function to extract signal names from Verilog code
 */
function extractSignals(code: string): string[] {
  const signals = new Set<string>();
  const lines = code.split('\n');
  
  for (const line of lines) {
    // Simple signal extraction (not comprehensive)
    const matches = line.match(/\b([a-zA-Z_]\w*)\b/g);
    if (matches) {
      matches.forEach(m => {
        // Filter out keywords
        if (!['always', 'if', 'else', 'case', 'begin', 'end', 'module', 'endmodule'].includes(m)) {
          signals.add(m);
        }
      });
    }
  }
  
  return Array.from(signals);
}

/**
 * Generate summary of issues found
 */
function generateSummary(issues: any[]): string {
  if (issues.length === 0) {
    return 'No issues found. Code looks good!';
  }

  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const info = issues.filter(i => i.severity === 'info').length;

  let summary = `Found ${issues.length} issue(s): `;
  const parts = [];
  if (errors > 0) parts.push(`${errors} error(s)`);
  if (warnings > 0) parts.push(`${warnings} warning(s)`);
  if (info > 0) parts.push(`${info} info`);

  return summary + parts.join(', ');
}

/**
 * Export tool execution handlers for confirmed actions
 */
export const toolExecutions = {
  analyzeVerilog: analyzeVerilogTool.execute,
  timingAnalysis: timingAnalysisTool.execute,
  detectCDCIssues: detectCDCIssuesTool.execute,
};
