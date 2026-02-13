"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  quadVertexShader,
  fluidUpdateShader,
  imageVertexShader,
  imageFragmentShader,
} from "./shader";

// ============================================
// MAIN COMPONENT
// ============================================

export default function RippleEffect({ images, settings }) {
  const { gl, viewport, size } = useThree();
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const prevMouseRef = useRef({ x: 0.5, y: 0.5 });
  const mouseVelocityRef = useRef(0);
  const isPointerInsideRef = useRef(false);

  // Resolution for fluid simulation
  const RESOLUTION = 128;
  // les renders targets sont utilisés pour stocker
  // les états de la simulation de fluide à différentes étapes :
  // Buffer 0 (prev)    →  Lit l'état d'il y a 2 frames
  // Buffer 1 (current) →  Lit l'état de la frame précédente
  // Buffer 2 (next)    →  Écrit le nouvel état calculé

  // Ping-pong render targets for fluid simulation
  const renderTargets = useMemo(() => {
    const options = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    };
    return [
      new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, options),
      new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, options),
      new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, options),
    ];
  }, []);

  // Index for ping-pong
  const pingPongRef = useRef(0);

  // Fullscreen quad for fluid simulation
  // Ce quad est utilisé pour calculer la simulation.
  // Mais ce quad n'est pas rendu a l'ecran.
  const quadGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    return geo;
  }, []);

  // Scene and camera for off-screen rendering
  const offscreenScene = useMemo(() => new THREE.Scene(), []);
  const offscreenCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return cam;
  }, []);

  // Material for fluid update (includes ripple injection)
  const fluidUpdateMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader: fluidUpdateShader,
      uniforms: {
        uPrevState: { value: null },
        uCurrentState: { value: null },
        uResolution: { value: new THREE.Vector2(RESOLUTION, RESOLUTION) },
        uViscosity: { value: settings.viscosity },
        uDecay: { value: settings.decay },
        // Ripple uniforms
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uRadius: { value: settings.scale },
        uIntensity: { value: settings.intensity },
        uMouseVelocity: { value: 0 },
      },
    });
  }, []);

  // Quad mesh reference
  const quadMeshRef = useRef(null);

  // Clear render targets on mount to avoid residual data from previous effects
  useEffect(() => {
    renderTargets.forEach((rt) => {
      gl.setRenderTarget(rt);
      gl.clearColor();
    });
    gl.setRenderTarget(null);
  }, [gl, renderTargets]);

  // Setup quad mesh
  useEffect(() => {
    const mesh = new THREE.Mesh(quadGeometry, fluidUpdateMaterial);
    quadMeshRef.current = mesh;
    offscreenScene.add(mesh);

    return () => {
      offscreenScene.remove(mesh);
    };
  }, [quadGeometry, fluidUpdateMaterial, offscreenScene]);

  // Track image aspect ratios
  const imageAspectsRef = useRef(images.map(() => 1));

  // Load textures and get their aspect ratios
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return images.map((src, index) => {
      const tex = loader.load(src, (loadedTex) => {
        // Get image dimensions when loaded
        const image = loadedTex.image;
        if (image) {
          imageAspectsRef.current[index] =
            image.naturalWidth / image.naturalHeight;
        }
      });
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    });
  }, [images]);

  // Create image materials
  const imageMaterials = useMemo(() => {
    return textures.map(
      (texture, index) =>
        new THREE.ShaderMaterial({
          vertexShader: imageVertexShader,
          fragmentShader: imageFragmentShader,
          uniforms: {
            uTexture: { value: texture },
            uDisplacement: { value: renderTargets[0].texture },
            uViewportSize: {
              value: new THREE.Vector2(viewport.width, viewport.height),
            },
            uDistortionStrength: { value: settings.distortionStrength },
            uAberration: { value: settings.aberration },
            uLightIntensity: { value: settings.lightIntensity },
            uSpecularPower: { value: settings.specularPower },
            uResolution: { value: new THREE.Vector2(RESOLUTION, RESOLUTION) },
            uImageAspect: { value: imageAspectsRef.current[index] },
            uPlaneAspect: { value: 1.0 },
          },
        }),
    );
  }, [textures, renderTargets, viewport.width, viewport.height]);

  // Track mouse movement (normalized 0-1)
  useEffect(() => {
    const canvas = gl.domElement;

    const updatePointer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = 1.0 - (clientY - rect.top) / rect.height;

      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      isPointerInsideRef.current = inside;

      if (inside) {
        mouseRef.current.x = x;
        mouseRef.current.y = y;
      }
    };

    const handlePointerMove = (e) => {
      updatePointer(e.clientX, e.clientY);
    };

    const handlePointerLeave = () => {
      isPointerInsideRef.current = false;
      // Keep previous mouse position in sync to avoid a large velocity spike
      prevMouseRef.current.x = mouseRef.current.x;
      prevMouseRef.current.y = mouseRef.current.y;
    };

    canvas.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    canvas.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });

    return () => {
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [gl]);

  // Calculate image layout (moved before useFrame so it's available)
  const imageLayout = useMemo(() => {
    return images.map(() => ({
      position: [0, 0, 0],
      size: [viewport.width, viewport.height],
    }));
  }, [viewport, images]);

  // Main animation loop
  useFrame(() => {
    if (!quadMeshRef.current) return;

    // Calculate mouse velocity only when pointer is inside the canvas
    const dx = mouseRef.current.x - prevMouseRef.current.x;
    const dy = mouseRef.current.y - prevMouseRef.current.y;
    const rawVelocity = Math.sqrt(dx * dx + dy * dy);
    const velocity = isPointerInsideRef.current ? rawVelocity : 0;
    mouseVelocityRef.current = velocity;

    // Update all uniforms
    fluidUpdateMaterial.uniforms.uViscosity.value = settings.viscosity;
    fluidUpdateMaterial.uniforms.uDecay.value = settings.decay;
    fluidUpdateMaterial.uniforms.uRadius.value = settings.scale;
    fluidUpdateMaterial.uniforms.uIntensity.value = settings.intensity;
    fluidUpdateMaterial.uniforms.uMouse.value.set(
      mouseRef.current.x,
      mouseRef.current.y,
    );
    fluidUpdateMaterial.uniforms.uPrevMouse.value.set(
      prevMouseRef.current.x,
      prevMouseRef.current.y,
    );
    fluidUpdateMaterial.uniforms.uMouseVelocity.value = velocity;

    // Current ping-pong indices
    const current = pingPongRef.current;
    const prev = (current + 2) % 3;
    const next = (current + 1) % 3;

    // Update fluid simulation (includes ripple injection)
    fluidUpdateMaterial.uniforms.uPrevState.value = renderTargets[prev].texture;
    fluidUpdateMaterial.uniforms.uCurrentState.value =
      renderTargets[current].texture;

    quadMeshRef.current.material = fluidUpdateMaterial;

    gl.setRenderTarget(renderTargets[next]);
    gl.render(offscreenScene, offscreenCamera);
    gl.setRenderTarget(null);

    // Update image materials with new displacement and aspect ratios
    imageMaterials.forEach((mat, index) => {
      mat.uniforms.uDisplacement.value = renderTargets[next].texture;
      mat.uniforms.uViewportSize.value.set(viewport.width, viewport.height);
      mat.uniforms.uDistortionStrength.value = settings.distortionStrength;
      mat.uniforms.uAberration.value = settings.aberration;
      mat.uniforms.uLightIntensity.value = settings.lightIntensity;
      mat.uniforms.uSpecularPower.value = settings.specularPower;
      // Update aspect ratios
      mat.uniforms.uImageAspect.value = imageAspectsRef.current[index];
      const planeSize = imageLayout[index]?.size;
      if (planeSize) {
        mat.uniforms.uPlaneAspect.value = planeSize[0] / planeSize[1];
      }
    });

    // Advance ping-pong
    pingPongRef.current = next;

    // Store previous mouse position
    prevMouseRef.current.x = mouseRef.current.x;
    prevMouseRef.current.y = mouseRef.current.y;
  });

  // Cleanup
  useEffect(() => {
    return () => {
      renderTargets.forEach((rt) => rt.dispose());
      quadGeometry.dispose();
      fluidUpdateMaterial.dispose();
      imageMaterials.forEach((mat) => mat.dispose());
      textures.forEach((tex) => tex.dispose());
    };
  }, []);

  return (
    <>
      {imageMaterials.map((material, i) => (
        <mesh key={i} position={imageLayout[i].position}>
          <planeGeometry
            args={[imageLayout[i].size[0], imageLayout[i].size[1], 1, 1]}
          />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </>
  );
}
