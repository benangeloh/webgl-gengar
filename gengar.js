const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec3 aVertexNormal;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform mat4 uNormalMatrix;
    varying highp vec3 vTransformedNormal;
    varying highp vec4 vPosition;
    void main() {
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
    void main() {
        vec3 lightColor = vec3(1, 0.85, 0.95);
        float ambientStrength = 0.2;
        float specularStrength = 0.2;
        float shininess = 12.0;
        vec3 ambient = ambientStrength * lightColor;
        vec3 normal = normalize(vTransformedNormal);
        vec3 lightDirection = normalize(uLightPosition - vPosition.xyz);
        float diff = max(dot(normal, lightDirection), 0.0);
        vec3 diffuse = diff * lightColor;
        vec3 viewDirection = normalize(uViewPosition - vPosition.xyz);
        vec3 reflectDirection = reflect(-lightDirection, normal);
        float spec = pow(max(dot(viewDirection, reflectDirection), 0.0), shininess);
        vec3 specular = specularStrength * spec * lightColor;
        vec3 shadowColor = vec3(0.6, 0.1, 0.4);
        vec3 litColor = (ambient + diffuse + specular) * uObjectColor.rgb;
        vec3 result = mix(shadowColor * uObjectColor.rgb, litColor, diff);
        gl_FragColor = vec4(result, uObjectColor.a);
    }
`;

// class for hierarchical transformations
class SceneNode {
    constructor(options = {}) {
        this.buffers = options.buffers || null;
        this.localTransform = options.localTransform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
        this.color = options.color || [1, 1, 1, 1];
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
        },
    };

    // geometries
    const bodyGeometry = createEllipsoid(1.0, 1.0, 1.0, 32, 24);
    const coneGeometry = createQuadricCone(1.5, 1.5, 1.0, 60, 30);
    const tongueGeometry = createTongue(2, 0.6, 0.2, 50);
    const noHole = { phiStart: 0, phiLength: 0, thetaStart: 0, thetaLength: 0 };
    const eyeGeometry = createHemisphereWithHole(1.0, 32, 32, noHole);
    const pupilGeometry = createEllipsoid(1.0, 1.0, 1.0, 32, 24);
    const armGeometry = createEllipticParaboloid(1.0, 0.6, 0.2, 32, 200);
    const mouthBackGeometry = createDisc(80);
    const tailGeometry = createShearedCone(1.0, 2.0, 1.5, 0, 36, 24);
    const cylinderGeometry = createQuadricCylinder(1.0, 1.0, 32);


    // buffers
    const bodyBuffers = initBuffers(gl, bodyGeometry);
    const coneBuffers = initBuffers(gl, coneGeometry);
    const eyeBuffers = initBuffers(gl, eyeGeometry);
    const pupilBuffers = initBuffers(gl, pupilGeometry);
    const armBuffers = initBuffers(gl, armGeometry);
    const mouthBackBuffers = initBuffers(gl, mouthBackGeometry);
    const tailBuffers = initBuffers(gl, tailGeometry);
    const cylinderBuffers = initBuffers(gl, cylinderGeometry);

    const root = new SceneNode();

    // body - parent 1
    const body = new SceneNode({
        buffers: bodyBuffers,
        localTransform: { 
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0], 
            scale: [1.7, 1.75, 1.5]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    root.addChild(body);

    // ears (children of body)
    const leftEar = new SceneNode({
        buffers: coneBuffers,
        localTransform: { 
            position: [-0.75, 0.943, 0], 
            rotation: [0, -0.6, 0.7], 
            scale: [0.25, 0.85, 0.22] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(leftEar);

    const rightEar = new SceneNode({
        buffers: coneBuffers,
        localTransform: { 
            position: [0.75, 0.943, 0], 
            rotation: [0, 0.6, -0.7], 
            scale: [0.25, 0.85, 0.22] },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    body.addChild(rightEar);

    // top spikes (children of body)
    const topSpikes = [
        { pos: [0, 1.0, 0.05], rot: [-0.7, 0, 0], scale: [0.15, 0.7, 0.15] },

        { pos: [-0.175, 1.0, 0.05], rot: [-0.3, 0, 0.15], scale: [0.08, 0.3, 0.15] },
        { pos: [0.175, 1.0, 0.05], rot: [-0.3, 0, -0.15], scale: [0.08, 0.3, 0.15] },

        { pos: [-0.32, 0.925, 0.1], rot: [-0.4, 0, 0.45], scale: [0.075, 0.3, 0.15] },
        { pos: [0.32, 0.925, 0.1], rot: [-0.4, 0, -0.45], scale: [0.075, 0.3, 0.15] },
        // { pos: [-0.05, 1.025, -0.025], rot: [-0.2, 0.0, -0.2], scale: [0.03, 0.087, 0.03] },
        // { pos: [-0.175, 1.025, -0.125], rot: [-0.4, 0.0, 0.3], scale: [0.07, 0.168, 0.07] },
        // { pos: [-0.2, 1.0, 0.0], rot: [-0.0, 0.0, 0.6], scale: [0.03, 0.083, 0.03] },
        // { pos: [0.075, 1.025, -0.25], rot: [-0.65, 0, -0.1], scale: [0.15, 0.367, 0.15] },
        // { pos: [0.0, 0.925, -0.517], rot: [-0.8, 0, -0], scale: [0.1, 0.3, 0.1] }
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

    // eyes (children of body)
    const eyeColor = [0.97, 0.35, 0.32, 1];

    const leftEyeWhite = new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [-0.26, 0.265, 0.88],
            rotation: [-0.2, -0.3, -3.8],
            scale: [0.225, 0.22, 0.1]
        },
        color: eyeColor
    });
    body.addChild(leftEyeWhite);

    body.addChild(new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [-0.26, 0.264, 0.88],
            rotation: [-0.2, -0.3, -3.79],
            scale: [0.23, 0.225, 0.08]
        },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    const rightEyeWhite = new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [0.26, 0.265, 0.88],
            rotation: [-0.2, 0.3, 3.8],
            scale: [0.225, 0.22, 0.1]
        },
        color: eyeColor
    });
    body.addChild(rightEyeWhite);

    body.addChild(new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [0.26, 0.264, 0.88],
            rotation: [-0.2, 0.3, 3.79],
            scale: [0.23, 0.225, 0.08]
        },
        color: [0.0, 0.0, 0.0, 1.0]
    }));

    // pupils (children of body)
    const innerPupilColor = [0.8, 0.8, 0.8, 1.0];
    const outerPupilColor = [0.2, 0.2, 0.1, 1.0];

    body.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [-0.218, 0.19, 1.02],
            rotation: [0, 0, 0],
            scale: [0.009, 0.025, 0.01]
        },
        color: innerPupilColor
    }));

    body.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [-0.22, 0.18, 1.005],
            rotation: [0, 0, 0],
            scale: [0.02, 0.05, 0]
        },
        color: outerPupilColor
    }));

    body.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [0.218, 0.19, 1.02],
            rotation: [0, 0, 0],
            scale: [0.009, 0.025, 0.01]
        },
        color: innerPupilColor
    }));

    body.addChild(new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [0.22, 0.18, 1.005],
            rotation: [0, 0, 0],
            scale: [0.02, 0.05, 0]
        },
        color: outerPupilColor
    }));

    //eyelid
    // Add left "eyelid" cylinder
    body.addChild(new SceneNode({
        buffers: cylinderBuffers,
        localTransform: {
            // Positioned relative to the left eye
            position: [-0.24, 0.25, 0.85], // Slightly up (Y) and forward (Z)
            rotation: [-0.2, -0.2, -3.8], // Same rotation as the eye
            scale: [0.28, 0.005, 0.12]      // Scaled to be a flat "lid"
        },
        color: [0.0, 0.0, 0.0, 1.0] // Darker purple
    }));

    // Add right "eyelid" cylinder
    body.addChild(new SceneNode({
        buffers: cylinderBuffers,
        localTransform: {
            // Positioned relative to the right eye
            position: [0.24, 0.25, 0.85], // Slightly up (Y) and forward (Z)
            rotation: [-0.2, 0.2, 3.8],  // Same rotation as the eye
            scale: [0.28, 0.005, 0.12]     // Scaled to be a flat "lid"
        },
        color: [0.0, 0.0, 0.0, 1.0] // Darker purple
    }));
    

    // arms - parents 2 3
    const leftArm = new SceneNode({
        buffers: armBuffers,
        localTransform: {
            position: [-1.9, -1.33, 1.6],
            rotation: [0.0, 0.4, 0.0],
            scale: [0.8, 4.2, 1.2]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    root.addChild(leftArm);

    const rightArm = new SceneNode({
        buffers: armBuffers,
        localTransform: {
            position: [2, -1.25, 1.6],
            rotation: [0.0, -0.8, 0.0],
            scale: [1.0, 5.0, 1.3]
        },
        color: [0.4, 0.30, 0.60, 1.0]
    });
    root.addChild(rightArm);

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

    // tail (child of body)
    // body.addChild(new SceneNode({
    //     buffers: tailBuffers,
    //     localTransform: {
    //         position: [0.65, 0.28, -1.15],
    //         rotation: [0.0, 1.0, 0.0],
    //         scale: [0.3, 0.3, 0.3]
    //     },
    //     color: [0.4, 0.30, 0.60, 1.0]
    // }));

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
        // cameraRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotation.x));
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

    function render() {
        resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.13, 0.08, 0.12, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const fieldOfView = 45 * Math.PI / 180;
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, fieldOfView, aspect, 0.1, 100.0);
        
        const viewMatrix = mat4.create();
        const cameraPosition = [0.0, 0.0, 8.5];
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
function initBuffers(gl, geometry) { const positionBuffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.vertices), gl.STATIC_DRAW); const normalBuffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.normals), gl.STATIC_DRAW); const indexBuffer=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.indices), gl.STATIC_DRAW); return { position: positionBuffer, normal: normalBuffer, indices: indexBuffer, vertexCount: geometry.indices.length, }; }

// geometry Functions
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
            
            // Approximate normals (good enough for this case)
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
