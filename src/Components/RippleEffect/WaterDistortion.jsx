"use client";

import { Canvas } from "@react-three/fiber";
import RippleEffect from "./RippleEffect";
import styles from "./style.module.scss";

export function WaterDistortionCanvas({ images, settings }) {
  return (
    <div className={styles.canvasContainer}>
      <Canvas
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        camera={{
          position: [0, 0, 5],
          fov: 50,
          near: 0.1,
          far: 100,
        }}
        dpr={[1, 2]}
      >
        {/* <color attach="background" args={["#0a0a0a"]} /> */}
        <RippleEffect images={images} settings={settings} />
      </Canvas>
    </div>
  );
}

export default WaterDistortionCanvas;
