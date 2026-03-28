"use client";

import { useEffect, useRef } from "react";

export default function FloatingParticles() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function setup() {
      const THREE = await import("three");
      const mountNode = mountRef.current;
      if (!mountNode) {
        return;
      }

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, mountNode.clientWidth / mountNode.clientHeight, 0.1, 100);
      camera.position.z = 8;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
      mountNode.appendChild(renderer.domElement);

      const particleCount = 80;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);

      for (let index = 0; index < particleCount; index += 1) {
        positions[index * 3] = (Math.random() - 0.5) * 18;
        positions[index * 3 + 1] = (Math.random() - 0.5) * 10;
        positions[index * 3 + 2] = (Math.random() - 0.5) * 6;
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: "#d6b98c",
        transparent: true,
        opacity: 0.36,
        size: 0.06,
      });

      const particles = new THREE.Points(geometry, material);
      scene.add(particles);

      let animationFrame = 0;

      const animate = () => {
        particles.rotation.y += 0.0008;
        particles.rotation.x += 0.00025;
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(animate);
      };

      animate();

      const handleResize = () => {
        if (!mountRef.current) {
          return;
        }

        camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      };

      window.addEventListener("resize", handleResize);

      cleanup = () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", handleResize);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mountNode) {
          mountNode.removeChild(renderer.domElement);
        }
      };
    }

    void setup();

    return () => cleanup?.();
  }, []);

  return <div ref={mountRef} className="absolute inset-0 opacity-80" aria-hidden="true" />;
}
