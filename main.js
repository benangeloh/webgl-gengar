let gl;
let programInfo;
let buffers = {};
let animation = 'idle';
let time = 0;
let rotation = 0;

// Vertex Shader
const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec3 aVertexNormal;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform mat4 uNormalMatrix;
    
    varying highp vec3 vNormal;
    varying highp vec3 vViewPos;

    void main() {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
        
        vViewPos = (uModelViewMatrix * aVertexPosition).xyz;
        vNormal = (uNormalMatrix * vec4(aVertexNormal, 0.0)).xyz;
    }
`;

// Fragment Shader  
const fsSource = `
    precision mediump float;

    varying highp vec3 vNormal;
    varying highp vec3 vViewPos;

    uniform vec3 uLightPosition;
    uniform vec4 uObjectColor;
    uniform bool uIsGlowing;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(-vViewPos);

        // fresnel effect (edge highlight)
        float fresnelPower = 1.0;
        float fresnel = pow(1.1 - dot(viewDir, normal), fresnelPower);
        vec3 fresnelColor = vec3(0.8, 0.2, 0.5);

        vec3 secondaryColor = vec3(0.9, 0.6, 0.8);
        float mixFactor = abs(normal.y) * 0.2 + abs(normal.x) * 0.2;
        vec3 baseColor = mix(uObjectColor.rgb, secondaryColor, mixFactor);

        vec3 lightDir = normalize(uLightPosition - vViewPos);
        float diff = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diff * vec3(0.85, 0.7, 0.8);

        vec3 finalColor;

        if (uIsGlowing) {
            finalColor = baseColor * 0.8 + fresnel * fresnelColor * 2.0;
            finalColor += diffuse * baseColor * 0.2; 
        } else {
            vec3 ambient = vec3(0.2, 0.05, 0.15);
            vec3 shadowColor = vec3(0.4, 0.1, 0.3);
            vec3 litColor = (ambient + diffuse) * baseColor;
            vec3 shadedColor = shadowColor * baseColor;
            finalColor = mix(shadedColor, litColor, diff);
            finalColor += fresnel * fresnelColor * 0.005;
        }
        
        gl_FragColor = vec4(finalColor, uObjectColor.a);
    }
`;

// ============================================
// MATRIX OPERATIONS LIBRARY
// ============================================

function createMat4() {
    return new Float32Array(16);
}

function identity(out) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
}

function perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
    return out;
}

function translate(out, a, v) {
    const x = v[0], y = v[1], z = v[2];
    if (out === a) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
        out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
        out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
        out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    }
    return out;
}

function rotateX(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    
    if (out !== a) {
        out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
}

function rotateY(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    
    if (out !== a) {
        out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
}

function rotateZ(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    
    if (out !== a) {
        out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
}

function scale(out, a, v) {
    const x = v[0], y = v[1], z = v[2];
    out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
    out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
    out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
    if (out !== a) {
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    return out;
}

function multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
}

function invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
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
    if (!det) { return null; }
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
}

function transpose(out, a) {
    if (out === a) {
        const a01 = a[1], a02 = a[2], a03 = a[3];
        const a12 = a[6], a13 = a[7];
        const a23 = a[11];
        out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
        out[4] = a01; out[6] = a[9]; out[7] = a[13];
        out[8] = a02; out[9] = a12; out[11] = a[14];
        out[12] = a03; out[13] = a13; out[14] = a23;
    } else {
        out[0] = a[0]; out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
        out[4] = a[1]; out[5] = a[5]; out[6] = a[9]; out[7] = a[13];
        out[8] = a[2]; out[9] = a[6]; out[10] = a[10]; out[11] = a[14];
        out[12] = a[3]; out[13] = a[7]; out[14] = a[11]; out[15] = a[15];
    }
    return out;
}

function copy(out, a) {
    out.set(a);
    return out;
}

// class for hierarchical transformations
class SceneNode {
    constructor(options = {}) {
        this.buffers = options.buffers || null;
        this.localTransform = options.localTransform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
        this.color = options.color || [1, 1, 1, 1];
        this.isGlowing = options.isGlowing || false;
        this.isTransparent = options.isTransparent || false;  
        this.children = [];
        this.parent = null;
    }

    addChild(child) {
        this.children.push(child);
        child.parent = this;
    }

    getLocalMatrix() {
        const m = createMat4();
        identity(m);
        translate(m, m, this.localTransform.position);
        rotateX(m, m, this.localTransform.rotation[0]);
        rotateY(m, m, this.localTransform.rotation[1]);
        rotateZ(m, m, this.localTransform.rotation[2]);
        scale(m, m, this.localTransform.scale);
        return m;
    }

    getWorldMatrix(parentWorldMatrix = null) {
        const localMatrix = this.getLocalMatrix();
        if (parentWorldMatrix) {
            const worldMatrix = createMat4();
            multiply(worldMatrix, parentWorldMatrix, localMatrix);
            return worldMatrix;
        }
        return localMatrix;
    }
}
function rotateAroundArbitraryAxis(point, axis, angle) {
    const [x, y, z] = point;
    const [ax, ay, az] = normalizeVector(axis);
    
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const oneMinusCosA = 1 - cosA;
    
    const rotationMatrix = [
        cosA + ax*ax*oneMinusCosA,     ax*ay*oneMinusCosA - az*sinA, ax*az*oneMinusCosA + ay*sinA,
        ay*ax*oneMinusCosA + az*sinA, cosA + ay*ay*oneMinusCosA,     ay*az*oneMinusCosA - ax*sinA,
        az*ax*oneMinusCosA - ay*sinA, az*ay*oneMinusCosA + ax*sinA, cosA + az*az*oneMinusCosA
    ];
    
    const newX = x * rotationMatrix[0] + y * rotationMatrix[1] + z * rotationMatrix[2];
    const newY = x * rotationMatrix[3] + y * rotationMatrix[4] + z * rotationMatrix[5];
    const newZ = x * rotationMatrix[6] + y * rotationMatrix[7] + z * rotationMatrix[8];
    
    return [newX, newY, newZ];
}

function normalizeVector(v) {
    const [x, y, z] = v;
    const len = Math.sqrt(x*x + y*y + z*z);
    if (len === 0) return [0, 0, 0];
    return [x/len, y/len, z/len];
}

function updatePoisonGasStream(now, mouthNode) {
    // Arbitrary axis: diagonal keluar dari mulut (miring ke kanan-atas-depan)
    const streamAxis = [0., 0., 5]; 
    
    // Cari gas particles (children setelah fangs)
    mouthNode.children.forEach((child, index) => {
        // Skip fangs (index 0 dan 1 adalah fang)
        if (index >= 2) {
            const particle = child;
            const particleIndex = index - 2;
            
            // Stream keluar dari mulut
            const streamSpeed = 1;
            const time = now * streamSpeed - particleIndex * 0.001; // Delay per partikel
            
            // Base position: spiral keluar
            const angle = time * 3 + particleIndex * 0.5;
            const distance = particleIndex * 1 + (time % 3.0); // Makin jauh makin ke depan
            const spiralRadius = 0.3 + particleIndex * 0.1; // Makin lebar
            
            const streamX = Math.cos(angle) * spiralRadius;
            const streamY = Math.sin(angle) * spiralRadius * 0.5; // Lebih flat vertikal
            const streamZ = distance; // Keluar ke depan (Z positif)
            
            // Rotate pada arbitrary axis untuk efek stream miring
            const rotatedPos = rotateAroundArbitraryAxis(
                [streamX, streamY, streamZ],
                streamAxis,
                angle * 0.3
            );
            
            particle.localTransform.position[0] = rotatedPos[0];
            particle.localTransform.position[1] = rotatedPos[1];
            particle.localTransform.position[2] = rotatedPos[2];
            
            // Rotasi partikel sendiri
            particle.localTransform.rotation[0] = angle * 2;
            particle.localTransform.rotation[1] = angle * 1.5;
            
            // Fade out semakin jauh
            const fadeDistance = distance / 2.0;
            particle.color[3] = Math.max(0.1, 0.8 - fadeDistance);
            
            // Scale mengecil semakin jauh (dispersi gas)
            const scaleBase = 0.5;
            const scaleFactor = 1.0 + particleIndex * 0.15;
            particle.localTransform.scale[0] = scaleBase * scaleFactor;
            particle.localTransform.scale[1] = scaleBase * scaleFactor;
            particle.localTransform.scale[2] = scaleBase * scaleFactor;
        }
    });
}


// ============================================
// GASTLY BUILDER
// ============================================
function createGastlyNode(buffers) {
    const body = new SceneNode({
        buffers: buffers.gastlyBody,
        localTransform: { position: [0.0, 0.0, 0.0], rotation: [0.0, 0.0, 0.0], scale: [1.5, 1.5, 1.5] },
        color: [0., 0., 0., 0.9],
        isGlowing: false
    });
    
    const initialBodyScaleY = body.localTransform.scale[1];
    
    //mouth (children of body)
    const mouth = new SceneNode({
        buffers: buffers.gastlyMouth,
        localTransform: {
            position: [0, -0.2, 1],
            rotation: [0.2, 0.0, 0.0],
            scale: [0.6, 0.5 , 1.0]
        },
        color: [0.25, 0.0, 0.2, 2.0],
        isGlowing: false
    });
    body.addChild(mouth);

    //fang (children of mouth)
    const Leftfang = new SceneNode({
        buffers: buffers.gastlyFang,
        localTransform: {
            position: [-0.7, 0.05, -0.13],
            rotation: [Math.PI, 0.0, 0.0],
            scale: [1.5, 1.5 , 1.5]
        },
        color: [0.92, 0.92, 0.95, 1.0],
        isGlowing: false
    });
    mouth.addChild(Leftfang);

    const Rightfang = new SceneNode({
        buffers: buffers.gastlyFang,
        localTransform: {
            position: [0.7, 0.05, -0.13],
            rotation: [Math.PI, 0.0, 0.0],
            scale: [1.5, 1.5 , 1.5]
        },
        color: [0.92, 0.92, 0.95, 1.0],
        isGlowing: false
    });
    mouth.addChild(Rightfang);


    for (let i = 0; i < 5; i++) {
        const gasParticle = new SceneNode({
            buffers: buffers.gastlyGasAura, // Gunakan buffer gas aura yang sama
            localTransform: {
                position: [0, 0, 0], // Awalnya di dalam mulut
                rotation: [0, 0, 0],
                scale: [0.01, 0.01, 0.01]
            },
            color: [0.52, 0.32, 0.62, 0.15],
            isGlowing: true,
            isTransparent: true
        });
        mouth.addChild(gasParticle);
    }

    // Eyes (children of body)
    const leftEye = new SceneNode({
        buffers: buffers.gastlyEye,
        localTransform: {
            position: [-0.6, 0.2, 0.89],
            rotation: [3, 0.2, 0.7],
            scale: [4, 4, 0.1]
        },
        color: [0.92, 0.92, 0.95, 1.0],
        isGlowing: false
    });
    body.addChild(leftEye);

    const leftPupil = new SceneNode({
        buffers: buffers.gastlyPupil,
        localTransform: {
            position: [0.05, -0.04, -0.05],
            rotation: [3, 0.0, -0.7],
            scale: [0.1, 0.1, 0.1]
        },
        color: [0.05, 0.05, 0.15, 1.0],
        isGlowing: false
    });
    leftEye.addChild(leftPupil);


    const rightEye = new SceneNode({
        buffers: buffers.gastlyEye,
        localTransform: {
            position: [0.6, 0.2, 0.89],
            rotation: [3, -0.2, -0.7],
            scale: [4, 4, 0.1]
        },
        color: [0.92, 0.92, 0.95, 1.0],
        isGlowing: false
    });
    body.addChild(rightEye);

    const rightPupil = new SceneNode({
        buffers: buffers.gastlyPupil,
        localTransform: {
            
            position: [-0.05, -0.04, -0.05],
            rotation: [3, 0.0, -0.7],
            scale: [0.1, 0.1, 0.1]
        },
        color: [0.05, 0.05, 0.15, 1.0],
        isGlowing: false
    });
    rightEye.addChild(rightPupil);

    // Gas aura di sekeliling Gastly
    const gasAuraNode = new SceneNode({
        buffers: buffers.gastlyGasAura,
        localTransform: {
            position: [0.0, 0.5, -0.85],
            rotation: [0.0, 0.0, 0.0],
            scale: [2.0, 2.0, 2.0]
        },
        color: [0.52, 0.32, 0.62, 0.15],
        isGlowing: true,
        isTransparent: true
    });
    body.addChild(gasAuraNode);
    // Additional small gas particles
    const orbitingGasParticles = [];
    for (let i = 0; i < 8; i++) {
        
        const gasParticle = new SceneNode({
            buffers: buffers.gastlyGasAura,
            localTransform: {
                position: [
                    Math.sin(i * 0.8) * 2.5,
                    Math.cos(i * 1.2) * 1.5,
                    Math.sin(i * 0.6) * 2.0
                ],
                rotation: [0, i * 0.5, 0],
                scale: [0.2, 0.2, 0.2]
            },
            color: [0.52, 0.32, 0.62, 0.3],
            isGlowing: true,
            isTransparent: true
        });
        gasAuraNode.addChild(gasParticle);
        orbitingGasParticles.push(gasParticle);
    }

    return {
        modelRoot: body, // The main node to add to the scene
        initialBodyScaleY: initialBodyScaleY, // For breath animation
        mouthNode: mouth, // Needed for poison gas stream animation
        leftEyeNode: leftEye, // For glow animation
        rightEyeNode: rightEye, // For glow animation
        gasAuraNode: gasAuraNode, // For rotation animation
        orbitingGasParticles: orbitingGasParticles, // For orbiting animation

        initials: {
            bodyPos: [...body.localTransform.position]
        }
    }; 
}

// ============================================
// HAUNTER BUILDER
// ============================================
function createHaunterNode(buffers) { // Takes the main buffers object

    const haunterRootNode = new SceneNode(); // Main node for Haunter's transforms (like flip)

    const headNode = new SceneNode({
        buffers: buffers.haunterHead, // Use buffer from object
        localTransform: { position: [0, -0.2, 0], rotation: [0,0,0], scale: [1.05, 1.1, 1.1] },
        color: [0.557, 0.471, 0.710, 1.0]
    });
    haunterRootNode.addChild(headNode);

    const tailNode = new SceneNode({
        buffers: buffers.haunterTail, // Use buffer from object
        localTransform: { 
            position: [0, -0.7, -0.65], 
            rotation: [-115 * Math.PI / 180, Math.PI / 18, 0], 
            scale: [1.4, 1, 1.25]
        },
        color: [0.557, 0.471, 0.710, 1.0]
    });
    headNode.addChild(tailNode);

    const eyeScaleFactor = 1.4; // Keep this constant defined here

    // Left Eye Black Background
    const leftEyeWhite = new SceneNode({
        buffers: buffers.haunterEye, // Use buffer from object
        localTransform: { position: [-0.33, 0.364, 0.86], rotation: [-0.4, -0.3, -3.79], scale: [0.480 * eyeScaleFactor, 0.835 * eyeScaleFactor, 0.08 * eyeScaleFactor] },
        color: [0.0, 0.0, 0.0, 1.0]
    });
    headNode.addChild(leftEyeWhite);

    // Left Eye White Outline/Shape
    const leftEyeOutline = new SceneNode({
        buffers: buffers.haunterEye, // Use buffer from object
        localTransform: { position: [-0.33, 0.365, 0.865], rotation: [-0.4, -0.3, -3.8], scale: [0.465 * eyeScaleFactor, 0.788 * eyeScaleFactor, 0.1 * eyeScaleFactor] },
        color: [1.0, 1.0, 1.0, 1.0]
    });
    headNode.addChild(leftEyeOutline);

    // Right Eye White Shape/Outline
    const rightEyeWhite = new SceneNode({
        buffers: buffers.haunterEye, // Use buffer from object
        localTransform: { position: [0.33, 0.365, 0.86], rotation: [-0.4, 0.3, 3.8], scale: [0.465 * eyeScaleFactor, 0.788 * eyeScaleFactor, 0.1 * eyeScaleFactor] },
        color: [1.0, 1.0, 1.0, 1.0]
    });
    headNode.addChild(rightEyeWhite);

    // Right Eye Black Background
    headNode.addChild(new SceneNode({
        buffers: buffers.haunterEye, // Use buffer from object
        localTransform: { position: [0.33, 0.364, 0.86], rotation: [-0.4, 0.3, 3.79], scale: [0.480 * eyeScaleFactor, 0.835 * eyeScaleFactor, 0.08 * eyeScaleFactor] },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    // Pupil colors
    const innerPupilColor = [0.8, 0.8, 0.8, 1.0];
    const outerPupilColor = [0.2, 0.2, 0.1, 1.0];

    // Left Outer Pupil
    headNode.addChild(new SceneNode({
        buffers: buffers.haunterPupil, // Use buffer from object
        localTransform: { position: [-0.26, 0.379, 0.92], rotation: [-1, 2 , 4], scale: [0.2 * eyeScaleFactor, 3 * eyeScaleFactor, 1 * eyeScaleFactor] },
        color: outerPupilColor
    }));

    // Right Outer Pupil
    headNode.addChild(new SceneNode({
        buffers: buffers.haunterPupil, // Use buffer from object
        localTransform: { position: [0.26, 0.379, 0.91], rotation: [-1, 1, 4], scale: [0.2 * eyeScaleFactor, 3 * eyeScaleFactor, 1 * eyeScaleFactor] },
        color: outerPupilColor
    }));
        
    // Spikes - Using a single cone buffer for simplicity
    const spikeColor = [0.557, 0.471, 0.710, 1.0];
    const spikeBuffer = buffers.haunterTooth; // Reuse tooth buffer or create a dedicated spike buffer if different

    const headSpikes = [
        { pos: [-0.6, 0.5, -0.2],  rot: [0, -Math.PI / 6, Math.PI / 5], scale: [4, 4, 4] },
        { pos: [-0.85, 0.1, -0.2], rot: [0, -Math.PI / 7, Math.PI / 3], scale: [2.5, 2.5, 2.5] },
        { pos: [-0.9, -0.2, -0.15], rot: [0, -Math.PI / 8, Math.PI / 2], scale: [1.5, 1.5, 1.5] },
        { pos: [0.6, 0.5, -0.2],   rot: [0, Math.PI / 6, -Math.PI / 5], scale: [4, 4, 4] },
        { pos: [0.85, 0.1, -0.2],  rot: [0, Math.PI / 7, -Math.PI / 3], scale: [2.5, 2.5, 2.5] },
        { pos: [0.9, -0.2, -0.15],  rot: [0, Math.PI / 8, -Math.PI / 2], scale: [1.5, 1.5, 1.5] },
    ];
    for (const s of headSpikes) {
        headNode.addChild(new SceneNode({
            buffers: spikeBuffer, // Use the selected buffer
            localTransform: { position: s.pos, rotation: s.rot, scale: s.scale },
            color: spikeColor,
        }));
    }

    const tailSpikes = [
        { pos: [0, -0.8, -1], rot: [-Math.PI * 0.5, 0, 0], scale: [1.2, 1.2, 1.2] },
        { pos: [0, -0.95, -0.85], rot: [-Math.PI * 0.68, 0, 0], scale: [1.2, 1.2, 1.2] },
    ];
    for (const s of tailSpikes) {
         headNode.addChild(new SceneNode({ // Adding to headNode based on original code
            buffers: spikeBuffer, // Use the selected buffer
            localTransform: { position: s.pos, rotation: s.rot, scale: s.scale },
            color: spikeColor,
        }));
    }

    // Left Hand hierarchy
    const leftHandNode = new SceneNode({
        localTransform: { position: [-1.3, -0.5, 0.5], rotation: [Math.PI / 2, Math.PI / 8, 0], scale: [0.7, 0.7, 0.7] }
    });
    haunterRootNode.addChild(leftHandNode);

    const armNodeLeft = new SceneNode({ buffers: buffers.haunterArm, localTransform: { position: [0, -0.1, 0], rotation: [0, 0, 0.1], scale: [0.6, 0.4, 0.6] }, color: spikeColor });
    leftHandNode.addChild(armNodeLeft);

    const palmGroupNodeLeft = new SceneNode({ localTransform: { position: [0, 0.2, 0], rotation: [-Math.PI / 2, 0, 0], scale: [0.9, 0.7, 0.9] } });
    leftHandNode.addChild(palmGroupNodeLeft);

    const palmNodeLeft = new SceneNode({ buffers: buffers.haunterPalm, localTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.6, 0.5, 0.6] }, color: spikeColor });
    palmGroupNodeLeft.addChild(palmNodeLeft);

    const fingerData = [ /* ... finger data ... */ ]; // Assuming fingerData is defined globally or passed in
    for (const data of fingerData) {
        const fingerBase = new SceneNode({ buffers: buffers.haunterFingerBase, localTransform: { position: data.pos, rotation: data.rot, scale: data.scale }, color: spikeColor });
        palmNodeLeft.addChild(fingerBase); 
        const fingerMiddle = new SceneNode({ buffers: buffers.haunterFingerBase, localTransform: { position: [0, 0.75, 0], rotation: [Math.PI, 0, 0], scale: [0.8, 0.7, 0.8] }, color: spikeColor });
        fingerBase.addChild(fingerMiddle);
        const fingerTip = new SceneNode({ buffers: buffers.haunterFingerTip, localTransform: { position: [0, -0.8, 0], rotation: [Math.PI, 0, 0], scale: [0.8, 0.6, 0.8] }, color: spikeColor });
        fingerBase.addChild(fingerTip);
    }

    // Right Hand hierarchy
    const rightHandNode = new SceneNode({
        localTransform: { position: [1.3, -0.5, 0.5], rotation: [Math.PI / 2, -Math.PI / 8, 0], scale: [0.7, 0.7, 0.7] }
    });
    haunterRootNode.addChild(rightHandNode);

    const armNodeRight = new SceneNode({ buffers: buffers.haunterArm, localTransform: { position: [0, -0.1, 0], rotation: [0, 0, -0.1], scale: [0.6, 0.4, 0.6] }, color: spikeColor });
    rightHandNode.addChild(armNodeRight);

    const palmGroupNodeRight = new SceneNode({ localTransform: { position: [0, 0.2, 0], rotation: [-Math.PI / 2, 0, 0], scale: [0.9, 0.7, 0.9] } });
    rightHandNode.addChild(palmGroupNodeRight);

    const palmNodeRight = new SceneNode({ buffers: buffers.haunterPalm, localTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.6, 0.5, 0.6] }, color: spikeColor });
    palmGroupNodeRight.addChild(palmNodeRight);

    for (const data of fingerData) {
        const fingerBase = new SceneNode({ buffers: buffers.haunterFingerBase, localTransform: { position: data.pos, rotation: data.rot, scale: data.scale }, color: spikeColor });
        palmNodeRight.addChild(fingerBase);
        const fingerMiddle = new SceneNode({ buffers: buffers.haunterFingerBase, localTransform: { position: [0, 0.75, 0], rotation: [Math.PI, 0, 0], scale: [0.8, 0.7, 0.8] }, color: spikeColor });
        fingerBase.addChild(fingerMiddle);
        const fingerTip = new SceneNode({ buffers: buffers.haunterFingerTip, localTransform: { position: [0, -0.8, 0], rotation: [Math.PI, 0, 0], scale: [0.8, 0.6, 0.8] }, color: spikeColor });
        fingerBase.addChild(fingerTip);
    }

    // Mouth node
    const mouthNode = new SceneNode({ buffers: buffers.haunterMouth, localTransform: { position: [0, -0.1, 0.99], rotation: [0.1, 0, 0], scale: [0.9, 0.7, 0.7] }, color: [0.8, 0.4, 0.5, 1.0] });
    headNode.addChild(mouthNode);

    // Teeth data and loops
    const topTeethCurve = [ [-0.7, 0.17, -0.28], [-0.2, 0.17, 0.1], [0.2, 0.17, 0.1], [0.7, 0.17, -0.28] ];
    const bottomTeethCurve = [ [-0.5, 0.23, -0.15], [-0.4, -0.25, 0.07], [0.4, -0.25, 0.07], [0.5, 0.23, -0.15] ];
    const topTeethCount = 4;
    const allTeeth = []; // Store teeth references for animation

    for (let i = 0; i < topTeethCount; i++) {
        const t_val = (i + 1) / (topTeethCount + 1); 
        const bezierPos = bezier(t_val, ...topTeethCurve); // Assuming bezier is defined globally or passed in
        
        const toothNode = new SceneNode({ buffers: buffers.haunterTooth, localTransform: { position: bezierPos, rotation: [-0.5, 0.5, Math.PI], scale: [1, 1, 1] }, color: [0.557, 0.471, 0.710, 1.0] });
        mouthNode.addChild(toothNode);
        allTeeth.push(toothNode); // Add for animation
    }

    const bottomTeethCount = 6;
    for (let i = 0; i < bottomTeethCount; i++) {
        const t_val = 0.2 + (i * 0.12);
        const bezierPos = bezier(t_val, ...bottomTeethCurve); // Assuming bezier is defined

        const toothNode = new SceneNode({ buffers: buffers.haunterTooth, localTransform: { position: bezierPos, rotation: [0.3, 0, 0], scale: [0.8, 0.8, 0.8] }, color: [0.557, 0.471, 0.710, 1.0] });
        mouthNode.addChild(toothNode); 
        allTeeth.push(toothNode); // Add for animation
    }

    // Return the main node and references for animation
    return {
        modelRoot: haunterRootNode, // The node to add to the main scene
        allTeeth: allTeeth         // Array of teeth nodes for animation
    };
}

// ============================================
// GENGAR BUILDER
// ============================================
function createGengarNode(gl, buffers) { // Takes the main buffers object

    // body - Gengar's main parent node
    const body = new SceneNode({
        buffers: buffers.gengarBody, // Use buffer from object
        localTransform: { position: [0.0, 0.0, 0.0], rotation: [0.0, 0.0, 0.0], scale: [1.7, 1.75, 1.5] },
        color: [0.4, 0.30, 0.60, 1.0]
    });

        const bodyBottom = new SceneNode({
        buffers: buffers.gengarBody,
        localTransform: { 
            position: [0.0, -0.057, -0.007],
            rotation: [0.0, 0.0, 0.0], 
            scale: [1.0, 1.0, 1.0]
        },
        color: [0.39, 0.29, 0.59, 1.0]
    });
    body.addChild(bodyBottom);

    const bodyBottom2 = new SceneNode({
        buffers: buffers.gengarBody,
        localTransform: { 
            position: [0.0, -0.429, -0.007],
            rotation: [0.0, 0.0, 0.0], 
            scale: [0.88, 0.66, 0.71]
        },
        color: [0.37, 0.27, 0.57, 1.0]
    });
    body.addChild(bodyBottom2);

    // Ears (children of body)
    const leftEar = new SceneNode({
        buffers: buffers.gengarCone, // Use buffer from object
        localTransform: { 
            position: [-0.72, 0.843, -0.0], 
            rotation: [-0.4, -0.4, 0.65], 
            scale: [0.3, 1.4, 0.26] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(leftEar);

    const rightEar = new SceneNode({
        buffers: buffers.gengarCone,
        localTransform: { 
            position: [0.72, 0.843, 0.0], 
            rotation: [-0.4, 0.4, -0.65], 
            scale: [0.3, 1.4, 0.26] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(rightEar);

    // Top spikes (children of body)
    const topSpikes = [
        { pos: [0, 1.0, 0.05], rot: [-0.7, 0, 0], scale: [0.15, 0.7, 0.15] },
        { pos: [-0.205, 0.98, 0.05], rot: [-0.3, 0, 0.45], scale: [0.08, 0.3, 0.15] },
        { pos: [0.205, 0.98, 0.05], rot: [-0.3, 0, -0.45], scale: [0.08, 0.3, 0.15] },
        { pos: [-0.36, 0.925, -0.05], rot: [-0.4, 0, 0.6], scale: [0.075, 0.3, 0.15] },
        { pos: [0.36, 0.925, -0.05], rot: [-0.4, 0, -0.6], scale: [0.075, 0.3, 0.15] },
    ];
    topSpikes.forEach(spike => {
        body.addChild(new SceneNode({
            buffers: buffers.gengarCone, // Use buffer from object
            localTransform: { position: spike.pos, rotation: spike.rot, scale: spike.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    // Back spikes (children of body)
    const backSpikes = [
        { pos: [-0.2, 0.85, -0.583], rot: [-0.8, -0.3, -0.0], scale: [0.05, 0.125, 0.05] },
        { pos: [0.0, 0.75, -0.6],rot: [-0.9, 0.0, 0.0], scale: [0.1, 0.25, 0.1] },
        { pos: [0.2, 0.85, -0.583], rot: [-0.8, 0.3, 0.0], scale: [0.05, 0.125, 0.05] },
        { pos: [-0.2, 0.683, -0.733], rot: [-1.0, -0.4, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [0.0, 0.583, -0.8], rot: [-1.2, 0.0, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [0.2, 0.683, -0.733], rot: [-1.0, 0.4, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [-0.2, 0.483, -0.9], rot: [-1.35, -0.5, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [0.0, 0.383, -0.92], rot: [-1.6, 0.0, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [0.2, 0.483, -0.9], rot: [-1.35, 0.5, 0.0], scale: [0.075, 0.117, 0.075] }
    ];
    backSpikes.forEach(spike => {
        body.addChild(new SceneNode({
            buffers: buffers.gengarCone, // Use buffer from object
            localTransform: { position: spike.pos, rotation: spike.rot, scale: spike.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    // Eyes (children of body)
    const eyeColor = [0.97, 0.35, 0.32, 1];

    const leftEyeWhite = new SceneNode({
        buffers: buffers.gengarEye, // Use buffer from object
        localTransform: { position: [-0.25, 0.22, 0.88], rotation: [-0.2, -0.3, -3.85], scale: [0.205, 0.19, 0.1] },
        color: eyeColor
    });
    body.addChild(leftEyeWhite);

    body.addChild(new SceneNode({ // Left black background
        buffers: buffers.gengarEye, // Use buffer from object
        localTransform: { position: [-0.25, 0.219, 0.88], rotation: [-0.19, -0.3, -3.84], scale: [0.221, 0.215, 0.08] },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    const rightEyeWhite = new SceneNode({
        buffers: buffers.gengarEye, // Use buffer from object
        localTransform: { position: [0.25, 0.22, 0.88], rotation: [-0.2, 0.3, 3.85], scale: [0.205, 0.19, 0.1] },
        color: eyeColor
    });
    body.addChild(rightEyeWhite);

    body.addChild(new SceneNode({ // Right black background
        buffers: buffers.gengarEye, // Use buffer from object
        localTransform: { position: [0.25, 0.219, 0.88], rotation: [-0.19, 0.3, 3.84], scale: [0.221, 0.215, 0.08] },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    // Pupils (children of body)
    const innerPupilColor = [0.8, 0.8, 0.8, 1.0];
    const outerPupilColor = [0.2, 0.2, 0.1, 1.0];

    body.addChild(new SceneNode({ // Left Inner
        buffers: buffers.gengarPupil, // Use buffer from object
        localTransform: { position: [-0.238, 0.19, 1.0], rotation: [0, 0, 0.1], scale: [0.01, 0.025, 0.005] },
        color: innerPupilColor
    }));

    body.addChild(new SceneNode({ // Left Outer
        buffers: buffers.gengarPupil, // Use buffer from object
        localTransform: { position: [-0.24, 0.18, 1.0], rotation: [0, 0, 0.2], scale: [0.03, 0.05, 0] }, // Z scale is 0?
        color: outerPupilColor
    }));

    body.addChild(new SceneNode({ // Right Inner
        buffers: buffers.gengarPupil, // Use buffer from object
        localTransform: { position: [0.238, 0.19, 1.0], rotation: [0, 0, -0.1], scale: [0.01, 0.025, 0.005] },
        color: innerPupilColor
    }));

    body.addChild(new SceneNode({ // Right Outer
        buffers: buffers.gengarPupil, // Use buffer from object
        localTransform: { position: [0.24, 0.18, 1.0], rotation: [0, 0, -0.2], scale: [0.03, 0.05, 0] }, // Z scale is 0?
        color: outerPupilColor
    }));

    // Eyelids (children of body)
    body.addChild(new SceneNode({ // Left
        buffers: buffers.gengarCylinder, // Use buffer from object
        localTransform: { position: [-0.231, 0.21, 0.85], rotation: [-0.2, -0.2, -3.85], scale: [0.28, 0.005, 0.12] },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    body.addChild(new SceneNode({ // Right
        buffers: buffers.gengarCylinder, // Use buffer from object
        localTransform: { position: [0.231, 0.21, 0.85], rotation: [-0.2, 0.2, 3.85], scale: [0.28, 0.005, 0.12] },
        color: [0.0, 0.0, 0.0, 1.0]
    }));
        
    // Arms - Attach to body instead of root
    const leftArmTop = new SceneNode({
        buffers: buffers.gengarBody,
        localTransform: {
            position: [-1.0, 0.02, 0.1],
            rotation: [0.0, 0.0, 2.5],
            scale: [0.22, 0.45, 0.46]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(leftArmTop);

    const rightArmTop = new SceneNode({
        buffers: buffers.gengarBody,
        localTransform: {
            position: [1.0, 0.02, 0.1],
            rotation: [0.0, 0.0, -2.5],
            scale: [0.22, 0.45, 0.46]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(rightArmTop);

    const rightArm = new SceneNode({
        buffers: buffers.gengarArm,
        localTransform: {
            position: [-0.0, 0.9, 0.0],
            rotation: [-0.0, 1.5, 0.0],
            scale: [1.8, 3.0, 2.9]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    rightArmTop.addChild(rightArm);

    const leftArm = new SceneNode({
        buffers: buffers.gengarArm,
        localTransform: {
            position: [-0.0, 0.9, 0.0],
            rotation: [-0.0, -1.5, 0.0],
            scale: [1.8, 3.0, 2.9]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    leftArmTop.addChild(leftArm);

    const leftFingerTransforms = [
        { pos: [0.0, 0.1, 0.05], rot: [0.5, 0.0, 0.0], scale: [0.13, 0.14, 0.08] },
        { pos: [0.15, 0.085, 0.05], rot: [0.5, 0.0, -0.3], scale: [0.13, 0.14, 0.08] },
        { pos: [-0.16, 0.075, 0.06], rot: [0.5, 0.0, 0.4], scale: [0.13, 0.14, 0.08] },
    ];
    leftFingerTransforms.forEach(transform => {
        leftArm.addChild(new SceneNode({
            buffers: buffers.gengarCone,
            localTransform: { position: transform.pos, rotation: transform.rot, scale: transform.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    const rightFingerTransforms = [
        { pos: [0.0, 0.1, 0.05], rot: [0.5, 0.0, 0.0], scale: [0.13, 0.14, 0.08] },
        { pos: [0.15, 0.085, 0.05], rot: [0.5, 0.0, -0.3], scale: [0.13, 0.14, 0.08] },
        { pos: [-0.16, 0.075, 0.06], rot: [0.5, 0.0, 0.4], scale: [0.13, 0.14, 0.08] },
    ];
    rightFingerTransforms.forEach(transform => {
        rightArm.addChild(new SceneNode({
            buffers: buffers.gengarCone,
            localTransform: { position: transform.pos, rotation: transform.rot, scale: transform.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    body.addChild(new SceneNode({
        buffers: buffers.gengarSmile,
        localTransform: { position: [0, 0, 0.02], rotation: [0, 0, 0], scale: [1, 1, 1]
        },
        color: [0.95, 0.95, 0.95, 1.0]
    }));

    
    body.addChild(new SceneNode({
        buffers: buffers.gengarSmile,
        localTransform: {  position: [0, 0.015, -0.04], rotation: [0, 0, 0], scale: [1.03, 1.1, 1.05]
        },
        color: [0.3, 0.3, 0.3, 1.0]
    }));


    // teeth
    body.addChild(new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [-0.35, -0.11, 0.96], rotation: [-0.0, -0.0, -0], scale: [0.005, 0.18, 0.005]
        },
        color: [0.3, 0.3, 0.3, 1.0] 
    }));

    body.addChild(new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [0.35, -0.11, 0.96], rotation: [-0.0, -0.0, -0], scale: [0.005, 0.18, 0.005]
        },
        color: [0.3, 0.3, 0.3, 1.0] // Darker purple
    }));

    body.addChild(new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [-0.175, -0.15, 1.0], rotation: [-0.0, -0.0, -0], scale: [0.005, 0.21, 0.005]
        },
        color: [0.3, 0.3, 0.3, 1.0]
    }));

    body.addChild(new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [0.175, -0.15, 1.0], rotation: [-0.0, -0.0, -0], scale: [0.005, 0.21, 0.005]
        },
        color: [0.0, 0.0, 0.0, 1.0]
    }));
    
    body.addChild(new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [0.0, -0.15, 1.02], rotation: [-0.0, -0.0, -0], scale: [0.005, 0.21, 0.005]
        },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    body.addChild(new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [-0.585, 0.09, 0.82], rotation: [-0.6, -0.0, 0.6], scale: [0.005, 0.1, 0.005] 
        },
        color: [0.1, 0.1, 0.1, 1.0]
    }));

    body.addChild(new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [0.585, 0.09, 0.82], rotation: [-0.6, -0.0, -0.6], scale: [0.005, 0.1, 0.005]
        },
        color: [0.1, 0.1, 0.1, 1.0] 
    }));
    

    const leftLegTop = new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [-0.55, -0.76, 0.0], rotation: [0.0, 0.0, 2.6], scale: [0.3, 0.5, 0.35]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(leftLegTop);

    const leftLegTop2 = new SceneNode({
        buffers: buffers.gengarBody,
        localTransform: { position: [0.2, -0.02, 0.0], rotation: [0.0, 0.0, 0.2], scale: [1.07, 0.9, 1.2]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    leftLegTop.addChild(leftLegTop2);
    const leftLegBottom = new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [-0.02, 0.57, 0.0], rotation: [-0.0, 0.0, 0.33], scale: [0.87, 0.52, 0.98]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    leftLegTop.addChild(leftLegBottom);

    
    const rightLegTop = new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [0.55, -0.76, 0.0], rotation: [0.0, 0.0, -2.6], scale: [0.3, 0.5, 0.35]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(rightLegTop);

    const rightLegTop2 = new SceneNode({
        buffers: buffers.gengarBody,
        localTransform: { position: [-0.2, -0.02, 0.0], rotation: [0.0, 0.0, -0.2], scale: [1.07, 0.9, 1.2]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    rightLegTop.addChild(rightLegTop2);
    const rightLegBottom = new SceneNode({
        buffers: buffers.gengarCylinder,
        localTransform: { position: [0.02, 0.57, 0.0], rotation: [-0.0, 0.0, -0.33], scale: [0.87, 0.52, 0.98]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    rightLegTop.addChild(rightLegBottom);

    
    const tail = new SceneNode({
        buffers: buffers.gengarTailB,
        localTransform: { position: [0.0, -0.75, -0.695], rotation: [-2.2, 3.0, 0.0], scale: [0.6, 0.7, 0.6]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(tail);
    
    return {
        modelRoot: body,
        leftArmTop: leftArmTop,
        rightArmTop: rightArmTop,
        leftLegTop: leftLegTop,
        rightLegTop: rightLegTop,
        
        initials: {
            bodyPos: [...body.localTransform.position],
            bodyRot: [...body.localTransform.rotation],
            leftLegScale: [...leftLegTop.localTransform.scale],
            rightLegScale: [...rightLegTop.localTransform.scale],
            leftArmRot: [...leftArmTop.localTransform.rotation],
            rightArmRot: [...rightArmTop.localTransform.rotation]
        }
    };
}

// ============================================
// GIGANTAMAX GENGAR BUILDER
// ============================================
function createGigantamaxNode(gl, buffers) { // Needs gl and the main buffers object

    // body - G-Max Gengar's main parent node
    const body = new SceneNode({
        buffers: buffers.gmaxBody, // Use buffer from object
        localTransform: { position: [-0.0, -0, 0.0], rotation: [0.0, 0.0, 0.0], scale: [4.0, 6.0, 4.0] },
        color: [0.4, 0.30, 0.60, 1.0]
    });

    const initialBodyScaleY = body.localTransform.scale[1]; // For breath animation

    // Ears (children of body)
    const leftEar = new SceneNode({
        buffers: buffers.gmaxCone, // Use buffer from object (reusing Gengar's cone)
        localTransform: { position: [-0.6, 0.943, -0.1], rotation: [-0.9, 0.6, 1.0], scale: [0.15, 0.55, 0.2] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(leftEar);

    const rightEar = new SceneNode({
        buffers: buffers.gmaxCone, // Use buffer from object
        localTransform: { position: [0.6, 0.943, -0.1], rotation: [-0.9, -0.6, -1.0], scale: [0.15, 0.55, 0.2] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(rightEar);

    // Top spikes (children of body)
    const topSpikes = [
        { pos: [0.175, 1.0, 0.0], rot: [-0.0, -0.3, -0.6], scale: [0.03, 0.083, 0.03] },
        { pos: [0.25, 1.0, -0.085], rot: [-0.0, 0.4, -0.8], scale: [0.05, 0.15, 0.05] },

        { pos: [0.1, 1.025, 0.05], rot: [-0.0, -3.0, 0.6], scale: [0.1, 0.3, 0.1] },
        // { pos: [0.1, 1.025, -0.025], rot: [-0.0, 0.8, -0.6], scale: [0.1, 0.3, 0.1] },

        { pos: [-0.05, 1.025, -0.025], rot: [-0.2, 0.0, -0.2], scale: [0.03, 0.087, 0.03] },
        { pos: [-0.175, 1.025, -0.125], rot: [-0.4, 0.0, 0.3], scale: [0.07, 0.168, 0.07] },
        { pos: [-0.2, 1.0, 0.0], rot: [-0.0, 0.0, 0.6], scale: [0.03, 0.083, 0.03] },
        { pos: [0.075, 1.025, -0.25], rot: [-0.65, 0, -0.1], scale: [0.15, 0.367, 0.15] },
        { pos: [0.0, 0.925, -0.517], rot: [-0.8, 0, -0], scale: [0.1, 0.3, 0.1] }
    ];
    topSpikes.forEach(spike => {
        body.addChild(new SceneNode({
            buffers: buffers.gmaxCone, // Use buffer from object
            localTransform: { position: spike.pos, rotation: spike.rot, scale: spike.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    // Back spikes (children of body)
    const backSpikes = [
        { pos: [-0.2, 0.85, -0.583], rot: [-0.8, -0.3, -0.0], scale: [0.05, 0.125, 0.05] },
        { pos: [0.0, 0.75, -0.6],rot: [-0.9, 0.0, 0.0], scale: [0.1, 0.25, 0.1] },
        { pos: [0.2, 0.85, -0.583], rot: [-0.8, 0.3, 0.0], scale: [0.05, 0.125, 0.05] },
        { pos: [-0.2, 0.683, -0.733], rot: [-1.0, -0.4, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [0.0, 0.583, -0.8], rot: [-1.2, 0.0, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [0.2, 0.683, -0.733], rot: [-1.0, 0.4, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [-0.2, 0.483, -0.9], rot: [-1.35, -0.5, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [0.0, 0.383, -0.92], rot: [-1.6, 0.0, 0.0], scale: [0.075, 0.117, 0.075] },
        { pos: [0.2, 0.483, -0.9], rot: [-1.35, 0.5, 0.0], scale: [0.075, 0.117, 0.075] }
    ];
    backSpikes.forEach(spike => {
        body.addChild(new SceneNode({
            buffers: buffers.gmaxCone, // Use buffer from object
            localTransform: { position: spike.pos, rotation: spike.rot, scale: spike.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    // mouth layers (children of body)
    const mouthColors = [
        [0.671, 0.067, 0.306, 1.0],
        [0.580, 0.059, 0.270, 1.0],
        [0.491, 0.051, 0.224, 1.0],
        [0.402, 0.044, 0.178, 1.0],
        [0.310, 0.035, 0.141, 1.0],
        [0.1, 0.05, 0.1, 1.0]
    ];

    const squareness = 0.6;
    const startInnerRadius = 0.45;
    const innerRadiusStep = 0.08;
    const holeWidthScale = 0.8;
    const holeOffsetYStep = 0.02;

    for (let i = 0; i < 6; i++) {
        const isBackLayer = (i === 5);
        let layerBuffers;
        let localScale;
        let localPos = [0.0, 0.25, 0.35 - i * 0.1];

        if (isBackLayer) {
            localPos[2] += 0.367;
            layerBuffers = buffers.gmaxMouthBack;
            const lastRingIndex = i - 1;
            const lastRingScaleY = 2.5 - lastRingIndex * 0.22;
            const lastHoleOffsetY = -lastRingIndex * holeOffsetYStep;
            const lastHoleRadiusY = startInnerRadius - lastRingIndex * innerRadiusStep;
            const lastHoleRadiusX = lastHoleRadiusY * holeWidthScale;
            localScale = [lastHoleRadiusX * 10.0, lastHoleRadiusY * 2.667, 0.333];
            localPos[1] += lastHoleOffsetY * lastRingScaleY / 3.0;
        } else {
            let currentHoleRadiusY = startInnerRadius - i * innerRadiusStep;
            let desiredOffsetY = -i * holeOffsetYStep - 0.2;
            const maxOffsetY = 0.5 - currentHoleRadiusY;
            const clampedOffsetY = Math.max(desiredOffsetY, -maxOffsetY);
            const holeParams = {
                radiusX: currentHoleRadiusY * holeWidthScale,
                radiusY: currentHoleRadiusY,
                offsetX: 0.0,
                offsetY: clampedOffsetY
            };
            const layerGeometry = createCustomRing(40, squareness, holeParams);
            layerBuffers = initBuffers(gl, layerGeometry);
            localScale = [(2.9 - 0.18) / 2.0, (2.5 - 0.22) / 3.0, 0.333];
        }

        body.addChild(new SceneNode({
            buffers: layerBuffers,
            localTransform: { position: localPos, rotation: [-0.4, 0, 0], scale: localScale },
            color: mouthColors[i]
        }));
    }

    // Teeth (children of body)
    const topTeethCount = 6;
    const bottomTeethCount = 6;
    const topRadius = 1.8;
    const bottomRadius = 1.9;
    const topArc = Math.PI * 0.35;
    const bottomArc = Math.PI * 0.5;

    for (let i = 0; i < topTeethCount; i++) {
        const t = (i / (topTeethCount - 1)) - 0.5;
        const angle = t * topArc;
        const x = topRadius * Math.sin(angle) / 2.0;
        const y = (0.2 + 1.75) / 3.0; //0.65
        const z = (topRadius * Math.cos(angle) - 0.5) / 1.9;

        if (i <= 2) {
            body.addChild(new SceneNode({
                buffers: buffers.gmaxTooth,
                localTransform: {
                    position: [x + 0.005, y, z],
                    rotation: [-0.45, angle, -0.125],
                    scale: [0.4, 0.233, 0.5]
                },
                color: [1.0, 1.0, 1.0, 1.0]
            }));
        } else {
            body.addChild(new SceneNode({
                buffers: buffers.gmaxTooth,
                localTransform: {
                    position: [x - 0.005, y, z],
                    rotation: [-0.45, angle, 0.125],
                    scale: [0.4, 0.233, 0.5]
                },
                color: [1.0, 1.0, 1.0, 1.0]
            }));
        }
    }

    for (let i = 0; i < bottomTeethCount; i++) {
        const t = (i / (bottomTeethCount - 1)) - 0.5;
        const angle = t * bottomArc;
        const x = bottomRadius * Math.sin(angle) / 2.0;
        const y = (-1.62 + 1.75) / 3.0;
        const z = (bottomRadius * Math.cos(angle) + 0.0) / 2.0;

        body.addChild(new SceneNode({
            buffers: buffers.gmaxTooth,
            localTransform: {
                position: [x, y, z],
                rotation: [0, angle, 0],
                scale: [0.6, 0.2, 0.5]
            },
            color: [1.0, 1.0, 1.0, 1.0]
        }));
    }

    // Tongue (child of body)
    const tongueNode = new SceneNode({
        buffers: buffers.gmaxTongue, // Use buffer from object
        localTransform: { position: [0.0, 0.1, 0.3], rotation: [0.1, 0, 0], scale: [0.6, 0.333, 0.5] },
        color: [0.729, 0.204, 0.427, 1.0]
    });
    body.addChild(tongueNode);

    // Eyes (children of body)
    const eyeColor = [1.0, 0.8, 0.1, 1.0];

    const leftEyeWhite = new SceneNode({
        buffers: buffers.gmaxEye, // Use buffer from object
        localTransform: { position: [-0.25, 0.765, 0.577], rotation: [-1.0, -0.2, -3.8], scale: [0.375, 0.528, 0.1] },
        color: eyeColor
    });
    body.addChild(leftEyeWhite);

    body.addChild(new SceneNode({ // Left Black Background
        buffers: buffers.gmaxEye, // Use buffer from object
        localTransform: { position: [-0.25, 0.767, 0.575], rotation: [-1.0, -0.2, -3.79], scale: [0.4, 0.575, 0.08] },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    const rightEyeWhite = new SceneNode({
        buffers: buffers.gmaxEye, // Use buffer from object
        localTransform: { position: [0.25, 0.765, 0.577], rotation: [-1.0, 0.2, 3.8], scale: [0.375, 0.528, 0.1] },
        color: eyeColor
    });
    body.addChild(rightEyeWhite);

    body.addChild(new SceneNode({ // Right Black Background
        buffers: buffers.gmaxEye, // Use buffer from object
        localTransform: { position: [0.25, 0.767, 0.575], rotation: [-1.0, 0.2, 3.79], scale: [0.4, 0.575, 0.08] },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    // Pupils (children of body)
    const innerPupilColor = [0.8, 0.8, 0.8, 1.0];
    const outerPupilColor = [1.0, 0.2, 0.1, 1.0];

    body.addChild(new SceneNode({ // Left Inner
        buffers: buffers.gmaxPupil, // Use buffer from object
        localTransform: { position: [-0.1825, 0.780, 0.62], rotation: [-1.5, -1.0, -3.8], scale: [0.035, 0.183, 0.05] },
        color: innerPupilColor
    }));

    body.addChild(new SceneNode({ // Left Outer
        buffers: buffers.gmaxPupil, // Use buffer from object
        localTransform: { position: [-0.18, 0.777, 0.615], rotation: [-1.6, -1.0, -3.9], scale: [0.035, 0.25, 0.1] },
        color: outerPupilColor
    }));

    body.addChild(new SceneNode({ // Right Inner
        buffers: buffers.gmaxPupil, // Use buffer from object
        localTransform: { position: [0.1825, 0.780, 0.62], rotation: [-1.5, 1.0, 3.8], scale: [0.035, 0.183, 0.055] },
        color: innerPupilColor
    }));

    body.addChild(new SceneNode({ // Right Outer
        buffers: buffers.gmaxPupil, // Use buffer from object
        localTransform: { position: [0.18, 0.777, 0.615], rotation: [-1.6, 1.0, 3.9], scale: [0.035, 0.25, 0.1] },
        color: outerPupilColor
    }));
        
    // Arms - Attach to body
    const leftArm = new SceneNode({
        buffers: buffers.gmaxArm, // Use buffer from object
        // Adjusted position relative to body scale
        localTransform: { position: [-0.95, -0.06, 0.8], rotation: [0.0, 0.4, 0.0], scale: [1.6/4.0, 8.4/6.0, 2.6/4.0] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(leftArm); // Add arm to body
    
    // Store initial transform relative to body for animation
    const initialLeftArmTransform = {
        position: [...leftArm.localTransform.position], // Position relative to body
        scale: [...leftArm.localTransform.scale],     // Scale relative to body
    };

    const rightArm = new SceneNode({
        buffers: buffers.gmaxArm, // Use buffer from object
        // Adjusted position relative to body scale
        localTransform: { position: [1.0, -0.06, 0.8], rotation: [0.0, -0.8, 0.0], scale: [2.0/4.0, 10.0/6.0, 2.6/4.0] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(rightArm); // Add arm to body

     // Store initial transform relative to body for animation
    const initialRightArmTransform = {
        position: [...rightArm.localTransform.position], // Position relative to body
        scale: [...rightArm.localTransform.scale],     // Scale relative to body
    };

    // Fingers (children of arms)
    const leftFingerTransforms = [
        // mid finger
        { pos: [0.0, 0.1, 0.05], rot: [0.5, 0.0, 0.0], scale: [0.065, 0.07, 0.04] },
        // index
        { pos: [-0.15, 0.085, 0.05], rot: [0.5, 0.0, 0.3], scale: [0.05, 0.07, 0.04] },
        // thumb
        { pos: [0.16, 0.075, 0.06], rot: [0.5, 0.0, -0.4], scale: [0.06, 0.06, 0.04] }
    ];
    leftFingerTransforms.forEach(transform => {
        leftArm.addChild(new SceneNode({
            buffers: buffers.gmaxCone, // Use buffer from object
            localTransform: { position: transform.pos, rotation: transform.rot, scale: transform.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    const rightFingerTransforms = [
        // mid finger
        { pos: [0.0, 0.1, 0.05], rot: [0.5, 0.0, 0.0], scale: [0.065, 0.07, 0.04] },
        // thumb
        { pos: [0.15, 0.085, 0.05], rot: [0.5, 0.0, -0.3], scale: [0.05, 0.07, 0.04] },
        // index
        { pos: [-0.16, 0.075, 0.06], rot: [0.5, 0.0, 0.4], scale: [0.06, 0.06, 0.04] },
    ];
    rightFingerTransforms.forEach(transform => {
        rightArm.addChild(new SceneNode({
            buffers: buffers.gmaxCone, // Use buffer from object
            localTransform: { position: transform.pos, rotation: transform.rot, scale: transform.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    // Cloud Parent (child of body) - For rotation animation
    const cloudParent = new SceneNode();
    body.addChild(cloudParent);

    // Cloud trails (children of cloudParent)
    const cloudColor = [0.6, 0.05, 0.2, 1.0]; /* ... other params ... */
    const circleRadius = 0.3;
    const heightAboveHead = 1.3;

    const trail1Blobs = [
        // front cluster
        { angle: 0.0, offset: [0, 0, 0], scale: [0.11, 0.05, 0.10], detach: 0 },
        { angle: 0.05, offset: [0.08, 0.02, -0.02], scale: [0.08, 0.06, 0.07], detach: 0 },
        { angle: -0.08, offset: [-0.05, -0.02, 0.03], scale: [0.08, 0.05, 0.09], detach: 0 },
        { angle: 0.12, offset: [0.03, 0.04, 0.05], scale: [0.07, 0.06, 0.06], detach: 0 },
        { angle: -0.05, offset: [-0.02, -0.03, -0.04], scale: [0.06, 0.04, 0.07], detach: 0 },
        
        // mid cluster
        { angle: 0.28, offset: [0.02, 0.01, 0.02], scale: [0.09, 0.05, 0.08], detach: 0.02 },
        { angle: 0.35, offset: [-0.03, 0.02, -0.02], scale: [0.07, 0.04, 0.07], detach: 0.03 },
        { angle: 0.42, offset: [0.02, -0.01, 0.03], scale: [0.06, 0.05, 0.05], detach: 0.04 },
        
        { angle: 0.58, offset: [0.01, 0.02, -0.02], scale: [0.08, 0.04, 0.07], detach: 0.06 },
        { angle: 0.68, offset: [-0.02, -0.01, 0.02], scale: [0.06, 0.03, 0.06], detach: 0.08 },
        
        // tail
        { angle: 0.85, offset: [0.01, 0.01, 0.01], scale: [0.07, 0.03, 0.06], detach: 0.10 },
        { angle: 0.98, offset: [-0.01, -0.01, -0.01], scale: [0.04, 0.03, 0.03], detach: 0.13 },
        { angle: 1.12, offset: [0.01, 0.01, 0.01], scale: [0.04, 0.02, 0.03], detach: 0.16 },
        { angle: 1.28, offset: [0.01, 0.03, -0.01], scale: [0.025, 0.01, 0.02], detach: 0.20 },
    ];
    trail1Blobs.forEach(blob => {
        const baseX = circleRadius * Math.cos(blob.angle);
        const baseZ = circleRadius * Math.sin(blob.angle);
        
        // detachment offset - moves blobs inward/outward as they trail
        const detachAngle = blob.angle + 0.5;
        const detachX = blob.detach * Math.cos(detachAngle);
        const detachZ = blob.detach * Math.sin(detachAngle);
        
        const x = baseX + blob.offset[0] + detachX;
        const z = baseZ + blob.offset[2] + detachZ;
        const y = heightAboveHead + blob.offset[1] - blob.detach * 0.3; 
        
        cloudParent.addChild(new SceneNode({
            buffers: buffers.gmaxCloud,
            localTransform: { 
                position: [x, y, z],
                rotation: [blob.offset[1] * 0.5, blob.angle * 0.4, blob.offset[0] * 0.3],
                scale: blob.scale
            },
            color: cloudColor
        }));
    });
    const trail2Blobs = [
        // front cluster
        { angle: 2.0, offset: [0, 0, 0], scale: [0.10, 0.06, 0.10], detach: 0 },
        { angle: 2.08, offset: [0.05, 0.03, 0.02], scale: [0.08, 0.07, 0.07], detach: 0 },
        { angle: 1.95, offset: [-0.04, -0.02, -0.03], scale: [0.07, 0.04, 0.08], detach: 0 },
        { angle: 2.15, offset: [0.04, 0.02, -0.04], scale: [0.06, 0.05, 0.06], detach: 0 },
        { angle: 1.88, offset: [-0.03, 0.03, 0.04], scale: [0.07, 0.03, 0.07], detach: 0 },
        
        // mid cluster
        { angle: 2.32, offset: [0.02, 0.02, 0.02], scale: [0.08, 0.04, 0.07], detach: 0.02 },
        { angle: 2.42, offset: [-0.02, -0.01, -0.02], scale: [0.06, 0.05, 0.05], detach: 0.04 },
        { angle: 2.55, offset: [0.02, 0.02, 0.03], scale: [0.07, 0.03, 0.06], detach: 0.05 },
        
        { angle: 2.72, offset: [-0.02, 0.01, -0.02], scale: [0.06, 0.03, 0.05], detach: 0.07 },
        { angle: 2.88, offset: [0.01, -0.01, 0.02], scale: [0.05, 0.02, 0.06], detach: 0.09 },
        
        // tail
        { angle: 3.05, offset: [0.01, 0.01, -0.01], scale: [0.06, 0.03, 0.05], detach: 0.12 },
        { angle: 3.20, offset: [-0.01, -0.01, 0.01], scale: [0.05, 0.02, 0.05], detach: 0.15 },
        { angle: 3.35, offset: [0.01, 0.01, -0.01], scale: [0.04, 0.02, 0.04], detach: 0.19 },
        { angle: 3.48, offset: [0.00, 0.00, 0.01], scale: [0.03, 0.01, 0.03], detach: 0.23 }
    ];
    trail2Blobs.forEach(blob => {
        const baseX = circleRadius * Math.cos(blob.angle);
        const baseZ = circleRadius * Math.sin(blob.angle);
        
        const detachAngle = blob.angle + 0.5;
        const detachX = blob.detach * Math.cos(detachAngle);
        const detachZ = blob.detach * Math.sin(detachAngle);
        
        const x = baseX + blob.offset[0] + detachX;
        const z = baseZ + blob.offset[2] + detachZ;
        const y = heightAboveHead + blob.offset[1] - blob.detach * 0.3;
        
        // --- ANIMATION CHANGE: Add clouds to the parent node ---
        cloudParent.addChild(new SceneNode({
            buffers: buffers.gmaxCloud,
            localTransform: { 
                position: [x, y, z],
                rotation: [blob.offset[1] * 0.5, blob.angle * 0.4, blob.offset[0] * 0.3],
                scale: blob.scale
            },
            color: cloudColor
        }));
    });
    const trail3Blobs = [
        // front cluster
        { angle: 4.1, offset: [0, 0, 0], scale: [0.09, 0.08, 0.08], detach: 0 },
        { angle: 4.18, offset: [0.05, 0.02, -0.03], scale: [0.08, 0.05, 0.09], detach: 0 },
        { angle: 4.02, offset: [-0.04, -0.02, 0.04], scale: [0.07, 0.06, 0.06], detach: 0 },
        { angle: 4.25, offset: [0.03, 0.03, 0.02], scale: [0.06, 0.04, 0.07], detach: 0 },
        { angle: 3.98, offset: [-0.02, -0.02, -0.02], scale: [0.06, 0.03, 0.06], detach: 0 },
        
        // mid cluster
        { angle: 4.42, offset: [0.02, 0.01, 0.02], scale: [0.07, 0.04, 0.07], detach: 0.02 },
        { angle: 4.52, offset: [-0.02, 0.02, -0.02], scale: [0.06, 0.04, 0.05], detach: 0.04 },
        { angle: 4.65, offset: [0.02, -0.01, 0.03], scale: [0.06, 0.03, 0.06], detach: 0.06 },
        
        { angle: 4.82, offset: [-0.01, 0.01, -0.02], scale: [0.05, 0.03, 0.05], detach: 0.08 },
        { angle: 4.96, offset: [0.01, -0.01, 0.01], scale: [0.05, 0.03, 0.05], detach: 0.10 },
        
        // tail
        { angle: 5.12, offset: [0.01, 0.01, 0.01], scale: [0.05, 0.02, 0.05], detach: 0.13 },
        { angle: 5.26, offset: [-0.01, 0.00, -0.01], scale: [0.04, 0.02, 0.04], detach: 0.17 },
        { angle: 5.38, offset: [0.01, 0.01, 0.00], scale: [0.03, 0.01, 0.03], detach: 0.21 }
    ];
    trail3Blobs.forEach(blob => {
        const baseX = circleRadius * Math.cos(blob.angle);
        const baseZ = circleRadius * Math.sin(blob.angle);
        
        const detachAngle = blob.angle + 0.5;
        const detachX = blob.detach * Math.cos(detachAngle);
        const detachZ = blob.detach * Math.sin(detachAngle);
        
        const x = baseX + blob.offset[0] + detachX;
        const z = baseZ + blob.offset[2] + detachZ;
        const y = heightAboveHead + blob.offset[1] - blob.detach * 0.3;
        
        // --- ANIMATION CHANGE: Add clouds to the parent node ---
        cloudParent.addChild(new SceneNode({
            buffers: buffers.gmaxCloud,
            localTransform: { 
                position: [x, y, z],
                rotation: [blob.offset[1] * 0.5, blob.angle * 0.4, blob.offset[0] * 0.3],
                scale: blob.scale
            },
            color: cloudColor
        }));
    });

    // Tail (child of body)
    const tailNode = new SceneNode({
        buffers: buffers.gmaxTail, // Use buffer from object
        localTransform: { position: [0.65, 0.28, -1.15], rotation: [0.0, 1.0, 0.0], scale: [0.3, 0.3, 0.3] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(tailNode);
    
    // Store initial transform relative to body for animation
    const initialTailTransform = {
        position: [...tailNode.localTransform.position],
        rotation: [...tailNode.localTransform.rotation]
    };

    // Return the main node and references needed for animation
    return {
        modelRoot: body,
        initialBodyScaleY: initialBodyScaleY,
        leftArmNode: leftArm,
        initialLeftArmTransform: initialLeftArmTransform,
        rightArmNode: rightArm,
        initialRightArmTransform: initialRightArmTransform,
        tailNode: tailNode,
        initialTailTransform: initialTailTransform,
        cloudParentNode: cloudParent,
        tongueNode: tongueNode // Need this to access its buffers for update
    };
}

function updateGastlyAnimation(now, gastlyRefs) {
    // Check if gastlyRefs is valid
    if (!gastlyRefs || !gastlyRefs.modelRoot) {
        console.error("Invalid gastlyRefs passed to updateGastlyAnimation");
        return;
    }

    // Body breath animation
    const breathSpeed = 0.5;
    const breathAmount = 0.02;
    const breathScaleFactor = 1.0 + Math.sin(now * breathSpeed * 2 * Math.PI) * breathAmount;
    // Use the reference: gastlyRefs.modelRoot is Gastly's 'body' node
    // Make sure initialBodyScaleY was correctly returned in gastlyRefs
    if (gastlyRefs.initialBodyScaleY !== undefined) {
         gastlyRefs.modelRoot.localTransform.scale[1] = gastlyRefs.initialBodyScaleY * breathScaleFactor;
    } else {
         console.warn("initialBodyScaleY not found in gastlyRefs");
    }


    // Gas aura rotation
    const gasRotateSpeed = 0.5;
    // Use the reference: gastlyRefs.gasAuraNode
    if (gastlyRefs.gasAuraNode) {
        gastlyRefs.gasAuraNode.localTransform.rotation[1] = now * gasRotateSpeed;
    } else {
         console.warn("gasAuraNode not found in gastlyRefs");
    }


    // Poison gas stream (make sure updatePoisonGasStream is defined globally)
    // Use the reference: gastlyRefs.mouthNode
    if (gastlyRefs.mouthNode) {
        updatePoisonGasStream(now, gastlyRefs.mouthNode);
    } else {
         console.warn("mouthNode not found in gastlyRefs");
    }

    // Small orbiting gas particles animation
    // Use the reference: gastlyRefs.orbitingGasParticles (it's an array)
    if (gastlyRefs.orbitingGasParticles && Array.isArray(gastlyRefs.orbitingGasParticles)) {
        gastlyRefs.orbitingGasParticles.forEach((particle, index) => {
            if (particle && particle.localTransform) { // Check if particle is valid
                const particleTime = now + index * 0.5; // Add offset based on index
                // Calculate new position
                particle.localTransform.position[0] = Math.sin(particleTime * 2 + index) * 1.5;
                particle.localTransform.position[1] = Math.cos(particleTime * 1.5 + index) * 0.5;
                particle.localTransform.position[2] = Math.sin(particleTime * 1.8 + index) * 1.0;
                // Update rotation
                particle.localTransform.rotation[1] = particleTime * 3;
                // Pulsating alpha
                const alphaPulse = 0.2 + Math.sin(particleTime * 4) * 0.1;
                if (particle.color && particle.color.length === 4) { // Check color array
                     particle.color[3] = alphaPulse; // Update alpha component of color
                }
            }
        });
    } else {
         console.warn("orbitingGasParticles not found or not an array in gastlyRefs");
    }

    // Idle float and eye glow
    let eyeGlowIntensity = 0.3 + Math.sin(now * 4) * 0.2; // Varies between 0.1 and 0.5
    // Use the reference: gastlyRefs.modelRoot
    if (gastlyRefs.initials) {
        gastlyRefs.modelRoot.localTransform.position[1] = gastlyRefs.initials.bodyPos[1] + Math.sin(now * 1.5) * 0.2;
    }

    // Use the references: gastlyRefs.leftEyeNode, gastlyRefs.rightEyeNode
    const glowThreshold = 0.4; // Adjust threshold for when eyes glow
    if (gastlyRefs.leftEyeNode) {
        gastlyRefs.leftEyeNode.isGlowing = eyeGlowIntensity > glowThreshold;
    } else {
         console.warn("leftEyeNode not found in gastlyRefs");
    }
     if (gastlyRefs.rightEyeNode) {
        gastlyRefs.rightEyeNode.isGlowing = eyeGlowIntensity > glowThreshold;
    } else {
         console.warn("rightEyeNode not found in gastlyRefs");
    }
}

let lastFlipTime = 0;
const flipInterval = 5.0; // seconds between flips
const flipDuration = 1.0; // seconds for flip animation
let isFlipping = false;

function updateHaunterAnimation(now, haunterRefs) {
    // Check if refs are valid
    if (!haunterRefs || !haunterRefs.modelRoot || !haunterRefs.allTeeth) {
        console.error("Invalid haunterRefs passed to updateHaunterAnimation");
        return;
    }

    // Tooth wiggle animation
    const toothAmplitude = 0.03; // Renamed amplitude to avoid conflict
    const toothSpeed = 4;
    haunterRefs.allTeeth.forEach(tooth => {
        if (tooth && tooth.localTransform) {
            // Initialize initialY if it doesn't exist on the tooth node
            if (tooth.initialY === undefined) {
                tooth.initialY = tooth.localTransform.position[1];
            }
            const newY = tooth.initialY + toothAmplitude * Math.sin(now * toothSpeed);
            tooth.localTransform.position[1] = newY;
        }
    });

    // Flip animation (Uses global state variables: isFlipping, lastFlipTime)
    let currentRotation = 0;
    if (isFlipping) {
        const elapsedTime = now - lastFlipTime;
        if (elapsedTime < flipDuration) {
            const progress = elapsedTime / flipDuration;
            // Ease-out cubic easing function for smoother end
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            currentRotation = -easedProgress * 2 * Math.PI; // Rotate around X-axis
        } else {
            isFlipping = false; // End flipping state
            currentRotation = 0; // Ensure it ends exactly at 0 rotation
        }
    } else {
        // Check if it's time to start the next flip
        if (now - lastFlipTime >= flipInterval) {
            isFlipping = true; // Start flipping state
            lastFlipTime = now; // Record flip start time
            currentRotation = 0; // Start rotation from 0
        } else {
            currentRotation = 0; // Stay at 0 rotation
        }
    }
    // Apply rotation to the main Haunter node
    haunterRefs.modelRoot.localTransform.rotation[0] = currentRotation;

    // Idle float and breath animation
    const idleAmplitude = 0.1;
    const idleSpeed = 2;
    const initialRootY = 0;
    const breathAmplitude = 0.05;
    const baseScale = 1.0;

    const sinValue = Math.sin(now * idleSpeed);

    // Apply float
    haunterRefs.modelRoot.localTransform.position[1] = initialRootY + idleAmplitude * sinValue;

    // Apply breath scaling (uniformly)
    const currentScale = baseScale + ((sinValue + 1) / 2) * breathAmplitude;
    haunterRefs.modelRoot.localTransform.scale[0] = currentScale;
    haunterRefs.modelRoot.localTransform.scale[1] = currentScale;
    haunterRefs.modelRoot.localTransform.scale[2] = currentScale;

}

function updateGengarAnimation(now, gengarRefs) {
    // Check if we have the refs and the 'initials' object
    if (!gengarRefs || !gengarRefs.initials) {
        return;
    }

    // --- GENGAR ANIMATION LOGIC ---
    
    // Get nodes and initial values from the 'gengarRefs' object
    const body = gengarRefs.modelRoot;
    const leftLegTop = gengarRefs.leftLegTop;
    const rightLegTop = gengarRefs.rightLegTop;
    const leftArmTop = gengarRefs.leftArmTop;
    const rightArmTop = gengarRefs.rightArmTop;
    
    const initials = gengarRefs.initials;

    // Animation parameters
    const speed = 4.0; 
    const swayMagnitude = 0.2; 
    const turnMagnitude = 0.25; 
    const tiltMagnitude = 0.15; 
    const humpMagnitude = -0.15;
    const bobMagnitude = 0.05; 
    const zMoveMagnitude = 0.1; 

    // Animation calculations
    const sway = Math.sin(now * speed); 
    const absSway = Math.abs(sway); 
    const swayVelocity = Math.cos(now * speed);

    // 1. X Position (Sway side to side)
    // body.localTransform.position[0] = initials.bodyPos[0] + sway * swayMagnitude; // This was commented out in your example
    
    // 2. Y Position (Bob up at the peak of the sway)
    body.localTransform.position[1] = initials.bodyPos[1] + absSway * bobMagnitude;
    
    // 3. Z Position (Move forward at the peak of the sway)
    body.localTransform.position[2] = initials.bodyPos[2] + absSway * zMoveMagnitude;

    // 4. X Rotation (Hump/lean forward at the peak of the sway)
    body.localTransform.rotation[0] = initials.bodyRot[0] - absSway * humpMagnitude;
    
    // 5. Y Rotation (Turn side to side)
    body.localTransform.rotation[1] = initials.bodyRot[1] + sway * turnMagnitude;
    
    // 6. Z Rotation (Tilt side to side)
    body.localTransform.rotation[2] = initials.bodyRot[2] + sway * tiltMagnitude;

    // --- Animate Legs (Stretch/Squash) ---
    const legStretchMagnitude = -0.2; 
    leftLegTop.localTransform.scale[1] = initials.leftLegScale[1] + sway * legStretchMagnitude;
    rightLegTop.localTransform.scale[1] = initials.rightLegScale[1] - sway * legStretchMagnitude;
    
    // --- Animate Arms (Flap/Bounce) ---
    const rightArmFlapMag = -0.3;
    const rightArmBounceMag = 0.15;
    const leftArmFlapMag = 0.3;
    const leftArmBounceMag = -0.15; 

    // 1. Flap (based on position)
    const rightFlap = Math.max(0, sway) * rightArmFlapMag;
    const leftFlap = Math.max(0, -sway) * leftArmFlapMag;

    // 2. Bounce (based on velocity)
    const rightBounce = -swayVelocity * rightArmBounceMag;
    const leftBounce = swayVelocity * leftArmBounceMag;

    // 3. Apply both
    rightArmTop.localTransform.rotation[2] = initials.rightArmRot[2] + leftFlap + leftBounce;
    leftArmTop.localTransform.rotation[2] = initials.leftArmRot[2] + rightFlap + rightBounce;
}

function updateGigantamaxAnimation(now, gmaxRefs, gl, buffers) {
    // Check if refs are valid
    if (!gmaxRefs || !gmaxRefs.modelRoot) {
        console.error("Invalid gmaxRefs passed to updateGigantamaxAnimation");
        return;
    }

    // --- G-Max Body Breath ---
    const breathSpeed = 0.5; 
    const breathAmount = 0.02;
    const breathScaleFactor = 1.0 + Math.sin(now * breathSpeed * 2 * Math.PI) * breathAmount;
    if (gmaxRefs.initialBodyScaleY !== undefined) {
         gmaxRefs.modelRoot.localTransform.scale[1] = gmaxRefs.initialBodyScaleY * breathScaleFactor;
    }

    // --- G-Max Arm Pump ---
    // This animation scales the arms and moves them up/down slightly relative to their starting position.
    const armAnimSpeed = 0.8;
    const armCycle = (Math.sin(now * armAnimSpeed * Math.PI) + 1) / 2; // Oscillates 0 -> 1 -> 0

    if (gmaxRefs.leftArmNode && gmaxRefs.initialLeftArmTransform) {
        const minScaleY = gmaxRefs.initialLeftArmTransform.scale[1];
        const maxScaleY = gmaxRefs.initialRightArmTransform.scale[1]; // Assuming right arm is the 'max' scale
        
        const leftArmScaleY = minScaleY + armCycle * (maxScaleY - minScaleY);
        gmaxRefs.leftArmNode.localTransform.scale[1] = leftArmScaleY;
        
        // Animate Y position slightly, relative to its initial local position
        const armYMoveAmount = 0.2; // How much the arm moves up/down
        gmaxRefs.leftArmNode.localTransform.position[1] = gmaxRefs.initialLeftArmTransform.position[1] + (armCycle * armYMoveAmount);
    }
    
    if (gmaxRefs.rightArmNode && gmaxRefs.initialRightArmTransform) {
        const minScaleY = gmaxRefs.initialLeftArmTransform.scale[1];
        const maxScaleY = gmaxRefs.initialRightArmTransform.scale[1];
        
        const rightArmScaleY = maxScaleY - armCycle * (maxScaleY - minScaleY); // Opposite of left
        gmaxRefs.rightArmNode.localTransform.scale[1] = rightArmScaleY;

        // Animate Y position in the opposite direction
        const armYMoveAmount = 0.2;
        gmaxRefs.rightArmNode.localTransform.position[1] = gmaxRefs.initialRightArmTransform.position[1] + ((1 - armCycle) * armYMoveAmount);
    }

    // --- G-Max Tail Swing ---
    const tailAnimSpeed = 1.5;
    const tailCurveDepth = 0.2;
    const swingFactor = Math.cos(now * tailAnimSpeed); // Oscillates -1 -> 1 -> -1
    
    if (gmaxRefs.tailNode && gmaxRefs.initialTailTransform) {
        gmaxRefs.tailNode.localTransform.position[0] = gmaxRefs.initialTailTransform.position[0] * swingFactor;
        gmaxRefs.tailNode.localTransform.position[2] = gmaxRefs.initialTailTransform.position[2] - tailCurveDepth * (1 - Math.abs(swingFactor));
        gmaxRefs.tailNode.localTransform.rotation[1] = gmaxRefs.initialTailTransform.rotation[1] - swingFactor;
    }

    // --- G-Max Cloud Rotation ---
    const cloudSpeed = 0.5;
    if (gmaxRefs.cloudParentNode) {
        gmaxRefs.cloudParentNode.localTransform.rotation[1] = now * cloudSpeed;
    }

    // --- G-Max Dynamic Tongue ---
    if (gmaxRefs.tongueNode && gmaxRefs.tongueNode.buffers && buffers.gmaxTongue) {
        // Create new tongue geometry based on time
        const updatedTongueGeometry = createTongue({ time: now }); 
        
        // Bind the correct, existing tongue buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.gmaxTongue.position);
        // Update just the vertex data in the buffer
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(updatedTongueGeometry.vertices));
        
        // You should also update normals if they change (createTongue normals are static, so this is optional)
        // gl.bindBuffer(gl.ARRAY_BUFFER, buffers.gmaxTongue.normal);
        // gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(updatedTongueGeometry.normals));
    }
}

function main() {
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl");
    if (!gl) { alert("Unable to initialize WebGL."); return; }

    // --- Shader Setup (Using Gastly/G-Max shaders with uIsGlowing) ---
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource); // Use Gastly's vs/fsSource
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
            objectColor: gl.getUniformLocation(shaderProgram, 'uObjectColor'),
            isGlowing: gl.getUniformLocation(shaderProgram, 'uIsGlowing'),
            viewPosition: gl.getUniformLocation(shaderProgram, 'uViewPosition'),
        },
    };

    // Gastly Geometries
    const gastlyBody_Geom = createSphere(1.0, 32, 32);
    const gastlyEye_Geom = createEllipticParaboloid(0.3, 0.2, 0.15, 16, 12);
    const gastlyMouth_Geom = createMouthFromBezier(30);
    const gastlyPupil_Geom = createSphere(0.1, 12, 12);
    const gastlyFang_Geom = createCone(0.08, 0.3, 10);
    const gastlyGasAura_Geom = createGasAura(20, 24);

    // Haunter Geometries
    const haunterHead_Geom = createHaunterSphere(1.0, 48, 48);
    const haunterTail_Geom = createHaunterCone(0.5, 2, 48);
    const haunterEye_Geom = createHaunterEllipticParaboloid(1.0, 0.6, 0.2, 32, 16, 1);
    const haunterPupil_Geom = createHaunterEllipticParaboloid(0.09, 0.12, 0.02, 18, 8, 1.18);
    const haunterArm_Geom = createHaunterCylinder(0.2, 0.2, 0.7, 32, 5);
    const haunterPalm_Geom = createHaunterSphere(0.5, 24, 24);
    const haunterFingerBase_Geom = createHaunterCylinder(0.5, 0.5, 1.0, 12, 1);
    const haunterFingerTip_Geom = createHaunterCone(0.5, 1.0, 12);
    const haunterMouth_Geom = createHaunterMouth(30);
    const haunterTooth_Geom = createHaunterCone(0.08, 0.25, 8, 0.1);

    // Gengar Geometries
    const gengarBody_Geom = createEllipsoid(1.0, 1.0, 1.0, 32, 24);
    const gengarCone_Geom = createQuadricCone(1.5, 1.5, 1.0, 60, 30);
    const gengarEye_Geom = createHemisphereWithHole(1.0, 32, 32, { phiStart: 0, phiLength: 0, thetaStart: 0, thetaLength: 0 });
    const gengarPupil_Geom = createEllipsoid(1.0, 1.0, 1.0, 32, 24);
    const gengarArm_Geom = createEllipticParaboloid(1.0, 0.6, 0.2, 32, 200);
    const gengarCylinder_Geom = createQuadricCylinder(1.0, 1.0, 32);
    const gengarSmile_Geom = createSmileMesh(1.1, 0.3, -0.2, 30);
    const gengarMouthBack_Geom = createDisc(80);
    const gengarTail_Geom = createShearedCone(1.0, 2.0, 1.5, 0, 36, 24);
    const gengarTail_GeomB = createGengarTail(1.25, 1.5, 24, 12, 0.8, 0);

    // G-Max Geometries
    const gmaxBody_Geom = createHemisphereWithHole(1.0, 300, 300, { phiStart: Math.PI/2 - 0.7, phiLength: 1.4, thetaStart: 0.8, thetaLength: 0.72 });
    const gmaxTooth_Geom = createTooth(0.5, 0.4, 0.02);
    const gmaxTongueInitial_Geom = createTongue();
    const gmaxCloud_Geom = createCloudEllipsoid(1.0, 1.0, 1.0, 16, 12);
    const gmaxEye_Geom = createEllipticParaboloid(1.0, 0.6, 0.2, 32, 16);
    const gmaxPupil_Geom = createEllipticParaboloid(1.0, 0.6, 0.2, 32, 60);

    // Environment Geometries
    const floor_Geom = createWavyPlane(40, 40, 50, 50);
    const crystal_Geom = createCrystal(3.0, 1.0, 6);

    // ============================================
    // 2. CREATE ALL BUFFERS
    // ============================================
    const buffers = {}; // Create empty object first to allow reuse

    // Gastly Buffers
    buffers.gastlyBody = initBuffers(gl, gastlyBody_Geom);
    buffers.gastlyEye = initBuffers(gl, gastlyEye_Geom);
    buffers.gastlyMouth = initBuffers(gl, gastlyMouth_Geom);
    buffers.gastlyFang = initBuffers(gl, gastlyFang_Geom);
    buffers.gastlyPupil = initBuffers(gl, gastlyPupil_Geom);
    buffers.gastlyGasAura = initBuffers(gl, gastlyGasAura_Geom);

    // Haunter Buffers
    buffers.haunterHead = initBuffers(gl, haunterHead_Geom);
    buffers.haunterTail = initBuffers(gl, haunterTail_Geom);
    buffers.haunterEye = initBuffers(gl, haunterEye_Geom);
    buffers.haunterPupil = initBuffers(gl, haunterPupil_Geom);
    buffers.haunterArm = initBuffers(gl, haunterArm_Geom);
    buffers.haunterPalm = initBuffers(gl, haunterPalm_Geom);
    buffers.haunterFingerBase = initBuffers(gl, haunterFingerBase_Geom);
    buffers.haunterFingerTip = initBuffers(gl, haunterFingerTip_Geom);
    buffers.haunterMouth = initBuffers(gl, haunterMouth_Geom);
    buffers.haunterTooth = initBuffers(gl, haunterTooth_Geom);

    // Gengar Buffers
    buffers.gengarBody = initBuffers(gl, gengarBody_Geom);
    buffers.gengarCone = initBuffers(gl, gengarCone_Geom);
    buffers.gengarEye = initBuffers(gl, gengarEye_Geom);
    buffers.gengarPupil = initBuffers(gl, gengarPupil_Geom);
    buffers.gengarArm = initBuffers(gl, gengarArm_Geom);
    buffers.gengarMouthBack = initBuffers(gl, gengarMouthBack_Geom);
    buffers.gengarTail = initBuffers(gl, gengarTail_Geom);
    buffers.gengarCylinder = initBuffers(gl, gengarCylinder_Geom);
    buffers.gengarSmile = initBuffers(gl, gengarSmile_Geom);
    buffers.gengarTailB = initBuffers(gl, gengarTail_GeomB);

    // G-Max Buffers
    buffers.gmaxBody = initBuffers(gl, gmaxBody_Geom);
    buffers.gmaxCone = buffers.gengarCone;
    buffers.gmaxTooth = initBuffers(gl, gmaxTooth_Geom);
    buffers.gmaxTongue = initBuffers(gl, gmaxTongueInitial_Geom, gl.DYNAMIC_DRAW);
    buffers.gmaxEye = initBuffers(gl, gmaxEye_Geom);
    buffers.gmaxPupil = initBuffers(gl, gmaxPupil_Geom);
    buffers.gmaxArm = buffers.gengarArm;
    buffers.gmaxMouthBack = buffers.gengarMouthBack;
    buffers.gmaxCloud = initBuffers(gl, gmaxCloud_Geom);
    buffers.gmaxTail = buffers.gengarTail;

    // Environment Buffers
    buffers.floor = initBuffers(gl, floor_Geom);
    buffers.crystal = initBuffers(gl, crystal_Geom);

    // ============================================
    // 3. BUILD SCENE GRAPH using Builder Functions
    // ============================================
    const root = new SceneNode();

    // --- Environment ---
    const floorNode = new SceneNode({
        buffers: buffers.floor,
        localTransform: { position: [0, -2.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        color: [0.1, 0.05, 0.15, 1.0]
    });
    root.addChild(floorNode);

    // Add Crystals
    const glowingCrystalColor = [1.0, 0.4, 0.7, 1.0];
    // const darkCrystalColor = [0.5, 0.1, 0.3, 1.0];
    // Define placeCluster here or globally
    function placeCluster(clusterPrefab, options) {
        const placerNode = new SceneNode({ localTransform: { position: options.position, rotation: options.rotation, scale: options.scale } });
        // Pass the specific crystal buffer here
        const cluster = clusterPrefab({ crystalBuffers: buffers.crystal, color: options.color, glowing: options.glowing });
        placerNode.addChild(cluster);
        root.addChild(placerNode);
    }
    placeCluster(createCrystalClusterA, { position: [-5, -2.0, -8], rotation: [0, 0.5, 0], scale: [1.2, 1.2, 1.2], glowing: true, color: glowingCrystalColor });
    placeCluster(createCrystalClusterB, { position: [-10, -2.1, -2], rotation: [0, 1.2, 0], scale: [1.0, 1.5, 1.0], glowing: true, color: glowingCrystalColor });
    placeCluster(createCrystalClusterB, { position: [6, -1.9, -6], rotation: [0, -0.8, 0], scale: [1.5, 1.8, 1.5], glowing: true, color: glowingCrystalColor });
    placeCluster(createCrystalClusterA, { position: [11, -2.0, 0], rotation: [0, -1.5, 0], scale: [0.9, 1.1, 0.9], glowing: true, color: glowingCrystalColor });
    placeCluster(createCrystalClusterB, { position: [2, -2.1, -15], rotation: [0, 0.1, 0], scale: [2.0, 2.5, 2.0], glowing: true, color: glowingCrystalColor });

    // --- Create Pokémon Models ---
    const gastlyData = createGastlyNode(buffers);
    const haunterData = createHaunterNode(buffers);
    const gengarData = createGengarNode(gl, buffers);
    const gigantamaxData = createGigantamaxNode(gl, buffers);

    // --- Position Pokémon ---
    gastlyData.modelRoot.localTransform.position = [7 , 6, 0];
    gengarData.modelRoot.localTransform.rotation = [0, 0.2, 0];
    haunterData.modelRoot.localTransform.position = [7, 0, 0];
    gengarData.modelRoot.localTransform.position = [-6.5, -0.15, 0];
    gengarData.modelRoot.localTransform.rotation = [0, -0.1, 0];
    gigantamaxData.modelRoot.localTransform.position = [0, -2, -1];
    // gigantamaxData.modelRoot.localTransform.scale = [1.5, 1.5, 1.5]; // Optional

    gastlyData.initials.bodyPos = [...gastlyData.modelRoot.localTransform.position];
    gengarData.initials.bodyPos = [...gengarData.modelRoot.localTransform.position];
    gengarData.initials.bodyRot = [...gengarData.modelRoot.localTransform.rotation];

    // --- Add Pokémon to Scene ---
    root.addChild(gastlyData.modelRoot);
    root.addChild(haunterData.modelRoot);
    root.addChild(gengarData.modelRoot);
    root.addChild(gigantamaxData.modelRoot);

    // ============================================
    // 4. CAMERA CONTROLS & RENDER LOOP
    // ============================================
    let isDragging = false;
    let cameraRotation = { x: 0.15, y: 0.0 };
    let cameraDistance = 22.0;
    canvas.addEventListener('mousedown', (e) => { isDragging = true; previousMousePosition = { x: e.clientX, y: e.clientY }; canvas.style.cursor = 'grabbing'; });
    window.addEventListener('mouseup', () => { isDragging = false; canvas.style.cursor = 'grab'; });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        cameraRotation.y += deltaX * 0.01;
        cameraRotation.x += deltaY * 0.01;
        cameraRotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraRotation.x)); // Clamp vertical angle
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        cameraDistance += e.deltaY * 0.02; // Adjust sensitivity
        cameraDistance = Math.max(3.0, Math.min(40.0, cameraDistance)); // Clamp zoom
    }, { passive: false });

    function renderNode(node, parentWorldMatrix, viewMatrix) {
        const worldMatrix = node.getWorldMatrix(parentWorldMatrix);
        
        if (node.buffers) {
            // Check for transparency
            if (node.isTransparent) {
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            } else {
                gl.disable(gl.BLEND);
            }
            
            const modelViewMatrix = createMat4();
            multiply(modelViewMatrix, viewMatrix, worldMatrix);
            
            gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
            
            const normalMatrix = createMat4();
            invert(normalMatrix, modelViewMatrix);
            transpose(normalMatrix, normalMatrix);
            gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);
            
            gl.uniform4fv(programInfo.uniformLocations.objectColor, node.color);
            gl.uniform1i(programInfo.uniformLocations.isGlowing, node.isGlowing);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, node.buffers.position);
            gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, node.buffers.normal);
            gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
            
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, node.buffers.indices);
            gl.drawElements(gl.TRIANGLES, node.buffers.vertexCount, gl.UNSIGNED_SHORT, 0);
        }
        
        node.children.forEach(child => renderNode(child, worldMatrix, viewMatrix));
    }
    // --- Store Animation References ---
    const animationRefs = { gastly: gastlyData, haunter: haunterData, gengar: gengarData, gigantamax: gigantamaxData };

    // --- Render Loop ---
    let lastTime = 0;
    function render(now) {
        // ... (now *= 0.001, deltaTime, resize, clear) ...
        now *= 0.001;
        const deltaTime = now - lastTime;
        lastTime = now;

        resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.12, 0.05, 0.09, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.BLEND); // Disable blend by default
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


        // --- Calculate Matrices ---
        const fieldOfView = 45 * Math.PI / 180;
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const projectionMatrix = createMat4();
        perspective(projectionMatrix, fieldOfView, aspect, 0.1, 100.0);

        const viewMatrix = createMat4();
        identity(viewMatrix);

        // Apply camera rotation and translation
        translate(viewMatrix, viewMatrix, [0, 0, -cameraDistance]); // Move back
        rotateX(viewMatrix, viewMatrix, cameraRotation.x);        // Apply pitch
        rotateY(viewMatrix, viewMatrix, cameraRotation.y);        // Apply yaw


        // --- Update Animations ---
        updateGastlyAnimation(now, animationRefs.gastly);
        updateHaunterAnimation(now, animationRefs.haunter);
        updateGengarAnimation(now, animationRefs.gengar);
        updateGigantamaxAnimation(now, animationRefs.gigantamax, gl, buffers);

        // --- Draw Scene ---
        gl.useProgram(programInfo.program);
        gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
        gl.uniform3fv(programInfo.uniformLocations.lightPosition, [5.0, 10.0, 15.0]); // Adjust light

        renderNode(root, null, viewMatrix); // Draw everything

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

function setupControls() {
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
        <button id="btnIdle" class="active">Idle</button>
    `;
    controls.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 100;
        background: rgba(0,0,0,0.7);
        padding: 10px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
    `;
    document.body.appendChild(controls);
    
    const style = document.createElement('style');
    style.textContent = `
        .controls button {
            background: #4a2a5a;
            color: white;
            border: none;
            padding: 8px 16px;
            margin: 2px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        .controls button.active {
            background: #8a4ca8;
            box-shadow: 0 0 10px #8a4ca8;
        }
        .controls button:hover {
            background: #6a3a7a;
        }
    `;
    document.head.appendChild(style);

    document.getElementById('btnIdle').addEventListener('click', function() {
        setAnimation('idle', this);
    });
}

function setAnimation(newAnimation, button) {
    animation = newAnimation;
    document.querySelectorAll('.controls button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function initShaderProgram(gl, vsSource, fsSource) { 
    const vertexShader=loadShader(gl, gl.VERTEX_SHADER, vsSource); 
    const fragmentShader=loadShader(gl, gl.FRAGMENT_SHADER, fsSource); 
    const shaderProgram=gl.createProgram(); 
    gl.attachShader(shaderProgram, vertexShader); 
    gl.attachShader(shaderProgram, fragmentShader); 
    gl.linkProgram(shaderProgram); 
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { 
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram)); 
        return null; 
    } 
    return shaderProgram; 
}

function loadShader(gl, type, source) { 
    const shader=gl.createShader(type); 
    gl.shaderSource(shader, source); 
    gl.compileShader(shader); 
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { 
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader)); 
        gl.deleteShader(shader); 
        return null; 
    } 
    return shader; 
}

function resizeCanvasToDisplaySize(canvas) { 
    const displayWidth=canvas.clientWidth; 
    const displayHeight=canvas.clientHeight; 
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) { 
        canvas.width=displayWidth; 
        canvas.height=displayHeight; 
        return true; 
    } 
    return false; 
}

function initBuffers(gl, geometry, usage = gl.STATIC_DRAW) { 
    const positionBuffer=gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.vertices), usage); 
    const normalBuffer=gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer); 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.normals), usage); 
    const indexBuffer=gl.createBuffer(); 
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); 
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.indices), gl.STATIC_DRAW); 
    return { 
        position: positionBuffer, 
        normal: normalBuffer, 
        indices: indexBuffer, 
        vertexCount: geometry.indices.length, 
    }; 
}

// ============================================
// GEOMETRY FUNCTIONS
// ============================================

// 1. SPHERE untuk badan Gastly
function createSphere(radius, latBands, longBands) {
    const vertices = [];
    const normals = [];
    const indices = [];

    for (let lat = 0; lat <= latBands; lat++) {
        const theta = lat * Math.PI / latBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let long = 0; long <= longBands; long++) {
            const phi = long * 2 * Math.PI / longBands;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const x = cosPhi * sinTheta;
            const y = cosTheta;
            const z = sinPhi * sinTheta;

            vertices.push(radius * x, radius * y, radius * z);
            normals.push(x, y, z);
        }
    }

    for (let lat = 0; lat < latBands; lat++) {
        for (let long = 0; long < longBands; long++) {
            const first = (lat * (longBands + 1)) + long;
            const second = first + longBands + 1;

            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }

    return { vertices, normals, indices };
}

// 2. ELLIPTIC PARABOLOID untuk mata Gastly
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
// 3. CONE untuk taring (QUADRIC OBJECT - bukan ellipsoid/cylinder)
function createCone(radius, height, segments) {
    const vertices = [];
    const normals = [];
    const indices = [];

    // Apex (puncak cone)
    vertices.push(0, height, 0);
    normals.push(0, 1, 0);

    // Base center
    const centerIdx = 1;
    vertices.push(0, 0, 0);
    normals.push(0, -1, 0);

    // Base vertices
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        vertices.push(x, 0, z);
        
        // Normal untuk sisi cone
        const sideLength = Math.sqrt(radius * radius + height * height);
        const nx = (height / sideLength) * Math.cos(angle);
        const ny = radius / sideLength;
        const nz = (height / sideLength) * Math.sin(angle);
        normals.push(nx, ny, nz);
    }

    // Side triangles (from apex)
    const baseStart = 2;
    for (let i = 0; i < segments; i++) {
        indices.push(0, baseStart + i, baseStart + i + 1);
    }

    // Bottom cap triangles
    for (let i = 0; i < segments; i++) {
        indices.push(centerIdx, baseStart + i + 1, baseStart + i);
    }

    return { vertices, normals, indices };
}

// 4. MULUT dari BEZIER CURVE (KURVA 2D) - Wide Smile
function createMouthFromBezier(segments) {
    const vertices = [];
    const normals = [];
    const indices = [];

    // Control points untuk wide smile Gastly (U terbalik lebar)
    const topCurve = [
        [-1, 0.1, -0.3],
        [-1, 0.1, 0.15],
        [1, 0.1, 0.15],
        [1.0, 0.1, -0.3]
    ];

    const bottomCurve = [
        [-1.0, 0.1, -0.26],
        [-0.2, -0.7, 0.1],
        [0.2, -0.7, 0.1],
        [1.0, 0.1, -0.26]
    ];

    // Cubic Bezier function
    function bezier(t, p0, p1, p2, p3) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        const x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
        const y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
        const z = uuu * p0[2] + 3 * uu * t * p1[2] + 3 * u * tt * p2[2] + ttt * p3[2];
        
        return [x, y, z];
    }

    // Generate curves
    const topPoints = [];
    const bottomPoints = [];
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        topPoints.push(bezier(t, topCurve[0], topCurve[1], topCurve[2], topCurve[3]));
        bottomPoints.push(bezier(t, bottomCurve[0], bottomCurve[1], bottomCurve[2], bottomCurve[3]));
    }

    // Create mesh
    const depth = 0.05;
    for (let i = 0; i <= segments; i++) {
        const top = topPoints[i];
        const bottom = bottomPoints[i];
        
        // Front vertices
        vertices.push(top[0], top[1], top[2]);
        normals.push(0, 0, 1);
        
        vertices.push(bottom[0], bottom[1], bottom[2]);
        normals.push(0, 0, 1);
        // const backOffset = 0.1; // Sedikit ke belakang dari Z asli
        // // Back vertices
        // positions.push(top[0], top[1], -top[2] - backOffset);
        // normals.push(0, 0, -1);
        
        // positions.push(bottom[0], bottom[1], -bottom[2] - backOffset);
        // normals.push(0, 0, -1);
    }

    // Generate indices
    for (let i = 0; i < segments; i++) {
        const base = i * 4;
        const next = (i + 1) * 4;
        
        // Front face
        indices.push(base, base + 1, next);
        indices.push(base + 1, next + 1, next);
        
        // Back face
        indices.push(base + 2, next + 2, base + 3);
        indices.push(base + 3, next + 2, next + 3);
    }

    return { vertices, normals, indices };
}
// 3. GAS AURA untuk efek gas Gastly
function createGasAura(segments, rings) {
    const vertices = [];
    const normals = [];
    const indices = [];

    // Control points untuk profil gas mengelilingi sphere
    const profileControl = [
        [0.0, 0.4, 0.0],
        [0.8, 0.3, 0.8],
        [0.9, -0.7, 0.8],
        [0.4, -0.9, 0.4]
    ];

    // Cubic Bezier 3D
    function bezier3D(t, p0, p1, p2, p3) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        const x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
        const y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
        const z = uuu * p0[2] + 3 * uu * t * p1[2] + 3 * u * tt * p2[2] + ttt * p3[2];
        
        return [x, y, z];
    }

    // Generate surface of revolution
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const profile = bezier3D(t, profileControl[0], profileControl[1], profileControl[2], profileControl[3]);
        
        const baseRadius = Math.abs(profile[0]);
        const yPos = profile[1];
        
        for (let j = 0; j <= rings; j++) {
            const angle = (j / rings) * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            
            // Organic variation
            const variation = Math.sin(t * Math.PI * 4 + angle * 3) * 0.1;
            const currentRadius = baseRadius + variation;
            
            const x = currentRadius * cosA;
            const y = yPos;
            const z = currentRadius * sinA;
            
            vertices.push(x, y, z);
            
            // Normal pointing outward
            const len = Math.sqrt(cosA * cosA + sinA * sinA + 0.09);
            normals.push(cosA / len, 0.3 / len, sinA / len);
        }
    }

    // Generate indices
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < rings; j++) {
            const first = i * (rings + 1) + j;
            const second = first + rings + 1;

            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }

    return { vertices, normals, indices };
}

// ============================================
// HAUNTER START
// ============================================

function createHaunterSphere(radius=1, stacks=48, slices=48){
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

function createHaunterCone(radius = 1, height = 2, slices = 48, topRatio = 0.0) {
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

function createHaunterEllipticParaboloid(a, b, height, segments = 36, stacks = 24, sharpness = 1.0) {
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

function createHaunterConeGeometry(radius = 0.1, height = 0.3, segments = 24) {
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

function createHaunterConeBuffer(gl, radius = 0.1, height = 0.3, segments = 24) {
  const geom = createHaunterConeGeometry(radius, height, segments);
  return initBuffers(gl, geom);
}

function createHaunterCylinder(radiusTop, radiusBottom, height, radialSegments, heightSegments) {
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

// ============================================
// HAUNTER END
// ============================================

// ============================================
// GENGAR START
// ============================================
function createEllipsoid(rx, ry, rz, segments = 16, stacks = 12) {
    const vertices = [], normals = [], indices = [];
    
    for (let i = 0; i <= stacks; i++) {
        const theta = i * Math.PI / stacks;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        
        for (let j = 0; j <= segments; j++) {
            const phi = j * 2 * Math.PI / segments;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            
            const x = rx * cosPhi * sinTheta;
            const y = ry * cosTheta;
            const z = rz * sinPhi * sinTheta;
            
            vertices.push(x, y, z);

            // Calculate normals
            const nx = x;
            const ny = y;
            const nz = z;
            const len = Math.hypot(nx, ny, nz) || 1;
            normals.push(nx / len, ny / len, nz / len);
        }
    }
    
    for (let i = 0; i < stacks; i++) {
        for (let j = 0; j < segments; j++) {
            const first = (i * (segments + 1)) + j;
            const second = first + segments + 1;
            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }
    
    return { vertices, normals, indices };
}

function createQuadricCylinder(radius, height, segments = 36) {
    const vertices = [];
    const normals = [];
    const indices = [];
    const halfHeight = height / 2;

    // Helper to add vertices for caps
    function addCap(isTop) {
        const y = isTop ? halfHeight : -halfHeight;
        const normalY = isTop ? 1 : -1;
        const centerIndex = vertices.length / 3;
        
        // Center vertex
        vertices.push(0, y, 0);
        normals.push(0, normalY, 0);

        // Ring vertices
        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * 2 * Math.PI;
            const x = radius * Math.cos(theta);
            const z = radius * Math.sin(theta);
            vertices.push(x, y, z);
            normals.push(0, normalY, 0);
        }

        // Indices for the cap
        for (let j = 0; j < segments; j++) {
            const i1 = centerIndex + 1 + j;
            const i2 = centerIndex + 1 + j + 1;
            if (isTop) {
                indices.push(centerIndex, i2, i1); // Top cap (CCW)
            } else {
                indices.push(centerIndex, i1, i2); // Bottom cap (CW)
            }
        }
    }

    // Add top and bottom caps
    addCap(false); // Bottom cap
    addCap(true);  // Top cap

    // --- Cylinder Walls ---
    const wallStartIndex = vertices.length / 3;

    // Create two rings for the wall (bottom and top)
    for (let yLevel = 0; yLevel <= 1; yLevel++) {
        const y = (yLevel === 0) ? -halfHeight : halfHeight;
        
        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * 2 * Math.PI;
            const x = radius * Math.cos(theta);
            const z = radius * Math.sin(theta);
            
            vertices.push(x, y, z);
            
            // Normal for the wall points outwards
            const nx = Math.cos(theta);
            const nz = Math.sin(theta);
            const len = Math.hypot(nx, 0, nz) || 1; // Normalize
            normals.push(nx / len, 0, nz / len);
        }
    }

    // Indices for the walls
    for (let j = 0; j < segments; j++) {
        const i1 = wallStartIndex + j;              // Bottom ring, vertex j
        const i2 = wallStartIndex + j + 1;          // Bottom ring, vertex j+1
        const i3 = wallStartIndex + (segments + 1) + j; // Top ring, vertex j
        const i4 = wallStartIndex + (segments + 1) + j + 1; // Top ring, vertex j+1

        // Triangle 1 (faces outwards)
        indices.push(i1, i3, i2);
        // Triangle 2 (faces outwards)
        indices.push(i2, i3, i4);
    }

    return { vertices, normals, indices };
}

function createHemisphereWithHole(radius, lats, longs, hole) {
    const vertices = [], normals = [], indices = [];
    for (let i = 0; i <= lats / 2; i++) {
        const theta = i * Math.PI / lats;
        const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
        for (let j = 0; j <= longs; j++) {
            const phi = j * 2 * Math.PI / longs;
            const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
            const x = radius * cosPhi * sinTheta, y = radius * cosTheta, z = radius * sinPhi * sinTheta;
            vertices.push(x, y, z);
            normals.push(x / radius, y / radius, z / radius);
        }
    }
    for (let i = 0; i < lats / 2; i++) {
        for (let j = 0; j < longs; j++) {
            const first = (i * (longs + 1)) + j, second = first + longs + 1;
            const theta1 = i / lats * Math.PI, phi1 = j / longs * 2 * Math.PI;
            const inHole = (phi, theta) => {
            const phiRel = (phi - hole.phiStart) / hole.phiLength;
            const smileCurve = 0.015 * Math.cos((phiRel - 0.5) * Math.PI * 1.3);
            const curvedThetaStart = hole.thetaStart + smileCurve;
            return (
                phi >= hole.phiStart &&
                phi <= hole.phiStart + hole.phiLength &&
                theta >= curvedThetaStart &&
                theta <= hole.thetaStart + hole.thetaLength
            );
        };
            if (!inHole(phi1, theta1)) {
              indices.push(first, second, first + 1);
              indices.push(second, second + 1, first + 1);
            }
        }
    }
    const baseStartIndex = vertices.length / 3;
    for (let j = 0; j <= longs; j++) { const phi = j * 2 * Math.PI / longs; const x = radius * Math.cos(phi); const z = radius * Math.sin(phi); vertices.push(x, 0, z); normals.push(0, -1, 0); }
    const baseCenterIndex = vertices.length / 3;
    vertices.push(0,0,0); normals.push(0,-1,0);
    for (let j = 0; j < longs; j++) { indices.push(baseCenterIndex, baseStartIndex + j, baseStartIndex + j + 1); }
    return { vertices, normals, indices };
}


function createDisc(segments) {
    const vertices = [], normals = [], indices = [];
    vertices.push(0, 0, 0);
    normals.push(0, 0, 1);
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        vertices.push(0.5 * Math.cos(angle), 0.5 * Math.sin(angle), 0);
        normals.push(0, 0, 1);
    }
    for (let i = 1; i <= segments; i++) {
        indices.push(0, i, i + 1);
    }
    return { vertices, normals, indices };
}

function createTooth(width, height, depth) {
    const w = width / 2, h = height / 2, d = depth / 2;
    const vertices = [
        -w,-h,d, w,-h,d, w,h,d, -w,h,d,
        -w,-h,-d, -w,h,-d, w,h,-d, w,-h,-d,
        -w,h,-d, -w,h,d, w,h,d, w,h,-d,
        -w,-h,-d, w,-h,-d, w,-h,d, -w,-h,d,
        w,-h,-d, w,h,-d, w,h,d, w,-h,d,
        -w,-h,-d, -w,-h,d, -w,h,d, -w,h,-d
    ];
    const normals = [
        0,0,1, 0,0,1, 0,0,1, 0,0,1,
        0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
        0,1,0, 0,1,0, 0,1,0, 0,1,0,
        0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
        1,0,0, 1,0,0, 1,0,0, 1,0,0,
        -1,0,0, -1,0,0, -1,0,0, -1,0,0
    ];
    const indices = [];
    for (let i = 0; i < 6; i++) {
        const offset = i * 4;
        indices.push(offset, offset+1, offset+2, offset, offset+2, offset+3);
    }
    return { vertices, normals, indices };
}

function createTongue(length = 2.5, width = 0.6, height = 0.25, segments = 40, radialSegments = 20, closeBack = true) {
    const vertices = [];
    const normals = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const z = t * length;
        let yCenter = Math.sin(t * Math.PI) * height * 1.5;
        if (t > 0.7) {
            const extraCurve = Math.pow((t - 0.7) / 0.3, 2) * height * 1.6;
            yCenter += extraCurve;
        }
        let w;
        const startWidth = width * 0.28;
        const peakWidth = width * (0.28 + 0.8 * 0.8);
        const tipWidth = peakWidth * 0.5;
        if (t <= 0.8) {
            const progress = t / 0.8;
            const curveFactor = Math.sin(progress * (Math.PI / 2));
            w = startWidth + (peakWidth - startWidth) * curveFactor;
        } else {
            const progress = (t - 0.8) / 0.2;
            const curveFactor = progress * progress;
            w = peakWidth + (tipWidth - peakWidth) * curveFactor;
        }
        const h = height * (0.6 + t * 0.2);
        const tipBend = (t > 0.7) ? (t - 0.7) / 0.3 * 0.3 : 0.0;
        const cosB = Math.cos(tipBend);
        const sinB = Math.sin(tipBend);
        for (let j = 0; j <= radialSegments; j++) {
            const theta = (j / radialSegments) * Math.PI * 2;
            let x = Math.cos(theta) * w;
            let y = Math.sin(theta) * h;
            let zOffset = 0;
            const yRot = y * cosB - zOffset * sinB;
            const zRot = z + y * sinB + zOffset * cosB;
            vertices.push(x, yCenter + yRot, zRot);
            normals.push(Math.cos(theta), Math.sin(theta), 0);
        }
    }
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < radialSegments; j++) {
            const a = i * (radialSegments + 1) + j;
            const b = a + radialSegments + 1;
            indices.push(a, b, a + 1);
            indices.push(b, b + 1, a + 1);
        }
    }
    const frontCenterIndex = vertices.length / 3;
    const tipZ = length;
    let tipYCenter = Math.sin(1 * Math.PI) * height * 0.6 + height * 1.2;
    vertices.push(0, tipYCenter, tipZ);
    normals.push(0, 0, 1);
    const lastRingStart = segments * (radialSegments + 1);
    for (let j = 0; j < radialSegments; j++) {
        indices.push(frontCenterIndex, lastRingStart + j + 1, lastRingStart + j);
    }
    if (closeBack) {
        const backCenterIndex = vertices.length / 3;
        vertices.push(0, 0, 0);
        normals.push(0, 0, -1);
        for (let j = 0; j < radialSegments; j++) {
            indices.push(backCenterIndex, j, j + 1);
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

function createQuadricCone(a, b, height, segments = 36, stacks = 24) {
    const vertices = [];
    const normals = [];
    const indices = [];
    const halfHeight = height / 2;
    vertices.push(0, -halfHeight, 0);
    normals.push(0, -1, 0);
    const slopeLength = Math.sqrt(height * height + a * a);
    const normalY = a / slopeLength;
    const normalXZ = height / slopeLength;
    for (let i = 1; i <= stacks; i++) {
        const v = i / stacks;
        const y = -halfHeight + v * height;
        const rx = a * (1 - v);
        const rz = b * (1 - v);
        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * 2 * Math.PI;
            const x = rx * Math.cos(theta);
            const z = rz * Math.sin(theta);
            vertices.push(x, y, z);
            const nx = Math.cos(theta) * normalXZ;
            const ny = normalY;
            const nz = Math.sin(theta) * normalXZ;
            const len = Math.hypot(nx, ny, nz) || 1.0;
            normals.push(nx / len, ny / len, nz / len);
        }
    }
    for (let j = 0; j < segments; j++) {
        const apex = 0;
        const v1 = 1 + j;
        const v2 = 1 + j + 1;
        indices.push(apex, v2, v1);
    }
    for (let i = 0; i < stacks - 1; i++) {
        for (let j = 0; j < segments; j++) {
            const row1 = 1 + i * (segments + 1);
            const row2 = row1 + (segments + 1);
            const a1 = row1 + j;
            const a2 = row1 + j + 1;
            const b1 = row2 + j;
            const b2 = row2 + j + 1;
            indices.push(a1, a2, b1);
            indices.push(a2, b2, b1);
        }
    }
    return { vertices, normals, indices };
}

function createShearedCone(baseRadius, height, shearX, shearZ, segments = 36, stacks = 24) {
    const vertices = [];
    const normals = [];
    const indices = [];
    
    const halfHeight = height / 2;
    
    // Base center at origin
    vertices.push(0, -halfHeight, 0);
    normals.push(0, -1, 0);
    
    // Create rings from base to tip with horizontal shear
    for (let i = 1; i <= stacks; i++) {
        const v = i / stacks;
        const y = -halfHeight + v * height;
        
        // Apply shear - shift x and z based on height
        const shiftX = v * shearX;
        const shiftZ = v * shearZ;
        
        // Radius tapers from base to tip
        const r = baseRadius * (1 - v);
        
        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * 2 * Math.PI;
            const x = r * Math.cos(theta) + shiftX;
            const z = r * Math.sin(theta) + shiftZ;
            
            vertices.push(x, y, z);
            
            const nx = Math.cos(theta);
            const ny = 0.4;
            const nz = Math.sin(theta);
            const len = Math.hypot(nx, ny, nz) || 1.0;
            normals.push(nx / len, ny / len, nz / len);
        }
    }
    
    // Base cap triangles
    for (let j = 0; j < segments; j++) {
        const baseCenterIdx = 0;
        const v1 = 1 + j;
        const v2 = 1 + j + 1;
        indices.push(baseCenterIdx, v1, v2);
    }
    
    // Side triangles
    for (let i = 0; i < stacks - 1; i++) {
        for (let j = 0; j < segments; j++) {
            const row1 = 1 + i * (segments + 1);
            const row2 = row1 + (segments + 1);
            const a1 = row1 + j;
            const a2 = row1 + j + 1;
            const b1 = row2 + j;
            const b2 = row2 + j + 1;
            
            indices.push(a1, a2, b1);
            indices.push(a2, b2, b1);
        }
    }
    
    return { vertices, normals, indices };
}

function createSmileMesh(width, height, yOffset, segments) {
    const vertices = [], normals = [], indices = [];
    const bodyRadius = 1.0;

    // Shape control
    const topCurveFactor = -0.6;
    const bottomCurveFactor = 2.1;
    const edgeBoost = 1.0;

    for (let i = 0; i <= segments; i++) {
        const t = -1.0 + (2.0 * i / segments); // -1 to 1
        const x = t * width * 0.5;

        const edgeIntensity = Math.pow(Math.abs(t), 4.5) * edgeBoost + (t * t) * (1.0 - edgeBoost);

        const yBase = yOffset;

        const yTop = yBase + height * 0.5 - (topCurveFactor * edgeIntensity * height * 0.5);
        const yBottom = yBase - height * 0.2 + (bottomCurveFactor * edgeIntensity * height * 0.5);

        // Project to sphere surface
        const zTop = Math.sqrt(Math.max(0, bodyRadius * bodyRadius - x * x - yTop * yTop));
        const zBottom = Math.sqrt(Math.max(0, bodyRadius * bodyRadius - x * x - yBottom * yBottom));

        // Bottom vertex
        vertices.push(x, yBottom, zBottom);
        const nBot = [x, yBottom, zBottom];
        const lenBot = Math.hypot(...nBot) || 1;
        normals.push(...nBot.map(v => v / lenBot));

        // Top vertex
        vertices.push(x, yTop, zTop);
        const nTop = [x, yTop, zTop];
        const lenTop = Math.hypot(...nTop) || 1;
        normals.push(...nTop.map(v => v / lenTop));
    }

    // Indices for triangle strip
    for (let i = 0; i < segments; i++) {
        const i1 = i * 2;
        const i2 = i1 + 1;
        const i3 = i1 + 2;
        const i4 = i1 + 3;

        indices.push(i1, i3, i2);
        indices.push(i2, i3, i4);
    }

    return { vertices, normals, indices };
}


function createGengarTail(baseRadius, height, segments = 24, stacks = 8, curveAmount = 0.4, tipBluntness = 0.1) {
    const vertices = [];
    const normals = [];
    const indices = [];
    const startY = -height / 2; 

    vertices.push(0, startY, 0);
    normals.push(0, -1, 0);

    for (let i = 0; i <= stacks; i++) {
        const t = i / stacks;

        let radiusFactor = Math.pow(1 - t, 1.8);
        let r = baseRadius * radiusFactor;

        const easeOutT = 1 - Math.pow(1 - t, 3);
        const yCurve = curveAmount * Math.sin(t * Math.PI) * height * 0.7;
        const currentY = startY + t * height + yCurve * easeOutT;

        const zCurve = -curveAmount * Math.sin(t * Math.PI * 0.5) * height * 0.7;
        const currentZOffset = zCurve * easeOutT;

        if (i === stacks) {
            r = Math.max(baseRadius * tipBluntness * 0.2, 0.01);
        } else if (i === stacks - 1) {
             r = Math.max(r, baseRadius * tipBluntness * 0.6);
        }

        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * 2 * Math.PI;
            const cosTheta = Math.cos(theta);
            const sinTheta = Math.sin(theta);

            const x = r * cosTheta;
            const y = currentY;
            const z = r * sinTheta + currentZOffset;

            vertices.push(x, y, z);

            const nextT = Math.min(1, (i + 0.1) / stacks);
            const nextEaseOutT = 1 - Math.pow(1 - nextT, 3);
            const nextYCurve = curveAmount * Math.sin(nextT * Math.PI) * height * 0.6;
            const nextY = startY + nextT * height + nextYCurve * nextEaseOutT;
            const nextZCurve = -curveAmount * Math.sin(nextT * Math.PI * 0.5) * height * 0.7;
            const nextZOffset = nextZCurve * nextEaseOutT;

            const tangentY = (nextY - currentY) * 10;
            const tangentZ = (nextZOffset - currentZOffset) * 10;

            const coneNormalX = cosTheta;
            const coneNormalY = baseRadius / (height * 1.5);
            const coneNormalZ = sinTheta;

            let nx = coneNormalX;
            let ny = coneNormalY + tangentY * 0.3;
            let nz = coneNormalZ + tangentZ * 0.3;

            if (i > stacks * 0.8) {
                const tipFactor = (i - stacks * 0.8) / (stacks * 0.2);
                ny = ny * (1 - tipFactor) + 0.8 * tipFactor;
            }

            const len = Math.hypot(nx, ny, nz) || 1.0;
            normals.push(nx / len, ny / len, nz / len);
        }
    }

    const baseCenterIndex = 0;
    const firstRingStartIndex = 1;
    for (let j = 0; j < segments; j++) {
        indices.push(baseCenterIndex, firstRingStartIndex + j + 1, firstRingStartIndex + j);
    }
    for (let i = 0; i < stacks; i++) {
        const ring1StartIndex = 1 + i * (segments + 1);
        const ring2StartIndex = ring1StartIndex + (segments + 1);
        for (let j = 0; j < segments; j++) {
            const i1 = ring1StartIndex + j;
            const i2 = i1 + 1;
            const i3 = ring2StartIndex + j;
            const i4 = i3 + 1;
            indices.push(i1, i3, i2);
            indices.push(i2, i3, i4);
        }
    }
     const lastRingStartIndex = 1 + stacks * (segments + 1);
     const tipCenterApproxY = vertices[lastRingStartIndex * 3 + 1];
     const tipCenterApproxZ = vertices[lastRingStartIndex * 3 + 2];

     const tipCenterIndex = vertices.length / 3;
     vertices.push(0, tipCenterApproxY, tipCenterApproxZ);
     const avgTipNX = 0;
     const avgTipNY = 0.8;
     const avgTipNZ = -0.2;
     const tipNormLen = Math.hypot(avgTipNX, avgTipNY, avgTipNZ) || 1;
     normals.push(avgTipNX / tipNormLen, avgTipNY / tipNormLen, avgTipNZ / tipNormLen);

     for (let j = 0; j < segments; j++) {
         indices.push(lastRingStartIndex + j, tipCenterIndex, lastRingStartIndex + j + 1);
     }

    return { vertices, normals, indices };
}

// ============================================
// GENGAR END
// ============================================

// ============================================
// GIGANTAMAX START
// ============================================

function createCustomRing(segments, squareness, holeParams, sphereRadius = 1.0) {
    const vertices = [], normals = [], indices = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const len_circle = 1.0;
        const len_square = Math.max(Math.abs(cos), Math.abs(sin));
        const len = len_circle * (1.0 - squareness) + len_square * squareness;
        const x = 0.5 * cos / len;
        const y = 0.5 * sin / len;
        const zOuter = Math.sqrt(Math.max(0, sphereRadius * sphereRadius - x*x - y*y));
        vertices.push(x, y, zOuter);
        normals.push(x / sphereRadius, y / sphereRadius, zOuter / sphereRadius);
        const innerX = holeParams.offsetX + cos * holeParams.radiusX;
        const innerY = holeParams.offsetY + sin * holeParams.radiusY;
        const zInner = Math.sqrt(Math.max(0, sphereRadius * sphereRadius - innerX*innerX - innerY*innerY));
        vertices.push(innerX, innerY, zInner);
        normals.push(innerX / sphereRadius, innerY / sphereRadius, zInner / sphereRadius);
    }
    for (let i = 0; i < segments; i++) {
        const outer1 = i * 2, inner1 = i * 2 + 1;
        const outer2 = (i + 1) * 2, inner2 = (i + 1) * 2 + 1;
        indices.push(outer1, outer2, inner1);
        indices.push(inner1, outer2, inner2);
    }
    return { vertices, normals, indices };
}

function createTooth(width, height, depth) {
    const w = width / 2, h = height / 2, d = depth / 2;
    const vertices = [
        -w,-h,d, w,-h,d, w,h,d, -w,h,d,
        -w,-h,-d, -w,h,-d, w,h,-d, w,-h,-d,
        -w,h,-d, -w,h,d, w,h,d, w,h,-d,
        -w,-h,-d, w,-h,-d, w,-h,d, -w,-h,d,
        w,-h,-d, w,h,-d, w,h,d, w,-h,d,
        -w,-h,-d, -w,-h,d, -w,h,d, -w,h,-d
    ];
    const normals = [
        0,0,1, 0,0,1, 0,0,1, 0,0,1,
        0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
        0,1,0, 0,1,0, 0,1,0, 0,1,0,
        0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
        1,0,0, 1,0,0, 1,0,0, 1,0,0,
        -1,0,0, -1,0,0, -1,0,0, -1,0,0
    ];
    const indices = [];
    for (let i = 0; i < 6; i++) {
        const offset = i * 4;
        indices.push(offset, offset+1, offset+2, offset, offset+2, offset+3);
    }
    return { vertices, normals, indices };
}

function createTongue(options = {}) {
    const {
        length = 2.5,
        width = 0.6,
        height = 0.25,
        segments = 40,
        radialSegments = 20,
        closeBack = true,
        time = 0
    } = options;

    const vertices = [];
    const normals = [];
    const indices = [];

    const animSpeed = 2.5;
    const animAmount = 0.1;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const z = t * length;

        const yOffset = Math.sin(time * animSpeed + t * Math.PI * 2) * animAmount * Math.pow(t, 2);

        let yCenter = Math.sin(t * Math.PI) * height * 1.5;
        yCenter += yOffset; 

        if (t > 0.7) {
            const extraCurve = Math.pow((t - 0.7) / 0.3, 2) * height * 1.6;
            yCenter += extraCurve;
        }
        let w;
        const startWidth = width * 0.28;
        const peakWidth = width * (0.28 + 0.8 * 0.8);
        const tipWidth = peakWidth * 0.5;
        if (t <= 0.8) {
            const progress = t / 0.8;
            const curveFactor = Math.sin(progress * (Math.PI / 2));
            w = startWidth + (peakWidth - startWidth) * curveFactor;
        } else {
            const progress = (t - 0.8) / 0.2;
            const curveFactor = progress * progress;
            w = peakWidth + (tipWidth - peakWidth) * curveFactor;
        }
        const h = height * (0.6 + t * 0.2);
        const tipBend = (t > 0.7) ? (t - 0.7) / 0.3 * 0.3 : 0.0;
        const cosB = Math.cos(tipBend);
        const sinB = Math.sin(tipBend);
        for (let j = 0; j <= radialSegments; j++) {
            const theta = (j / radialSegments) * Math.PI * 2;
            let x = Math.cos(theta) * w;
            let y = Math.sin(theta) * h;
            let zOffset = 0;
            const yRot = y * cosB - zOffset * sinB;
            const zRot = z + y * sinB + zOffset * cosB;
            vertices.push(x, yCenter + yRot, zRot);
            normals.push(Math.cos(theta), Math.sin(theta), 0);
        }
    }
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < radialSegments; j++) {
            const a = i * (radialSegments + 1) + j;
            const b = a + radialSegments + 1;
            indices.push(a, b, a + 1);
            indices.push(b, b + 1, a + 1);
        }
    }
    const frontCenterIndex = vertices.length / 3;
    const tipZ = length;
    let tipYCenter = Math.sin(1 * Math.PI) * height * 0.6 + height * 1.2;
    vertices.push(0, tipYCenter, tipZ);
    normals.push(0, 0, 1);
    const lastRingStart = segments * (radialSegments + 1);
    for (let j = 0; j < radialSegments; j++) {
        indices.push(frontCenterIndex, lastRingStart + j + 1, lastRingStart + j);
    }
    if (closeBack) {
        const backCenterIndex = vertices.length / 3;
        vertices.push(0, 0, 0);
        normals.push(0, 0, -1);
        for (let j = 0; j < radialSegments; j++) {
            indices.push(backCenterIndex, j, j + 1);
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

function createQuadricCone(a, b, height, segments = 36, stacks = 24) {
    const vertices = [];
    const normals = [];
    const indices = [];
    const halfHeight = height / 2;
    vertices.push(0, -halfHeight, 0);
    normals.push(0, -1, 0);
    const slopeLength = Math.sqrt(height * height + a * a);
    const normalY = a / slopeLength;
    const normalXZ = height / slopeLength;
    for (let i = 1; i <= stacks; i++) {
        const v = i / stacks;
        const y = -halfHeight + v * height;
        const rx = a * (1 - v);
        const rz = b * (1 - v);
        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * 2 * Math.PI;
            const x = rx * Math.cos(theta);
            const z = rz * Math.sin(theta);
            vertices.push(x, y, z);
            const nx = Math.cos(theta) * normalXZ;
            const ny = normalY;
            const nz = Math.sin(theta) * normalXZ;
            const len = Math.hypot(nx, ny, nz) || 1.0;
            normals.push(nx / len, ny / len, nz / len);
        }
    }
    for (let j = 0; j < segments; j++) {
        const apex = 0;
        const v1 = 1 + j;
        const v2 = 1 + j + 1;
        indices.push(apex, v2, v1);
    }
    for (let i = 0; i < stacks - 1; i++) {
        for (let j = 0; j < segments; j++) {
            const row1 = 1 + i * (segments + 1);
            const row2 = row1 + (segments + 1);
            const a1 = row1 + j;
            const a2 = row1 + j + 1;
            const b1 = row2 + j;
            const b2 = row2 + j + 1;
            indices.push(a1, a2, b1);
            indices.push(a2, b2, b1);
        }
    }
    return { vertices, normals, indices };
}

function createShearedCone(baseRadius, height, shearX, shearZ, segments = 36, stacks = 24) {
    const vertices = [];
    const normals = [];
    const indices = [];
    const halfHeight = height / 2;
    
    vertices.push(0, -halfHeight, 0);
    normals.push(0, -1, 0);
    
    for (let i = 1; i <= stacks; i++) {
        const v = i / stacks;
        const y = -halfHeight + v * height;
        
        const shiftX = v * shearX;
        const shiftZ = v * shearZ;
        
        const r = baseRadius * (1 - v);
        
        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * 2 * Math.PI;
            const x = r * Math.cos(theta) + shiftX;
            const z = r * Math.sin(theta) + shiftZ;
            
            vertices.push(x, y, z);
            
            const nx = Math.cos(theta);
            const ny = 0.4;
            const nz = Math.sin(theta);
            const len = Math.hypot(nx, ny, nz) || 1.0;
            normals.push(nx / len, ny / len, nz / len);
        }
    }
    
    for (let j = 0; j < segments; j++) {
        const baseCenterIdx = 0;
        const v1 = 1 + j;
        const v2 = 1 + j + 1;
        indices.push(baseCenterIdx, v1, v2);
    }
    
    for (let i = 0; i < stacks - 1; i++) {
        for (let j = 0; j < segments; j++) {
            const row1 = 1 + i * (segments + 1);
            const row2 = row1 + (segments + 1);
            const a1 = row1 + j;
            const a2 = row1 + j + 1;
            const b1 = row2 + j;
            const b2 = row2 + j + 1;
            
            indices.push(a1, a2, b1);
            indices.push(a2, b2, b1);
        }
    }
    
    return { vertices, normals, indices };
}

function createCloudEllipsoid(rx, ry, rz, segments = 16, stacks = 12) {
    const vertices = [], normals = [], indices = [];
    
    for (let i = 0; i <= stacks; i++) {
        const theta = i * Math.PI / stacks;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        
        for (let j = 0; j <= segments; j++) {
            const phi = j * 2 * Math.PI / segments;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            
            const x = rx * cosPhi * sinTheta;
            const y = ry * cosTheta;
            const z = rz * sinPhi * sinTheta;
            
            vertices.push(x, y, z);
            normals.push(x / rx, y / ry, z / rz);
        }
    }
    
    for (let i = 0; i < stacks; i++) {
        for (let j = 0; j < segments; j++) {
            const first = (i * (segments + 1)) + j;
            const second = first + segments + 1;
            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }
    
    return { vertices, normals, indices };
}

// ============================================
// GIGANTAMAX END
// ============================================




// ============================================
// ENVIRONMENT GEOMETRY
// ============================================

function createWavyPlane(width, height, widthSegments, heightSegments) {
    const vertices = [], normals = [], indices = [];
    const width_half = width / 2;
    const height_half = height / 2;
    const gridX = Math.floor(widthSegments);
    const gridZ = Math.floor(heightSegments);
    const segment_width = width / gridX;
    const segment_height = height / gridZ;

    // vertices n normals for grid
    for (let iz = 0; iz <= gridZ; iz++) {
        const z = iz * segment_height - height_half;
        for (let ix = 0; ix <= gridX; ix++) {
            const x = ix * segment_width - width_half;
            
            // wave effect
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
        vertices.push(x, midHeight, z); // mid ring vertex
        vertices.push(x, 0, z);         // base ring vertex
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

    // main
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

    // main
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

window.onload = main;