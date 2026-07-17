'use client';

import {useEffect, useState} from 'react';
import {ShaderGradient, ShaderGradientCanvas} from '@shadergradient/react';
import styles from './HomeLanding.module.css';

/** Warm honey / cream — keep in sync with `.bgFallback` in CSS. */
const HONEY = {
  color1: '#FFF1D6',
  color2: '#F0C987',
  color3: '#D9A45C',
} as const;

export function HeroShaderBg() {
  // null until mounted — avoids flashing WebGL for reduced-motion users
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  if (reduceMotion !== false) {
    return <div className={styles.bgFallback} aria-hidden />;
  }

  return (
    <div className={styles.shaderWrap} aria-hidden>
      <div className={styles.bgFallback} />
      <ShaderGradientCanvas
        className={styles.shaderCanvas}
        style={{width: '100%', height: '100%'}}
        pixelDensity={1}
        fov={45}
        pointerEvents="none"
        lazyLoad
        powerPreference="low-power"
      >
        <ShaderGradient
          control="props"
          animate="on"
          type="waterPlane"
          {...HONEY}
          uSpeed={0.12}
          uStrength={1.55}
          uDensity={0.95}
          uFrequency={4.4}
          uAmplitude={1}
          positionX={0}
          positionY={0.2}
          positionZ={0}
          rotationX={42}
          rotationY={8}
          rotationZ={0}
          cAzimuthAngle={180}
          cPolarAngle={95}
          cDistance={4}
          cameraZoom={1}
          lightType="3d"
          brightness={1.02}
          grain="off"
          reflection={0.03}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
