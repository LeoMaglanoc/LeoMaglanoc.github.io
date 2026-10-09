import * as THREE from 'three';
import { Reflector } from './Reflector.js';

// Appearance only. The release OBJ remains the sole physics/depth ground.
export function createGroundVisual(model) {
  const names = new Uint8Array(model.names);
  const decoder = new TextDecoder();
  const gridId = model.name_matadr.findIndex((start) => {
    let end = start;
    while (names[end]) end++;
    return decoder.decode(names.subarray(start, end)) === 'grid';
  });
  if (gridId < 0) throw new Error('The demo ground needs the original grid material');
  const textureId = model.mat_texid[gridId * 10 + 1]; // mjTEXROLE_RGB
  if (textureId < 0) throw new Error('The demo grid material has no texture');
  const width = model.tex_width[textureId], height = model.tex_height[textureId];
  const channels = model.tex_nchannel[textureId], offset = model.tex_adr[textureId];
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const src = offset + i * channels;
    pixels[i * 4] = model.tex_data[src];
    pixels[i * 4 + 1] = model.tex_data[src + (channels > 1 ? 1 : 0)];
    pixels[i * 4 + 2] = model.tex_data[src + (channels > 2 ? 2 : 0)];
    pixels[i * 4 + 3] = channels > 3 ? model.tex_data[src + 3] : 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Same 300 m presentation plane and repeat scale as the original plane renderer.
  const repeatScale = 300 / 10;
  const repeatX = textureId === 2 ? 50 : model.mat_texrepeat[gridId * 2];
  const repeatY = textureId === 2 ? 50 : model.mat_texrepeat[gridId * 2 + 1];
  texture.repeat.set(repeatX * repeatScale, repeatY * repeatScale);
  texture.needsUpdate = true;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x080e0d, roughness: 1 }));
  ground.name = 'release_ground_visual';
  ground.rotateX(-Math.PI / 2);
  ground.layers.set(0); // Main view/reflections only; depth camera uses layer 1.
  ground.castShadow = false;
  ground.receiveShadow = true;
  ground.userData.visualOnly = true;
  ground.raycast = () => {}; // Never becomes a physics drag target.
  return ground;
}
