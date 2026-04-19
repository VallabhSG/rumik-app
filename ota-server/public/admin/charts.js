/* global Chart */
'use strict';

// ── Chart.js wrappers ─────────────────────────────────────────────────────────

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: {
      labels: { color: '#8892a4', font: { size: 12 } },
    },
    tooltip: {
      backgroundColor: '#1e2330',
      borderColor: '#2a3040',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#8892a4',
    },
  },
  scales: {
    x: {
      ticks: { color: '#8892a4', font: { size: 11 }, maxRotation: 0 },
      grid: { color: '#2a3040' },
    },
    y: {
      ticks: { color: '#8892a4', font: { size: 11 } },
      grid: { color: '#2a3040' },
    },
  },
};

/**
 * Create or replace a line chart on a canvas element.
 * Returns the Chart instance.
 */
function createLineChart(canvasId, datasets, labels, yLabel = '') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  // Destroy previous instance if any
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { ...CHART_DEFAULTS.plugins.legend, display: datasets.length > 1 },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: yLabel
            ? { display: true, text: yLabel, color: '#8892a4', font: { size: 11 } }
            : { display: false },
          beginAtZero: true,
        },
      },
    },
  });
}

/**
 * Create a horizontal bar chart for the adoption funnel.
 */
function createFunnelChart(canvasId, labels, values, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: CHART_DEFAULTS.plugins.tooltip,
      },
      scales: {
        x: {
          ticks: { color: '#8892a4', font: { size: 11 } },
          grid: { color: '#2a3040' },
          beginAtZero: true,
        },
        y: {
          ticks: { color: '#e2e8f0', font: { size: 12 } },
          grid: { color: 'transparent' },
        },
      },
    },
  });
}

/**
 * Create a tiny sparkline (no axes, no legend) inside a canvas.
 */
function createSparkline(canvasId, values, color = '#4f8ef7') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: values.map((_, i) => i),
      datasets: [{
        data: values,
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      }],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false },
      },
    },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Format an ISO bucket string to a short "HH:mm" label.
 */
function bucketLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Palette of distinct colors for multi-series charts.
 */
const PALETTE = [
  '#4f8ef7', '#3ecf8e', '#f59e0b', '#f05252',
  '#a78bfa', '#34d399', '#fbbf24', '#ef4444',
];

function seriesColor(idx) {
  return PALETTE[idx % PALETTE.length];
}
