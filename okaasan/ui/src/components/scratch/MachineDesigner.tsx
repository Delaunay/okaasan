import React, { useState, useCallback } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Tabs, Input, Flex, Separator,
} from '@chakra-ui/react';
import { Wrench } from 'lucide-react';
import {
  MachineConfig, AxisConfig, DEFAULT_MACHINE_CONFIG,
  GUIDE_SPECS, DRIVE_SPECS, MOTOR_SPECS, FRAME_PROFILE_SPECS,
  GuideType, DriveType, MotorType, FrameProfile, KinematicsType,
  GuideOrientation, deriveBuildVolume,
} from './machine-designer/types';
import Viewport3D from './machine-designer/Viewport3D';
import Views2D from './machine-designer/Views2D';
import KinematicsPanel from './machine-designer/KinematicsPanel';
import StiffnessPanel from './machine-designer/StiffnessPanel';
import BOMPanel from './machine-designer/BOMPanel';

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  background: 'var(--input-bg)',
  fontSize: '13px',
};

const AxisConfigEditor: React.FC<{
  label: string;
  config: AxisConfig;
  onChange: (c: AxisConfig) => void;
}> = ({ label, config, onChange }) => {
  const update = (field: keyof AxisConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <Box p={3} bg="var(--card-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)">
      <Text fontSize="sm" fontWeight="bold" mb={2} color="var(--heading-color)">{label} Axis</Text>

      <VStack gap={2} align="stretch">
        <HStack gap={2}>
          <Box flex={2}>
            <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Guide</Text>
            <select style={selectStyle} value={config.guideType} onChange={e => update('guideType', e.target.value as GuideType)}>
              {Object.entries(GUIDE_SPECS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Box>
          <Box flex={1}>
            <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Count</Text>
            <select style={selectStyle} value={config.guideCount} onChange={e => update('guideCount', Number(e.target.value) as 1 | 2)}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </Box>
          {config.guideCount === 2 && (
            <Box flex={1}>
              <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Spacing</Text>
              <Input size="xs" type="number" value={config.guideSpacingMm} onChange={e => update('guideSpacingMm', Number(e.target.value))} />
            </Box>
          )}
        </HStack>

        {config.guideCount === 2 && (
          <Box>
            <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Rail Orientation</Text>
            <select style={selectStyle} value={config.guideOrientation} onChange={e => update('guideOrientation', e.target.value as GuideOrientation)}>
              <option value="same_face">Same face (parallel, same surface)</option>
              <option value="opposed">Opposed (180°, top/bottom of beam)</option>
              <option value="perpendicular">Perpendicular (90°, adjacent faces)</option>
            </select>
          </Box>
        )}

        <HStack gap={2}>
          <Box flex={2}>
            <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Drive</Text>
            <select style={selectStyle} value={config.driveType} onChange={e => update('driveType', e.target.value as DriveType)}>
              {Object.entries(DRIVE_SPECS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Box>
          <Box flex={1}>
            <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Motor</Text>
            <select style={selectStyle} value={config.motorType} onChange={e => update('motorType', e.target.value as MotorType)}>
              {Object.entries(MOTOR_SPECS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Box>
          <Box flex={1}>
            <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Motors</Text>
            <select style={selectStyle} value={config.motorCount} onChange={e => update('motorCount', Number(e.target.value) as 1 | 2 | 3)}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </Box>
        </HStack>

        <HStack gap={2}>
          <Box flex={1}>
            <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Carriage Offset (mm)</Text>
            <Input size="xs" type="number" value={config.carriageOffsetMm} onChange={e => update('carriageOffsetMm', Number(e.target.value))} />
          </Box>
        </HStack>
      </VStack>
    </Box>
  );
};

const MachineDesigner: React.FC = () => {
  const [config, setConfig] = useState<MachineConfig>(DEFAULT_MACHINE_CONFIG);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [activeTab, setActiveTab] = useState('frame');

  const updateFrame = useCallback((field: string, value: any) => {
    setConfig(c => ({ ...c, frame: { ...c.frame, [field]: value } }));
  }, []);

  const updateAxis = useCallback((axis: 'x' | 'y' | 'z', axisConfig: AxisConfig) => {
    setConfig(c => ({ ...c, axes: { ...c.axes, [axis]: axisConfig } }));
  }, []);

  const buildVolume = deriveBuildVolume(config);

  return (
    <Box p={4} h="100vh" overflow="hidden">
      <HStack mb={3} gap={3}>
        <Wrench size={22} color="var(--icon-color)" />
        <Heading size="md" color="var(--heading-color)">Machine Designer</Heading>
        <Input
          size="sm"
          maxW="200px"
          value={config.name}
          onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
          variant="flushed"
          fontWeight="medium"
        />
      </HStack>

      <Flex gap={4} h="calc(100vh - 80px)">
        {/* Left: Config Panels */}
        <Box w="380px" minW="380px" overflowY="auto" pr={2}>
          <Tabs.Root value={activeTab} onValueChange={e => setActiveTab(e.value)} size="sm">
            <Tabs.List mb={3}>
              <Tabs.Trigger value="frame">Frame</Tabs.Trigger>
              <Tabs.Trigger value="kinematics">Kinematics</Tabs.Trigger>
              <Tabs.Trigger value="stiffness">Stiffness</Tabs.Trigger>
              <Tabs.Trigger value="bom">BOM</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="frame">
              <VStack gap={3} align="stretch">
                {/* Global frame config */}
                <Box p={3} bg="var(--card-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)">
                  <Text fontSize="sm" fontWeight="bold" mb={2} color="var(--heading-color)">Frame</Text>
                  <HStack gap={2} mb={2}>
                    <Box flex={1}>
                      <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Profile</Text>
                      <select style={selectStyle} value={config.frame.profile} onChange={e => updateFrame('profile', e.target.value as FrameProfile)}>
                        {Object.entries(FRAME_PROFILE_SPECS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </Box>
                    <Box flex={1}>
                      <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Kinematics</Text>
                      <select style={selectStyle} value={config.kinematics} onChange={e => setConfig(c => ({ ...c, kinematics: e.target.value as KinematicsType }))}>
                        <option value="corexy">CoreXY</option>
                        <option value="cartesian">Cartesian</option>
                      </select>
                    </Box>
                  </HStack>
                  <HStack gap={2} mb={2}>
                    <Box flex={1}>
                      <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>X (mm)</Text>
                      <Input size="xs" type="number" value={config.frame.xLengthMm} onChange={e => updateFrame('xLengthMm', Number(e.target.value))} />
                    </Box>
                    <Box flex={1}>
                      <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Y (mm)</Text>
                      <Input size="xs" type="number" value={config.frame.yLengthMm} onChange={e => updateFrame('yLengthMm', Number(e.target.value))} />
                    </Box>
                    <Box flex={1}>
                      <Text fontSize="xs" color="var(--muted-text)" mb={0.5}>Z (mm)</Text>
                      <Input size="xs" type="number" value={config.frame.zLengthMm} onChange={e => updateFrame('zLengthMm', Number(e.target.value))} />
                    </Box>
                  </HStack>
                  <Text fontSize="xs" color="var(--muted-text)">
                    Build volume: {buildVolume.x} x {buildVolume.y} x {buildVolume.z} mm
                  </Text>
                </Box>

                <Separator />

                {/* Per-axis configs */}
                <AxisConfigEditor label="X" config={config.axes.x} onChange={c => updateAxis('x', c)} />
                <AxisConfigEditor label="Y" config={config.axes.y} onChange={c => updateAxis('y', c)} />
                <AxisConfigEditor label="Z" config={config.axes.z} onChange={c => updateAxis('z', c)} />
              </VStack>
            </Tabs.Content>

            <Tabs.Content value="kinematics">
              <KinematicsPanel config={config} />
            </Tabs.Content>

            <Tabs.Content value="stiffness">
              <StiffnessPanel config={config} />
            </Tabs.Content>

            <Tabs.Content value="bom">
              <BOMPanel config={config} />
            </Tabs.Content>
          </Tabs.Root>
        </Box>

        {/* Right: Viewport */}
        <Box flex={1} bg="var(--surface-muted)" borderRadius="md" borderWidth="1px" borderColor="var(--border-color)" position="relative" overflow="hidden">
          <HStack position="absolute" top={2} right={2} zIndex={10} gap={1}>
            <button
              onClick={() => setViewMode('3d')}
              style={{
                padding: '4px 10px', fontSize: '12px', borderRadius: '4px',
                background: viewMode === '3d' ? 'var(--icon-color)' : 'var(--card-bg)',
                color: viewMode === '3d' ? '#fff' : 'var(--muted-text)',
                border: '1px solid var(--border-color)', cursor: 'pointer',
              }}
            >3D</button>
            <button
              onClick={() => setViewMode('2d')}
              style={{
                padding: '4px 10px', fontSize: '12px', borderRadius: '4px',
                background: viewMode === '2d' ? 'var(--icon-color)' : 'var(--card-bg)',
                color: viewMode === '2d' ? '#fff' : 'var(--muted-text)',
                border: '1px solid var(--border-color)', cursor: 'pointer',
              }}
            >2D</button>
          </HStack>

          {viewMode === '3d' ? (
            <Viewport3D config={config} />
          ) : (
            <Views2D config={config} />
          )}
        </Box>
      </Flex>
    </Box>
  );
};

export default MachineDesigner;
