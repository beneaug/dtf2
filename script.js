// Grain effect using canvas for sharp, scalable rendering
class GrainEffect {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.animationFrame = null;
        this.time = 0;
        this.grainPattern = null;
        this.grainDrawn = false;
        
        this.init();
        this.animate();
        
        // Handle window resize with debounce
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.handleResize(), 100);
        });
    }
    
    init() {
        this.handleResize();
    }
    
    handleResize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        // Set display size (CSS pixels)
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Set actual canvas size (accounting for device pixel ratio for sharp rendering)
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // Reset transform and scale context to match device pixel ratio
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        
        // Regenerate grain for new size
        this.generateGrain();
        this.grainDrawn = false; // Mark for redraw
    }
    
    generateGrain() {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.ceil(this.canvas.width / dpr);
        const height = Math.ceil(this.canvas.height / dpr);
        
        // Create image data for grain at display resolution
        const imageData = this.ctx.createImageData(width, height);
        const data = imageData.data;
        
        // Generate procedural noise with more natural distribution
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                
                // Use multiple octaves for more natural grain
                const noise1 = Math.random();
                const noise2 = Math.random() * 0.5;
                const noise3 = Math.random() * 0.25;
                
                // Combine noise layers for more natural grain texture
                const grain = Math.min(255, (noise1 + noise2 + noise3) / 1.75 * 255);
                
                // Apply to RGB channels
                data[i] = grain;     // R
                data[i + 1] = grain; // G
                data[i + 2] = grain; // B
                data[i + 3] = 255;   // A
            }
        }
        
        // Store grain pattern
        this.grainPattern = imageData;
    }
    
    animate() {
        // Grain is static, so we only need to draw it once after generation
        // The animation loop is kept for potential future dynamic effects
        if (this.grainPattern && !this.grainDrawn) {
            const dpr = window.devicePixelRatio || 1;
            const width = this.canvas.width / dpr;
            const height = this.canvas.height / dpr;
            
            this.ctx.putImageData(this.grainPattern, 0, 0);
            this.grainDrawn = true;
        }
        
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }
    
    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }
}

// Initialize effects when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('grainCanvas');
    if (canvas) {
        new GrainEffect(canvas);
    }
});
