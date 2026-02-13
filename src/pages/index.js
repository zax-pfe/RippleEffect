import dynamic from "next/dynamic";
import styles from "./page.module.scss";

const WaterDistortionCanvas = dynamic(
  () =>
    import("@/Components/RippleEffect/WaterDistortion").then(
      (mod) => mod.WaterDistortionCanvas,
    ),
  { ssr: false },
);
const images = ["/image2.png"];
// const images = ["/gif.gif"];

const rippleSettings = {
  intensity: 0.12,
  scale: 0.1,
  viscosity: 0.89,
  decay: 0.98,
  distortionStrength: 0.05,
  aberration: 0.01,
  lightIntensity: 0.04,
  specularPower: 8.1,
};

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <WaterDistortionCanvas images={images} settings={rippleSettings} />
      </div>
    </main>
  );
}
