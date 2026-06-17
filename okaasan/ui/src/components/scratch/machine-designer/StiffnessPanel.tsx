import React, { useMemo } from 'react';
import { Box, Text, VStack, HStack, Badge } from '@chakra-ui/react';
import { MachineConfig, AxisConfig, GUIDE_SPECS, FRAME_PROFILE_SPECS } from './types';

const REFERENCE_FORCE = 10; // N — typical 3D printing/light CNC force
const E_ALUMINUM = 69000; // MPa (N/mm^2) — Young's modulus for 6063 aluminum

interface DeflectionResult {
  axis: string;
  linearDeflection: number;    // um
  angularDeflection: number;   // arcsec
  guideDeflection: number;     // um from rail carriage compliance
  totalDeflection: number;     // um combined
  rating: 'excellent' | 'good' | 'moderate' | 'poor';
  recommendations: string[];
}

function computeDeflection(
  axisLabel: string,
  axisConfig: AxisConfig,
  spanMm: number,
  frameProfile: keyof typeof FRAME_PROFILE_SPECS,
): DeflectionResult {
  const guide = GUIDE_SPECS[axisConfig.guideType];
  const profile = FRAME_PROFILE_SPECS[frameProfile];
  const F = REFERENCE_FORCE;
  const L = spanMm;
  const offset = axisConfig.carriageOffsetMm;

  // 1. Frame/beam deflection (simply supported beam with center load)
  // d = F * L^3 / (48 * E * I)
  const I = profile.momentOfInertia; // mm^4
  const beamDeflection = (F * Math.pow(L, 3)) / (48 * E_ALUMINUM * I); // mm
  const beamDeflectionUm = beamDeflection * 1000; // convert to um

  // 2. Guide/carriage deflection
  // Linear stiffness: d = F / k (k in N/um)
  let effectiveLinearStiffness = guide.linearStiffness; // N/um per block
  if (axisConfig.guideCount === 2) {
    if (axisConfig.guideOrientation === 'perpendicular') {
      // 90° offset: stiffness in primary direction remains 1 rail's worth,
      // but the second rail adds stiffness in the perpendicular direction.
      // Net effect in each direction: ~1.0x (primary), ~1.0x (secondary)
      // Combined for worst-case: sqrt(k1^2 + k2^2) / sqrt(2) ≈ same as 1 rail per direction
      // In practice, slightly better because it resists in 2 planes
      effectiveLinearStiffness *= 1.4; // geometric mean improvement
    } else {
      // same_face or opposed: both resist in the same direction
      effectiveLinearStiffness *= 2;
    }
  }
  const guideDeflectionUm = F / effectiveLinearStiffness;

  // 3. Angular deflection from offset load (moment)
  // M = F * offset
  // theta = M / k_moment (k_moment in N·m/rad)
  const moment = F * (offset / 1000); // N·m
  let effectiveMomentStiffness = guide.momentStiffness; // N·m/rad per block
  if (axisConfig.guideCount === 2) {
    const spacing = axisConfig.guideSpacingMm / 1000; // m
    // k_linear in N/m (linearStiffness is N/um, so *1e6 → N/m)
    const kLinear = guide.linearStiffness * 1e6;

    if (axisConfig.guideOrientation === 'opposed') {
      // Opposed rails (180°): each rail's linear stiffness acts at spacing/2
      // from center, creating a couple: k_rot = 2 * k_linear * (d/2)^2 [N·m/rad]
      const coupleStiffness = 2 * kLinear * (spacing / 2) * (spacing / 2);
      effectiveMomentStiffness = guide.momentStiffness * 2 + coupleStiffness;
    } else if (axisConfig.guideOrientation === 'perpendicular') {
      // 90° offset: one rail resists tilt in the primary plane at full spacing
      const coupleStiffness = kLinear * spacing * spacing;
      effectiveMomentStiffness = guide.momentStiffness * 2 + coupleStiffness;
    } else {
      // Same face: both rails are on the same surface so they tilt together.
      // The spacing adds a small couple, but much less effective than opposed.
      const coupleStiffness = 2 * kLinear * (spacing / 2) * (spacing / 2) * 0.25;
      effectiveMomentStiffness = guide.momentStiffness * 2 + coupleStiffness;
    }
  }
  const angularRad = effectiveMomentStiffness > 0 ? moment / effectiveMomentStiffness : 0;
  const angularArcsec = angularRad * (180 / Math.PI) * 3600;

  // Angular deflection contribution to linear displacement at tool tip
  const angularLinearUm = angularRad * offset * 1000; // um

  // 4. Total combined deflection
  const totalDeflection = beamDeflectionUm + guideDeflectionUm + angularLinearUm;

  // Rating
  let rating: DeflectionResult['rating'];
  if (totalDeflection < 5) rating = 'excellent';
  else if (totalDeflection < 15) rating = 'good';
  else if (totalDeflection < 40) rating = 'moderate';
  else rating = 'poor';

  // Recommendations
  const recommendations: string[] = [];
  if (axisConfig.guideCount === 1 && totalDeflection > 15) {
    recommendations.push('Add a second rail to significantly reduce deflection');
  }
  if (axisConfig.guideCount === 2 && axisConfig.guideOrientation === 'same_face' && angularLinearUm > totalDeflection * 0.3) {
    recommendations.push('Switch to opposed orientation (180°) for much better moment resistance');
  }
  if (beamDeflectionUm > totalDeflection * 0.5) {
    recommendations.push('Frame deflection is dominant — use a larger extrusion profile');
  }
  if (angularLinearUm > totalDeflection * 0.4 && axisConfig.guideCount === 1) {
    recommendations.push('Reduce carriage offset or add second rail to counter moment');
  }
  if (guide.category === 'v_slot' && totalDeflection > 20) {
    recommendations.push('V-slot wheels have low stiffness — consider upgrading to linear rails');
  }
  if (L > 400 && beamDeflectionUm > 10) {
    recommendations.push('Long span — consider adding a mid-span support');
  }

  return {
    axis: axisLabel,
    linearDeflection: beamDeflectionUm + guideDeflectionUm,
    angularDeflection: angularArcsec,
    guideDeflection: guideDeflectionUm,
    totalDeflection,
    rating,
    recommendations,
  };
}

const RATING_COLORS: Record<string, string> = {
  excellent: 'green',
  good: 'blue',
  moderate: 'orange',
  poor: 'red',
};

const DeflectionBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <Box w="100%" h="8px" bg="var(--surface-muted)" borderRadius="full" overflow="hidden">
      <Box h="100%" w={`${pct}%`} bg={color} borderRadius="full" transition="width 0.3s" />
    </Box>
  );
};

const AxisDeflectionCard: React.FC<{ result: DeflectionResult }> = ({ result }) => {
  const maxDeflection = 60; // um scale for bar

  return (
    <Box p={3} bg="var(--card-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)">
      <HStack justify="space-between" mb={2}>
        <Text fontSize="sm" fontWeight="bold" color="var(--heading-color)">{result.axis} Axis</Text>
        <Badge colorPalette={RATING_COLORS[result.rating]} fontSize="2xs">{result.rating}</Badge>
      </HStack>

      <VStack gap={2} align="stretch">
        <Box>
          <HStack justify="space-between" mb={0.5}>
            <Text fontSize="xs" color="var(--muted-text)">Total deflection</Text>
            <Text fontSize="xs" fontWeight="bold">{result.totalDeflection.toFixed(1)} um</Text>
          </HStack>
          <DeflectionBar value={result.totalDeflection} max={maxDeflection} color={`var(--panel-${RATING_COLORS[result.rating]}-border)`} />
        </Box>

        <HStack gap={4} fontSize="xs" color="var(--muted-text)">
          <Text>Linear: {result.linearDeflection.toFixed(1)} um</Text>
          <Text>Angular: {result.angularDeflection.toFixed(1)}"</Text>
        </HStack>

        <HStack gap={4} fontSize="xs" color="var(--muted-text)">
          <Text>Rail compliance: {result.guideDeflection.toFixed(2)} um</Text>
        </HStack>

        {result.recommendations.length > 0 && (
          <VStack align="stretch" gap={0.5} mt={1}>
            {result.recommendations.map((r, i) => (
              <Text key={i} fontSize="2xs" color="var(--panel-orange-text)">
                → {r}
              </Text>
            ))}
          </VStack>
        )}
      </VStack>
    </Box>
  );
};

const ComparisonView: React.FC<{ config: MachineConfig }> = ({ config }) => {
  const comparisons = useMemo(() => {
    const results: { axis: string; label: string; current: number; improved: number }[] = [];
    const axes = ['x', 'y', 'z'] as const;
    const spans = [config.frame.xLengthMm, config.frame.yLengthMm, config.frame.zLengthMm];

    for (let i = 0; i < 3; i++) {
      const axisConfig = config.axes[axes[i]];
      const current = computeDeflection(axes[i].toUpperCase(), axisConfig, spans[i], config.frame.profile);

      if (axisConfig.guideCount === 1) {
        // Show: single → dual (same face)
        const dualSame = computeDeflection(axes[i].toUpperCase(), { ...axisConfig, guideCount: 2, guideOrientation: 'same_face' }, spans[i], config.frame.profile);
        results.push({ axis: axes[i].toUpperCase(), label: '1 rail → 2 same-face', current: current.totalDeflection, improved: dualSame.totalDeflection });

        // Show: single → dual (opposed)
        const dualOpposed = computeDeflection(axes[i].toUpperCase(), { ...axisConfig, guideCount: 2, guideOrientation: 'opposed' }, spans[i], config.frame.profile);
        results.push({ axis: axes[i].toUpperCase(), label: '1 rail → 2 opposed', current: current.totalDeflection, improved: dualOpposed.totalDeflection });
      } else if (axisConfig.guideOrientation === 'same_face') {
        // Show: same_face → opposed
        const opposed = computeDeflection(axes[i].toUpperCase(), { ...axisConfig, guideOrientation: 'opposed' }, spans[i], config.frame.profile);
        results.push({ axis: axes[i].toUpperCase(), label: 'same-face → opposed', current: current.totalDeflection, improved: opposed.totalDeflection });
      } else if (axisConfig.guideOrientation === 'perpendicular') {
        // Show: perpendicular → opposed
        const opposed = computeDeflection(axes[i].toUpperCase(), { ...axisConfig, guideOrientation: 'opposed' }, spans[i], config.frame.profile);
        results.push({ axis: axes[i].toUpperCase(), label: '90° → opposed', current: current.totalDeflection, improved: opposed.totalDeflection });
      }
    }
    return results.filter(r => r.current !== r.improved);
  }, [config]);

  if (comparisons.length === 0) return null;

  return (
    <Box p={3} bg="var(--card-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)">
      <Text fontSize="sm" fontWeight="bold" mb={2} color="var(--heading-color)">
        Improvement Suggestions
      </Text>
      <VStack align="stretch" gap={2}>
        {comparisons.map((c, idx) => (
          <HStack key={idx} justify="space-between" fontSize="xs" flexWrap="wrap">
            <Text fontWeight="medium" minW="20px">{c.axis}</Text>
            <Text color="var(--muted-text)" flex={1}>{c.label}</Text>
            <Text color="var(--panel-red-text)">{c.current.toFixed(1)}</Text>
            <Text color="var(--muted-text)">→</Text>
            <Text color="var(--panel-green-text)">{c.improved.toFixed(1)} um</Text>
            <Text color="var(--muted-text)">({((1 - c.improved / c.current) * 100).toFixed(0)}%)</Text>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
};

const StiffnessPanel: React.FC<{ config: MachineConfig }> = ({ config }) => {
  const results = useMemo(() => {
    return [
      computeDeflection('X', config.axes.x, config.frame.xLengthMm, config.frame.profile),
      computeDeflection('Y', config.axes.y, config.frame.yLengthMm, config.frame.profile),
      computeDeflection('Z', config.axes.z, config.frame.zLengthMm, config.frame.profile),
    ];
  }, [config]);

  return (
    <VStack gap={3} align="stretch">
      <Box p={2} bg="var(--surface-muted)" borderRadius="md">
        <Text fontSize="xs" color="var(--muted-text)">
          Deflection estimated under {REFERENCE_FORCE}N reference force (typical for 3D printing / light CNC).
          Lower is better — values under 10um are excellent for FDM printing.
        </Text>
      </Box>

      {results.map(r => (
        <AxisDeflectionCard key={r.axis} result={r} />
      ))}

      <ComparisonView config={config} />
    </VStack>
  );
};

export default StiffnessPanel;
