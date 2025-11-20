import * as THREE from 'three';

export class StickerEffect {
  constructor(container, imageUrl) {
    this.container = container;
    this.imageUrl = imageUrl;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.material = null;
    this.mesh = null;
    this.clock = new THREE.Clock();
    this.targetCurl = 0;
    this.currentCurl = 0;
    this.isHovered = false;
    
    this.init();
  }

  init() {
    // Setup scene
    this.scene = new THREE.Scene();
    
    // Camera setup - Orthographic for a 2D-like look or Perspective?
    // Perspective gives better 3D depth for the curl.
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.z = 3; // Adjust based on plane size

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Load texture
    const loader = new THREE.TextureLoader();
    loader.load(this.imageUrl, (texture) => {
      this.createSticker(texture);
      this.animate();
    });

    // Handle resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  createSticker(texture) {
    // Adjust plane aspect ratio to match image
    const imgAspect = texture.image.width / texture.image.height;
    let planeW = 1.5;
    let planeH = 1.5 / imgAspect;

    // Keep within reasonable bounds
    if (imgAspect < 1) {
      planeH = 1.5;
      planeW = 1.5 * imgAspect;
    }

    const geometry = new THREE.PlaneGeometry(planeW, planeH, 32, 32);
    
    // Custom Shader Material for Peel Effect
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uCurl: { value: 0.0 }, // 0 = flat, 1 = fully peeled
        uTime: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(this.width, this.height) },
        uColor: { value: new THREE.Color(0xffffff) }, // Backing color
        uShadowColor: { value: new THREE.Color(0x000000) }
      },
      vertexShader: `
        uniform float uCurl;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vShadow;

        void main() {
          vUv = uv;
          vec3 pos = position;
          
          // Curl logic
          // Direction of curl: from bottom-right (-1, -1) to top-left (1, 1)
          // We define a line that moves with uCurl.
          
          // Simple curl: rotate vertices based on x+y
          // Axis moves from bottom-right corner inward
          
          float curlAmount = uCurl * 2.5; // Amplify range
          float angle = -3.14159 / 4.0; // 45 degrees
          
          // Rotate position to align with curl axis
          float c = cos(angle);
          float s = sin(angle);
          vec2 rotatedPos = vec2(pos.x * c - pos.y * s, pos.x * s + pos.y * c);
          
          // Calculate distance from curl start (adjust offset based on curlAmount)
          // We want the curl to start at the corner and move in
          float dist = rotatedPos.x - (1.0 - curlAmount * 2.0);
          
          if (dist > 0.0) {
             // Curl parameters
             float radius = 0.2;
             float theta = dist / radius;
             
             // Roll up
             float tx = radius * sin(theta);
             float tz = radius * (1.0 - cos(theta));
             
             // Apply curl to rotated coordinates
             // We want to lift it up (z) and back (x)
             
             // If theta > PI, it wraps around? Let's limit or let it roll.
             
             vec3 curled = vec3(
                (1.0 - curlAmount * 2.0) + tx, // New X in rotated space
                rotatedPos.y,                 // Y stays same in rotated space? No, this is a cylinder along Y.
                tz                            // Z lift
             );
             
             // Rotate back
             pos.x = curled.x * c + curled.y * s;
             pos.y = -curled.x * s + curled.y * c;
             pos.z = curled.z;
             
             // Normals need update for lighting, but we can approximate or compute
             vec3 n = vec3(sin(theta) * c, -sin(theta) * s, cos(theta));
             vNormal = normalize(n);
             
             // Shadow factor for self-shadowing (simple approximation)
             vShadow = smoothstep(0.0, 0.2, dist);

          } else {
             vNormal = normal;
             vShadow = 0.0;
          }
          
          vPosition = pos;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uCurl;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vShadow;

        void main() {
          vec4 texColor = texture2D(uTexture, vUv);
          
          // Backside check: if normal points away from camera
          // Since we don't have exact face culling in shader easily without gl_FrontFacing
          // we can use gl_FrontFacing
          
          vec3 normal = normalize(vNormal);
          vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
          float diff = max(dot(normal, lightDir), 0.0);
          
          // Specular for plastic look
          vec3 viewDir = normalize(cameraPosition - vPosition);
          vec3 reflectDir = reflect(-lightDir, normal);
          float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
          
          vec3 finalColor;
          float alpha = texColor.a;

          if (gl_FrontFacing) {
            // Front side
            // Plastic effect: mix texture with specular
            // Translucent film: if alpha is low, it's milky white plastic
            
            vec3 plasticColor = vec3(0.95, 0.95, 1.0); // Milky clear
            float filmOpacity = 0.3;
            
            // Mix ink and film
            vec3 contentColor = mix(plasticColor, texColor.rgb, alpha);
            float contentAlpha = max(alpha, filmOpacity);
            
            finalColor = contentColor * (0.8 + 0.2 * diff) + vec3(0.3) * spec;
            // Add shadow from curl
            finalColor *= (1.0 - vShadow * 0.3);
            
            gl_FragColor = vec4(finalColor, contentAlpha);
          } else {
            // Back side (sticky side or backing)
            // White paper
            finalColor = vec3(0.95) * (0.6 + 0.4 * diff);
            gl_FragColor = vec4(finalColor, 1.0);
          }
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
  }

  onResize() {
    if (!this.container) return;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    if (this.material) {
       this.material.uniforms.uResolution.value.set(this.width, this.height);
    }
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    const dt = this.clock.getDelta();
    
    // Smooth curl interpolation
    this.currentCurl += (this.targetCurl - this.currentCurl) * 5.0 * dt;
    
    if (this.material) {
      this.material.uniforms.uTime.value = this.clock.getElapsedTime();
      this.material.uniforms.uCurl.value = this.currentCurl;
    }
    
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setCurl(amount) {
    // amount between 0 and 1
    this.targetCurl = Math.max(0, Math.min(1, amount));
  }
  
  dispose() {
      if (this.renderer) {
          this.renderer.dispose();
          this.renderer.domElement.remove();
      }
      if (this.material) {
          this.material.dispose();
          if (this.material.uniforms.uTexture.value) {
              this.material.uniforms.uTexture.value.dispose();
          }
      }
      if (this.mesh) {
          if (this.mesh.geometry) this.mesh.geometry.dispose();
          this.scene.remove(this.mesh);
      }
      this.scene = null;
      this.camera = null;
      this.renderer = null;
  }
}

