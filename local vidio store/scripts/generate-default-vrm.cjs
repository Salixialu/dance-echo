const fs = require('fs');
const path = require('path');

// Generate a valid VRM 0.0 GLB avatar with Dark Studio cyberpunk dancer aesthetics
function buildDefaultVRM() {
  // Define humanoid bones and their relative offsets
  const bones = [
    { name: 'hips', parent: null, pos: [0, 0.95, 0], size: [0.24, 0.16, 0.16], color: [0.12, 0.14, 0.18, 1.0] },
    { name: 'spine', parent: 0, pos: [0, 0.16, 0], size: [0.20, 0.14, 0.14], color: [0.15, 0.18, 0.22, 1.0] },
    { name: 'chest', parent: 1, pos: [0, 0.18, 0], size: [0.26, 0.20, 0.16], color: [0.08, 0.25, 0.35, 1.0] }, // Cyan core
    { name: 'neck', parent: 2, pos: [0, 0.18, 0], size: [0.09, 0.10, 0.09], color: [0.15, 0.18, 0.22, 1.0] },
    { name: 'head', parent: 3, pos: [0, 0.14, 0], size: [0.20, 0.22, 0.20], color: [0.13, 0.83, 0.93, 1.0] }, // Neon Cyan head visor

    // Left leg
    { name: 'leftUpperLeg', parent: 0, pos: [0.11, -0.06, 0], size: [0.12, 0.38, 0.12], color: [0.12, 0.14, 0.18, 1.0] },
    { name: 'leftLowerLeg', parent: 5, pos: [0, -0.40, 0], size: [0.10, 0.38, 0.10], color: [0.10, 0.12, 0.15, 1.0] },
    { name: 'leftFoot', parent: 6, pos: [0, -0.40, 0.06], size: [0.11, 0.08, 0.22], color: [0.08, 0.70, 0.85, 1.0] }, // Cyan sneaker

    // Right leg
    { name: 'rightUpperLeg', parent: 0, pos: [-0.11, -0.06, 0], size: [0.12, 0.38, 0.12], color: [0.12, 0.14, 0.18, 1.0] },
    { name: 'rightLowerLeg', parent: 8, pos: [0, -0.40, 0], size: [0.10, 0.38, 0.10], color: [0.10, 0.12, 0.15, 1.0] },
    { name: 'rightFoot', parent: 9, pos: [0, -0.40, 0.06], size: [0.11, 0.08, 0.22], color: [0.08, 0.70, 0.85, 1.0] }, // Cyan sneaker

    // Left arm
    { name: 'leftUpperArm', parent: 2, pos: [0.20, 0.06, 0], size: [0.10, 0.28, 0.10], color: [0.12, 0.14, 0.18, 1.0] },
    { name: 'leftLowerArm', parent: 11, pos: [0.26, 0, 0], size: [0.09, 0.26, 0.09], color: [0.10, 0.12, 0.15, 1.0] },
    { name: 'leftHand', parent: 12, pos: [0.24, 0, 0], size: [0.08, 0.10, 0.08], color: [0.13, 0.83, 0.93, 1.0] }, // Neon Cyan glove

    // Right arm
    { name: 'rightUpperArm', parent: 2, pos: [-0.20, 0.06, 0], size: [0.10, 0.28, 0.10], color: [0.12, 0.14, 0.18, 1.0] },
    { name: 'rightLowerArm', parent: 14, pos: [-0.26, 0, 0], size: [0.09, 0.26, 0.09], color: [0.10, 0.12, 0.15, 1.0] },
    { name: 'rightHand', parent: 15, pos: [-0.24, 0, 0], size: [0.08, 0.10, 0.08], color: [0.13, 0.83, 0.93, 1.0] }, // Neon Cyan glove
  ];

  // Create box geometry data
  function makeBox(w, h, d) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const pos = [
      -hw, -hh,  hd,  hw, -hh,  hd,  hw,  hh,  hd, -hw,  hh,  hd,
      -hw, -hh, -hd, -hw,  hh, -hd,  hw,  hh, -hd,  hw, -hh, -hd,
      -hw,  hh, -hd, -hw,  hh,  hd,  hw,  hh,  hd,  hw,  hh, -hd,
      -hw, -hh, -hd,  hw, -hh, -hd,  hw, -hh,  hd, -hw, -hh,  hd,
       hw, -hh, -hd,  hw,  hh, -hd,  hw,  hh,  hd,  hw, -hh,  hd,
      -hw, -hh, -hd, -hw, -hh,  hd, -hw,  hh,  hd, -hw,  hh, -hd
    ];
    const ind = [
       0,  1,  2,  0,  2,  3,
       4,  5,  6,  4,  6,  7,
       8,  9, 10,  8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23
    ];
    return { pos, ind };
  }

  const bufferParts = [];
  let currentOffset = 0;

  const accessors = [];
  const bufferViews = [];
  const meshes = [];
  const materials = [];

  bones.forEach((b, idx) => {
    const { pos, ind } = makeBox(...b.size);
    const posFloat = new Float32Array(pos);
    const indUint = new Uint16Array(ind);

    const posBuf = Buffer.from(posFloat.buffer);
    const indBuf = Buffer.from(indUint.buffer);

    // BufferView for indices (target 34963: ELEMENT_ARRAY_BUFFER)
    const indViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: indBuf.length,
      target: 34963
    });
    bufferParts.push(indBuf);
    currentOffset += indBuf.length;

    // Pad to 4 bytes
    const pad1 = (4 - (currentOffset % 4)) % 4;
    if (pad1 > 0) {
      bufferParts.push(Buffer.alloc(pad1));
      currentOffset += pad1;
    }

    // BufferView for vertices (target 34962: ARRAY_BUFFER)
    const posViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: posBuf.length,
      target: 34962
    });
    bufferParts.push(posBuf);
    currentOffset += posBuf.length;

    // Pad to 4 bytes
    const pad2 = (4 - (currentOffset % 4)) % 4;
    if (pad2 > 0) {
      bufferParts.push(Buffer.alloc(pad2));
      currentOffset += pad2;
    }

    // Accessor for indices
    const indAccIdx = accessors.length;
    accessors.push({
      bufferView: indViewIdx,
      byteOffset: 0,
      componentType: 5123, // UNSIGNED_SHORT
      count: ind.length,
      type: 'SCALAR',
      max: [23],
      min: [0]
    });

    // Accessor for positions
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
      minY = Math.min(minY, pos[i+1]); maxY = Math.max(maxY, pos[i+1]);
      minZ = Math.min(minZ, pos[i+2]); maxZ = Math.max(maxZ, pos[i+2]);
    }
    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: pos.length / 3,
      type: 'VEC3',
      max: [maxX, maxY, maxZ],
      min: [minX, minY, minZ]
    });

    // Material
    const matIdx = materials.length;
    materials.push({
      name: `mat_${b.name}`,
      pbrMetallicRoughness: {
        baseColorFactor: b.color,
        roughnessFactor: 0.3,
        metallicFactor: 0.6
      }
    });

    // Mesh
    meshes.push({
      name: `mesh_${b.name}`,
      primitives: [
        {
          attributes: { POSITION: posAccIdx },
          indices: indAccIdx,
          material: matIdx
        }
      ]
    });
  });

  const totalBin = Buffer.concat(bufferParts);

  // Nodes hierarchy
  const nodes = bones.map((b, idx) => {
    const children = bones
      .map((other, otherIdx) => (other.parent === idx ? otherIdx : -1))
      .filter((i) => i !== -1);

    const node = {
      name: b.name,
      translation: b.pos,
      mesh: idx
    };
    if (children.length > 0) {
      node.children = children;
    }
    return node;
  });

  // VRM 0.0 humanoid bone mappings
  const humanBones = bones.map((b, idx) => ({
    bone: b.name,
    node: idx,
    useDefaultValues: true
  }));

  const gltf = {
    asset: { version: '2.0', generator: 'Dance Echo Cyber Dancer Generator' },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: totalBin.length }],
    extensionsUsed: ['VRM'],
    extensions: {
      VRM: {
        exporterVersion: 'DanceEcho 1.0',
        specVersion: '0.0',
        meta: {
          title: 'Cyber Dancer Avatar',
          version: '1.0',
          author: 'Dance Echo Studio',
          commercialUssageName: 'Allow',
          contactInformation: 'dance-echo.studio',
          reference: ''
        },
        humanoid: {
          humanBones
        }
      }
    }
  };

  const jsonStr = JSON.stringify(gltf);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  // Align JSON chunk to 4-byte boundary with spaces (0x20)
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const paddedJsonBuf = jsonPad > 0 ? Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]) : jsonBuf;

  // Align BIN chunk to 4-byte boundary with zeros
  const binPad = (4 - (totalBin.length % 4)) % 4;
  const paddedBinBuf = binPad > 0 ? Buffer.concat([totalBin, Buffer.alloc(binPad, 0x00)]) : totalBin;

  const totalLength = 12 + 8 + paddedJsonBuf.length + 8 + paddedBinBuf.length;

  const glbHeader = Buffer.alloc(12);
  glbHeader.writeUInt32LE(0x46546C67, 0); // "glTF"
  glbHeader.writeUInt32LE(2, 4);          // version 2
  glbHeader.writeUInt32LE(totalLength, 8); // total length

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4E4F534A, 4); // "JSON"

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinBuf.length, 0);
  binHeader.writeUInt32LE(0x004E4942, 4); // "BIN\0"

  const fullGlb = Buffer.concat([glbHeader, jsonHeader, paddedJsonBuf, binHeader, paddedBinBuf]);
  return fullGlb;
}

const outDir = path.resolve(__dirname, '../public/models');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const targetFile = path.join(outDir, 'default-avatar.vrm');
const glbBuffer = buildDefaultVRM();
fs.writeFileSync(targetFile, glbBuffer);
console.log(`Successfully generated default avatar at ${targetFile} (${glbBuffer.length} bytes)`);
