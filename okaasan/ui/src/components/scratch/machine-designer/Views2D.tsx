import React from 'react';
import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { MachineConfig, FRAME_PROFILE_SPECS, GUIDE_SPECS, deriveBuildVolume } from './types';

const PADDING = 40;
const VIEW_SIZE = 320;

const DimensionArrow: React.FC<{
  x1: number; y1: number; x2: number; y2: number;
  label: string; offset?: number;
}> = ({ x1, y1, x2, y2, label, offset = 15 }) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 5) return null;

  const nx = -dy / len * offset;
  const ny = dx / len * offset;
  const ax1 = x1 + nx;
  const ay1 = y1 + ny;
  const ax2 = x2 + nx;
  const ay2 = y2 + ny;
  const mx = (ax1 + ax2) / 2;
  const my = (ay1 + ay2) / 2;

  return (
    <g>
      <line x1={x1} y1={y1} x2={ax1} y2={ay1} stroke="var(--muted-text)" strokeWidth={0.5} strokeDasharray="2,2" />
      <line x1={x2} y1={y2} x2={ax2} y2={ay2} stroke="var(--muted-text)" strokeWidth={0.5} strokeDasharray="2,2" />
      <line x1={ax1} y1={ay1} x2={ax2} y2={ay2} stroke="var(--icon-color)" strokeWidth={1} markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
      <text x={mx + nx * 0.5} y={my + ny * 0.5} fontSize={10} fill="var(--icon-color)" textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
    </g>
  );
};

const TopView: React.FC<{ config: MachineConfig }> = ({ config }) => {
  const fx = config.frame.xLengthMm;
  const fy = config.frame.yLengthMm;
  const maxDim = Math.max(fx, fy);
  const scale = (VIEW_SIZE - PADDING * 2) / maxDim;
  const w = fx * scale;
  const h = fy * scale;
  const ox = (VIEW_SIZE - w) / 2;
  const oy = (VIEW_SIZE - h) / 2;
  const pw = FRAME_PROFILE_SPECS[config.frame.profile].widthMm * scale;
  const buildVol = deriveBuildVolume(config);

  return (
    <Box>
      <Text fontSize="xs" fontWeight="bold" color="var(--heading-color)" mb={1} textAlign="center">Top View (XY)</Text>
      <svg width={VIEW_SIZE} height={VIEW_SIZE} style={{ background: 'var(--card-bg)', borderRadius: '6px' }}>
        <defs>
          <marker id="arrowStart" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
            <path d="M6,0 L0,3 L6,6" fill="none" stroke="var(--icon-color)" strokeWidth="1" />
          </marker>
          <marker id="arrowEnd" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="none" stroke="var(--icon-color)" strokeWidth="1" />
          </marker>
        </defs>

        {/* Frame outline */}
        <rect x={ox} y={oy} width={w} height={h} fill="none" stroke="var(--border-color)" strokeWidth={1} />

        {/* Extrusions (thick lines at edges) */}
        <rect x={ox} y={oy} width={w} height={pw} fill="#555" opacity={0.5} />
        <rect x={ox} y={oy + h - pw} width={w} height={pw} fill="#555" opacity={0.5} />
        <rect x={ox} y={oy} width={pw} height={h} fill="#555" opacity={0.5} />
        <rect x={ox + w - pw} y={oy} width={pw} height={h} fill="#555" opacity={0.5} />

        {/* Build area */}
        <rect
          x={ox + (w - buildVol.x * scale) / 2}
          y={oy + (h - buildVol.y * scale) / 2}
          width={buildVol.x * scale}
          height={buildVol.y * scale}
          fill="var(--panel-blue-bg)" stroke="var(--panel-blue-border)" strokeWidth={1} strokeDasharray="4,2"
        />

        {/* X rails */}
        {config.axes.x.guideCount >= 1 && (
          <line x1={ox + 20} y1={oy + pw + 10} x2={ox + w - 20} y2={oy + pw + 10} stroke="#e74c3c" strokeWidth={2} />
        )}
        {config.axes.x.guideCount === 2 && (
          <line x1={ox + 20} y1={oy + pw + 10 + config.axes.x.guideSpacingMm * scale} x2={ox + w - 20} y2={oy + pw + 10 + config.axes.x.guideSpacingMm * scale} stroke="#e74c3c" strokeWidth={2} opacity={0.6} />
        )}

        {/* Y rails */}
        {config.axes.y.guideCount >= 1 && (
          <>
            <line x1={ox + pw + 5} y1={oy + 20} x2={ox + pw + 5} y2={oy + h - 20} stroke="#27ae60" strokeWidth={2} />
            <line x1={ox + w - pw - 5} y1={oy + 20} x2={ox + w - pw - 5} y2={oy + h - 20} stroke="#27ae60" strokeWidth={2} />
          </>
        )}

        {/* Motor positions (CoreXY: back corners) */}
        {config.kinematics === 'corexy' && (
          <>
            <rect x={ox + 5} y={oy + 5} width={12} height={12} fill="#333" stroke="#666" strokeWidth={1} />
            <rect x={ox + w - 17} y={oy + 5} width={12} height={12} fill="#333" stroke="#666" strokeWidth={1} />
          </>
        )}

        {/* Dimensions */}
        <DimensionArrow x1={ox} y1={oy + h} x2={ox + w} y2={oy + h} label={`${fx}mm`} offset={18} />
        <DimensionArrow x1={ox + w} y1={oy} x2={ox + w} y2={oy + h} label={`${fy}mm`} offset={18} />
      </svg>
    </Box>
  );
};

const FrontView: React.FC<{ config: MachineConfig }> = ({ config }) => {
  const fx = config.frame.xLengthMm;
  const fz = config.frame.zLengthMm;
  const maxDim = Math.max(fx, fz);
  const scale = (VIEW_SIZE - PADDING * 2) / maxDim;
  const w = fx * scale;
  const h = fz * scale;
  const ox = (VIEW_SIZE - w) / 2;
  const oy = (VIEW_SIZE - h) / 2;
  const pw = FRAME_PROFILE_SPECS[config.frame.profile].widthMm * scale;
  const buildVol = deriveBuildVolume(config);

  return (
    <Box>
      <Text fontSize="xs" fontWeight="bold" color="var(--heading-color)" mb={1} textAlign="center">Front View (XZ)</Text>
      <svg width={VIEW_SIZE} height={VIEW_SIZE} style={{ background: 'var(--card-bg)', borderRadius: '6px' }}>
        <defs>
          <marker id="arrowStart2" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
            <path d="M6,0 L0,3 L6,6" fill="none" stroke="var(--icon-color)" strokeWidth="1" />
          </marker>
          <marker id="arrowEnd2" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="none" stroke="var(--icon-color)" strokeWidth="1" />
          </marker>
        </defs>

        {/* Frame outline */}
        <rect x={ox} y={oy} width={w} height={h} fill="none" stroke="var(--border-color)" strokeWidth={1} />

        {/* Vertical extrusions */}
        <rect x={ox} y={oy} width={pw} height={h} fill="#555" opacity={0.5} />
        <rect x={ox + w - pw} y={oy} width={pw} height={h} fill="#555" opacity={0.5} />

        {/* Top/bottom beams */}
        <rect x={ox} y={oy} width={w} height={pw} fill="#555" opacity={0.5} />
        <rect x={ox} y={oy + h - pw} width={w} height={pw} fill="#555" opacity={0.5} />

        {/* Z rails (vertical blue lines) */}
        {config.axes.z.guideCount >= 1 && (
          <line x1={ox + pw + 10} y1={oy + 20} x2={ox + pw + 10} y2={oy + h - 20} stroke="#3498db" strokeWidth={2} />
        )}
        {config.axes.z.guideCount === 2 && (
          <line x1={ox + w - pw - 10} y1={oy + 20} x2={ox + w - pw - 10} y2={oy + h - 20} stroke="#3498db" strokeWidth={2} opacity={0.6} />
        )}

        {/* X gantry rail (horizontal red line at ~70% height) */}
        <line x1={ox + 15} y1={oy + h * 0.3} x2={ox + w - 15} y2={oy + h * 0.3} stroke="#e74c3c" strokeWidth={2} />

        {/* Build volume */}
        <rect
          x={ox + (w - buildVol.x * scale) / 2}
          y={oy + h - pw - buildVol.z * scale - 10}
          width={buildVol.x * scale}
          height={buildVol.z * scale}
          fill="var(--panel-green-bg)" stroke="var(--panel-green-border)" strokeWidth={1} strokeDasharray="4,2"
        />

        {/* Dimensions */}
        <DimensionArrow x1={ox} y1={oy + h} x2={ox + w} y2={oy + h} label={`${fx}mm`} offset={18} />
        <DimensionArrow x1={ox + w} y1={oy} x2={ox + w} y2={oy + h} label={`${fz}mm`} offset={18} />
      </svg>
    </Box>
  );
};

const Views2D: React.FC<{ config: MachineConfig }> = ({ config }) => {
  return (
    <VStack p={4} gap={4} h="100%" overflowY="auto" align="center">
      <HStack gap={4} flexWrap="wrap" justify="center">
        <TopView config={config} />
        <FrontView config={config} />
      </HStack>
      <Text fontSize="xs" color="var(--muted-text)">
        Red = X axis | Green = Y axis | Blue = Z axis | Dashed = build volume
      </Text>
    </VStack>
  );
};

export default Views2D;
