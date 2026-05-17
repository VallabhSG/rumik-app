#!/usr/bin/env node
// Checks that required runtime dependencies are present in package.json.
const p = require('../package.json');
const keys = Object.keys({ ...p.dependencies, ...p.devDependencies });
const required = [
  '@react-navigation/native',
  '@react-navigation/bottom-tabs',
  '@react-navigation/native-stack',
  'react-native-screens',
  'react-native-safe-area-context',
  'react-native-gesture-handler',
  'expo-av',
];
required.forEach(k => console.log(k, keys.includes(k) ? '✓' : '✗'));
