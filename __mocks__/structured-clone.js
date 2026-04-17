// Provide structuredClone — available natively in Node 17+
module.exports = { default: globalThis.structuredClone ?? ((v) => JSON.parse(JSON.stringify(v))) };
