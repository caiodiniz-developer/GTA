import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode is intentionally not used here: its development double-invoke
// remounts the Rapier world and re-clones every GLTF on each render pass,
// which spawns duplicate colliders and character controllers.
createRoot(document.getElementById('root')!).render(<App />);
