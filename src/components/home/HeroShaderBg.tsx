'use client';

import {useEffect, useState} from 'react';
import {ShaderGradient, ShaderGradientCanvas} from '@shadergradient/react';
import {useAppTheme} from '@/components/AppProviders';
import styles from './HomeLanding.module.css';

/** Soft lilac / violet — keep in sync with `.bgFallback` in CSS. */
const LILAC = {
  color1: '#F4ECFF',
  color2: '#B794F6',
  color3: '#6D28D9',
} as const;

/** Deep indigo + electric violet — keep in sync with dark `.bgFallback`. */
const INDIGO = {
  color1: '#12081F',
  color2: '#5B21B6',
  color3: '#C4B5FD',
} as const;

export function HeroShaderBg() {
  const {theme} = useAppTheme();
  const palette = theme === 'dark' ? INDIGO : LILAC;
  const isDark = theme === 'dark';
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
        key={theme}
        className={styles.shaderCanvas}
        style={{width: '100%', height: '100%'}}
        pixelDensity={1}
        fov={45}
        pointerEvents="none"
        lazyLoad
        powerPreference="low-power"
      >
        {/*
          Sphere morph instead of flat waterPlane:
          a soft molten orb that slowly spirals — more depth, less “wavy sheet”.
        */}
        <ShaderGradient
          control="props"
          animate="on"
          type="sphere"
          {...palette}
          uSpeed={0.18}
          uStrength={isDark ? 0.85 : 0.7}
          uDensity={1.05}
          uFrequency={5.2}
          uAmplitude={isDark ? 2.4 : 2.1}
          positionX={0}
          positionY={isDark ? -0.05 : -0.1}
          positionZ={0}
          rotationX={12}
          rotationY={-18}
          rotationZ={40}
          cAzimuthAngle={isDark ? 220 : 55}
          cPolarAngle={isDark ? 125 : 95}
          cDistance={3.8}
          cameraZoom={isDark ? 14.2 : 13.6}
          lightType="3d"
          brightness={isDark ? 1.05 : 1.2}
          grain="off"
          reflection={0.08}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
