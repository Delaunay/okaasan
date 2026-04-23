import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Grid,
  Heading,
  Input,
  HStack,
  Text,
  VStack,
} from '@chakra-ui/react';

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 300;
const CANVAS_PADDING = 40;
const LAYER_COUNT = 6;

const clampNumber = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const makeNumberChange = (
  setter: React.Dispatch<React.SetStateAction<number>>
) => (event: React.ChangeEvent<HTMLInputElement>) => {
  const parsed = Number.parseFloat(event.target.value);
  setter(parsed);
};

const quadraticPoint = (
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number
): [number, number] => {
  const oneMinus = 1 - t;
  const x = oneMinus * oneMinus * p0[0] + 2 * oneMinus * t * p1[0] + t * t * p2[0];
  const y = oneMinus * oneMinus * p0[1] + 2 * oneMinus * t * p1[1] + t * t * p2[1];
  return [x, y];
};

const polygonArea = (points: Array<[number, number]>): number => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) * 0.5;
};

const estimateFilamentArea = (
  layerWidth: number,
  layerHeight: number,
  nozzleSize: number
): number => {
  if (layerWidth <= 0 || layerHeight <= 0 || nozzleSize <= 0) return 0;
  const radiusX = layerWidth / 2;
  const radiusY = layerHeight / 2;
  const heightRatio = layerHeight / nozzleSize;
  const flatFactor = clampNumber(1.35 - heightRatio, 0.3, 1);
  const flatHalf = Math.min(nozzleSize / 2, radiusX) * flatFactor;
  const leftFlatX = -flatHalf;
  const rightFlatX = flatHalf;
  const topY = -radiusY;
  const bottomY = radiusY;
  const leftX = -radiusX;
  const rightX = radiusX;

  const points: Array<[number, number]> = [];
  points.push([leftFlatX, topY], [rightFlatX, topY]);

  const segments = 16;
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    points.push(quadraticPoint([rightFlatX, topY], [rightX, topY], [rightX, 0], t));
  }
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    points.push(quadraticPoint([rightX, 0], [rightX, bottomY], [rightFlatX, bottomY], t));
  }
  points.push([leftFlatX, bottomY]);
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    points.push(quadraticPoint([leftFlatX, bottomY], [leftX, bottomY], [leftX, 0], t));
  }
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    points.push(quadraticPoint([leftX, 0], [leftX, topY], [leftFlatX, topY], t));
  }

  return polygonArea(points);
};

const FilamentOverhang: React.FC = () => {
  const [layerHeight, setLayerHeight] = useState(0.2);
  const [layerWidth, setLayerWidth] = useState(0.45);
  const [layerWidthMode, setLayerWidthMode] = useState<'auto' | 'manual'>('auto');
  const [nozzleSize, setNozzleSize] = useState(0.4);
  const [overhangAngle, setOverhangAngle] = useState(45);
  const [extruderTemp, setExtruderTemp] = useState(200);
  const [cooling, setCooling] = useState(100);
  const [filamentDiameter, setFilamentDiameter] = useState(1.75);
  const [flowRate, setFlowRate] = useState(20);
  const [materialDensity, setMaterialDensity] = useState(1.27);
  const [printSpeed, setPrintSpeed] = useState(100);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const derivedLayerWidth =
    layerHeight > 0 && printSpeed > 0
      ? flowRate / (layerHeight * printSpeed)
      : null;
  const effectiveLayerWidth =
    layerWidthMode === 'auto' && derivedLayerWidth !== null
      ? derivedLayerWidth
      : layerWidth;
  const layerShift = Math.tan((overhangAngle * Math.PI) / 180) * layerHeight;
  const overlapWidth = Math.max(0, effectiveLayerWidth - layerShift);
  const overlapPercent = effectiveLayerWidth > 0 ? (overlapWidth / effectiveLayerWidth) * 100 : 0;
  const targetArea =
    printSpeed > 0 ? flowRate / printSpeed : 0;
  const shapeArea = estimateFilamentArea(
    effectiveLayerWidth,
    layerHeight,
    nozzleSize
  );
  const areaDelta =
    targetArea > 0 ? ((shapeArea - targetArea) / targetArea) * 100 : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const safeLayerHeight = clampNumber(layerHeight, 0.01, 5);
    const safeLayerWidth = clampNumber(effectiveLayerWidth, 0.05, 5);
    const safeNozzleSize = clampNumber(nozzleSize, 0.05, 5);
    const safeAngle = clampNumber(overhangAngle, 0, 89);

    const angleRad = (safeAngle * Math.PI) / 180;
    const layerShift = Math.tan(angleRad) * safeLayerHeight;
    const totalWidth = safeLayerWidth + layerShift * (LAYER_COUNT - 1);
    const totalHeight = safeLayerHeight * LAYER_COUNT;
    const maxWidth = Math.max(totalWidth, safeNozzleSize);
    const maxHeight = Math.max(totalHeight, safeNozzleSize);
    const scale = Math.min(
      (CANVAS_WIDTH - CANVAS_PADDING * 2) / maxWidth,
      (CANVAS_HEIGHT - CANVAS_PADDING * 2) / maxHeight
    );

    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const rx = (safeLayerWidth / 2) * scale;
    const ry = (safeLayerHeight / 2) * scale;
    const nozzleRadius = (safeNozzleSize / 2) * scale;
    const totalWidthPx = totalWidth * scale;
    const totalHeightPx = totalHeight * scale;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const leftEdge = cx - totalWidthPx / 2;
    const baseCenterY = cy + totalHeightPx / 2 - ry;

    ctx.strokeStyle = '#b0c0d6';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    for (let i = 0; i <= LAYER_COUNT; i += 1) {
      const boundaryY = baseCenterY + ry - i * safeLayerHeight * scale;
      ctx.beginPath();
      ctx.moveTo(leftEdge - rx * 0.4, boundaryY);
      ctx.lineTo(leftEdge + totalWidthPx + rx * 0.4, boundaryY);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const drawLayer = (
      centerX: number,
      centerY: number,
      radiusX: number,
      radiusY: number,
      flatHalf: number
    ) => {
      const leftFlatX = centerX - flatHalf;
      const rightFlatX = centerX + flatHalf;
      const topY = centerY - radiusY;
      const bottomY = centerY + radiusY;
      const leftX = centerX - radiusX;
      const rightX = centerX + radiusX;

      ctx.beginPath();
      ctx.moveTo(leftFlatX, topY);
      ctx.lineTo(rightFlatX, topY);
      ctx.quadraticCurveTo(rightX, topY, rightX, centerY);
      ctx.quadraticCurveTo(rightX, bottomY, rightFlatX, bottomY);
      ctx.lineTo(leftFlatX, bottomY);
      ctx.quadraticCurveTo(leftX, bottomY, leftX, centerY);
      ctx.quadraticCurveTo(leftX, topY, leftFlatX, topY);
      ctx.closePath();
    };

    const heightRatio = safeLayerHeight / safeNozzleSize;
    const flatFactor = clampNumber(1.35 - heightRatio, 0.3, 1);
    const flatHalf = Math.min(nozzleRadius, rx) * flatFactor;

    for (let i = 0; i < LAYER_COUNT; i += 1) {
      const centerX = leftEdge + rx + i * layerShift * scale;
      const centerY = baseCenterY - i * safeLayerHeight * scale;
      const alpha = 0.2 + (i / (LAYER_COUNT - 1)) * 0.25;

      drawLayer(centerX, centerY, rx, ry, flatHalf);
      ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx.fill();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const topCenterX = leftEdge + rx + (LAYER_COUNT - 1) * layerShift * scale;
    const topCenterY = baseCenterY - (LAYER_COUNT - 1) * safeLayerHeight * scale;

    const nozzleLineY = topCenterY - ry - 10;
    ctx.beginPath();
    ctx.moveTo(topCenterX - nozzleRadius, nozzleLineY);
    ctx.lineTo(topCenterX + nozzleRadius, nozzleLineY);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const bottomCenterX = leftEdge + rx;
    const bottomCenterY = baseCenterY;
    const supportOffsetX = rx * 0;
    const startX = bottomCenterX + rx + supportOffsetX;
    const startY = bottomCenterY + ry;
    const endY = topCenterY - ry;
    const supportHeight = startY - endY;
    const endX = startX + Math.tan(angleRad) * supportHeight;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [layerHeight, effectiveLayerWidth, nozzleSize, overhangAngle]);

  return (
    <Box>
      <Heading size="md" mb={4}>Filament Overhang</Heading>
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={8}>
        <VStack align="stretch" gap={4}>
          <Box>
            <Text fontWeight="semibold">Nozzle Size (mm)</Text>
            <HStack gap={3} align="center" wrap="wrap">
              <Input
                type="number"
                step="0.01"
                min="0.05"
                value={nozzleSize}
                onChange={makeNumberChange(setNozzleSize)}
                maxW="140px"
              />
              {[0.2, 0.4, 0.6, 0.8].map((size) => (
                <Button
                  key={size}
                  size="sm"
                  variant={nozzleSize === size ? "solid" : "outline"}
                  colorScheme="blue"
                  onClick={() => setNozzleSize(size)}
                >
                  {size} mm
                </Button>
              ))}
            </HStack>
          </Box>
          <Box>
            <Text fontWeight="semibold">Layer Height (mm)</Text>
            <HStack gap={3} align="center" wrap="wrap">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={layerHeight}
                onChange={makeNumberChange(setLayerHeight)}
                maxW="140px"
              />
              {[0.25, 0.5, 0.6, 0.8].map((ratio) => (
                <Button
                  key={ratio}
                  size="sm"
                  variant={Math.abs(layerHeight - nozzleSize * ratio) < 0.001 ? "solid" : "outline"}
                  colorScheme="blue"
                  onClick={() => setLayerHeight(Number((nozzleSize * ratio).toFixed(3)))}
                >
                  {(ratio * 100).toFixed(0)}%
                </Button>
              ))}
            </HStack>
          </Box>
          <Box>
            <Text fontWeight="semibold">Layer Width (mm)</Text>
            <HStack gap={3} align="center" wrap="wrap">
              <Input
                type="number"
                step="0.01"
                min="0.05"
                value={
                  layerWidthMode === 'auto' && derivedLayerWidth !== null
                    ? Number(derivedLayerWidth.toFixed(3))
                    : layerWidth
                }
                onChange={(event) => {
                  setLayerWidthMode('manual');
                  makeNumberChange(setLayerWidth)(event);
                }}
                maxW="140px"
              />
              <Button
                size="sm"
                variant={layerWidthMode === 'auto' ? 'solid' : 'outline'}
                colorScheme="blue"
                onClick={() => {
                  setLayerWidthMode((mode) => (mode === 'auto' ? 'manual' : 'auto'));
                }}
              >
                Auto
              </Button>
            </HStack>
            <Text fontSize="sm" color="gray.600" mt={1}>
              Derived width: {derivedLayerWidth ? derivedLayerWidth.toFixed(3) : '--'} mm
            </Text>
          </Box>
          <Box>
            <Text fontWeight="semibold">Overhang Angle (deg)</Text>
            <Input
              type="number"
              step="1"
              min="0"
              max="89"
              value={overhangAngle}
              onChange={makeNumberChange(setOverhangAngle)}
            />
            <Text fontSize="sm" color="gray.600" mt={1}>
              0 = vertical, 90 = horizontal
            </Text>
            <Text fontSize="sm" color="gray.600">
              Overlap: {overlapPercent.toFixed(1)}% ({overlapWidth.toFixed(3)} mm)
            </Text>
          </Box>
          <Box>
            <Text fontWeight="semibold">Extruder Temperature (°C)</Text>
            <Input
              type="number"
              step="1"
              min="0"
              value={extruderTemp}
              onChange={makeNumberChange(setExtruderTemp)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Cooling (%)</Text>
            <Input
              type="number"
              step="1"
              min="0"
              max="100"
              value={cooling}
              onChange={makeNumberChange(setCooling)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Filament Diameter (mm)</Text>
            <Input
              type="number"
              step="0.01"
              min="0.1"
              value={filamentDiameter}
              onChange={makeNumberChange(setFilamentDiameter)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Flow Rate (mm³/s)</Text>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={flowRate}
              onChange={makeNumberChange(setFlowRate)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Material Density (g/cm³)</Text>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={materialDensity}
              onChange={makeNumberChange(setMaterialDensity)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Print Speed (mm/s)</Text>
            <Input
              type="number"
              step="1"
              min="0"
              value={printSpeed}
              onChange={makeNumberChange(setPrintSpeed)}
            />
          </Box>
          <Box>
            <Text fontSize="sm" color="gray.600">
              Target area: {targetArea > 0 ? targetArea.toFixed(3) : '--'} mm²
            </Text>
            <Text fontSize="sm" color="gray.600">
              Shape area: {shapeArea > 0 ? shapeArea.toFixed(3) : '--'} mm²
            </Text>
            <Text fontSize="sm" color="gray.600">
              Delta: {targetArea > 0 ? areaDelta.toFixed(1) : '--'}%
            </Text>
          </Box>
          <Box>
            <Text fontSize="sm" color="gray.600">
              Cross section assumes constant speed extrusion.
            </Text>
          </Box>
        </VStack>
        <VStack align="stretch" gap={4}>
          <Box
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="md"
            p={4}
            display="flex"
            justifyContent="center"
            alignItems="center"
            bg="white"
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
            />
          </Box>
        </VStack>
      </Grid>
    </Box>
  );
};

const GasketBuilder: React.FC = () => {
  const gasketCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gasketHeight, setGasketHeight] = useState(2);
  const [gasketWidth, setGasketWidth] = useState(2);
  const [gasketGroovePosition, setGasketGroovePosition] = useState<'inner' | 'outer'>('inner');
  const [gasketGrooveDepth, setGasketGrooveDepth] = useState(1.5);
  const [innerDiameter, setInnerDiameter] = useState(40);
  const [outerDiameter, setOuterDiameter] = useState(60);
  const gasketGap = Math.max(0, (outerDiameter - innerDiameter) / 2);
  const gasketCompression =
    outerDiameter > innerDiameter
      ? ((gasketWidth / (outerDiameter - innerDiameter)) * 100 - 1)
      : 0;
  const gasketExtension =
    gasketWidth > 0 && gasketGap > 0
      ? Math.max(0, ((gasketGap - gasketWidth) / gasketWidth) * 100)
      : 0;

  useEffect(() => {
    const canvas = gasketCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const safeInner = Math.max(1, innerDiameter);
    const safeOuter = Math.max(safeInner + 1, outerDiameter);
    const safeWidth = Math.max(0.1, gasketWidth);

    const canvasWidth = CANVAS_WIDTH;
    const canvasHeight = 260;
    const padding = 40;
    const outerRadius = (safeOuter / 2);
    const scale = (Math.min(canvasWidth, canvasHeight) - padding * 2) / (outerRadius * 2);
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const innerRadius = (safeInner / 2) * scale;
    const outerRadiusPx = outerRadius * scale;
    const gasketWidthPx = safeWidth * scale;
    const grooveDepthPx = Math.max(0, gasketGrooveDepth) * scale;
    let gasketInnerRadius = innerRadius;
    let gasketOuterRadius = outerRadiusPx;

    if (gasketGroovePosition === 'inner') {
      gasketInnerRadius = Math.max(0, innerRadius - grooveDepthPx);
      gasketOuterRadius = Math.min(
        outerRadiusPx,
        gasketInnerRadius + gasketWidthPx
      );
    } else {
      gasketInnerRadius = Math.max(innerRadius, outerRadiusPx + grooveDepthPx);
      gasketOuterRadius = gasketInnerRadius + gasketWidthPx;
    }

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadiusPx, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, gasketOuterRadius, 0, Math.PI * 2);
    ctx.arc(cx, cy, gasketInnerRadius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, gasketInnerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, gasketOuterRadius, 0, Math.PI * 2);
    ctx.stroke();
  }, [
    gasketWidth,
    gasketGroovePosition,
    gasketGrooveDepth,
    innerDiameter,
    outerDiameter,
  ]);

  return (
    <Box>
      <Heading size="md" mb={4}>Gasket Builder</Heading>
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={8}>
        <VStack align="stretch" gap={4}>
          <Box>
            <Text fontWeight="semibold">Gasket Height (mm)</Text>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              value={gasketHeight}
              onChange={makeNumberChange(setGasketHeight)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Gasket Width (mm)</Text>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              value={gasketWidth}
              onChange={makeNumberChange(setGasketWidth)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Gasket Groove Position</Text>
            <HStack gap={4}>
              <label>
                <input
                  type="radio"
                  name="gasket-groove-position"
                  value="inner"
                  checked={gasketGroovePosition === 'inner'}
                  onChange={() => setGasketGroovePosition('inner')}
                />
                <Text as="span" ml={2}>Inner</Text>
              </label>
              <label>
                <input
                  type="radio"
                  name="gasket-groove-position"
                  value="outer"
                  checked={gasketGroovePosition === 'outer'}
                  onChange={() => setGasketGroovePosition('outer')}
                />
                <Text as="span" ml={2}>Outer</Text>
              </label>
            </HStack>
          </Box>
          <Box>
            <Text fontWeight="semibold">Gasket Groove Depth (mm)</Text>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={gasketGrooveDepth}
              onChange={makeNumberChange(setGasketGrooveDepth)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Inner Diameter (mm)</Text>
            <Input
              type="number"
              step="0.5"
              min="1"
              value={innerDiameter}
              onChange={makeNumberChange(setInnerDiameter)}
            />
          </Box>
          <Box>
            <Text fontWeight="semibold">Outer Diameter (mm)</Text>
            <Input
              type="number"
              step="0.5"
              min="1"
              value={outerDiameter}
              onChange={makeNumberChange(setOuterDiameter)}
            />
          </Box>
          <Box>
            <Text fontSize="sm" color="gray.600">
              Compression: {gasketCompression.toFixed(1)}%
            </Text>
            <Text fontSize="sm" color="gray.600">
              Extension: {gasketExtension.toFixed(1)}%
            </Text>
          </Box>
        </VStack>
        <Box
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          p={4}
          display="flex"
          justifyContent="center"
          alignItems="center"
          bg="white"
          flexDirection="column"
          gap={2}
        >
          <Text fontWeight="semibold">Gasket Top View</Text>
          <canvas
            ref={gasketCanvasRef}
            width={CANVAS_WIDTH}
            height={260}
          />
        </Box>
      </Grid>
    </Box>
  );
};

const FilamentMath: React.FC = () => {
  return (
    <Box maxW="6xl" mx="auto" p={6}>
      <Heading size="lg" mb={6}>Filament Math</Heading>
      <VStack align="stretch" gap={10}>
        <FilamentOverhang />
        <GasketBuilder />
      </VStack>
    </Box>
  );
};

export default FilamentMath;
