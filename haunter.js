const vsSource = `
attribute vec4 aVertexPosition;
attribute vec3 aVertexNormal;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat4 uNormalMatrix;
varying highp vec3 vTransformedNormal;
varying highp vec4 vPosition;
void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vPosition = uModelViewMatrix * aVertexPosition;
    vTransformedNormal = (uNormalMatrix * vec4(aVertexNormal, 0.0)).xyz;
}
`;
const fsSource = `
precision mediump float;

varying highp vec3 vTransformedNormal; 
varying highp vec4 vPosition;        

uniform vec3 uLightPosition;
uniform vec3 uViewPosition;  
uniform vec4 uObjectColor;

void main(void) {
    vec3 normal = normalize(vTransformedNormal);
    vec3 viewDir = normalize(uViewPosition - vPosition.xyz); // Direction from surface to camera
    vec3 ambient = vec3(0.2, 0.05, 0.15); // Low, dark purplish ambient
    vec3 lightDir = normalize(uLightPosition - vPosition.xyz); // Direction from surface to light
    float diff = max(dot(normal, lightDir), 0.0); // Light intensity factor (0 to 1)
    vec3 diffuseColor = vec3(0.85, 0.7, 0.8); // Light color (can be vec3(1.0, 1.0, 1.0) for white)
    vec3 diffuse = diff * diffuseColor;
    vec3 shadowColor = vec3(0.4, 0.1, 0.3); // Dark purple shadow

    vec3 litColor = (ambient + diffuse) * uObjectColor.rgb;
    vec3 shadedColor = shadowColor * uObjectColor.rgb;
    vec3 finalColor = mix(shadedColor, litColor, diff);
    float fresnelPower = 1.0;
    float fresnelFactor = pow(1.0 - clamp(dot(viewDir, normal), 0.0, 1.0), fresnelPower);
    vec3 fresnelColor = vec3(0.8, 0.2, 0.5); // Fresnel highlight color
    finalColor += fresnelFactor * fresnelColor * 0.05; // Add a *very subtle* fresnel

    gl_FragColor = vec4(finalColor, uObjectColor.a); // Use final calculated color
}
`;

let allTeeth = [];

let lastFlipTime = 0;     
const flipInterval = 5.0; 
const flipDuration = 1.0;   
let isFlipping = false;    

const mat4 = {
  create: () => {
    const out = new Float32Array(16);
    out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
    return out;
  },

  perspective: (out, fovy, aspect, near, far) => {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect;
    out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[11] = -1; out[12] = 0; out[13] = 0;
    if (far !== Infinity) {
      const nf = 1 / (near - far);
      out[10] = (far + near) * nf;
      out[14] = (2 * far * near) * nf;
    } else {
      out[10] = -1; out[14] = -2 * near;
    }
    out[15] = 0;
    return out;
  },

  translate: (out, a, v) => {
    const x = v[0], y = v[1], z = v[2];
    if (a === out) {
      out[12] = a[0]*x + a[4]*y + a[8]*z + a[12];
      out[13] = a[1]*x + a[5]*y + a[9]*z + a[13];
      out[14] = a[2]*x + a[6]*y + a[10]*z + a[14];
      out[15] = a[3]*x + a[7]*y + a[11]*z + a[15];
    } else {
      out[0]=a[0]; out[1]=a[1]; out[2]=a[2]; out[3]=a[3];
      out[4]=a[4]; out[5]=a[5]; out[6]=a[6]; out[7]=a[7];
      out[8]=a[8]; out[9]=a[9]; out[10]=a[10]; out[11]=a[11];
      out[12]=a[0]*x + a[4]*y + a[8]*z + a[12];
      out[13]=a[1]*x + a[5]*y + a[9]*z + a[13];
      out[14]=a[2]*x + a[6]*y + a[10]*z + a[14];
      out[15]=a[3]*x + a[7]*y + a[11]*z + a[15];
    }
    return out;
  },

  rotate: (out, a, rad, axis) => {
    let x = axis[0], y = axis[1], z = axis[2];
    let len = Math.hypot(x,y,z);
    if (len < 0.000001) return null;
    len = 1/len;
    x *= len; y *= len; z *= len;
    const s = Math.sin(rad), c = Math.cos(rad), t = 1 - c;
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const b00 = x*x*t + c, b01 = y*x*t + z*s, b02 = z*x*t - y*s;
    const b10 = x*y*t - z*s, b11 = y*y*t + c, b12 = z*y*t + x*s;
    const b20 = x*z*t + y*s, b21 = y*z*t - x*s, b22 = z*z*t + c;
    out[0] = a00*b00 + a10*b01 + a20*b02;
    out[1] = a01*b00 + a11*b01 + a21*b02;
    out[2] = a02*b00 + a12*b01 + a22*b02;
    out[3] = a03*b00 + a13*b01 + a23*b02;
    out[4] = a00*b10 + a10*b11 + a20*b12;
    out[5] = a01*b10 + a11*b11 + a21*b12;
    out[6] = a02*b10 + a12*b11 + a22*b12;
    out[7] = a03*b10 + a13*b11 + a23*b12;
    out[8] = a00*b20 + a10*b21 + a20*b22;
    out[9] = a01*b20 + a11*b21 + a21*b22;
    out[10] = a02*b20 + a12*b21 + a22*b22;
    out[11] = a03*b20 + a13*b21 + a23*b22;
    if (a !== out) {
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    return out;
  },

  rotateX: (out,a,rad) => {
    const r = mat4.create();
    r[5] = Math.cos(rad); r[6] = Math.sin(rad);
    r[9] = -Math.sin(rad); r[10] = Math.cos(rad);
    return mat4.multiply(out, a, r);
  },
  rotateY: (out,a,rad) => {
    const r = mat4.create();
    r[0] = Math.cos(rad); r[2] = -Math.sin(rad);
    r[8] = Math.sin(rad); r[10] = Math.cos(rad);
    return mat4.multiply(out, a, r);
  },
  rotateZ: (out,a,rad) => {
    const r = mat4.create();
    r[0] = Math.cos(rad); r[1] = Math.sin(rad);
    r[4] = -Math.sin(rad); r[5] = Math.cos(rad);
    return mat4.multiply(out, a, r);
  },

  scale: (out, a, v) => {
    const x=v[0], y=v[1], z=v[2];
    out[0] = a[0]*x; out[1] = a[1]*x; out[2] = a[2]*x; out[3] = a[3]*x;
    out[4] = a[4]*y; out[5] = a[5]*y; out[6] = a[6]*y; out[7] = a[7]*y;
    out[8] = a[8]*z; out[9] = a[9]*z; out[10] = a[10]*z; out[11] = a[11]*z;
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
  },

  multiply: (out, a, b) => {
    const a00=a[0], a01=a[1], a02=a[2], a03=a[3];
    const a10=a[4], a11=a[5], a12=a[6], a13=a[7];
    const a20=a[8], a21=a[9], a22=a[10], a23=a[11];
    const a30=a[12], a31=a[13], a32=a[14], a33=a[15];

    let b0=b[0], b1=b[1], b2=b[2], b3=b[3];
    out[0] = a00*b0 + a10*b1 + a20*b2 + a30*b3;
    out[1] = a01*b0 + a11*b1 + a21*b2 + a31*b3;
    out[2] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
    out[3] = a03*b0 + a13*b1 + a23*b2 + a33*b3;

    b0=b[4]; b1=b[5]; b2=b[6]; b3=b[7];
    out[4] = a00*b0 + a10*b1 + a20*b2 + a30*b3;
    out[5] = a01*b0 + a11*b1 + a21*b2 + a31*b3;
    out[6] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
    out[7] = a03*b0 + a13*b1 + a23*b2 + a33*b3;

    b0=b[8]; b1=b[9]; b2=b[10]; b3=b[11];
    out[8] = a00*b0 + a10*b1 + a20*b2 + a30*b3;
    out[9] = a01*b0 + a11*b1 + a21*b2 + a31*b3;
    out[10] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
    out[11] = a03*b0 + a13*b1 + a23*b2 + a33*b3;

    b0=b[12]; b1=b[13]; b2=b[14]; b3=b[15];
    out[12] = a00*b0 + a10*b1 + a20*b2 + a30*b3;
    out[13] = a01*b0 + a11*b1 + a21*b2 + a31*b3;
    out[14] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
    out[15] = a03*b0 + a13*b1 + a23*b2 + a33*b3;
    return out;
  },

  invert: (out, a) => {
    const a00=a[0], a01=a[1], a02=a[2], a03=a[3];
    const a10=a[4], a11=a[5], a12=a[6], a13=a[7];
    const a20=a[8], a21=a[9], a22=a[10], a23=a[11];
    const a30=a[12], a31=a[13], a32=a[14], a33=a[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },

  transpose: (out, a) => {
    if (out === a) {
      let a01=a[1], a02=a[2], a03=a[3], a12=a[6], a13=a[7], a23=a[11];
      out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
      out[4] = a01; out[6] = a[9]; out[7] = a[13];
      out[8] = a02; out[9] = a12; out[11] = a[14];
      out[12] = a03; out[13] = a13; out[14] = a23;
    } else {
      out[0]=a[0]; out[1]=a[4]; out[2]=a[8]; out[3]=a[12];
      out[4]=a[1]; out[5]=a[5]; out[6]=a[9]; out[7]=a[13];
      out[8]=a[2]; out[9]=a[6]; out[10]=a[10]; out[11]=a[14];
      out[12]=a[3]; out[13]=a[7]; out[14]=a[11]; out[15]=a[15];
    }
    return out;
  }
};

class SceneNode {
  constructor(options = {}) {
    this.buffers = options.buffers || null;
    this.localTransform = options.localTransform || { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] };
    this.color = options.color || [1,1,1,1];
    this.children = [];
    this.parent = null;
  }
  addChild(child) {
    this.children.push(child);
    child.parent = this;
  }
  getLocalMatrix() {
    const m = mat4.create();
    mat4.translate(m, m, this.localTransform.position);
    mat4.rotate(m, m, this.localTransform.rotation[0], [1,0,0]);
    mat4.rotate(m, m, this.localTransform.rotation[1], [0,1,0]);
    mat4.rotate(m, m, this.localTransform.rotation[2], [0,0,1]);
    mat4.scale(m, m, this.localTransform.scale);
    return m;
  }
  getWorldMatrix(parentWorldMatrix = null) {
    const local = this.getLocalMatrix();
    if (parentWorldMatrix) {
      const world = mat4.create();
      mat4.multiply(world, parentWorldMatrix, local);
      return world;
    }
    return local;
  }
}

function createSphere(radius=1, stacks=48, slices=48){
  const vertices = [], normals = [], indices = [];
  for (let y=0; y<=stacks; y++){
    const v = y / stacks;
    const theta = v * Math.PI;
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    for (let x=0; x<=slices; x++){
      const u = x / slices;
      const phi = u * Math.PI * 2;
      const sinP = Math.sin(phi), cosP = Math.cos(phi);
      const nx = cosP * sinT, ny = cosT, nz = sinP * sinT;
      vertices.push(radius * nx, radius * ny, radius * nz);
      normals.push(nx, ny, nz);
    }
  }
  for (let y=0; y<stacks; y++){
    for (let x=0; x<slices; x++){
      const i1 = y * (slices + 1) + x;
      const i2 = i1 + slices + 1;
      indices.push(i1, i2, i1+1, i2, i2+1, i1+1);
    }
  }
  return { vertices, normals, indices };
}

function createCone(radius = 1, height = 2, slices = 48, topRatio = 0.0) {
    const vertices = [];
    const normals = [];
    const indices = [];
    const heightHalf = height / 2;

    for (let y = 0; y <= 1; y++) { 
        const r = (y === 0) ? radius : radius * topRatio;
        const currentY = -heightHalf + y * height;

        for (let x = 0; x <= slices; x++) {
            const u = x / slices;
            const angle = u * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            vertices.push(cosA * r, currentY, sinA * r);

            const nx = cosA, ny = radius / height, nz = sinA;
            const len = Math.hypot(nx, ny, nz) || 1;
            normals.push(nx / len, ny / len, nz / len);
        }
    }

    for (let x = 0; x < slices; x++) {
        const i1 = x;
        const i2 = x + 1;
        const i3 = i1 + slices + 1;
        const i4 = i2 + slices + 1;
        indices.push(i1, i3, i2);
        indices.push(i2, i3, i4);
    }

    const baseCenterIndex = vertices.length / 3;
    vertices.push(0, -heightHalf, 0);
    normals.push(0, -1, 0);
    for (let x = 0; x < slices; x++) {
        indices.push(baseCenterIndex, x, x + 1);
    }

    if (topRatio > 0) {
        const topCenterIndex = vertices.length / 3;
        vertices.push(0, heightHalf, 0);
        normals.push(0, 1, 0);
        const topRowStartIndex = slices + 1;
        for (let x = 0; x < slices; x++) {
            indices.push(topCenterIndex, topRowStartIndex + x + 1, topRowStartIndex + x);
        }
    }

    return { vertices, normals, indices };
}

function createEllipticParaboloid(a, b, height, segments = 36, stacks = 24, sharpness = 1.0) {
    const vertices = [], normals = [], indices = [];
    const halfHeight = height / 2;
    const aEff = Math.max(1e-6, a / sharpness);
    const bEff = Math.max(1e-6, b / sharpness);
    vertices.push(0, halfHeight, 0);
    normals.push(0, 1, 0);
    for (let i = 1; i <= stacks; i++) {
        const v = i / stacks;
        const s = v * height;
        const y = halfHeight - s;
        const rX = aEff * Math.sqrt(s);
        const rZ = bEff * Math.sqrt(s);
        for (let j = 0; j <= segments; j++) {
            const angle = (j / segments) * Math.PI * 2;
            const x = rX * Math.cos(angle);
            const z = rZ * Math.sin(angle);
            vertices.push(x, y, z);
            const nx = 2 * x / (aEff * aEff);
            const ny = 1.0;
            const nz = 2 * z / (bEff * bEff);
            const len = Math.hypot(nx, ny, nz) || 1.0;
            normals.push(nx / len, ny / len, nz / len);
        }
    }
    const firstRingStart = 1;
    for (let j = 0; j < segments; j++) {
        indices.push(0, firstRingStart + j + 1, firstRingStart + j);
    }
    for (let i = 1; i < stacks; i++) {
        const ring1 = (i - 1) * (segments + 1) + 1;
        const ring2 = i * (segments + 1) + 1;
        for (let j = 0; j < segments; j++) {
            indices.push(ring1 + j, ring2 + j, ring1 + j + 1);
            indices.push(ring2 + j, ring2 + j + 1, ring1 + j + 1);
        }
    }
    return { vertices, normals, indices };
}

function createConeGeometry(radius = 0.1, height = 0.3, segments = 24) {
  const vertices = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = radius * Math.cos(theta);
    const z = radius * Math.sin(theta);
    vertices.push(x, 0, z);
    const nx = Math.cos(theta);
    const ny = radius / Math.sqrt(radius * radius + height * height); 
    const nz = Math.sin(theta);
    const len = Math.hypot(nx, ny, nz);
    normals.push(nx / len, ny / len, nz / len);
  }

  const tipIndex = vertices.length / 3;
  vertices.push(0, height, 0);
  normals.push(0, 1, 0); 

  const baseCenterIndex = vertices.length / 3;
  vertices.push(0, 0, 0);
  normals.push(0, -1, 0);

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(i, next, tipIndex);
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(baseCenterIndex, next, i);
  }
  return { vertices, normals, indices };
}

function createConeBuffer(gl, radius = 0.1, height = 0.3, segments = 24) {
  const geom = createConeGeometry(radius, height, segments);
  return initBuffers(gl, geom);
}

function createCylinder(radiusTop, radiusBottom, height, radialSegments, heightSegments) {
    const vertices = [];
    const normals = [];
    const indices = [];

    const heightHalf = height / 2;
    const slope = (radiusBottom - radiusTop) / height;

    for (let y = 0; y <= heightSegments; y++) {
        const v = y / heightSegments;
        const radius = v * (radiusBottom - radiusTop) + radiusTop;
        for (let x = 0; x <= radialSegments; x++) {
            const u = x / radialSegments;
            const angle = u * Math.PI * 2;
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);

            vertices.push(radius * sinA, v * height - heightHalf, radius * cosA);

            const normal = [sinA, slope, cosA];
            const len = Math.hypot(...normal);
            normals.push(normal[0] / len, normal[1] / len, normal[2] / len);
        }
    }

    for (let y = 0; y < heightSegments; y++) {
        for (let x = 0; x < radialSegments; x++) {
            const i1 = y * (radialSegments + 1) + x;
            const i2 = i1 + radialSegments + 1;
            indices.push(i1, i2, i1 + 1);
            indices.push(i2, i2 + 1, i1 + 1);
        }
    }
    return { vertices, normals, indices };
}

    function bezier(t, p0, p1, p2, p3) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        const p = [0, 0, 0];
        p[0] = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
        p[1] = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
        p[2] = uuu * p0[2] + 3 * uu * t * p1[2] + 3 * u * tt * p2[2] + ttt * p3[2];
        return p;
    }

function createHaunterMouth(segments) {
    const positions = [];
    const normals = [];
    const indices = [];

    const topCurve = [
        [-0.6, 0.3, -0.26],
        [-0.2, 0.3, 0.1],    
        [0.2, 0.3, 0.1],    
        [0.6, 0.3, -0.26]
    ];
    const bottomCurve = [
        [-0.6, 0.3, -0.26],
        [-0.5, -0.4, 0.1],   
        [0.5, -0.4, 0.1],    
        [0.6, 0.3, -0.26]
    ];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const topPoint = bezier(t, ...topCurve);
        const bottomPoint = bezier(t, ...bottomCurve);
        
        positions.push(...topPoint);
        normals.push(0, 0, 1); 
        
        positions.push(...bottomPoint);
        normals.push(0, 0, 1);
    }

    for (let i = 0; i < segments; i++) {
        const base = i * 2;
        const p1 = base;      
        const p2 = base + 1;  
        const p3 = base + 2;  
        const p4 = base + 3;

        indices.push(p1, p2, p3);
        indices.push(p2, p4, p3);
    }

    return { vertices: positions, normals, indices };
}

function loadShader(gl, type, source){
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initShaderProgram(gl, vsSource, fsSource){
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)){
    console.error("Program link error:", gl.getProgramInfoLog(shaderProgram));
    return null;
  }
  return shaderProgram;
}

function initBuffers(gl, data) {
  const { vertices, normals, indices } = data;

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  return {
    position: positionBuffer,
    normal: normalBuffer,
    indices: indexBuffer,
    vertexCount: indices.length
  };
}

let dragging = false;
let last = { x: 0, y: 0 };
let cameraRotation = { x: -0.15, y: 0.0 };
let cameraDistance = 7.0;

function main() {
  const canvas = document.querySelector("#glcanvas");
  if (!canvas) {
    alert("Canvas with id 'glcanvas' not found in the page.");
    return;
  }
  const gl = canvas.getContext("webgl");
  if (!gl) { alert("WebGL not available"); return; }

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexNormal: gl.getAttribLocation(shaderProgram, 'aVertexNormal'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
      normalMatrix: gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
      lightPosition: gl.getUniformLocation(shaderProgram, 'uLightPosition'),
      viewPosition: gl.getUniformLocation(shaderProgram, 'uViewPosition'),
      objectColor: gl.getUniformLocation(shaderProgram, 'uObjectColor'),
    }
  };
  const headGeom = createSphere(1.0, 48, 48);
  const tailGeom = createCone(0.5, 2, 48);

const headBuf = initBuffers(gl, headGeom);
const tailBuf = initBuffers(gl, tailGeom);
const eyeGeometry = createEllipticParaboloid(1.0, 0.6, 0.2, 32, 16,);
const eyeBuffers = initBuffers(gl, eyeGeometry);
const eyeScaleFactor = 1.4;

const pupilGeometry = createEllipticParaboloid(0.09, 0.12, 0.02, 18, 8, 1.18);
const pupilBuffers = initBuffers(gl, pupilGeometry);

const armBuf = initBuffers(gl, createCylinder(0.2, 0.2, 0.7, 32, 5)); 
const palmBuf = initBuffers(gl, createSphere(0.5, 24, 24));
const fingerBaseBuf = initBuffers(gl, createCylinder(0.5, 0.5, 1.0, 12, 1)); 
const fingerTipBuf = initBuffers(gl, createCone(0.5, 1.0, 12)); 
const mouthBuf = initBuffers(gl, createHaunterMouth(30));
const toothBuf = initBuffers(gl, createCone(0.08, 0.25, 8, 0.1));

 const floorGeometry = createWavyPlane(40, 40, 50, 50);
  const floorBuffers = initBuffers(gl, floorGeometry);

  const root = new SceneNode();
  const haunterRootNode = new SceneNode();
  
const floorNode = new SceneNode({
    buffers: floorBuffers,
    localTransform: {
        position: [0, -2.1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
    color: [0.1, 0.05, 0.15, 1.0]
});
root.addChild(floorNode);

const crystalGeometry = createCrystal(3.0, 1.0, 6);
    const crystalBuffers = initBuffers(gl, crystalGeometry);

    const glowingCrystalColor = [1.0, 0.4, 0.7, 1.0];
    const darkCrystalColor = [0.5, 0.1, 0.3, 1.0];

    function placeCluster(clusterPrefab, options) {
        const placerNode = new SceneNode({
            localTransform: {
                position: options.position,
                rotation: options.rotation,
                scale: options.scale
            }
        });
        const cluster = clusterPrefab({
            crystalBuffers,
            color: options.isGlowing ? glowingCrystalColor : darkCrystalColor,
            glowing: options.isGlowing,
        });
        placerNode.addChild(cluster);
        root.addChild(placerNode);
    }

    placeCluster(createCrystalClusterA, {
        position: [-5, -2.0, -8],
        rotation: [0, 0.5, 0],
        scale: [1.2, 1.2, 1.2],
        isGlowing: true,
    });
    placeCluster(createCrystalClusterB, {
        position: [-10, -2.1, -2],
        rotation: [0, 1.2, 0],
        scale: [1.0, 1.5, 1.0],
        isGlowing: true,
    });

    placeCluster(createCrystalClusterB, {
        position: [6, -1.9, -6],
        rotation: [0, -0.8, 0],
        scale: [1.5, 1.8, 1.5],
        isGlowing: true,
    });
    placeCluster(createCrystalClusterA, {
        position: [11, -2.0, 0],
        rotation: [0, -1.5, 0],
        scale: [0.9, 1.1, 0.9],
        isGlowing: true,
    });

    placeCluster(createCrystalClusterB, {
        position: [2, -2.1, -15],
        rotation: [0, 0.1, 0],
        scale: [2.0, 2.5, 2.0],
        isGlowing: true,
    });

    function createWavyPlane(width, height, widthSegments, heightSegments) {
    const vertices = [], normals = [], indices = [];
    const width_half = width / 2;
    const height_half = height / 2;
    const gridX = Math.floor(widthSegments);
    const gridZ = Math.floor(heightSegments);
    const segment_width = width / gridX;
    const segment_height = height / gridZ;

    for (let iz = 0; iz <= gridZ; iz++) {
        const z = iz * segment_height - height_half;
        for (let ix = 0; ix <= gridX; ix++) {
            const x = ix * segment_width - width_half;
            
            const y = (Math.sin(x * 0.3) + Math.cos(z * 0.3)) * 0.3;
            vertices.push(x, y, z);
            
            const dYdX = 0.3 * Math.cos(x * 0.3);
            const dYdZ = -0.3 * Math.sin(z * 0.3);
            const normal = [-dYdX, 1, -dYdZ];
            const len = Math.hypot(...normal);
            normals.push(normal[0]/len, normal[1]/len, normal[2]/len);
        }
    }

    for (let iz = 0; iz < gridZ; iz++) {
        for (let ix = 0; ix < gridX; ix++) {
            const a = ix + (gridX + 1) * iz;
            const b = ix + 1 + (gridX + 1) * iz;
            const c = ix + (gridX + 1) * (iz + 1);
            const d = ix + 1 + (gridX + 1) * (iz + 1);
            indices.push(a, b, d);
            indices.push(a, d, c);
        }
    }
    return { vertices, normals, indices };
}

function createCrystal(height, radius, sides = 6) {
    const vertices = [];
    const normals = [];
    const indices = [];
    
    const apex = [0, height, 0];
    vertices.push(...apex);
    normals.push(0, 1, 0);

    const midHeight = height * 0.7;

    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * 2 * Math.PI;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        vertices.push(x, midHeight, z); 
        vertices.push(x, 0, z);    
    }


    for (let i = 0; i < sides; i++) {
        const angleMid = ((i + 0.5) / sides) * 2 * Math.PI;
        const nx = Math.cos(angleMid);
        const nz = Math.sin(angleMid);
        const ny = radius / (height - midHeight);
        let len = Math.hypot(nx, ny, nz);
        normals.push(nx/len, ny/len, nz/len); 
        normals.push(nx/len, ny/len, nz/len); 
    }

    for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;

        const mid1 = 2 * i + 1;
        const base1 = 2 * i + 2;
        const mid2 = 2 * next + 1;
        const base2 = 2 * next + 2;

        indices.push(0, mid1, mid2);

        indices.push(mid1, base1, base2);
        indices.push(mid1, base2, mid2);
    }
    
    const baseCenterIndex = vertices.length / 3;
    vertices.push(0,0,0);
    normals.push(0,-1,0);
    for (let i = 0; i < sides; i++) {
        indices.push(baseCenterIndex, 2*((i+1)%sides)+2, 2*i+2);
    }

    return { vertices, normals, indices };
}


function createCrystalClusterA(options) {
    const { crystalBuffers, color, glowing } = options;
    const cluster = new SceneNode();

    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0, 0, 0], rotation: [0, 0.2, 0], scale: [1, 1, 1] },
        color: color,
        isGlowing: glowing,
    }));

    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0.8, 0.1, 0.2], rotation: [0.3, -0.5, -0.4], scale: [0.4, 0.6, 0.4] },
        color: color,
        isGlowing: glowing,
    }));
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [-0.7, 0, 0.4], rotation: [-0.4, 0.8, 0.6], scale: [0.5, 0.7, 0.5] },
        color: color,
        isGlowing: glowing,
    }));
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0.8, 0.2, 0.2], rotation: [0.4, 0.2, -1.5], scale: [0.3, 0.5, 0.3] },
        color: color,
        isGlowing: glowing,
    }));

    return cluster;
}

function createCrystalClusterB(options) {
    const { crystalBuffers, color, glowing } = options;
    const cluster = new SceneNode();

    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0, 0, 0], rotation: [0.1, -0.1, -0.1], scale: [0.6, 1.2, 0.6] },
        color: color,
        isGlowing: glowing,
    }));

    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0.6, 0, 0.5], rotation: [-0.5, -0.8, -0.6], scale: [0.3, 0.4, 0.3] },
        color: color,
        isGlowing: glowing,
    }));
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [-0.2, 0, 0.7], rotation: [0.6, 2.5, -0.5], scale: [0.25, 0.5, 0.25] },
        color: color,
        isGlowing: glowing,
    }));
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [-0.6, 0, -0.6], rotation: [0.5, -1.2, 0.8], scale: [0.4, 0.8, 0.4] },
        color: color,
        isGlowing: glowing,
    }));

    return cluster;
}

  root.addChild(haunterRootNode);
  const headNode = new SceneNode({
    buffers: headBuf,
    localTransform: { position: [0, -0.2, 0], rotation: [0,0,0], scale: [1.2, 1.05, 1.2] },
    color: [0.557, 0.471, 0.710, 1.0]
  });
  haunterRootNode.addChild(headNode);

  const tailNode = new SceneNode({
    buffers: tailBuf,
    localTransform: { 
      position: [0, -0.7, -0.65], 
      rotation: [-115 * Math.PI / 180, Math.PI / 18, 0], 
      scale: [1.4, 1, 1.25]
    },
    color: [0.557, 0.471, 0.710, 1.0]
  });
  headNode.addChild(tailNode);

const leftEyeWhite = new SceneNode({
    buffers: eyeBuffers,
    localTransform: {
        position: [-0.33, 0.364, 0.86],
        rotation: [-0.4, -0.3, -3.79],
        scale: [0.480 * eyeScaleFactor, 0.835 * eyeScaleFactor, 0.08 * eyeScaleFactor]
    },
    color: [0.0, 0.0, 0.0, 1.0]
});
headNode.addChild(leftEyeWhite);

const leftEyeOutline = new SceneNode({
    buffers: eyeBuffers,
    localTransform: {
        position: [-0.33, 0.365, 0.865],
        rotation: [-0.4, -0.3, -3.8],
        scale: [0.465 * eyeScaleFactor, 0.788 * eyeScaleFactor, 0.1 * eyeScaleFactor]
    },
    color: [1.0, 1.0, 1.0, 1.0]
});
headNode.addChild(leftEyeOutline);

 const rightEyeWhite = new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [0.33, 0.365, 0.86],
            rotation: [-0.4, 0.3, 3.8],
            scale: [0.465  * eyeScaleFactor, 0.788 * eyeScaleFactor, 0.1 * eyeScaleFactor]
        },
        color: [1.0, 1.0, 1.0, 1.0]
    });
    headNode.addChild(rightEyeWhite);

    headNode.addChild(new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [0.33, 0.364, 0.86],
            rotation: [-0.4, 0.3, 3.79],
            scale: [0.480 * eyeScaleFactor, 0.835 * eyeScaleFactor, 0.08 * eyeScaleFactor]
        },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    const innerPupilColor = [0.8, 0.8, 0.8, 1.0];
    const outerPupilColor = [0.2, 0.2, 0.1, 1.0];

    headNode.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [-0.2625, 0.39, 0.98],
            rotation: [-1.2, -1.5, -3.85],
            scale: [0.013 * eyeScaleFactor, 0.183 * eyeScaleFactor, 0.025 * eyeScaleFactor]
        },
        color: innerPupilColor
    }));

    headNode.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [-0.26, 0.379, 0.92],
            rotation: [-1, 2 , 4],
            scale: [0.2 * eyeScaleFactor, 3 * eyeScaleFactor, 1 * eyeScaleFactor]
        },
        color: outerPupilColor
    }));

    headNode.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [0.2625, 0.39, 0.98],
            rotation: [-1.2, 1.5, 3.85],
            scale: [0.013 * eyeScaleFactor, 0.183 * eyeScaleFactor, 0.025 * eyeScaleFactor]
        },
        color: innerPupilColor
    }));

    headNode.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [0.26, 0.379, 0.91],
            rotation: [-1, 1, 4],
            scale: [0.2 * eyeScaleFactor, 3 * eyeScaleFactor, 1 * eyeScaleFactor]
        },
        color: outerPupilColor
    }));
    
function createSpikeNode(gl, position, rotation, scale, color) {
  const spikeBuf = createConeBuffer(gl, 0.1, 0.3, 1000);
  return new SceneNode({
    buffers: spikeBuf,
    localTransform: { position, rotation, scale },
    color,
  });
}

function createTailSpikeNode(gl, position, rotation, scale, color) {
  const spikeBuf = createConeBuffer(gl, 0.05, 0.35, 24);
  return new SceneNode({
    buffers: spikeBuf,
    localTransform: { position, rotation, scale },
    color,
  });
}


const spikeColor = [0.557, 0.471, 0.710, 1.0];

const headSpikes = [
  { pos: [-0.6, 0.5, -0.2],  rot: [0, -Math.PI / 6, Math.PI / 5], scale: [4, 4, 4] },
  { pos: [-0.85, 0.1, -0.2], rot: [0, -Math.PI / 7, Math.PI / 3], scale: [2.5, 2.5, 2.5] },
  { pos: [-0.9, -0.2, -0.15], rot: [0, -Math.PI / 8, Math.PI / 2], scale: [1.5, 1.5, 1.5] },
  { pos: [0.6, 0.5, -0.2],   rot: [0, Math.PI / 6, -Math.PI / 5], scale: [4, 4, 4] },
  { pos: [0.85, 0.1, -0.2],  rot: [0, Math.PI / 7, -Math.PI / 3], scale: [2.5, 2.5, 2.5] },
  { pos: [0.9, -0.2, -0.15],  rot: [0, Math.PI / 8, -Math.PI / 2], scale: [1.5, 1.5, 1.5] },
];
for (const s of headSpikes) {
  const spikeNode = createSpikeNode(gl, s.pos, s.rot, s.scale, spikeColor);
  headNode.addChild(spikeNode);
}

const tailSpikes = [
  { pos: [0, -0.8, -1], rot: [-Math.PI * 0.5, 0, 0], scale: [1.2, 1.2, 1.2] },
  { pos: [0, -0.95, -0.85], rot: [-Math.PI * 0.68, 0, 0], scale: [1.2, 1.2, 1.2] },
];

for (const s of tailSpikes) {
  const spikeNode = createTailSpikeNode(gl, s.pos, s.rot, s.scale, spikeColor);
  headNode.addChild(spikeNode);
}

const leftHandNode = new SceneNode({
    localTransform: {
        position: [-1.3, -0.5, 0.5],
        rotation: [Math.PI / 2, Math.PI / 8, 0],
        scale: [0.7, 0.7, 0.7]
    }
});
haunterRootNode.addChild(leftHandNode);

const armNodeLeft = new SceneNode({
    buffers: armBuf,
    localTransform: { position: [0, -0.1, 0], rotation: [0, 0, 0.1], scale: [0.6, 0.4, 0.6] }, // Mirrored Z rotation
    color: spikeColor
});
leftHandNode.addChild(armNodeLeft);

const palmGroupNodeLeft = new SceneNode({
    localTransform: { position: [0, 0.2, 0], rotation: [-Math.PI / 2, 0, 0], scale: [0.9, 0.7, 0.9] }
});
leftHandNode.addChild(palmGroupNodeLeft);

const palmNodeLeft = new SceneNode({
    buffers: palmBuf,
    localTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.6, 0.5, 0.6] },
    color: spikeColor
});
palmGroupNodeLeft.addChild(palmNodeLeft);

const fingerData = [ 
    { pos: [-0.25, 0.05, 0.5], rot: [0.9, 0.5, 0], scale: [0.25, 0.315, 0.25] },
    { pos: [0, 0.15, 0.55],   rot: [1.1, 0, 0],    scale: [0.25, 0.26, 0.22] },
    { pos: [0.25, 0.05, 0.5],  rot: [0.9, -0.5, 0], scale: [0.25, 0.315, 0.25] },
    { pos: [-0.25, 0.1, 0.95], rot: [-0.9, 0.5, 0], scale: [0.2, 0.27, 0.2] },
    { pos: [0, 0.15, 1.1],   rot: [-1.1, 0, 0],    scale: [0.2, 0.315, 0.2] },
    { pos: [0.25, 0.05, 0.95],  rot: [-0.9, -0.5, 0], scale: [0.2, 0.27, 0.2] }
];

for (const data of fingerData) {
    const fingerBase = new SceneNode({
        buffers: fingerBaseBuf,
        localTransform: { position: data.pos, rotation: data.rot, scale: data.scale },
        color: spikeColor
    });
    palmNodeLeft.addChild(fingerBase); 

    const fingerMiddle = new SceneNode({
        buffers: fingerBaseBuf, 
        localTransform: {
            position: [0, 0.75, 0],   
            rotation: [Math.PI, 0, 0], 
            scale: [0.8, 0.7, 0.8]
        },
        color: spikeColor
    });
    fingerBase.addChild(fingerMiddle);

    const fingerTip = new SceneNode({
        buffers: fingerTipBuf,
        localTransform: {
            position: [0, -0.8, 0], 
            rotation: [Math.PI, 0, 0],
            scale: [0.8, 0.6, 0.8]
        },
        color: spikeColor
    });
    fingerBase.addChild(fingerTip);
}

const rightHandNode = new SceneNode({
    localTransform: {
        position: [1.3, -0.5, 0.5],
        rotation: [Math.PI / 2, -Math.PI / 8, 0],
        scale: [0.7, 0.7, 0.7]
    }
});
haunterRootNode.addChild(rightHandNode);

const armNodeRight = new SceneNode({
    buffers: armBuf,
    localTransform: { position: [0, -0.1, 0], rotation: [0, 0, -0.1], scale: [0.6, 0.4, 0.6] },
    color: spikeColor
});
rightHandNode.addChild(armNodeRight);

const palmGroupNodeRight = new SceneNode({
    localTransform: { position: [0, 0.2, 0], rotation: [-Math.PI / 2, 0, 0], scale: [0.9, 0.7, 0.9] }
});
rightHandNode.addChild(palmGroupNodeRight);

const palmNodeRight = new SceneNode({
    buffers: palmBuf,
    localTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.6, 0.5, 0.6] },
    color: spikeColor
});
palmGroupNodeRight.addChild(palmNodeRight);

for (const data of fingerData) {
    const fingerBase = new SceneNode({
        buffers: fingerBaseBuf,
        localTransform: { position: data.pos, rotation: data.rot, scale: data.scale },
        color: spikeColor
    });
    palmNodeRight.addChild(fingerBase);

    const fingerMiddle = new SceneNode({
        buffers: fingerBaseBuf,
        localTransform: { position: [0, 0.75, 0], rotation: [Math.PI, 0, 0], scale: [0.8, 0.7, 0.8] },
        color: spikeColor
    });
    fingerBase.addChild(fingerMiddle);

    const fingerTip = new SceneNode({
        buffers: fingerTipBuf,
        localTransform: {
            position: [0, -0.8, 0],
            rotation: [Math.PI, 0, 0],
            scale: [0.8, 0.6, 0.8]
        },
        color: spikeColor
    });
    fingerBase.addChild(fingerTip);
}

const mouthNode = new SceneNode({
    buffers: mouthBuf,
    localTransform: {
        position: [0, -0.1, 0.99], 
        rotation: [0.1, 0, 0],
        scale: [0.9, 0.7, 0.7]      
    },
    color: [0.8, 0.4, 0.5, 1.0] 
});
headNode.addChild(mouthNode);

const topTeethCurve = [
    [-0.7, 0.17, -0.28], 
    [-0.2, 0.17, 0.1],
    [0.2, 0.17, 0.1],
    [0.7, 0.17, -0.28]
];
const bottomTeethCurve = [
    [-0.5, 0.23, -0.15],
    [-0.4, -0.25, 0.07],
    [0.4, -0.25, 0.07],
    [0.5, 0.23, -0.15]
];

const topTeethCount = 4;
for (let i = 0; i < topTeethCount; i++) {
    const t_val = (i + 1) / (topTeethCount + 1); 
    const bezierPos = bezier(t_val, ...topTeethCurve);
    
    const toothNode = new SceneNode({
        buffers: toothBuf,
        localTransform: {
            position: bezierPos,
            rotation: [-0.5, 0.5, Math.PI], 
            scale: [1, 1, 1]
        },
        color: [0.557, 0.471, 0.710, 1.0]
    });
    mouthNode.addChild(toothNode);
}

const bottomTeethCount = 6;
for (let i = 0; i < bottomTeethCount; i++) {
    const t_val = 0.2 + (i * 0.12);
    const bezierPos = bezier(t_val, ...bottomTeethCurve);

    const toothNode = new SceneNode({
        buffers: toothBuf,
        localTransform: {
            position: bezierPos,
            rotation: [0.3, 0, 0], 
            scale: [0.8, 0.8, 0.8]
        },
        color: [0.557, 0.471, 0.710, 1.0]
    });
    mouthNode.addChild(toothNode); 
}

canvas.style.cursor = 'grab';
  canvas.addEventListener('mousedown', (e) => { dragging = true; last = { x: e.clientX, y: e.clientY }; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup', () => { dragging = false; canvas.style.cursor = 'grab'; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    cameraRotation.y += dx * 0.01;
    cameraRotation.x += dy * 0.01;
    cameraRotation.x = Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, cameraRotation.x));
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cameraDistance += e.deltaY * 0.01; cameraDistance = Math.max(2.0, Math.min(20.0, cameraDistance)); }, { passive: false });

  function render(time) {
    time *= 0.001; 
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
    }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.12, 0.05, 0.09, 1.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, 45 * Math.PI/180, gl.canvas.width / gl.canvas.height, 0.1, 100.0);

    const viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, [0, 0, -cameraDistance]);
    mat4.rotate(viewMatrix, viewMatrix, cameraRotation.x, [1, 0, 0]);
    mat4.rotate(viewMatrix, viewMatrix, cameraRotation.y, [0, 1, 0]);

    gl.useProgram(programInfo.program);
    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
    gl.uniform3fv(programInfo.uniformLocations.lightPosition, [6.0, 6.0, 6.0]);
    gl.uniform3fv(programInfo.uniformLocations.viewPosition, [0.0, 0.0, cameraDistance]);

    const amplitude = 0.03;
    const toothSpeed = 4;
    for (const tooth of allTeeth) {
        if (tooth.initialY === undefined) {
             tooth.initialY = tooth.localTransform.position[1];
        }
        const newY = tooth.initialY + amplitude * Math.sin(time * toothSpeed);
        tooth.localTransform.position[1] = newY;
    }

    let currentRotation = 0; 
    if (isFlipping) {
        const elapsedTime = time - lastFlipTime;
        if (elapsedTime < flipDuration) {
            const progress = elapsedTime / flipDuration;
            currentRotation = -progress * 2 * Math.PI; 
        } else {
            isFlipping = false;
            currentRotation = 0;
        }
    } else {
        if (time - lastFlipTime >= flipInterval) {
            isFlipping = true;
            lastFlipTime = time;
            currentRotation = 0;
        } else {
             currentRotation = 0;
        }
    }
    haunterRootNode.localTransform.rotation[0] = currentRotation; 

   const idleAmplitude = 0.1;  
    const idleSpeed = 2;    
    const initialRootY = 0;   
    const breathAmplitude = 0.05; 
    const baseScale = 1.0;    

    const sinValue = Math.sin(time * idleSpeed);

    haunterRootNode.localTransform.position[1] = initialRootY + idleAmplitude * sinValue;

    const currentScale = baseScale + ((sinValue + 1) / 2) * breathAmplitude;

    haunterRootNode.localTransform.scale[0] = currentScale;
    haunterRootNode.localTransform.scale[1] = currentScale;
    haunterRootNode.localTransform.scale[2] = currentScale;

   drawNode(gl, programInfo, root, null, viewMatrix);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

function drawNode(gl, programInfo, node, parentWorldMatrix, viewMatrix) {
  const worldMatrix = node.getWorldMatrix(parentWorldMatrix);
  const modelViewMatrix = mat4.create();
  mat4.multiply(modelViewMatrix, viewMatrix, worldMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, modelViewMatrix);
  mat4.transpose(normalMatrix, normalMatrix);

  if (node.buffers) {
    gl.bindBuffer(gl.ARRAY_BUFFER, node.buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, node.buffers.normal);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, node.buffers.indices);

    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);
    gl.uniform4fv(programInfo.uniformLocations.objectColor, node.color);

    gl.drawElements(gl.TRIANGLES, node.buffers.vertexCount, gl.UNSIGNED_SHORT, 0);
  }

  for (const child of node.children) drawNode(gl, programInfo, child, worldMatrix, viewMatrix);
}

window.addEventListener('load', () => setTimeout(main, 10));