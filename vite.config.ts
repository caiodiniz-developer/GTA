import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Keeping the heavy 3D stack in its own chunk lets the browser cache it
        // across builds instead of redownloading it with every gameplay tweak.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('rapier')) return 'rapier';
          if (id.includes('three-stdlib') || id.includes('/three/')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          return undefined;
        },
      },
    },
  },
});
