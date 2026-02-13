// Vertex shader for fullscreen quad
export const quadVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Fragment shader for fluid simulation with ripple injection
export const fluidUpdateShader = `
  uniform sampler2D uPrevState;
  uniform sampler2D uCurrentState;
  uniform vec2 uResolution;
  uniform float uViscosity;
  uniform float uDecay;

  // Ripple uniforms
  uniform vec2 uMouse;
  uniform vec2 uPrevMouse;
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uMouseVelocity;

  varying vec2 vUv;

  void main() {
    vec2 texel = 1.0 / uResolution;

    // Sample neighboring pixels for wave propagation
    float current = texture2D(uCurrentState, vUv).r;
    float prev = texture2D(uPrevState, vUv).r;

    float left = texture2D(uCurrentState, vUv + vec2(-texel.x, 0.0)).r;
    float right = texture2D(uCurrentState, vUv + vec2(texel.x, 0.0)).r;
    float top = texture2D(uCurrentState, vUv + vec2(0.0, texel.y)).r;
    float bottom = texture2D(uCurrentState, vUv + vec2(0.0, -texel.y)).r;

    // Wave equation with viscosity
    float neighbors = (left + right + top + bottom) * 0.25;
    float wave = neighbors * 2.0 - prev;
    wave = mix(current, wave, uViscosity);
    wave *= uDecay;

    // Add ripple at mouse position
    if (uMouseVelocity > 0.0001) {
      vec2 mousePos = uMouse;
      float dist = distance(vUv, mousePos);

      // Create soft circular ripple
      float ripple = smoothstep(uRadius, 0.0, dist);
      ripple = pow(ripple, 2.0);

      // Trail effect - sample along path from prev to current mouse
      vec2 prevMousePos = uPrevMouse;
      for(float i = 0.0; i < 8.0; i++) {
        float t = i / 8.0;
        vec2 trailPos = mix(prevMousePos, mousePos, t);
        float d = distance(vUv, trailPos);
        float trailRipple = smoothstep(uRadius * 0.7, 0.0, d);
        ripple = max(ripple, pow(trailRipple, 2.0));
      }

      // Add ripple with velocity-based intensity
      float finalRipple = ripple * uIntensity * min(uMouseVelocity * 10.0, 1.0);
      wave += finalRipple;
    }

    gl_FragColor = vec4(wave, wave, wave, 1.0);
  }
`;

// ============================================
// SHADERS FOR IMAGE RENDERING WITH WATER EFFECT
// ============================================

export const imageVertexShader = `
  varying vec2 vUv;
  varying vec2 vScreenUv;
  uniform vec2 uViewportSize;

  void main() {
    vUv = uv;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vScreenUv = (worldPos.xy + uViewportSize * 0.5) / uViewportSize;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const imageFragmentShader = `
  uniform sampler2D uTexture;
  uniform sampler2D uDisplacement;
  uniform float uDistortionStrength;
  uniform float uAberration;
  uniform float uLightIntensity;
  uniform float uSpecularPower;
  uniform vec2 uResolution;
  uniform float uImageAspect;
  uniform float uPlaneAspect;

  varying vec2 vUv;
  varying vec2 vScreenUv;

  // Cover fit - maintains aspect ratio while filling the plane
  vec2 coverUv(vec2 uv, float imageAspect, float planeAspect) {
    vec2 ratio = vec2(
      min(planeAspect / imageAspect, 1.0),
      min(imageAspect / planeAspect, 1.0)
    );
    return vec2(
      uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      uv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
  }

  vec3 calculateNormal(vec2 uv, float strength) {
    vec2 texel = 1.0 / uResolution;

    float left = texture2D(uDisplacement, uv + vec2(-texel.x, 0.0)).r;
    float right = texture2D(uDisplacement, uv + vec2(texel.x, 0.0)).r;
    float top = texture2D(uDisplacement, uv + vec2(0.0, texel.y)).r;
    float bottom = texture2D(uDisplacement, uv + vec2(0.0, -texel.y)).r;

    vec3 normal;
    normal.x = (left - right) * strength;
    normal.y = (bottom - top) * strength;
    normal.z = 1.0;

    return normalize(normal);
  }

  void main() {
    // Apply aspect ratio correction (cover fit)
    vec2 coveredUv = coverUv(vUv, uImageAspect, uPlaneAspect);

    // Get displacement value
    float displacement = texture2D(uDisplacement, vScreenUv).r;

    // Calculate normal for lighting and refraction
    vec3 normal = calculateNormal(vScreenUv, 50.0);

    // Calculate how much the normal deviates from flat (used to mask lighting)
    float normalDeviation = length(normal.xy);

    // Refraction-based distortion using normal
    vec2 refraction = normal.xy * uDistortionStrength;
    vec2 distortedUv = coveredUv + refraction;

    // Clamp UVs
    distortedUv = clamp(distortedUv, 0.001, 0.999);

    // Chromatic aberration based on displacement
    float aberrationAmount = uAberration * (abs(normal.x) + abs(normal.y));

    vec4 colorR = texture2D(uTexture, distortedUv + vec2(aberrationAmount, 0.0));
    vec4 colorG = texture2D(uTexture, distortedUv);
    vec4 colorB = texture2D(uTexture, distortedUv - vec2(aberrationAmount, 0.0));

    vec3 color = vec3(colorR.r, colorG.g, colorB.b);

    // Only apply lighting where there are actual ripples (normal deviation > 0)
    // Use smoothstep to create a soft threshold
    float rippleMask = smoothstep(0.01, 0.1, normalDeviation);

    // Specular lighting (water highlights) - only on ripples
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfDir = normalize(lightDir + viewDir);

    float specular = pow(max(dot(normal, halfDir), 0.0), uSpecularPower);
    specular *= uLightIntensity * rippleMask;

    // Add specular highlight only on ripples
    color += vec3(specular);

    // Subtle fresnel effect - only on ripples
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
    color += vec3(fresnel * uLightIntensity * 0.1 * rippleMask);

    gl_FragColor = vec4(color, 1.0);
  }
`;
