import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Eye, Layers, Palette, RotateCw, Gauge, ChevronDown, ChevronUp, Maximize2, ShieldCheck, Wrench } from 'lucide-react';
import { OBDData } from '../types';
import { cn } from '../lib/utils';

interface VehicleScene3DProps {
  obdData?: OBDData;
  speed?: number;
  rpm?: number;
  vehicleModel?: string;
  className?: string;
}

// Pre-allocated scratch objects to eliminate GC in the render loop
const _vec3 = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3(3.8, 1.8, 4.2);
const _targetLookAt = new THREE.Vector3(0, 0.6, 0);

// Paint finish options with accurate physical PBR properties
const PAINT_PRESETS = [
  { id: 'titanium', name: 'Cyber Titanium', color: 0x3d434d, metalness: 0.95, roughness: 0.22, clearcoat: 0.9 },
  { id: 'crimson', name: 'Apex Crimson', color: 0xba1325, metalness: 0.88, roughness: 0.18, clearcoat: 1.0 },
  { id: 'obsidian', name: 'Obsidian Black', color: 0x111317, metalness: 0.92, roughness: 0.15, clearcoat: 1.0 },
  { id: 'cyan', name: 'Electric Cyan', color: 0x067a99, metalness: 0.90, roughness: 0.20, clearcoat: 0.95 },
  { id: 'pearl', name: 'Arctic Pearl', color: 0xedeef2, metalness: 0.75, roughness: 0.25, clearcoat: 0.85 },
];

export const VehicleScene3D: React.FC<VehicleScene3DProps> = ({
  obdData,
  speed = 0,
  rpm = 0,
  vehicleModel = '2023 Toyota Camry',
  className
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [paintPreset, setPaintPreset] = useState(PAINT_PRESETS[0]);
  const [explodedAmount, setExplodedAmount] = useState(0);
  const [activeCameraView, setActiveCameraView] = useState<'orbit' | 'threeQuarter' | 'side' | 'engine' | 'top'>('threeQuarter');
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const [diagnosticMode, setDiagnosticMode] = useState(true);
  const [syncTelemetry, setSyncTelemetry] = useState(true);

  // Mutable refs for values accessed inside the Three.js animation loop
  const explodedRef = useRef(0);
  const speedRef = useRef(speed);
  const rpmRef = useRef(rpm);
  const paintColorRef = useRef(new THREE.Color(paintPreset.color));
  const diagnosticModeRef = useRef(diagnosticMode);
  const syncTelemetryRef = useRef(syncTelemetry);
  const carPaintMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const wheelGroupsRef = useRef<THREE.Group[]>([]);
  const chassisGroupRef = useRef<THREE.Group | null>(null);
  const bodyGroupRef = useRef<THREE.Group | null>(null);
  const roofGroupRef = useRef<THREE.Group | null>(null);
  const engineGroupRef = useRef<THREE.Group | null>(null);
  const wheelsParentGroupRef = useRef<THREE.Group | null>(null);
  const engineGlowMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const brakeGlowMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Sync refs when state changes
  useEffect(() => {
    explodedRef.current = explodedAmount;
  }, [explodedAmount]);

  useEffect(() => {
    speedRef.current = speed;
    rpmRef.current = rpm;
  }, [speed, rpm]);

  useEffect(() => {
    paintColorRef.current.setHex(paintPreset.color);
    if (carPaintMatRef.current) {
      carPaintMatRef.current.color.setHex(paintPreset.color);
      carPaintMatRef.current.metalness = paintPreset.metalness;
      carPaintMatRef.current.roughness = paintPreset.roughness;
      carPaintMatRef.current.clearcoat = paintPreset.clearcoat;
    }
  }, [paintPreset]);

  useEffect(() => {
    diagnosticModeRef.current = diagnosticMode;
  }, [diagnosticMode]);

  useEffect(() => {
    syncTelemetryRef.current = syncTelemetry;
  }, [syncTelemetry]);

  // Camera preset handler
  const setCameraPreset = useCallback((preset: 'orbit' | 'threeQuarter' | 'side' | 'engine' | 'top') => {
    setActiveCameraView(preset);
    switch (preset) {
      case 'threeQuarter':
        _targetCamPos.set(3.6, 1.8, 3.8);
        _targetLookAt.set(0, 0.6, 0);
        break;
      case 'side':
        _targetCamPos.set(0, 1.2, 5.0);
        _targetLookAt.set(0, 0.6, 0);
        break;
      case 'engine':
        _targetCamPos.set(1.4, 1.8, 1.5);
        _targetLookAt.set(1.0, 0.6, 0);
        break;
      case 'top':
        _targetCamPos.set(0.01, 5.5, 0);
        _targetLookAt.set(0, 0, 0);
        break;
      case 'orbit':
      default:
        _targetCamPos.set(3.8, 2.0, 4.2);
        _targetLookAt.set(0, 0.6, 0);
        break;
    }
  }, []);

  // Listen for DriveLogic hands-free voice commands for 3D Digital Twin Studio
  useEffect(() => {
    const onVoiceCommand = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail || detail.name !== 'control3DStudio') return;
      const args = detail.args || {};
      if (args.cameraPreset) {
        const p = String(args.cameraPreset).toLowerCase();
        if (p.includes('engine') || p.includes('front')) setCameraPreset('engine');
        else if (p.includes('side') || p.includes('wheel')) setCameraPreset('side');
        else if (p.includes('top') || p.includes('overhead')) setCameraPreset('top');
        else if (p.includes('three') || p.includes('quarter')) setCameraPreset('threeQuarter');
        else setCameraPreset('orbit');
      }
      if (args.exploded !== undefined) {
        setExplodedAmount(args.exploded ? 1 : 0);
      }
      if (args.xray !== undefined) {
        setDiagnosticMode(Boolean(args.xray));
      }
      if (args.inspectSubsystem) {
        setDiagnosticMode(true);
        const sub = String(args.inspectSubsystem).toLowerCase();
        if (sub.includes('engine') || sub.includes('powertrain') || sub.includes('battery')) {
          setCameraPreset('engine');
          setExplodedAmount(0.8);
        } else if (sub.includes('suspension') || sub.includes('brake') || sub.includes('wheel')) {
          setCameraPreset('side');
          setExplodedAmount(0.6);
        } else if (sub.includes('exhaust') || sub.includes('chassis')) {
          setCameraPreset('top');
          setExplodedAmount(1);
        }
      }
    };
    window.addEventListener('drivelogic:command', onVoiceCommand);
    return () => window.removeEventListener('drivelogic:command', onVoiceCommand);
  }, [setCameraPreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL from renderer string (per Three.js skill guidelines)
    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d14);
    scene.fog = new THREE.FogExp2(0x0a0d14, 0.035);

    // Camera setup
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || 550;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.copy(_targetCamPos);

    // WebGLRenderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // OrbitControls with exponential damping
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent camera clipping below floor
    controls.minDistance = 2.2;
    controls.maxDistance = 12.0;
    controls.target.copy(_targetLookAt);

    // Studio Environment map using PMREMGenerator & RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // Balanced 3-Point Studio Lighting Rig
    const warmKeyLight = new THREE.DirectionalLight(0xfff3e6, 2.4);
    warmKeyLight.position.set(5, 7, 4);
    if (!isSoftwareGl) {
      warmKeyLight.castShadow = true;
      warmKeyLight.shadow.mapSize.width = 1024;
      warmKeyLight.shadow.mapSize.height = 1024;
      warmKeyLight.shadow.camera.near = 0.5;
      warmKeyLight.shadow.camera.far = 25;
      const d = 4.5;
      warmKeyLight.shadow.camera.left = -d;
      warmKeyLight.shadow.camera.right = d;
      warmKeyLight.shadow.camera.top = d;
      warmKeyLight.shadow.camera.bottom = -d;
      warmKeyLight.shadow.bias = -0.0004;
      warmKeyLight.shadow.normalBias = 0.02;
    }
    scene.add(warmKeyLight);

    const coolFillLight = new THREE.DirectionalLight(0x8ec7f5, 1.0);
    coolFillLight.position.set(-5, 4, -3);
    scene.add(coolFillLight);

    const rimLight = new THREE.DirectionalLight(0x00f0ff, 1.2);
    rimLight.position.set(0, 4, -6);
    scene.add(rimLight);

    const hemiLight = new THREE.HemisphereLight(0x1a283e, 0x07090d, 0.8);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);

    // Procedural Studio Grid Floor Texture
    const createFloorTexture = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, size, size);

      // Radial vignette falloff
      const radial = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      radial.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      radial.addColorStop(0.6, 'rgba(255, 255, 255, 0.02)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, size, size);

      // Fine grid lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.lineWidth = 1;
      const step = 32;
      for (let i = 0; i <= size; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 4);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const floorGeo = new THREE.PlaneGeometry(24, 24);
    const floorMat = new THREE.MeshStandardMaterial({
      map: createFloorTexture(),
      roughness: 0.65,
      metalness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    // Soft Radial Contact Shadow directly beneath vehicle (prevents floating look)
    const createContactShadowTexture = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
      gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const shadowPlaneGeo = new THREE.PlaneGeometry(4.8, 2.4);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.005; // Slightly above floor to avoid z-fighting
    scene.add(contactShadow);

    // =========================================================================
    // COMPOSITE PROCEDURAL VEHICLE MODEL (Group of 10+ distinct physical parts)
    // =========================================================================
    const vehicleRoot = new THREE.Group();
    vehicleRoot.position.set(0, 0, 0); // Root grounded at bottom-center

    // Materials
    const carPaintMat = new THREE.MeshPhysicalMaterial({
      color: paintPreset.color,
      metalness: paintPreset.metalness,
      roughness: paintPreset.roughness,
      clearcoat: paintPreset.clearcoat,
      clearcoatRoughness: 0.1,
      reflectivity: 0.9,
    });
    carPaintMatRef.current = carPaintMat;

    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x15171c,
      roughness: 0.45,
      metalness: 0.7,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf5f7fb,
      metalness: 0.98,
      roughness: 0.08,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x08131d,
      metalness: 0.1,
      roughness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.85,
      transparent: true,
      opacity: isSoftwareGl ? 0.4 : 0.92,
      ior: 1.52,
    });

    const tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1e,
      roughness: 0.85,
      metalness: 0.08,
    });

    const wheelAlloyMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde8,
      metalness: 0.92,
      roughness: 0.22,
    });

    const brakeCalipersMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Racing Red Caliper
      metalness: 0.6,
      roughness: 0.3,
    });
    brakeGlowMatRef.current = brakeCalipersMat;

    const brakeRotorMat = new THREE.MeshStandardMaterial({
      color: 0x99a2b0,
      metalness: 0.95,
      roughness: 0.35,
    });

    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xecf8ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    });

    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xef233c,
      emissive: 0xff002b,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    });

    const engineGlowMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 0.7,
      roughness: 0.3,
      metalness: 0.8,
    });
    engineGlowMatRef.current = engineGlowMat;

    // 1. Chassis Group (Base frame, floor pan, mechanical axles)
    const chassisGroup = new THREE.Group();
    chassisGroupRef.current = chassisGroup;

    const floorPan = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.6), darkTrimMat);
    floorPan.position.set(0, 0.32, 0);
    floorPan.castShadow = !isSoftwareGl;
    floorPan.receiveShadow = !isSoftwareGl;
    chassisGroup.add(floorPan);

    // Front & rear subframes
    const subframeFront = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 1.4), darkTrimMat);
    subframeFront.position.set(1.1, 0.35, 0);
    chassisGroup.add(subframeFront);

    const subframeRear = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 1.4), darkTrimMat);
    subframeRear.position.set(-1.1, 0.35, 0);
    chassisGroup.add(subframeRear);

    vehicleRoot.add(chassisGroup);

    // 2. Engine & Drivetrain Group (Separates in Exploded View)
    const engineGroup = new THREE.Group();
    engineGroupRef.current = engineGroup;

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.7), engineGlowMat);
    engineBlock.position.set(1.1, 0.58, 0);
    engineBlock.castShadow = !isSoftwareGl;
    engineGroup.add(engineBlock);

    // Intake manifold runners (using cylinders)
    for (let i = -0.22; i <= 0.22; i += 0.15) {
      const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 12), chromeMat);
      runner.rotation.z = Math.PI / 4;
      runner.position.set(1.1 + i, 0.82, 0.15);
      engineGroup.add(runner);
    }

    // Battery & ECU pack
    const batteryPack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.4), darkTrimMat);
    batteryPack.position.set(0.65, 0.52, -0.45);
    engineGroup.add(batteryPack);

    // Exhaust headers & dual tips
    const exhaustTipLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.35, 16), chromeMat);
    exhaustTipLeft.rotation.z = Math.PI / 2;
    exhaustTipLeft.position.set(-1.88, 0.32, 0.45);
    engineGroup.add(exhaustTipLeft);

    const exhaustTipRight = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.35, 16), chromeMat);
    exhaustTipRight.rotation.z = Math.PI / 2;
    exhaustTipRight.position.set(-1.88, 0.32, -0.45);
    engineGroup.add(exhaustTipRight);

    vehicleRoot.add(engineGroup);

    // 3. Body Shell Group (Chassis panels, hood, doors, bumpers, aerodynamic contours)
    const bodyGroup = new THREE.Group();
    bodyGroupRef.current = bodyGroup;

    // Main lower fuselage
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.48, 1.75), carPaintMat);
    mainBody.position.set(0, 0.58, 0);
    mainBody.castShadow = !isSoftwareGl;
    mainBody.receiveShadow = !isSoftwareGl;
    bodyGroup.add(mainBody);

    // Front aerodynamic hood taper
    const hoodMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 1.68), carPaintMat);
    hoodMesh.position.set(1.25, 0.72, 0);
    hoodMesh.rotation.z = -0.09;
    hoodMesh.castShadow = !isSoftwareGl;
    bodyGroup.add(hoodMesh);

    // Front bumper & carbon splitter
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 1.8), darkTrimMat);
    frontSplitter.position.set(1.88, 0.28, 0);
    bodyGroup.add(frontSplitter);

    // Front honeycomb grille insert
    const grilleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 1.1), darkTrimMat);
    grilleMesh.position.set(1.85, 0.48, 0);
    bodyGroup.add(grilleMesh);

    // Rear bumper & aerodynamic diffuser
    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 1.76), darkTrimMat);
    rearDiffuser.position.set(-1.86, 0.32, 0);
    bodyGroup.add(rearDiffuser);

    // Rear spoiler wing (accent detail)
    const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 1.6), darkTrimMat);
    spoilerWing.position.set(-1.75, 0.98, 0);
    bodyGroup.add(spoilerWing);

    const spoilerStalkL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), darkTrimMat);
    spoilerStalkL.position.set(-1.72, 0.88, 0.45);
    bodyGroup.add(spoilerStalkL);

    const spoilerStalkR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), darkTrimMat);
    spoilerStalkR.position.set(-1.72, 0.88, -0.45);
    bodyGroup.add(spoilerStalkR);

    // Headlight clusters (Front left and right)
    const headlampL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.35), headlightMat);
    headlampL.position.set(1.82, 0.65, 0.62);
    bodyGroup.add(headlampL);

    const headlampR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.35), headlightMat);
    headlampR.position.set(1.82, 0.65, -0.62);
    bodyGroup.add(headlampR);

    // Rear taillight horizontal bar
    const taillightBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.62), taillightMat);
    taillightBar.position.set(-1.86, 0.72, 0);
    bodyGroup.add(taillightBar);

    // Side mirrors (Left & Right)
    const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.15), carPaintMat);
    mirrorL.position.set(0.65, 0.95, 0.98);
    bodyGroup.add(mirrorL);

    const mirrorFaceL = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08), chromeMat);
    mirrorFaceL.rotation.y = -Math.PI / 2;
    mirrorFaceL.position.set(0.65, 0.95, 0.91);
    bodyGroup.add(mirrorFaceL);

    const mirrorR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.15), carPaintMat);
    mirrorR.position.set(0.65, 0.95, -0.98);
    bodyGroup.add(mirrorR);

    const mirrorFaceR = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08), chromeMat);
    mirrorFaceR.rotation.y = Math.PI / 2;
    mirrorFaceR.position.set(0.65, 0.95, -0.91);
    bodyGroup.add(mirrorFaceR);

    vehicleRoot.add(bodyGroup);

    // 4. Greenhouse / Cabin & Glass Canopy Group
    const roofGroup = new THREE.Group();
    roofGroupRef.current = roofGroup;

    // Cabin roof panel
    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.4), carPaintMat);
    roofPanel.position.set(-0.15, 1.34, 0);
    roofPanel.castShadow = !isSoftwareGl;
    roofGroup.add(roofPanel);

    // Windshield (Front glass)
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 1.35), glassMat);
    windshield.position.set(0.78, 1.08, 0);
    windshield.rotation.z = 0.58;
    roofGroup.add(windshield);

    // Rear glass window
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 1.35), glassMat);
    rearGlass.position.set(-1.08, 1.12, 0);
    rearGlass.rotation.z = -0.52;
    roofGroup.add(rearGlass);

    // Side windows (Left and Right)
    const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.03), glassMat);
    sideGlassL.position.set(-0.15, 1.12, 0.69);
    roofGroup.add(sideGlassL);

    const sideGlassR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.03), glassMat);
    sideGlassR.position.set(-0.15, 1.12, -0.69);
    roofGroup.add(sideGlassR);

    // Interior steering wheel accent
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 12, 24), darkTrimMat);
    steeringWheel.rotation.y = Math.PI / 2;
    steeringWheel.rotation.x = -0.3;
    steeringWheel.position.set(0.42, 0.92, 0.32);
    roofGroup.add(steeringWheel);

    vehicleRoot.add(roofGroup);

    // 5. Wheels Group (4 composite wheel assemblies with tire + rim + caliper + rotor)
    const wheelsParent = new THREE.Group();
    wheelsParentGroupRef.current = wheelsParent;

    const wheelPositions = [
      { x: 1.15, y: 0.35, z: 0.88, isFront: true, isLeft: true },   // Front-Left
      { x: 1.15, y: 0.35, z: -0.88, isFront: true, isLeft: false }, // Front-Right
      { x: -1.15, y: 0.35, z: 0.88, isFront: false, isLeft: true },  // Rear-Left
      { x: -1.15, y: 0.35, z: -0.88, isFront: false, isLeft: false } // Rear-Right
    ];

    const wheelMeshList: THREE.Group[] = [];

    wheelPositions.forEach((pos) => {
      const wheelAssembly = new THREE.Group();
      wheelAssembly.position.set(pos.x, pos.y, pos.z);

      // Rubber Tire Outer Ring
      const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 28);
      tireGeo.rotateX(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, tireRubberMat);
      tire.castShadow = !isSoftwareGl;
      wheelAssembly.add(tire);

      // Metallic Alloy Rim Center
      const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.28, 20);
      rimGeo.rotateX(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, wheelAlloyMat);
      wheelAssembly.add(rim);

      // 5-Spoke Pattern
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.03), chromeMat);
        spoke.rotation.z = (s * Math.PI * 2) / 5;
        spoke.position.z = pos.isLeft ? 0.12 : -0.12;
        wheelAssembly.add(spoke);
      }

      // Disc Brake Rotor
      const rotorGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.04, 24);
      rotorGeo.rotateX(Math.PI / 2);
      const rotor = new THREE.Mesh(rotorGeo, brakeRotorMat);
      rotor.position.z = pos.isLeft ? -0.06 : 0.06;
      wheelAssembly.add(rotor);

      // Red Racing Brake Caliper
      const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.08), brakeCalipersMat);
      caliper.position.set(0, 0.14, pos.isLeft ? -0.06 : 0.06);
      wheelAssembly.add(caliper);

      wheelsParent.add(wheelAssembly);
      wheelMeshList.push(wheelAssembly);
    });

    wheelGroupsRef.current = wheelMeshList;
    vehicleRoot.add(wheelsParent);

    scene.add(vehicleRoot);

    // Resize Observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight || 550;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation & Pacing Loop
    let animFrameId = 0;
    let clock = new THREE.Clock();

    function renderLoop() {
      animFrameId = requestAnimationFrame(renderLoop);

      const delta = Math.min(clock.getDelta(), 0.1);
      const time = clock.getElapsedTime();

      // Smooth Camera Transitions via exponential damping
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, 3.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, 3.5, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, 3.5, delta);

      controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLookAt.x, 4.0, delta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLookAt.y, 4.0, delta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLookAt.z, 4.0, delta);
      controls.update();

      // Smooth Exploded View Layer Interpolation
      const curExploded = explodedRef.current;
      const targetBodyY = 0 + curExploded * 0.45;
      const targetRoofY = 0 + curExploded * 0.95;
      const targetEngineY = 0 + curExploded * 0.35;
      const targetEngineX = 0 + curExploded * 0.40;

      if (bodyGroupRef.current) {
        bodyGroupRef.current.position.y = THREE.MathUtils.damp(bodyGroupRef.current.position.y, targetBodyY, 5.0, delta);
      }
      if (roofGroupRef.current) {
        roofGroupRef.current.position.y = THREE.MathUtils.damp(roofGroupRef.current.position.y, targetRoofY, 5.0, delta);
      }
      if (engineGroupRef.current) {
        engineGroupRef.current.position.y = THREE.MathUtils.damp(engineGroupRef.current.position.y, targetEngineY, 5.0, delta);
        engineGroupRef.current.position.x = THREE.MathUtils.damp(engineGroupRef.current.position.x, targetEngineX, 5.0, delta);

        // Subtle engine RPM harmonic vibration when engine is on
        const activeRpm = rpmRef.current;
        if (syncTelemetryRef.current && activeRpm > 500) {
          const vibIntensity = Math.min(activeRpm / 6000, 1.0) * 0.006;
          engineGroupRef.current.position.y += (Math.sin(time * 45) * vibIntensity);
          engineGroupRef.current.position.z = (Math.cos(time * 35) * vibIntensity);
        }
      }

      // Wheel rotation based on live telemetry speed
      const curSpeedMph = speedRef.current;
      const rotSpeed = syncTelemetryRef.current && curSpeedMph > 0 ? (curSpeedMph * 0.44704) / 0.35 : 0;
      if (rotSpeed > 0) {
        wheelGroupsRef.current.forEach((wheel) => {
          wheel.rotation.z -= rotSpeed * delta;
        });
      }

      // Exploded lateral displacement for wheels
      if (wheelGroupsRef.current.length === 4) {
        const wheelLateralOffset = curExploded * 0.55;
        // FL
        wheelGroupsRef.current[0].position.z = THREE.MathUtils.damp(wheelGroupsRef.current[0].position.z, 0.88 + wheelLateralOffset, 5.0, delta);
        // FR
        wheelGroupsRef.current[1].position.z = THREE.MathUtils.damp(wheelGroupsRef.current[1].position.z, -0.88 - wheelLateralOffset, 5.0, delta);
        // RL
        wheelGroupsRef.current[2].position.z = THREE.MathUtils.damp(wheelGroupsRef.current[2].position.z, 0.88 + wheelLateralOffset, 5.0, delta);
        // RR
        wheelGroupsRef.current[3].position.z = THREE.MathUtils.damp(wheelGroupsRef.current[3].position.z, -0.88 - wheelLateralOffset, 5.0, delta);
      }

      // Diagnostic glow pulse when diagnostic mode active
      if (diagnosticModeRef.current && engineGlowMatRef.current) {
        const dtcCount = obdData?.dtcs?.length || 0;
        if (dtcCount > 0) {
          // Warning Amber/Red pulse
          engineGlowMatRef.current.color.setHex(0xf59e0b);
          engineGlowMatRef.current.emissive.setHex(0xd97706);
          engineGlowMatRef.current.emissiveIntensity = 0.8 + Math.sin(time * 3.5) * 0.5;
        } else {
          // Nominal Emerald glow
          engineGlowMatRef.current.color.setHex(0x22c55e);
          engineGlowMatRef.current.emissive.setHex(0x16a34a);
          engineGlowMatRef.current.emissiveIntensity = 0.55 + Math.sin(time * 2.0) * 0.25;
        }
      }

      renderer.render(scene, camera);
    }

    renderLoop();

    // Cleanup resources on unmount
    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      controls.dispose();

      // Dispose all scene meshes, geometries, and materials
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });

      floorMat.map?.dispose();
      shadowPlaneMat.map?.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className={cn("relative w-full h-[620px] rounded-3xl overflow-hidden bg-[#0a0d14] border border-white/10 shadow-2xl flex flex-col select-none", className)}>
      {/* Three.js Canvas Mount Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Spec & Telemetry HUD Overlay */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 bg-[#111622]/90 border border-white/10 px-3.5 py-2 rounded-2xl pointer-events-auto shadow-lg">
          <div className="w-8 h-8 rounded-xl bg-car-accent/15 border border-car-accent/30 flex items-center justify-center text-car-accent">
            <Gauge size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">{vehicleModel}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-car-accent/15 text-car-accent border border-car-accent/25">
                PBR Studio 3D
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono text-white/50">
              <span>Speed: <strong className="text-white">{Math.round(speed * 0.621371)} MPH</strong></span>
              <span>•</span>
              <span>RPM: <strong className="text-white">{rpm}</strong></span>
              <span>•</span>
              <span>DTCs: <strong className={obdData?.dtcs?.length ? "text-amber-400" : "text-emerald-400"}>{obdData?.dtcs?.length || 0}</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setDiagnosticMode(!diagnosticMode)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-md",
              diagnosticMode
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-[#111622]/90 text-white/50 border-white/10 hover:text-white"
            )}
            title="Toggle component health diagnostics illumination"
          >
            <ShieldCheck size={14} className={diagnosticMode ? "text-emerald-400" : ""} />
            <span>Health Diagnostics</span>
          </button>
        </div>
      </div>

      {/* Unified Bottom Floating Control Dock (Zero Viewport Occlusion, <= 15% footprint) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-[840px] flex flex-col items-center">
        {/* Cinema / Collapse Toggle Pill */}
        <button
          type="button"
          onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
          className="mb-1.5 px-3 py-1 rounded-full bg-[#141821]/95 text-white/70 hover:text-white border border-white/10 text-[10px] font-mono flex items-center gap-1 shadow-lg transition-all cursor-pointer"
        >
          {isControlsCollapsed ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          <span>{isControlsCollapsed ? "Show 3D Studio Controls" : "Cinema Mode (Hide Dock)"}</span>
        </button>

        {!isControlsCollapsed && (
          <div className="w-full bg-[#141821]/95 border border-white/10 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5">
            {/* Top row: Camera Presets & Paint Finishes */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Camera Angle Presets */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-white/40 uppercase mr-1">View:</span>
                {[
                  { id: 'threeQuarter', label: '3/4 Studio' },
                  { id: 'side', label: 'Side' },
                  { id: 'engine', label: 'Engine Bay' },
                  { id: 'top', label: 'Top-Down' },
                  { id: 'orbit', label: 'Free Orbit' },
                ].map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => setCameraPreset(cam.id as any)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer",
                      activeCameraView === cam.id
                        ? "bg-car-accent text-white font-bold shadow-sm"
                        : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                    )}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>

              {/* Paint Swatches */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-white/40 uppercase mr-1">Finish:</span>
                {PAINT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPaintPreset(preset)}
                    className={cn(
                      "w-6 h-6 rounded-full border transition-all cursor-pointer relative",
                      paintPreset.id === preset.id
                        ? "border-car-accent scale-110 shadow-[0_0_8px_rgba(242,125,38,0.5)]"
                        : "border-white/20 hover:scale-105"
                    )}
                    style={{ backgroundColor: `#${preset.color.toString(16).padStart(6, '0')}` }}
                    title={preset.name}
                  />
                ))}
              </div>
            </div>

            {/* Bottom row: Exploded View Slider & Telemetry Sync */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5 text-xs">
              {/* Exploded View Slider */}
              <div className="flex items-center gap-3 flex-1 max-w-sm">
                <div className="flex items-center gap-1.5 text-white/60 shrink-0 font-medium text-[11px]">
                  <Layers size={13} className="text-car-accent" />
                  <span>Exploded View:</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={explodedAmount}
                  onChange={(e) => setExplodedAmount(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-car-accent"
                />
                <span className="text-[10px] font-mono text-white/50 w-8 text-right">
                  {Math.round(explodedAmount * 100)}%
                </span>
              </div>

              {/* Live Telemetry Sync Toggle */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setSyncTelemetry(!syncTelemetry)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 transition-all cursor-pointer",
                    syncTelemetry
                      ? "bg-car-accent/15 border-car-accent/30 text-car-accent font-semibold"
                      : "bg-white/5 border-white/10 text-white/50 hover:text-white"
                  )}
                  title="Simulates real-time wheel revolutions and RPM harmonic vibration"
                >
                  <RotateCw size={11} className={syncTelemetry && speed > 0 ? "animate-spin" : ""} />
                  <span>Sync OBD Telemetry</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleScene3D;
