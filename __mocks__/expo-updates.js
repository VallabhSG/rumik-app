module.exports = {
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: false }),
  fetchUpdateAsync: jest.fn().mockResolvedValue({}),
  reloadAsync: jest.fn().mockResolvedValue(undefined),
  runtimeVersion: '1.0.0',
  channel: 'production',
};
