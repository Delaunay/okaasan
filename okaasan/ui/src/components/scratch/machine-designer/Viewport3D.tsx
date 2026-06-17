import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import {
  MachineConfig, FRAME_PROFILE_SPECS, GUIDE_SPECS, MOTOR_SPECS,
} from './types';

const AXIS_COLORS = { x: '#e74c3c', y: '#27ae60', z: '#3498db' };

const Extrusion: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  profileW: number;
  profileH: number;
  color?: string;
}> = ({ start, end, profileW, profileH, color = '#666' }) => {
  const [sx, sy, sz] = start;
  const [ex, ey, ez] = end;
  const length = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2 + (ez - sz) ** 2);
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  const midZ = (sz + ez) / 2;

  const quaternion = useMemo(() => {
    const dir = new THREE.Vector3(ex - sx, ey - sy, ez - sz).normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return q;
  }, [sx, sy, sz, ex, ey, ez]);

  return (
    <mesh position={[midX, midY, midZ]} quaternion={quaternion}>
      <boxGeometry args={[profileW / 1000, length / 1000, profileH / 1000]} />
      <meshStandardMaterial color={color} transparent opacity={0.6} />
    </mesh>
  );
};

const Rail: React.FC<{
  position: [number, number, number];
  length: number;
  axis: 'x' | 'y' | 'z';
  width: number;
  height: number;
  color?: string;
}> = ({ position, length, axis, width, height, color = '#aaa' }) => {
  const rotation: [number, number, number] = axis === 'x'
    ? [0, 0, Math.PI / 2]
    : axis === 'z'
      ? [Math.PI / 2, 0, 0]
      : [0, 0, 0];

  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={[width / 1000, length / 1000, height / 1000]} />
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
    </mesh>
  );
};

const Motor: React.FC<{
  position: [number, number, number];
  size: number;
}> = ({ position, size }) => (
  <mesh position={position}>
    <boxGeometry args={[size / 1000, size / 1000, (size * 1.2) / 1000]} />
    <meshStandardMaterial color="#333" metalness={0.5} roughness={0.5} />
  </mesh>
);

const MachineModel: React.FC<{ config: MachineConfig }> = ({ config }) => {
  const profile = FRAME_PROFILE_SPECS[config.frame.profile];
  const pw = profile.widthMm;
  const ph = profile.heightMm;
  const fx = config.frame.xLengthMm;
  const fy = config.frame.yLengthMm;
  const fz = config.frame.zLengthMm;

  // Convert to meters for Three.js (using mm/1000)
  const extrusions = useMemo(() => {
    const halfX = fx / 2;
    const halfY = fy / 2;
    const bars: { start: [number, number, number]; end: [number, number, number]; color: string }[] = [];

    // Bottom frame (4 horizontal bars)
    bars.push({ start: [-halfX, 0, -halfY], end: [halfX, 0, -halfY], color: AXIS_COLORS.x });
    bars.push({ start: [-halfX, 0, halfY], end: [halfX, 0, halfY], color: AXIS_COLORS.x });
    bars.push({ start: [-halfX, 0, -halfY], end: [-halfX, 0, halfY], color: AXIS_COLORS.y });
    bars.push({ start: [halfX, 0, -halfY], end: [halfX, 0, halfY], color: AXIS_COLORS.y });

    // Top frame (4 horizontal bars)
    bars.push({ start: [-halfX, fz, -halfY], end: [halfX, fz, -halfY], color: AXIS_COLORS.x });
    bars.push({ start: [-halfX, fz, halfY], end: [halfX, fz, halfY], color: AXIS_COLORS.x });
    bars.push({ start: [-halfX, fz, -halfY], end: [-halfX, fz, halfY], color: AXIS_COLORS.y });
    bars.push({ start: [halfX, fz, -halfY], end: [halfX, fz, halfY], color: AXIS_COLORS.y });

    // Vertical bars (4 corners)
    bars.push({ start: [-halfX, 0, -halfY], end: [-halfX, fz, -halfY], color: AXIS_COLORS.z });
    bars.push({ start: [halfX, 0, -halfY], end: [halfX, fz, -halfY], color: AXIS_COLORS.z });
    bars.push({ start: [-halfX, 0, halfY], end: [-halfX, fz, halfY], color: AXIS_COLORS.z });
    bars.push({ start: [halfX, 0, halfY], end: [halfX, fz, halfY], color: AXIS_COLORS.z });

    return bars;
  }, [fx, fy, fz]);

  // Rails
  const rails = useMemo(() => {
    const result: { position: [number, number, number]; length: number; axis: 'x' | 'y' | 'z'; width: number; height: number }[] = [];
    const halfX = fx / 2;
    const halfY = fy / 2;
    const railHeight = fz * 0.7;

    // X axis rails (on the gantry beam, at top)
    const xGuide = GUIDE_SPECS[config.axes.x.guideType];
    if (config.axes.x.guideCount >= 1) {
      result.push({ position: [0, railHeight, -halfY + 30], length: fx - 60, axis: 'x', width: xGuide.width, height: xGuide.height });
    }
    if (config.axes.x.guideCount === 2) {
      const spacing = config.axes.x.guideSpacingMm;
      result.push({ position: [0, railHeight + spacing, -halfY + 30], length: fx - 60, axis: 'x', width: xGuide.width, height: xGuide.height });
    }

    // Y axis rails (on the side frames)
    const yGuide = GUIDE_SPECS[config.axes.y.guideType];
    if (config.axes.y.guideCount >= 1) {
      result.push({ position: [-halfX + 15, railHeight, 0], length: fy - 60, axis: 'y', width: yGuide.width, height: yGuide.height });
      result.push({ position: [halfX - 15, railHeight, 0], length: fy - 60, axis: 'y', width: yGuide.width, height: yGuide.height });
    }
    if (config.axes.y.guideCount === 2) {
      const spacing = config.axes.y.guideSpacingMm;
      result.push({ position: [-halfX + 15, railHeight + spacing, 0], length: fy - 60, axis: 'y', width: yGuide.width, height: yGuide.height });
      result.push({ position: [halfX - 15, railHeight + spacing, 0], length: fy - 60, axis: 'y', width: yGuide.width, height: yGuide.height });
    }

    // Z axis rails (vertical)
    const zGuide = GUIDE_SPECS[config.axes.z.guideType];
    if (config.axes.z.guideCount >= 1) {
      result.push({ position: [-halfX + 25, fz / 2, -halfY + 25], length: fz - 80, axis: 'z', width: zGuide.width, height: zGuide.height });
    }
    if (config.axes.z.guideCount === 2) {
      result.push({ position: [halfX - 25, fz / 2, -halfY + 25], length: fz - 80, axis: 'z', width: zGuide.width, height: zGuide.height });
    }

    return result;
  }, [config, fx, fy, fz]);

  // Motors
  const motors = useMemo(() => {
    const result: { position: [number, number, number]; size: number }[] = [];
    const halfX = fx / 2;
    const halfY = fy / 2;
    const railHeight = fz * 0.7;

    if (config.kinematics === 'corexy') {
      const mSize = MOTOR_SPECS[config.axes.x.motorType].flangeSizeMm;
      result.push({ position: [-halfX + 10, railHeight + 30, -halfY + 10], size: mSize });
      result.push({ position: [halfX - 10, railHeight + 30, -halfY + 10], size: mSize });
    } else {
      const mxSize = MOTOR_SPECS[config.axes.x.motorType].flangeSizeMm;
      result.push({ position: [-halfX - 20, railHeight, -halfY + 30], size: mxSize });
      const mySize = MOTOR_SPECS[config.axes.y.motorType].flangeSizeMm;
      result.push({ position: [-halfX + 15, railHeight, -halfY - 20], size: mySize });
    }

    // Z motors
    const mzSize = MOTOR_SPECS[config.axes.z.motorType].flangeSizeMm;
    for (let i = 0; i < config.axes.z.motorCount; i++) {
      const angle = (i / config.axes.z.motorCount) * Math.PI * 2;
      const r = Math.min(halfX, halfY) * 0.6;
      result.push({ position: [Math.cos(angle) * r, -20, Math.sin(angle) * r], size: mzSize });
    }

    return result;
  }, [config, fx, fy, fz]);

  return (
    <group scale={[1 / 1000, 1 / 1000, 1 / 1000]} position={[0, -fz / 2000, 0]}>
      {extrusions.map((bar, i) => (
        <Extrusion key={`ext-${i}`} start={bar.start} end={bar.end} profileW={pw} profileH={ph} color={bar.color} />
      ))}
      {rails.map((rail, i) => (
        <Rail key={`rail-${i}`} {...rail} />
      ))}
      {motors.map((m, i) => (
        <Motor key={`motor-${i}`} {...m} />
      ))}
    </group>
  );
};

const Viewport3D: React.FC<{ config: MachineConfig }> = ({ config }) => {
  return (
    <Canvas
      camera={{ position: [0.4, 0.3, 0.5], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-3, 2, -3]} intensity={0.3} />

      <MachineModel config={config} />

      {/* Grid */}
      <gridHelper args={[1, 20, '#444', '#333']} />

      <OrbitControls makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport />
      </GizmoHelper>
    </Canvas>
  );
};

export default Viewport3D;
