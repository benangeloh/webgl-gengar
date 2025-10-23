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
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;
// class for hierarchical transformations
class SceneNode {
    constructor(options = {}) {
        this.buffers = options.buffers || null;
        this.localTransform = options.localTransform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
        this.color = options.color || [1, 1, 1, 1];
        this.isGlowing = options.isGlowing || false;
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
        mat4.rotate(m, m, this.localTransform.rotation[0], [1, 0, 0]);
        mat4.rotate(m, m, this.localTransform.rotation[1], [0, 1, 0]);
        mat4.rotate(m, m, this.localTransform.rotation[2], [0, 0, 1]);
        mat4.scale(m, m, this.localTransform.scale);
        return m;
    }

    getWorldMatrix(parentWorldMatrix = null) {
        const localMatrix = this.getLocalMatrix();
        if (parentWorldMatrix) {
            const worldMatrix = mat4.create();
            mat4.multiply(worldMatrix, parentWorldMatrix, localMatrix);
            return worldMatrix;
        }
        return localMatrix;
    }
}

function main() {
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl");
    if (!gl) { alert("Unable to initialize WebGL."); return; }

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
            isGlowing: gl.getUniformLocation(shaderProgram, 'uIsGlowing'), // Add this line
        },
    };

    // geometries
    const bodyGeometry = createHemisphereWithHole(1.0, 300, 300, {
        phiStart: Math.PI / 2 - 0.7,
        phiLength: 1.4,
        thetaStart: 0.8,
        thetaLength: 0.72
    });
    const coneGeometry = createQuadricCone(1.5, 1.5, 1.0, 60, 30);
    const toothGeom = createTooth(0.5, 0.4, 0.02);
    // const tongueGeometry = createTongue(2, 0.6, 0.2, 50); // We will create this dynamically
    const eyeGeometry = createEllipticParaboloid(1.0, 0.6, 0.2, 32, 16);
    const pupilGeometry = createEllipticParaboloid(1.0, 0.6, 0.2, 32, 60);
    const armGeometry = createEllipticParaboloid(1.0, 0.6, 0.2, 32, 200);
    const mouthBackGeometry = createDisc(80);
    const tailGeometry = createShearedCone(1.0, 2.0, 1.5, 0, 36, 24);


    // buffers
    const bodyBuffers = initBuffers(gl, bodyGeometry);
    const coneBuffers = initBuffers(gl, coneGeometry);
    const toothBuffers = initBuffers(gl, toothGeom);
    
    const tongueInitialGeometry = createTongue(); 
    const tongueBuffers = initBuffers(gl, tongueInitialGeometry, gl.DYNAMIC_DRAW);

    const eyeBuffers = initBuffers(gl, eyeGeometry);
    const pupilBuffers = initBuffers(gl, pupilGeometry);
    const armBuffers = initBuffers(gl, armGeometry);
    const mouthBackBuffers = initBuffers(gl, mouthBackGeometry);
    const cloudEllipsoidBuffers = initBuffers(gl, createCloudEllipsoid(1.0, 1.0, 1.0, 16, 12));
    const tailBuffers = initBuffers(gl, tailGeometry);

    const root = new SceneNode();

    const floorGeometry = createWavyPlane(40, 40, 50, 50);
    const floorBuffers = initBuffers(gl, floorGeometry);


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
        
    // body - parent 1
    const body = new SceneNode({
        buffers: bodyBuffers,
        localTransform: { position: [0.0, -1.75, 0.0], rotation: [0.0, 0.0, 0.0], scale: [4.0, 6.0, 4.0] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    root.addChild(body);
    
    const initialBodyScaleY = body.localTransform.scale[1];

    // ears (children of body)
    const leftEar = new SceneNode({
        buffers: coneBuffers,
        localTransform: { position: [-0.6, 0.943, -0.1], rotation: [-0.9, 0.6, 1.0], scale: [0.15, 0.55, 0.2] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(leftEar);

    const rightEar = new SceneNode({
        buffers: coneBuffers,
        localTransform: { position: [0.6, 0.943, -0.1], rotation: [-0.9, -0.6, -1.0], scale: [0.15, 0.55, 0.2] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(rightEar);

    // top spikes (children of body)
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
            buffers: coneBuffers,
            localTransform: { position: spike.pos, rotation: spike.rot, scale: spike.scale },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    // back spikes (children of body)
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
            buffers: coneBuffers,
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
            layerBuffers = mouthBackBuffers;
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

    // teeth (children of body)
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
                buffers: toothBuffers,
                localTransform: {
                    position: [x + 0.005, y, z],
                    rotation: [-0.45, angle, -0.125],
                    scale: [0.4, 0.233, 0.5]
                },
                color: [1.0, 1.0, 1.0, 1.0]
            }));
        } else {
            body.addChild(new SceneNode({
                buffers: toothBuffers,
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
            buffers: toothBuffers,
            localTransform: {
                position: [x, y, z],
                rotation: [0, angle, 0],
                scale: [0.6, 0.2, 0.5]
            },
            color: [1.0, 1.0, 1.0, 1.0]
        }));
    }

    // tongue (child of body)
    const tongueNode = new SceneNode({
        buffers: tongueBuffers,
        localTransform: {
            position: [0.0, 0.1, 0.3],
            rotation: [0.1, 0, 0],
            scale: [0.6, 0.333, 0.5]
        },
        color: [0.729, 0.204, 0.427, 1.0]
    });
    body.addChild(tongueNode);

    // eyes (children of body)
    const eyeColor = [1.0, 0.8, 0.1, 1.0];

    const leftEyeWhite = new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [-0.25, 0.765, 0.577],
            rotation: [-1.0, -0.2, -3.8],
            scale: [0.375, 0.528, 0.1]
        },
        color: eyeColor
    });
    body.addChild(leftEyeWhite);

    body.addChild(new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [-0.25, 0.767, 0.575],
            rotation: [-1.0, -0.2, -3.79],
            scale: [0.4, 0.575, 0.08]
        },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    const rightEyeWhite = new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [0.25, 0.765, 0.577],
            rotation: [-1.0, 0.2, 3.8],
            scale: [0.375, 0.528, 0.1]
        },
        color: eyeColor
    });
    body.addChild(rightEyeWhite);

    body.addChild(new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [0.25, 0.767, 0.575],
            rotation: [-1.0, 0.2, 3.79],
            scale: [0.4, 0.575, 0.08]
        },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    // pupils (children of body)
    const innerPupilColor = [0.8, 0.8, 0.8, 1.0];
    const outerPupilColor = [1.0, 0.2, 0.1, 1.0];

    body.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [-0.1825, 0.780, 0.62],
            rotation: [-1.5, -1.0, -3.8],
            scale: [0.035, 0.183, 0.05]
        },
        color: innerPupilColor
    }));

    body.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [-0.18, 0.777, 0.615],
            rotation: [-1.6, -1.0, -3.9],
            scale: [0.035, 0.25, 0.1]
        },
        color: outerPupilColor
    }));

    body.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [0.1825, 0.780, 0.62],
            rotation: [-1.5, 1.0, 3.8],
            scale: [0.035, 0.183, 0.055]
        },
        color: innerPupilColor
    }));

    body.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [0.18, 0.777, 0.615],
            rotation: [-1.6, 1.0, 3.9],
            scale: [0.035, 0.25, 0.1]
        },
        color: outerPupilColor
    }));
    

    // arms - parents 2 3
    const leftArm = new SceneNode({
        buffers: armBuffers,
        localTransform: {
            position: [-3.8, -2.66, 3.2],
            rotation: [0.0, 0.4, 0.0],
            scale: [1.6, 8.4, 2.6]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    root.addChild(leftArm);

    const rightArm = new SceneNode({
        buffers: armBuffers,
        localTransform: {
            position: [4, -2.5, 3.2],
            rotation: [0.0, -0.8, 0.0],
            scale: [2.0, 10.0, 2.6]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    root.addChild(rightArm);
    
    const initialLeftArmTransform = {
        position: [...leftArm.localTransform.position],
        scale: [...leftArm.localTransform.scale],
    };
    const initialRightArmTransform = {
        position: [...rightArm.localTransform.position],
        scale: [...rightArm.localTransform.scale],
    };


    const leftFingerTransforms = [
        // mid finger
        { pos: [0.0, 0.1, 0.05], rot: [0.5, 0.0, 0.0], scale: [0.065, 0.07, 0.04] },
        // index
        { pos: [-0.15, 0.085, 0.05], rot: [0.5, 0.0, 0.3], scale: [0.05, 0.07, 0.04] },
        // thumb
        { pos: [0.16, 0.075, 0.06], rot: [0.5, 0.0, -0.4], scale: [0.06, 0.06, 0.04] }
    ];

    const rightFingerTransforms = [
        // mid finger
        { pos: [0.0, 0.1, 0.05], rot: [0.5, 0.0, 0.0], scale: [0.065, 0.07, 0.04] },
        // thumb
        { pos: [0.15, 0.085, 0.05], rot: [0.5, 0.0, -0.3], scale: [0.05, 0.07, 0.04] },
        // index
        { pos: [-0.16, 0.075, 0.06], rot: [0.5, 0.0, 0.4], scale: [0.06, 0.06, 0.04] },
    ];

    leftFingerTransforms.forEach(transform => {
        leftArm.addChild(new SceneNode({
            buffers: coneBuffers,
            localTransform: {
                position: transform.pos,
                rotation: transform.rot,
                scale: transform.scale
            },
            color: [0.4, 0.30, 0.60, 1.0]
        }));

    });

    rightFingerTransforms.forEach(transform => {
        rightArm.addChild(new SceneNode({
            buffers: coneBuffers,
            localTransform: {
                position: transform.pos,
                rotation: transform.rot,
                scale: transform.scale
            },
            color: [0.4, 0.30, 0.60, 1.0]
        }));
    });

    const cloudParent = new SceneNode();
    body.addChild(cloudParent);

    // cloud trails (children of body)
    const cloudColor = [0.6, 0.05, 0.2, 1.0];
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
            buffers: cloudEllipsoidBuffers,
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
            buffers: cloudEllipsoidBuffers,
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
            buffers: cloudEllipsoidBuffers,
            localTransform: { 
                position: [x, y, z],
                rotation: [blob.offset[1] * 0.5, blob.angle * 0.4, blob.offset[0] * 0.3],
                scale: blob.scale
            },
            color: cloudColor
        }));
    });

    // tail (child of body)
    const tailNode = new SceneNode({
        buffers: tailBuffers,
        localTransform: {
            position: [0.65, 0.28, -1.15],
            rotation: [0.0, 1.0, 0.0],
            scale: [0.3, 0.3, 0.3]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(tailNode);
    
    const initialTailTransform = {
        position: [...tailNode.localTransform.position],
        rotation: [...tailNode.localTransform.rotation]
    };


    // crystals
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

    // left
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

    // right
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

    // back
    placeCluster(createCrystalClusterB, {
        position: [2, -2.1, -15],
        rotation: [0, 0.1, 0],
        scale: [2.0, 2.5, 2.0],
        isGlowing: true,
    });


    // camera controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let cameraRotation = { x: 0.35, y: 0.05 };
    canvas.addEventListener('mousedown', (e) => { isDragging = true; previousMousePosition = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        cameraRotation.y += deltaX * 0.01;
        cameraRotation.x += deltaY * 0.01;
        cameraRotation.x = Math.max(0.0, Math.min(Math.PI / 2, cameraRotation.x));  
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    // render function with hierarchical traversal
    function renderNode(node, parentWorldMatrix, viewMatrix) {
        const worldMatrix = node.getWorldMatrix(parentWorldMatrix);
        
        if (node.buffers) {
            const modelViewMatrix = mat4.create();
            mat4.multiply(modelViewMatrix, viewMatrix, worldMatrix);
            
            gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
            
            const normalMatrix = mat4.create();
            mat4.invert(normalMatrix, modelViewMatrix);
            mat4.transpose(normalMatrix, normalMatrix);
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

    function render(now) {
        now *= 0.001; // convert time to seconds

        const breathSpeed = 0.5; 
        const breathAmount = 0.02;
        const breathScaleFactor = 1.0 + Math.sin(now * breathSpeed * 2 * Math.PI) * breathAmount;
        body.localTransform.scale[1] = initialBodyScaleY * breathScaleFactor;

        const armAnimSpeed = 0.8;
        const minArmScaleY = initialLeftArmTransform.scale[1];
        const maxArmScaleY = initialRightArmTransform.scale[1];
        const armCycle = (Math.sin(now * armAnimSpeed * Math.PI) + 1) / 2;
        const leftArmScaleY = minArmScaleY + armCycle * (maxArmScaleY - minArmScaleY);
        const rightArmScaleY = maxArmScaleY - armCycle * (maxArmScaleY - minArmScaleY);
        leftArm.localTransform.scale[1] = leftArmScaleY;
        rightArm.localTransform.scale[1] = rightArmScaleY;
        const groundLevel = -1.75;
        const armGeometryHalfHeight = 0.1;
        leftArm.localTransform.position[1] = groundLevel + (leftArmScaleY * armGeometryHalfHeight);
        rightArm.localTransform.position[1] = groundLevel + (rightArmScaleY * armGeometryHalfHeight);

        const tailAnimSpeed = 1.5;
        const tailCurveDepth = 0.2;
        const swingFactor = Math.cos(now * tailAnimSpeed); 
        tailNode.localTransform.position[0] = initialTailTransform.position[0] * swingFactor;
        tailNode.localTransform.position[2] = initialTailTransform.position[2] - tailCurveDepth * (1 - Math.abs(swingFactor));
        tailNode.localTransform.rotation[1] = initialTailTransform.rotation[1] - swingFactor;

        const cloudSpeed = 0.5;
        cloudParent.localTransform.rotation[1] = now * cloudSpeed;

        const updatedTongueGeometry = createTongue({ time: now });
        gl.bindBuffer(gl.ARRAY_BUFFER, tongueNode.buffers.position);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(updatedTongueGeometry.vertices));


        resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.12, 0.05, 0.09, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const fieldOfView = 45 * Math.PI / 180;
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, fieldOfView, aspect, 0.1, 100.0);
        
        const viewMatrix = mat4.create();
        const cameraPosition = [0.0, 0.0, 20.0];
        mat4.translate(viewMatrix, viewMatrix, [0.0, 0.0, -cameraPosition[2]]);
        mat4.rotate(viewMatrix, viewMatrix, cameraRotation.x, [1, 0, 0]);
        mat4.rotate(viewMatrix, viewMatrix, cameraRotation.y, [0, 1, 0]);
        
        gl.useProgram(programInfo.program);
        gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
        gl.uniform3fv(programInfo.uniformLocations.lightPosition, [5.0, 4.0, 7.0]);
        gl.uniform3fv(programInfo.uniformLocations.viewPosition, cameraPosition);
        
        renderNode(root, null, viewMatrix);
        
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}


// helper Functions
function initShaderProgram(gl, vsSource, fsSource) { const vertexShader=loadShader(gl, gl.VERTEX_SHADER, vsSource); const fragmentShader=loadShader(gl, gl.FRAGMENT_SHADER, fsSource); const shaderProgram=gl.createProgram(); gl.attachShader(shaderProgram, vertexShader); gl.attachShader(shaderProgram, fragmentShader); gl.linkProgram(shaderProgram); if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram)); return null; } return shaderProgram; }
function loadShader(gl, type, source) { const shader=gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader)); gl.deleteShader(shader); return null; } return shader; }
function resizeCanvasToDisplaySize(canvas) { const displayWidth=canvas.clientWidth; const displayHeight=canvas.clientHeight; if (canvas.width !== displayWidth || canvas.height !== displayHeight) { canvas.width=displayWidth; canvas.height=displayHeight; return true; } return false; }

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
    return { position: positionBuffer, normal: normalBuffer, indices: indexBuffer, vertexCount: geometry.indices.length, }; 
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

// mat4 functions
const mat4 = { 
    create: () => { const out = new Float32Array(16); out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1; return out; },
    perspective: (out, fovy, aspect, near, far) => { const f = 1.0 / Math.tan(fovy / 2); out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0; out[8] = 0; out[9] = 0; out[11] = -1; out[12] = 0; out[13] = 0; out[15] = 0; if (far != null && far !== Infinity) { const nf = 1 / (near - far); out[10] = (far + near) * nf; out[14] = (2 * far * near) * nf; } else { out[10] = -1; out[14] = -2 * near; } return out; },
    translate: (out, a, v) => { const x = v[0], y = v[1], z = v[2]; if (a === out) { out[12] = a[0] * x + a[4] * y + a[8] * z + a[12]; out[13] = a[1] * x + a[5] * y + a[9] * z + a[13]; out[14] = a[2] * x + a[6] * y + a[10] * z + a[14]; out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]; } else { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3]; out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7]; out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11]; out[12] = a[0] * x + a[4] * y + a[8] * z + a[12]; out[13] = a[1] * x + a[5] * y + a[9] * z + a[13]; out[14] = a[2] * x + a[6] * y + a[10] * z + a[14]; out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]; } return out; },
    rotate: (out, a, rad, axis) => { let x = axis[0], y = axis[1], z = axis[2]; let len = Math.hypot(x, y, z); if (len < 0.000001) { return null; } len = 1 / len; x *= len; y *= len; z *= len; const s = Math.sin(rad); const c = Math.cos(rad); const t = 1 - c; const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]; const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]; const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]; const b00 = x * x * t + c, b01 = y * x * t + z * s, b02 = z * x * t - y * s; const b10 = x * y * t - z * s, b11 = y * y * t + c, b12 = z * y * t + x * s; const b20 = x * z * t + y * s, b21 = y * z * t - x * s, b22 = z * z * t + c; out[0] = a00 * b00 + a10 * b01 + a20 * b02; out[1] = a01 * b00 + a11 * b01 + a21 * b02; out[2] = a02 * b00 + a12 * b01 + a22 * b02; out[3] = a03 * b00 + a13 * b01 + a23 * b02; out[4] = a00 * b10 + a10 * b11 + a20 * b12; out[5] = a01 * b10 + a11 * b11 + a21 * b12; out[6] = a02 * b10 + a12 * b11 + a22 * b12; out[7] = a03 * b10 + a13 * b11 + a23 * b12; out[8] = a00 * b20 + a10 * b21 + a20 * b22; out[9] = a01 * b20 + a11 * b21 + a21 * b22; out[10] = a02 * b20 + a12 * b21 + a22 * b22; out[11] = a03 * b20 + a13 * b21 + a23 * b22; if (a !== out) { out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]; } return out; },
    scale: (out, a, v) => { const x = v[0], y = v[1], z = v[2]; out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x; out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y; out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z; out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]; return out; },
    multiply: (out, a, b) => { const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]; const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]; const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]; const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]; let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3]; out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30; out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31; out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32; out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33; b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7]; out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30; out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31; out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32; out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33; b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11]; out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30; out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31; out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32; out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33; b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15]; out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30; out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31; out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32; out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33; return out; },
    invert: (out, a) => { const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]; const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]; const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]; const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]; const b00 = a00 * a11 - a01 * a10; const b01 = a00 * a12 - a02 * a10; const b02 = a00 * a13 - a03 * a10; const b03 = a01 * a12 - a02 * a11; const b04 = a01 * a13 - a03 * a11; const b05 = a02 * a13 - a03 * a12; const b06 = a20 * a31 - a21 * a30; const b07 = a20 * a32 - a22 * a30; const b08 = a20 * a33 - a23 * a30; const b09 = a21 * a32 - a22 * a31; const b10 = a21 * a33 - a23 * a31; const b11 = a22 * a33 - a23 * a32; let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) { return null; } det = 1.0 / det; out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det; out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det; out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det; out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det; return out; },
    transpose: (out, a) => { if (out === a) { const a01 = a[1], a02 = a[2], a03 = a[3]; const a12 = a[6], a13 = a[7]; const a23 = a[11]; out[1] = a[4]; out[2] = a[8]; out[3] = a[12]; out[4] = a01; out[6] = a[9]; out[7] = a[13]; out[8] = a02; out[9] = a12; out[11] = a[14]; out[12] = a03; out[13] = a13; out[14] = a23; } else { out[0] = a[0]; out[1] = a[4]; out[2] = a[8]; out[3] = a[12]; out[4] = a[1]; out[5] = a[5]; out[6] = a[9]; out[7] = a[13]; out[8] = a[2]; out[9] = a[6]; out[10] = a[10]; out[11] = a[14]; out[12] = a[3]; out[13] = a[7]; out[14] = a[11]; out[15] = a[15]; } return out; }
};

window.onload = main;