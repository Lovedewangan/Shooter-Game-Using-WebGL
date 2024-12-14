class Game {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.setupCanvas();
        this.gl = this.canvas.getContext('webgl');

        if (!this.gl) {
            alert('Unable to initialize WebGL. Your browser may not support it.');
            return;
        }

        // Add sound effects
        this.sounds = {
            collision: new Audio('sounds/collision.wav'),  
            gameOver: new Audio('sounds/gameover.wav'),
            shoot: new Audio('sounds/shoot.wav')
        };

        // Pre-load sounds
        Object.values(this.sounds).forEach(sound => {
            sound.load();
            
            sound.volume = 0.3;
        });

        // Add resize listener
        window.addEventListener('resize', this.handleResize.bind(this));

        // Game state
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.gameOver = false;
        this.lastBlockSpawn = 0;
        this.blockSpawnInterval = 2000;
        this.isInvulnerable = false;    
        this.invulnerabilityDuration = 1000; 
        
        // Initialize game objects
        this.player = {
            x: 0,
            y: -0.8,
            width: 0.1,
            height: 0.1,
            speed: 0.01,
            isBlinking: false
        };
        
        this.blocks = [];
        this.projectiles = [];
        
        // Input handling
        this.keys = {
            left: false,
            right: false,
            space: false
        };
        
        // Initialize game components
        this.initShaders();
        this.initBuffers();
        this.initTextures();
        this.setupEventListeners();
        
        // Start game loop
        this.lastTime = 0;
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    setupCanvas() {
        // Get the game container dimensions
        const container = this.canvas.parentElement;
        const containerStyle = window.getComputedStyle(container);
        const width = parseInt(containerStyle.width, 10);
        const height = parseInt(containerStyle.height, 10);

        // Set canvas size to match container
        this.canvas.width = width;
        this.canvas.height = height;

        // Update the viewport
        if (this.gl) {
            this.gl.viewport(0, 0, width, height);
        }
    }

    handleResize() {
        this.setupCanvas();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            switch(e.code) {

                case 'ArrowLeft':
                    this.keys.left = true;
                    break;

                case 'ArrowRight':
                    this.keys.right = true;
                    break;

                case 'Space':
                    if (!this.keys.space) {
                        this.keys.space = true;
                        this.shootProjectile();
                    }
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch(e.code) {

                case 'ArrowLeft':
                    this.keys.left = false;
                    break;

                case 'ArrowRight':
                    this.keys.right = false;
                    break;

                case 'Space':
                    this.keys.space = false;
                    break;
            }
        });

        document.getElementById('restartButton').addEventListener('click', () => {
            this.restartGame();
        });
    }

    playSound(soundName) {
        if (this.sounds[soundName]) {
            // Create a new audio instance for overlap support
            const sound = this.sounds[soundName].cloneNode();
            sound.play().catch(error => {
                console.log('Sound play failed:', error);
            });
        }
    }

    shootProjectile() {
        if (this.gameOver) return;
        
        this.projectiles.push({
            x: this.player.x,
            y: this.player.y + this.player.height,
            width: 0.02,
            height: 0.04,
            speed: 0.015
        });

        
        this.playSound('shoot');
    }


    updateGame(deltaTime) {
        if (this.gameOver) return;

        
        if (this.keys.left) {
            this.player.x = Math.max(-0.9, this.player.x - this.player.speed);
        }

        if (this.keys.right) {
            this.player.x = Math.min(0.9, this.player.x + this.player.speed);
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            projectile.y += projectile.speed;

            // Remove projectiles that go off screen
            if (projectile.y > 1.0) {
                this.projectiles.splice(i, 1);
                continue;
            }

            
            let projectileHit = false;
            for (let j = this.blocks.length - 1; j >= 0; j--) {
                const block = this.blocks[j];
                if (this.checkCollision(projectile, block)) {
                    
                    this.projectiles.splice(i, 1);
                    projectileHit = true;

                    
                    this.destroyBlock(j);
                    break; 
                }
            }
            if (projectileHit) continue; 
        }

        
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            const block = this.blocks[i];
            block.y -= block.speed;

            // Check if block passed the bottom of the screen
            if (block.y < -1.0) {
                this.blocks.splice(i, 1);
                this.decreaseLives('Block passed the screen!');
                continue;
            }

            
            if (!this.isInvulnerable && this.checkCollision(this.player, block)) {
                this.blocks.splice(i, 1);
                this.decreaseLives('Block hit the player!');
            }
        }

        
        if (Date.now() - this.lastBlockSpawn > this.blockSpawnInterval) {
            this.spawnBlock();
            this.lastBlockSpawn = Date.now();
        }
    }

    decreaseLives(reason) {
        if (!this.isInvulnerable) {
            this.lives--;
            this.updateHUD();
            
            
            this.playSound('collision');
            
            
            this.isInvulnerable = true;
            this.player.isBlinking = true;
            
            
            setTimeout(() => {
                this.isInvulnerable = false;
                this.player.isBlinking = false;
            }, this.invulnerabilityDuration);

            
            if (this.lives <= 0) {
                this.endGame();
            }
        }
    }

    updateHUD() {
        document.getElementById('scoreValue').textContent = this.score;
        document.getElementById('livesValue').textContent = this.lives;
        document.getElementById('levelValue').textContent = this.level;
    }

    endGame() {
        this.gameOver = true;
        
        // Play game over sound
        this.playSound('gameOver');
        
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('finalLevel').textContent = this.level;
        document.getElementById('gameOver').classList.remove('hidden');
    }

    destroyBlock(blockIndex) {
        this.blocks.splice(blockIndex, 1);
        this.score += 100;
        this.updateHUD();
        
        
        this.playSound('collision');

        // Level progression
        if (this.score % 1000 === 0) {
            this.level++;
            this.blockSpawnInterval = Math.max(500, 2000 - (this.level * 100));
            this.updateHUD();
        }
    }

    restartGame() {
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.gameOver = false;
        this.blocks = [];
        this.projectiles = [];
        this.player.x = 0;
        this.blockSpawnInterval = 2000;
        this.updateHUD();
        document.getElementById('gameOver').classList.add('hidden');
    }

    gameLoop(currentTime) {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.updateGame(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    initShaders() {
        // Updated vertex shader program (unchanged)
        const vsSource = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            
            varying highp vec2 vTextureCoord;
            
            void main(void) {
                gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
                vTextureCoord = aTextureCoord;
            }
        `;

        // Modified fragment shader to handle transparency
        const fsSource = `
            precision mediump float;
            varying highp vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform vec4 uBackgroundColor;
            
            void main(void) {
                vec4 texColor = texture2D(uSampler, vTextureCoord);
                
                // If alpha is very low, discard the pixel completely
                if (texColor.a < 0.01) {
                    discard;
                }
                
                // Output color with proper alpha blending
                gl_FragColor = texColor;
            }
        `;

        // Create the shader program
        const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);

        const shaderProgram = this.gl.createProgram();
        this.gl.attachShader(shaderProgram, vertexShader);
        this.gl.attachShader(shaderProgram, fragmentShader);
        this.gl.linkProgram(shaderProgram);

        if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
            alert('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(shaderProgram));
            return null;
        }

        this.programInfo = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: this.gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
                textureCoord: this.gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
            },
            uniformLocations: {
                projectionMatrix: this.gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
                modelViewMatrix: this.gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
                uSampler: this.gl.getUniformLocation(shaderProgram, 'uSampler'),
                uBackgroundColor: this.gl.getUniformLocation(shaderProgram, 'uBackgroundColor'),
            },
        };
    }

    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            alert('An error occurred compiling the shaders: ' + this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    initBuffers() {
        // Create vertex buffer for a square
        this.squareBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareBuffer);
    
        const positions = [
            -1.0,  1.0,  // Top left
             1.0,  1.0,  // Top right
            -1.0, -1.0,  // Bottom left
             1.0, -1.0,  // Bottom right
        ];
    
        this.gl.bufferData(
            this.gl.ARRAY_BUFFER,
            new Float32Array(positions),
            this.gl.STATIC_DRAW
        );
    
        // Create texture coordinate buffer
        this.textureCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
    
        // Updated texture coordinates to flip the texture 
        const textureCoordinates = [
            0.0, 0.0,  // Top left (was 0.0, 1.0)
            1.0, 0.0,  // Top right (was 1.0, 1.0)
            0.0, 1.0,  // Bottom left (was 0.0, 0.0)
            1.0, 1.0,  // Bottom right (was 1.0, 0.0)
        ];
    
        this.gl.bufferData(
            this.gl.ARRAY_BUFFER,
            new Float32Array(textureCoordinates),
            this.gl.STATIC_DRAW
        );
    }

    initTextures() {
        // Player texture
        this.playerTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.playerTexture);
        
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 255, 255]));

        // Block texture with transparency
        this.blockTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.blockTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
            new Uint8Array([255, 0, 0, 0])); // Alpha set to 0 for full transparency

        // Projectile texture with transparency
        this.projectileTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.projectileTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
            new Uint8Array([0, 255, 0, 0])); 

       
        this.loadTexture('textures/player.png', this.playerTexture);
        this.loadTexture('textures/block.png', this.blockTexture);
        this.loadTexture('textures/projectile.png', this.projectileTexture);
    }

    loadTexture(url, texture) {
        const image = new Image();
        image.onload = () => {
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            
            // Enable premultiplied alpha for better transparency
            this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
            
            
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            
            // Reset pixel store parameter
            this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        };
        image.src = url;
    }

    isPowerOf2(value) {
        return (value & (value - 1)) === 0;
    }

    spawnBlock() {
        const x = Math.random() * 1.6 - 0.8; 
        this.blocks.push({
            x: x,
            y: 1.0,
            width: 0.1,
            height: 0.1,
            hitPoints: Math.floor(Math.random() * 3) + 1,
            speed: 0.002 * this.level
        });
    }

    checkCollision(obj1, obj2) {
        
        if (this.projectiles.includes(obj1)) {
            
            const expandedWidth = obj1.width * 2;
            
            
            const projectileCenter = {
                x: obj1.x + (obj1.width / 2),
                y: obj1.y + (obj1.height / 2)
            };
            
            // Create an expanded hit box around the block's center
            const blockCenter = {
                x: obj2.x + (obj2.width / 2),
                y: obj2.y + (obj2.height / 2)
            };
            
            // Calculate distance between centers
            const dx = projectileCenter.x - blockCenter.x;
            const dy = projectileCenter.y - blockCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Use a more forgiving radius for collision
            const collisionRadius = (obj1.width + obj2.width) * 0.75;
            
            return distance < collisionRadius;
        }
        
        // For non-projectile collisions (like player-block), use standard box collision
        return obj1.x < obj2.x + obj2.width &&
               obj1.x + obj1.width > obj2.x &&
               obj1.y < obj2.y + obj2.height &&
               obj1.y + obj1.height > obj2.y;
    }


    render() {
        const backgroundColor = [0.0, 0.0, 0.2, 1.0];  // Dark blue background
        this.gl.clearColor(...backgroundColor);
        this.gl.clearDepth(1.0);
        
        // Enable depth testing and proper alpha blending
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        
        // Configure blending for proper transparency
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Create perspective matrix
        const projectionMatrix = mat4.create();
        mat4.ortho(projectionMatrix, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0);

        // Set shader uniforms
        this.gl.useProgram(this.programInfo.program);
        this.gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.projectionMatrix,
            false,
            projectionMatrix
        );
        
        // Set background color uniform
        this.gl.uniform4fv(
            this.programInfo.uniformLocations.uBackgroundColor,
            backgroundColor
        );

        // Render game objects
        this.renderObject(this.player, this.playerTexture);
        this.blocks.forEach(block => {
            this.renderObject(block, this.blockTexture);
        });
        this.projectiles.forEach(projectile => {
            this.renderObject(projectile, this.projectileTexture);
        });
    }

    renderObject(object, texture) {
        // Skip rendering if object is blinking (for invulnerability effect)
        if (object.isBlinking && Math.floor(Date.now() / 100) % 2 === 0) {
            return;
        }

        // Create model view matrix for the object
        const modelViewMatrix = mat4.create();
        mat4.translate(modelViewMatrix, modelViewMatrix, [object.x, object.y, 0.0]);
        mat4.scale(modelViewMatrix, modelViewMatrix, [object.width, object.height, 1.0]);

        // Set vertex positions
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareBuffer);
        this.gl.vertexAttribPointer(
            this.programInfo.attribLocations.vertexPosition,
            2,
            this.gl.FLOAT,
            false,
            0,
            0
        );
        this.gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);

        // Set texture coordinates
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
        this.gl.vertexAttribPointer(
            this.programInfo.attribLocations.textureCoord,
            2,
            this.gl.FLOAT,
            false,
            0,
            0
        );
        this.gl.enableVertexAttribArray(this.programInfo.attribLocations.textureCoord);

        // Set the model view matrix
        this.gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.modelViewMatrix,
            false,
            modelViewMatrix
        );

        // Bind texture
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.uniform1i(this.programInfo.uniformLocations.uSampler, 0);

        // Draw the object
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}

// Initialize game when window loads
window.addEventListener('load', () => {
    const game = new Game('gameCanvas');
});