'use client';

import { useRef, useEffect } from 'react';

interface NetworkCanvasProps {
  count?: number;
  maxDist?: number;
  speed?: number;
  className?: string;
}

export default function NetworkCanvas({
  count = 90,
  maxDist = 150,
  speed = 0.25,
  className,
}: NetworkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width: number;
    let height: number;
    let particles: { x: number; y: number; vx: number; vy: number; r: number }[];
    let animationId: number;

    function getNetworkColor(): string {
      const style = getComputedStyle(document.documentElement);
      return style.getPropertyValue('--network-rgb').trim() || '21, 238, 118';
    }

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      width = parent.offsetWidth;
      height = parent.offsetHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = width + 'px';
      canvas!.style.height = height + 'px';
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.scale(dpr, dpr);
    }

    function createParticles() {
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed,
          r: Math.random() * 2 + 0.8,
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      const rgb = getNetworkColor();

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.5;
            ctx!.strokeStyle = 'rgba(' + rgb + ', ' + alpha + ')';
            ctx!.lineWidth = 0.6;
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.stroke();
          }
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx!.fillStyle = 'rgba(' + rgb + ', 0.8)';
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }

      animationId = requestAnimationFrame(draw);
    }

    function handleResize() {
      resize();
      createParticles();
    }

    resize();
    createParticles();
    draw();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, [count, maxDist, speed]);

  return <canvas ref={canvasRef} className={className} />;
}
