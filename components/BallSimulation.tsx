
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, RotateCcw, Pause, Trophy } from 'lucide-react';
import { Ball, SimulationState, Vector2 } from '../types';
import {
  GRAVITY,
  FRICTION,
  BOUNCE_DAMPING,
  ROTATION_SPEED,
  GAP_SIZE,
  BALL_RADIUS,
  MAX_VELOCITY,
  TIME_LIMIT_MS,
  SPAWN_VELOCITY
} from '../constants';

const generateColor = () => {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 100%, 60%)`;
};

const generateId = () => Math.random().toString(36).substring(2, 9);

export const BallSimulation: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);

  const ballsRef = useRef<Ball[]>([]);
  const rotationRef = useRef<number>(0);
  const containerRadiusRef = useRef<number>(250); // Default start value
  const stateRef = useRef<SimulationState>(SimulationState.IDLE);

  const [activeTimer, setActiveTimer] = useState<number>(TIME_LIMIT_MS / 1000);
  const [simState, setSimState] = useState<SimulationState>(SimulationState.IDLE);
  const [attempts, setAttempts] = useState(1);

  const spawnBall = useCallback(() => {
    const newBall: Ball = {
      id: generateId(),
      position: { x: 0, y: -50 },
      velocity: {
        x: (Math.random() - 0.5) * SPAWN_VELOCITY * 2,
        y: (Math.random() - 0.5) * SPAWN_VELOCITY
      },
      radius: BALL_RADIUS,
      color: generateColor(),
      spawnTime: Date.now(),
      isFrozen: false
    };
    ballsRef.current = [...ballsRef.current, newBall];
    setAttempts(prev => ballsRef.current.filter(b => b.isFrozen).length + 1);
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const { width, height } = ctx.canvas;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw Container
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotationRef.current);
    ctx.beginPath();
    ctx.arc(0, 0, containerRadiusRef.current, GAP_SIZE / 2, Math.PI * 2 - GAP_SIZE / 2);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Glow for the ring
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(100, 116, 139, 0.4)';
    ctx.stroke();
    ctx.restore();

    // Draw Balls
    ballsRef.current.forEach(ball => {
      const x = centerX + ball.position.x;
      const y = centerY + ball.position.y;

      ctx.save();
      if (ball.isFrozen) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#475569';
        ctx.shadowBlur = 0;
        // Draw a slight border for frozen balls
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = ball.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = ball.color;
      }

      ctx.beginPath();
      ctx.arc(x, y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      if (ball.isFrozen) ctx.stroke();

      if (!ball.isFrozen) {
        const timeLeft = Math.max(0, (TIME_LIMIT_MS - (Date.now() - ball.spawnTime)) / 1000);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(timeLeft.toFixed(1) + 's', x, y - ball.radius - 10);
      }
      ctx.restore();
    });
  }, []);

  const updatePhysics = useCallback(() => {
    if (stateRef.current !== SimulationState.RUNNING) return;

    rotationRef.current += ROTATION_SPEED;

    const now = Date.now();
    let shouldSpawnNew = false;
    let ballEscaped = false;

    // We only update the physics for non-frozen balls
    // In our logic, there is only one non-frozen ball at a time
    const updatedBalls = [...ballsRef.current];

    for (let i = 0; i < updatedBalls.length; i++) {
      const ball = updatedBalls[i];
      if (ball.isFrozen) continue;

      // Check timer
      const elapsed = now - ball.spawnTime;
      if (elapsed >= TIME_LIMIT_MS) {
        ball.isFrozen = true;
        ball.velocity = { x: 0, y: 0 };
        shouldSpawnNew = true;
        continue;
      }

      // Physics integration
      ball.velocity.y += GRAVITY;
      ball.velocity.x *= FRICTION;
      ball.velocity.y *= FRICTION;

      const nextPos = {
        x: ball.position.x + ball.velocity.x,
        y: ball.position.y + ball.velocity.y
      };

      // 1. Collision with Frozen Balls (Solid obstacles)
      for (let j = 0; j < updatedBalls.length; j++) {
        const other = updatedBalls[j];
        if (i === j || !other.isFrozen) continue;

        const dx = nextPos.x - other.position.x;
        const dy = nextPos.y - other.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = ball.radius + other.radius;

        if (distance < minDistance) {
          // Collision Normal
          const nx = dx / distance;
          const ny = dy / distance;

          // Reflect velocity relative to the static frozen ball
          const dot = ball.velocity.x * nx + ball.velocity.y * ny;

          // Only bounce if moving towards the object
          if (dot < 0) {
            ball.velocity.x = (ball.velocity.x - 2 * dot * nx) * BOUNCE_DAMPING;
            ball.velocity.y = (ball.velocity.y - 2 * dot * ny) * BOUNCE_DAMPING;

            // Cap velocity for stability
            const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
            if (speed > MAX_VELOCITY) {
              ball.velocity.x = (ball.velocity.x / speed) * MAX_VELOCITY;
              ball.velocity.y = (ball.velocity.y / speed) * MAX_VELOCITY;
            }

            // Push out to prevent sticking
            const overlap = minDistance - distance;
            nextPos.x += nx * overlap;
            nextPos.y += ny * overlap;
            ball.color = generateColor();
          }
        }
      }

      // 2. Collision with Container Wall
      const distFromCenter = Math.sqrt(nextPos.x * nextPos.x + nextPos.y * nextPos.y);

      if (distFromCenter + ball.radius >= containerRadiusRef.current) {
        const angle = Math.atan2(nextPos.y, nextPos.x);
        let normalizedAngle = angle;
        if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;

        const currentRotation = rotationRef.current % (Math.PI * 2);
        let angleDiff = Math.abs(normalizedAngle - currentRotation);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

        if (angleDiff > GAP_SIZE / 2) {
          // Bounce off wall
          const nx = nextPos.x / distFromCenter;
          const ny = nextPos.y / distFromCenter;
          const dot = ball.velocity.x * nx + ball.velocity.y * ny;

          if (dot > 0) { // Moving outwards
            ball.velocity.x = (ball.velocity.x - 2 * dot * nx) * BOUNCE_DAMPING;
            ball.velocity.y = (ball.velocity.y - 2 * dot * ny) * BOUNCE_DAMPING;

            const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
            if (speed > MAX_VELOCITY) {
              ball.velocity.x = (ball.velocity.x / speed) * MAX_VELOCITY;
              ball.velocity.y = (ball.velocity.y / speed) * MAX_VELOCITY;
            }

            const overlap = (distFromCenter + ball.radius) - containerRadiusRef.current;
            nextPos.x -= nx * (overlap + 1);
            nextPos.y -= ny * (overlap + 1);
            ball.color = generateColor();
          }
        } else {
          // Check for escape
          if (distFromCenter > containerRadiusRef.current + ball.radius) {
            ballEscaped = true;
          }
        }
      }

      ball.position = nextPos;
    }

    ballsRef.current = updatedBalls;

    if (ballEscaped) {
      stateRef.current = SimulationState.FINISHED;
      setSimState(SimulationState.FINISHED);
    } else if (shouldSpawnNew) {
      spawnBall();
    }

    // Update UI timer for the active ball
    const activeBall = ballsRef.current.find(b => !b.isFrozen);
    if (activeBall) {
      setActiveTimer(Math.max(0, (TIME_LIMIT_MS - (Date.now() - activeBall.spawnTime)) / 1000));
    }
  }, [spawnBall]);

  const animate = useCallback(() => {
    updatePhysics();
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) draw(ctx);
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [updatePhysics, draw]);

  const initSimulation = useCallback(() => {
    ballsRef.current = [];
    rotationRef.current = 0;
    stateRef.current = SimulationState.IDLE;
    setSimState(SimulationState.IDLE);
    setAttempts(1);
    spawnBall();
  }, [spawnBall]);

  const startSimulation = () => {
    if (simState === SimulationState.FINISHED) {
      initSimulation();
    }
    stateRef.current = SimulationState.RUNNING;
    setSimState(SimulationState.RUNNING);
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const { clientWidth, clientHeight } = canvasRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;

        // Calculate available space subtracting UI height (approx 320px total for header + footer)
        const uiVerticalSpace = 340;
        const availableHeight = Math.max(300, clientHeight - uiVerticalSpace);
        const availableWidth = Math.max(300, clientWidth - 40);

        containerRadiusRef.current = Math.min(availableWidth, availableHeight) / 2;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    initSimulation();
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate, initSimulation]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-950 overflow-hidden font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Header UI */}
      <div className="absolute top-8 left-0 right-0 flex flex-col items-center pointer-events-none z-10">
        <h1 className="text-4xl font-black text-white mb-4 tracking-tighter italic uppercase drop-shadow-lg flex items-center justify-center gap-3">
          Sphere <span className="text-blue-500">Escape</span>
          <svg width="0.8em" height="0.8em" viewBox="0 0 100 100" className="drop-shadow-md pb-1">
            <defs>
              <radialGradient id="sphereGrad" cx="30%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="45" fill="url(#sphereGrad)" />
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          </svg>
        </h1>

        <div className="flex gap-4">
          <div className="bg-slate-900/90 border border-slate-800 backdrop-blur px-6 py-2 rounded-xl flex flex-col items-center shadow-2xl">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Tentative</span>
            <span className="text-2xl font-mono font-bold text-white leading-none">#{attempts}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 backdrop-blur px-6 py-2 rounded-xl flex flex-col items-center shadow-2xl min-w-[120px]">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Temps restant</span>
            <span className={`text-2xl font-mono font-bold leading-none ${activeTimer < 2 ? 'text-red-500 animate-pulse' : 'text-blue-400'}`}>
              {activeTimer.toFixed(2)}s
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-12 z-10 flex gap-4">
        {simState === SimulationState.RUNNING ? (
          <button
            onClick={() => { stateRef.current = SimulationState.IDLE; setSimState(SimulationState.IDLE); }}
            className="flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all active:scale-95 border border-slate-700 shadow-xl"
          >
            <Pause size={20} fill="currentColor" /> Pause
          </button>
        ) : (
          <button
            onClick={startSimulation}
            className="flex items-center gap-2 px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-500/20"
          >
            <Play size={20} fill="currentColor" /> {simState === SimulationState.FINISHED ? 'Rejouer' : 'Démarrer'}
          </button>
        )}

        <button
          onClick={initSimulation}
          className="p-4 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-2xl transition-all border border-slate-800"
          title="Réinitialiser"
        >
          <RotateCcw size={24} />
        </button>
      </div>

      {/* Win Overlay */}
      {simState === SimulationState.FINISHED && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-950/40 backdrop-blur-md z-30 px-6">
          <div className="bg-slate-900 border-2 border-blue-500 p-10 rounded-3xl shadow-[0_0_50px_rgba(59,130,246,0.5)] text-center max-w-md w-full animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/50">
              <Trophy size={40} className="text-white" />
            </div>
            <h2 className="text-4xl font-black text-white mb-2 uppercase tracking-tight">Victoire !</h2>
            <p className="text-slate-400 mb-8 text-lg">
              Une balle a réussi à s'échapper après <span className="text-blue-400 font-bold">{attempts} tentatives</span>.
            </p>
            <button
              onClick={initSimulation}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-blue-500/40"
            >
              Recommencer
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      {simState === SimulationState.IDLE && attempts === 1 && (
        <div className="absolute inset-x-0 bottom-32 flex justify-center pointer-events-none">
          <p className="text-slate-500 text-sm bg-slate-900/50 px-6 py-3 rounded-full border border-slate-800 backdrop-blur animate-bounce">
            Démarrer pour lancer la première balle !
          </p>
        </div>
      )}
    </div>
  );
};
