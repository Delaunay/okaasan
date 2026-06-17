import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, VStack, HStack, Badge } from '@chakra-ui/react';
import { MachineConfig, DRIVE_SPECS, deriveBuildVolume } from './types';

const CANVAS_SIZE = 300;
const PADDING = 30;

const KinematicsPanel: React.FC<{ config: MachineConfig }> = ({ config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [toolPos, setToolPos] = useState({ x: 0.5, y: 0.5 });
  const [animating, setAnimating] = useState(false);
  const [time, setTime] = useState(0);

  const buildVol = deriveBuildVolume(config);
  const isCoreXY = config.kinematics === 'corexy';

  // Animate tool path (rectangle trace)
  useEffect(() => {
    if (!animating) return;
    let t = time;
    const tick = () => {
      t += 0.005;
      if (t > 1) t = 0;
      setTime(t);

      // Trace a rectangle
      let x: number, y: number;
      if (t < 0.25) { x = t * 4; y = 0; }
      else if (t < 0.5) { x = 1; y = (t - 0.25) * 4; }
      else if (t < 0.75) { x = 1 - (t - 0.5) * 4; y = 1; }
      else { x = 0; y = 1 - (t - 0.75) * 4; }

      x = 0.1 + x * 0.8;
      y = 0.1 + y * 0.8;
      setToolPos({ x, y });

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [animating]);

  // Draw kinematics visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = CANVAS_SIZE;
    const h = CANVAS_SIZE;
    ctx.clearRect(0, 0, w, h);

    const area = w - PADDING * 2;
    const tx = PADDING + toolPos.x * area;
    const ty = PADDING + toolPos.y * area;

    // Draw workspace boundary
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(PADDING, PADDING, area, area);
    ctx.setLineDash([]);

    if (isCoreXY) {
      // CoreXY belt paths
      // Motor A (top-left), Motor B (top-right)
      const mAx = PADDING;
      const mAy = PADDING;
      const mBx = PADDING + area;
      const mBy = PADDING;

      // Belt A path (simplified): Motor A → top-left → tool → bottom-right → Motor A
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mAx, mAy);
      ctx.lineTo(tx, mAy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.strokeStyle = '#e74c3c';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(PADDING + area, ty);
      ctx.lineTo(PADDING + area, PADDING + area);
      ctx.lineTo(mAx, PADDING + area);
      ctx.lineTo(mAx, mAy);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Belt B path
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mBx, mBy);
      ctx.lineTo(tx, mBy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.strokeStyle = '#3498db';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(PADDING, ty);
      ctx.lineTo(PADDING, PADDING + area);
      ctx.lineTo(mBx, PADDING + area);
      ctx.lineTo(mBx, mBy);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Motors
      ctx.fillStyle = '#333';
      ctx.fillRect(mAx - 6, mAy - 6, 12, 12);
      ctx.fillRect(mBx - 6, mBy - 6, 12, 12);
      ctx.fillStyle = '#e74c3c';
      ctx.font = '9px sans-serif';
      ctx.fillText('A', mAx - 3, mAy + 3);
      ctx.fillStyle = '#3498db';
      ctx.fillText('B', mBx - 3, mBy + 3);
    } else {
      // Cartesian: simple axis lines
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PADDING, ty);
      ctx.lineTo(PADDING + area, ty);
      ctx.stroke();

      ctx.strokeStyle = '#27ae60';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, PADDING);
      ctx.lineTo(tx, PADDING + area);
      ctx.stroke();

      // Motor markers
      ctx.fillStyle = '#333';
      ctx.fillRect(PADDING - 8, ty - 6, 12, 12);
      ctx.fillRect(tx - 6, PADDING - 8, 12, 12);
    }

    // Tool head
    ctx.beginPath();
    ctx.arc(tx, ty, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f39c12';
    ctx.fill();
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Crosshair
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(tx, PADDING);
    ctx.lineTo(tx, PADDING + area);
    ctx.moveTo(PADDING, ty);
    ctx.lineTo(PADDING + area, ty);
    ctx.stroke();
    ctx.setLineDash([]);

  }, [toolPos, isCoreXY]);

  // CoreXY motor calculations
  const motorA = isCoreXY ? toolPos.x + toolPos.y : toolPos.x;
  const motorB = isCoreXY ? toolPos.x - toolPos.y : toolPos.y;

  const xDrive = DRIVE_SPECS[config.axes.x.driveType];
  const yDrive = DRIVE_SPECS[config.axes.y.driveType];

  return (
    <VStack gap={3} align="stretch">
      <Box p={3} bg="var(--card-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)">
        <HStack justify="space-between" mb={2}>
          <Text fontSize="sm" fontWeight="bold" color="var(--heading-color)">
            {isCoreXY ? 'CoreXY' : 'Cartesian'} Kinematics
          </Text>
          <Badge colorPalette={isCoreXY ? 'purple' : 'blue'} fontSize="2xs">
            {isCoreXY ? 'Coupled' : 'Direct'}
          </Badge>
        </HStack>

        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{ width: '100%', maxWidth: CANVAS_SIZE, borderRadius: '6px', border: '1px solid var(--border-color)' }}
        />

        <HStack mt={2} gap={2}>
          <button
            onClick={() => setAnimating(!animating)}
            style={{
              padding: '4px 12px', fontSize: '12px', borderRadius: '4px',
              background: animating ? 'var(--panel-red-bg)' : 'var(--panel-green-bg)',
              border: `1px solid ${animating ? 'var(--panel-red-border)' : 'var(--panel-green-border)'}`,
              cursor: 'pointer',
            }}
          >
            {animating ? 'Stop' : 'Animate'}
          </button>
          <Text fontSize="xs" color="var(--muted-text)">
            Tool: ({(toolPos.x * buildVol.x).toFixed(0)}, {(toolPos.y * buildVol.y).toFixed(0)}) mm
          </Text>
        </HStack>
      </Box>

      {/* Motor info */}
      <Box p={3} bg="var(--card-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)">
        <Text fontSize="sm" fontWeight="bold" mb={2} color="var(--heading-color)">Motor Positions</Text>
        {isCoreXY ? (
          <VStack align="stretch" gap={1}>
            <HStack justify="space-between">
              <Text fontSize="xs" color="#e74c3c">Motor A</Text>
              <Text fontSize="xs">{(motorA * 100).toFixed(1)}%</Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs" color="#3498db">Motor B</Text>
              <Text fontSize="xs">{((motorB + 1) / 2 * 100).toFixed(1)}%</Text>
            </HStack>
            <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
              X = (A + B) / 2 | Y = (A - B) / 2
            </Text>
          </VStack>
        ) : (
          <VStack align="stretch" gap={1}>
            <HStack justify="space-between">
              <Text fontSize="xs" color="#e74c3c">X Motor</Text>
              <Text fontSize="xs">{(toolPos.x * 100).toFixed(1)}%</Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs" color="#27ae60">Y Motor</Text>
              <Text fontSize="xs">{(toolPos.y * 100).toFixed(1)}%</Text>
            </HStack>
          </VStack>
        )}
      </Box>

      {/* Speed/precision info */}
      <Box p={3} bg="var(--card-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)">
        <Text fontSize="sm" fontWeight="bold" mb={2} color="var(--heading-color)">Performance</Text>
        <VStack align="stretch" gap={1}>
          <HStack justify="space-between">
            <Text fontSize="xs">X max speed</Text>
            <Text fontSize="xs">{xDrive.maxSpeed} mm/s</Text>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="xs">Y max speed</Text>
            <Text fontSize="xs">{yDrive.maxSpeed} mm/s</Text>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="xs">X backlash</Text>
            <Text fontSize="xs">{xDrive.backlash} um</Text>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="xs">Y backlash</Text>
            <Text fontSize="xs">{yDrive.backlash} um</Text>
          </HStack>
          {isCoreXY && (
            <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
              CoreXY: diagonal speed = {Math.round(xDrive.maxSpeed * Math.SQRT2)} mm/s
            </Text>
          )}
        </VStack>
      </Box>
    </VStack>
  );
};

export default KinematicsPanel;
