import { ErrorUtils } from 'react-native';
import type { OtaConfig } from './types';

interface StackFrame {
  file: string;
  line?: number;
  column?: number;
  func?: string;
}

function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [{ file: 'unknown', func: 'unknown' }];

  return stack
    .split('\n')
    .slice(1) // skip the error message line
    .map(line => {
      // Format: "    at funcName (file.js:10:5)" or "    at file.js:10:5"
      const atMatch = line.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?/);
      if (atMatch) {
        return {
          func: atMatch[1] ?? '<anonymous>',
          file: atMatch[2] ?? 'unknown',
          line: atMatch[3] ? parseInt(atMatch[3], 10) : undefined,
          column: atMatch[4] ? parseInt(atMatch[4], 10) : undefined,
        };
      }
      return { file: line.trim(), func: '<anonymous>' };
    })
    .filter(f => f.file && !f.file.includes('node_modules'))
    .slice(0, 20);
}

export class ErrorReporter {
  private config: OtaConfig;
  private deviceId: string;
  private version: string;
  private installed = false;
  private previousHandler: ((error: Error, isFatal?: boolean) => void) | null = null;

  constructor(deviceId: string, version: string, config: OtaConfig) {
    this.deviceId = deviceId;
    this.version = version;
    this.config = config;
  }

  install(): void {
    if (this.installed) return;
    this.installed = true;

    try {
      this.previousHandler = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        this.report(error, isFatal ?? false).catch(() => {});
        // Always call the previous handler so crash reporting doesn't suppress it
        this.previousHandler?.(error, isFatal);
      });
    } catch {
      // ErrorUtils may not be available in all environments
    }
  }

  uninstall(): void {
    if (!this.installed) return;
    this.installed = false;
    try {
      if (this.previousHandler) {
        ErrorUtils.setGlobalHandler(this.previousHandler);
      }
    } catch {
      // ignore
    }
  }

  async report(error: Error, isFatal: boolean): Promise<void> {
    const stackTrace = parseStack(error.stack);

    try {
      await fetch(`${this.config.serverUrl}/api/errors`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: this.deviceId,
          version: this.version,
          channel: this.config.channel,
          platform: this.config.platform,
          error_type: error.name || 'Error',
          message: error.message || 'Unknown error',
          stack_trace: stackTrace,
          context: { is_fatal: isFatal },
        }),
      });
    } catch {
      // Best-effort — never throw from error reporter
    }
  }
}
