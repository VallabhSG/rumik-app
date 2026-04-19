jest.mock('react-native', () => ({
  ErrorUtils: {
    getGlobalHandler: jest.fn().mockReturnValue(null),
    setGlobalHandler: jest.fn(),
  },
}));

import { ErrorUtils } from 'react-native';
import { ErrorReporter } from '../../../services/ota/ErrorReporter';
import type { OtaConfig } from '../../../services/ota/types';

const mockGetGlobalHandler = ErrorUtils.getGlobalHandler as jest.Mock;
const mockSetGlobalHandler = ErrorUtils.setGlobalHandler as jest.Mock;

const config: OtaConfig = {
  serverUrl: 'https://ota.example.com',
  apiKey: 'test-key',
  channel: 'production',
  platform: 'ios',
  nativeVersion: '1.0.0',
  crashThreshold: 0.05,
  minLaunchesBeforeRollback: 3,
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  mockGetGlobalHandler.mockReturnValue(null);
});

describe('ErrorReporter', () => {
  it('installs a global error handler', () => {
    const reporter = new ErrorReporter('device-1', '1.0.0', config);
    reporter.install();
    expect(mockSetGlobalHandler).toHaveBeenCalledTimes(1);
    expect(typeof mockSetGlobalHandler.mock.calls[0][0]).toBe('function');
    reporter.uninstall();
  });

  it('does not install twice', () => {
    const reporter = new ErrorReporter('d', '1.0.0', config);
    reporter.install();
    reporter.install(); // second call should be no-op
    expect(mockSetGlobalHandler).toHaveBeenCalledTimes(1);
    reporter.uninstall();
  });

  it('restores previous handler on uninstall', () => {
    const prevHandler = jest.fn();
    mockGetGlobalHandler.mockReturnValue(prevHandler);
    const reporter = new ErrorReporter('d', '1.0.0', config);
    reporter.install();
    reporter.uninstall();
    expect(mockSetGlobalHandler).toHaveBeenLastCalledWith(prevHandler);
  });

  it('report() sends error to /api/errors', async () => {
    const reporter = new ErrorReporter('device-1', '1.0.0', config);
    const error = new Error('Something went wrong');
    error.stack = 'Error: Something went wrong\n    at doThing (App.tsx:42:5)\n    at HomeScreen.tsx:18:3';

    await reporter.report(error, false);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://ota.example.com/api/errors');
    const body = JSON.parse(opts.body);
    expect(body.device_id).toBe('device-1');
    expect(body.version).toBe('1.0.0');
    expect(body.error_type).toBe('Error');
    expect(body.message).toBe('Something went wrong');
    expect(Array.isArray(body.stack_trace)).toBe(true);
    expect(body.stack_trace.length).toBeGreaterThan(0);
  });

  it('includes is_fatal in context', async () => {
    const reporter = new ErrorReporter('d', '1.0.0', config);
    const error = new Error('Fatal error');
    await reporter.report(error, true);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.context.is_fatal).toBe(true);
  });

  it('does not throw when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const reporter = new ErrorReporter('d', '1.0.0', config);
    const error = new Error('test');
    await expect(reporter.report(error, false)).resolves.toBeUndefined();
  });

  it('sends correct auth header', async () => {
    const reporter = new ErrorReporter('d', '1.0.0', config);
    await reporter.report(new Error('x'), false);
    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers['Authorization']).toBe('Bearer test-key');
  });

  it('handles errors without stack trace', async () => {
    const reporter = new ErrorReporter('d', '1.0.0', config);
    const error = new Error('no stack');
    error.stack = undefined;
    await reporter.report(error, false);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(Array.isArray(body.stack_trace)).toBe(true);
    expect(body.stack_trace.length).toBeGreaterThan(0);
  });

  it('filters node_modules frames from stack', async () => {
    const reporter = new ErrorReporter('d', '1.0.0', config);
    const error = new Error('test');
    error.stack = [
      'Error: test',
      '    at myFn (App.tsx:10:5)',
      '    at reactFn (node_modules/react/index.js:100:3)',
      '    at otherFn (src/screens/Home.tsx:20:1)',
    ].join('\n');
    await reporter.report(error, false);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const files = body.stack_trace.map((f: { file: string }) => f.file);
    expect(files.some((f: string) => f.includes('node_modules'))).toBe(false);
  });
});
