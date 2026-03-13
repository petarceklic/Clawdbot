'use client';

import { useRef, useEffect } from 'react';

interface SparklineProps {
  sparkline: number[];
  trend: string;
  className?: string;
}

export default function Sparkline({ sparkline, trend, className }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sparkline || sparkline.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 60;
    const h = 28;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    const data = sparkline;
    const isUp = trend === 'up';
    const color = isUp ? '#ff3344' : '#15EE76';

    const min = Math.min(...data) - 3;
    const max = Math.max(...data) + 3;
    const range = max - min;
    const pad = 3;
    const stepX = (w - pad) / (data.length - 1);

    // Fill area
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, isUp ? 'rgba(255, 51, 68, 0.25)' : 'rgba(21, 238, 118, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((d, i) => {
      const x = i * stepX;
      const y = h - ((d - min) / range) * (h - 4) - 2;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = i * stepX;
      const y = h - ((d - min) / range) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Feather left edge
    const feather = ctx.createLinearGradient(0, 0, 14, 0);
    feather.addColorStop(0, 'rgba(24, 24, 24, 1)');
    feather.addColorStop(1, 'rgba(24, 24, 24, 0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = feather;
    ctx.fillRect(0, 0, 14, h);
    ctx.globalCompositeOperation = 'source-over';

    // Last point dot
    const lastX = (data.length - 1) * stepX;
    const lastY = h - ((data[data.length - 1] - min) / range) * (h - 4) - 2;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [sparkline, trend]);

  return <canvas ref={canvasRef} className={className} />;
}
