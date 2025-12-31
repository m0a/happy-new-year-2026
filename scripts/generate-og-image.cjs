// Generate OG image using canvas
// Run: node scripts/generate-og-image.js

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const width = 1200;
const height = 630;

const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Background gradient
const gradient = ctx.createLinearGradient(0, 0, width, height);
gradient.addColorStop(0, '#0a0a2e');
gradient.addColorStop(0.5, '#1a1a4e');
gradient.addColorStop(1, '#0a0a2e');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, width, height);

// Add stars
ctx.fillStyle = '#ffffff';
for (let i = 0; i < 100; i++) {
  const x = Math.random() * width;
  const y = Math.random() * height;
  const size = Math.random() * 2 + 1;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}

// City silhouette
ctx.fillStyle = '#111133';
for (let x = 0; x < width; x += 40) {
  const buildingHeight = 50 + Math.random() * 150;
  ctx.fillRect(x, height - buildingHeight, 35, buildingHeight);
}

// Main title
ctx.fillStyle = '#ffff00';
ctx.font = 'bold 90px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.shadowColor = '#ff6600';
ctx.shadowBlur = 20;
ctx.fillText('HAPPY NEW YEAR', width / 2, 180);

// Year
ctx.fillStyle = '#ff3366';
ctx.font = 'bold 150px sans-serif';
ctx.shadowColor = '#ff0066';
ctx.shadowBlur = 30;
ctx.fillText('2026', width / 2, 340);

// Subtitle
ctx.fillStyle = '#00ffff';
ctx.font = 'bold 40px sans-serif';
ctx.shadowColor = '#00ffff';
ctx.shadowBlur = 15;
ctx.fillText('3D FLIGHT SHOOTING GAME', width / 2, 480);

// Play instruction
ctx.fillStyle = '#ffffff';
ctx.font = '24px sans-serif';
ctx.shadowColor = '#ffffff';
ctx.shadowBlur = 10;
ctx.fillText('▶ CLICK TO PLAY', width / 2, 560);

// Save
const buffer = canvas.toBuffer('image/png');
const outputPath = path.join(__dirname, '..', 'public', 'og-image.png');
fs.writeFileSync(outputPath, buffer);
console.log('OG image saved to:', outputPath);
