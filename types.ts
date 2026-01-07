
export interface Vector2 {
  x: number;
  y: number;
}

export interface Ball {
  id: string;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  color: string;
  spawnTime: number;
  isFrozen: boolean;
}

export enum SimulationState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED',
}
