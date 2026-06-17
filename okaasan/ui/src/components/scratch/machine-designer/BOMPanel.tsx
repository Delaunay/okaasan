import React, { useMemo } from 'react';
import { Box, Text, VStack, HStack, Badge, Separator } from '@chakra-ui/react';
import {
  MachineConfig, AxisConfig,
  GUIDE_SPECS, DRIVE_SPECS, MOTOR_SPECS, FRAME_PROFILE_SPECS,
} from './types';

interface BOMItem {
  category: string;
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
}

function computeBOM(config: MachineConfig): BOMItem[] {
  const items: BOMItem[] = [];
  const profile = FRAME_PROFILE_SPECS[config.frame.profile];
  const fx = config.frame.xLengthMm;
  const fy = config.frame.yLengthMm;
  const fz = config.frame.zLengthMm;

  // Frame extrusions
  items.push({ category: 'Frame', name: `${profile.label} extrusion (X)`, quantity: 4, unit: `x ${fx}mm`, notes: 'Top/bottom, front/back' });
  items.push({ category: 'Frame', name: `${profile.label} extrusion (Y)`, quantity: 4, unit: `x ${fy}mm`, notes: 'Top/bottom, left/right' });
  items.push({ category: 'Frame', name: `${profile.label} extrusion (Z)`, quantity: 4, unit: `x ${fz}mm`, notes: 'Vertical corners' });
  items.push({ category: 'Frame', name: 'Corner brackets', quantity: 24, unit: 'pcs', notes: '2 per joint x 12 joints (or 3-way)' });

  // Per-axis components
  const axes: { label: string; axis: AxisConfig; span: number }[] = [
    { label: 'X', axis: config.axes.x, span: fx },
    { label: 'Y', axis: config.axes.y, span: fy },
    { label: 'Z', axis: config.axes.z, span: fz },
  ];

  for (const { label, axis, span } of axes) {
    const guide = GUIDE_SPECS[axis.guideType];
    const drive = DRIVE_SPECS[axis.driveType];
    const motor = MOTOR_SPECS[axis.motorType];
    const railLen = span - 60; // usable rail length

    // Rails
    const railCount = axis.guideCount * (label === 'Y' && config.kinematics === 'corexy' ? 2 : 1);
    items.push({
      category: `${label}-Axis`,
      name: `${guide.label} rail`,
      quantity: railCount,
      unit: `x ${railLen}mm`,
    });
    items.push({
      category: `${label}-Axis`,
      name: `${guide.label} carriage block`,
      quantity: railCount * (guide.category === 'linear_rail' ? 1 : 2),
      unit: 'pcs',
    });

    // Drive system
    if (drive.category === 'belt') {
      const beltPerimeter = label === 'X' || label === 'Y'
        ? (config.kinematics === 'corexy' ? (fx + fy) * 2 + 200 : span * 2 + 200)
        : 0;
      if (beltPerimeter > 0) {
        items.push({
          category: `${label}-Axis`,
          name: `${drive.label} belt`,
          quantity: 1,
          unit: `x ${beltPerimeter}mm`,
          notes: config.kinematics === 'corexy' && label === 'X' ? 'Shared CoreXY loop' : undefined,
        });
      }
      items.push({ category: `${label}-Axis`, name: 'GT2 20T pulley', quantity: axis.motorCount, unit: 'pcs' });
      items.push({ category: `${label}-Axis`, name: 'GT2 20T idler', quantity: label === 'X' || label === 'Y' ? 2 : 0, unit: 'pcs' });
    } else if (drive.category === 'ball_screw' || drive.category === 'lead_screw') {
      items.push({
        category: `${label}-Axis`,
        name: `${drive.label}`,
        quantity: axis.motorCount,
        unit: `x ${span - 40}mm`,
      });
      items.push({ category: `${label}-Axis`, name: `${drive.label} nut`, quantity: axis.motorCount, unit: 'pcs' });
      items.push({ category: `${label}-Axis`, name: 'BK/BF bearing mount', quantity: axis.motorCount * 2, unit: 'pcs' });
      items.push({ category: `${label}-Axis`, name: 'Flexible coupling', quantity: axis.motorCount, unit: 'pcs' });
    }

    // Motors
    items.push({
      category: `${label}-Axis`,
      name: `${motor.label} stepper motor`,
      quantity: axis.motorCount,
      unit: 'pcs',
      notes: `${motor.holdingTorque} N·m`,
    });
  }

  // Common hardware
  items.push({ category: 'Hardware', name: 'M5x10 button head screw', quantity: 80, unit: 'pcs', notes: 'Frame assembly' });
  items.push({ category: 'Hardware', name: 'M5 T-nut (drop-in)', quantity: 80, unit: 'pcs' });
  items.push({ category: 'Hardware', name: 'M3x8 socket head screw', quantity: 40, unit: 'pcs', notes: 'Rail mounting' });
  items.push({ category: 'Hardware', name: 'M3 T-nut', quantity: 40, unit: 'pcs' });

  // Filter out zero-quantity items
  return items.filter(item => item.quantity > 0);
}

const BOMPanel: React.FC<{ config: MachineConfig }> = ({ config }) => {
  const bom = useMemo(() => computeBOM(config), [config]);

  const categories = [...new Set(bom.map(i => i.category))];
  const totalParts = bom.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <VStack gap={3} align="stretch">
      <HStack justify="space-between">
        <Text fontSize="sm" fontWeight="bold" color="var(--heading-color)">Bill of Materials</Text>
        <Badge fontSize="2xs">{totalParts} total parts</Badge>
      </HStack>

      {categories.map(cat => (
        <Box key={cat} p={3} bg="var(--card-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)">
          <Text fontSize="xs" fontWeight="bold" color="var(--heading-color)" mb={2}>{cat}</Text>
          <VStack align="stretch" gap={1}>
            {bom.filter(i => i.category === cat).map((item, idx) => (
              <HStack key={idx} justify="space-between" fontSize="xs">
                <Text flex={2}>{item.name}</Text>
                <Text flex={1} textAlign="right" fontWeight="medium">
                  {item.quantity} {item.unit}
                </Text>
                {item.notes && (
                  <Text flex={1} color="var(--muted-text)" fontSize="2xs" textAlign="right">
                    {item.notes}
                  </Text>
                )}
              </HStack>
            ))}
          </VStack>
        </Box>
      ))}

      <Separator />

      <Box p={2} bg="var(--surface-muted)" borderRadius="md">
        <Text fontSize="xs" color="var(--muted-text)">
          BOM is approximate. Belt lengths include extra for tensioning.
          Fastener counts are estimates — adjust based on final design.
        </Text>
      </Box>
    </VStack>
  );
};

export default BOMPanel;
