let gl;
let program;
let borgoRenderables = []; 
let mazzmarillRenderables = [];
let mazzmarilli = [];
let globalTime = 0;

const nascondigli = [
    { pos: [-5.02, 0.0, 5.58], rotazione: 1.7},
    { pos: [-0.7, 0.0, 11.7], rotazione: 3.14},
    { pos: [-10.64, 0.0, 6.35], rotazione: 1.57},
    { pos: [-12.67, 0.0, -1.08], rotazione: 1.57},
    { pos: [-12.75, 0.0, -0.86], rotazione: 1.57},
    { pos: [-2.83, 0.0, -8.6], rotazione: 0.0},
    { pos: [13.28, 0.0, -5.73], rotazione: 4.71},
    { pos: [12.37, 0.0, 8.98], rotazione: 3.30},
    { pos: [4.82, 0.0, 7.95], rotazione: 3.14},
    { pos: [-5.6, 0.0, 1.26], rotazione: 1.57},
    { pos: [-4.99, 0.0, -1.41], rotazione: 0.9},
    { pos: [8.08, 0.0, -3.46], rotazione: 0.0},
    { pos: [7.72, 0.0, 5.07], rotazione: 3.14}

];

// --- MOTORE TELECAMERA IBRIDO ---
let cameraMode = 'ORBITAL'; // Può essere 'ORBITAL' o 'FREE'
let cameraTarget = [0, 0, 0]; // Reso dinamico per la lookAt

// Parametri Orbitale
let orbitYaw = 0.0;
let orbitPitch = 0.5;
let orbitRadius = 20.0;
const orbitTarget = [0, 0, 0];
const orbitSensitivity = 0.01;

// Parametri Volo Libero (WASD)
let freeYaw = 0.0;
let freePitch = 0.0;
let cameraSpeed = 0.3;
const freeSensitivity = 0.005;
let keys = { w: false, a: false, s: false, d: false };

// Input Condivisi
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
// --------------------------------

let cameraPosition = [0, 5, 20]; 
let upVector = [0, 1, 0];

// --- VARIABILI BARDO E NOTE ---
let bardRenderables = [];
let bardMatrix = m4.identity();
// Coordinate fisse del bardo (modifica a piacimento per posizionarlo)
const bardPosition = [5.8, 0.0, -4.6]; 

let noteRenderables = [];
const NUM_NOTES = 5; // Numero di note fluttuanti
let noteMatricesArray = new Float32Array(NUM_NOTES * 16);
let noteAnimTimer = 0.0;

let isMusicPlaying = false;
// Assicurati che il percorso del file audio coincida
const medievalMusic = new Audio('assets/audio/lute.mp3'); 
medievalMusic.loop = true; // Riproduzione in loop continuo
// ------------------------------

// --- VARIABILI INTERFACCIA E STATISTICHE ---
let mazzmarillScore = 0;
let lastTime = 0;
let frameCount = 0;
let fpsVisible = false;


let projectionMatrix = m4.identity();
let viewMatrix = m4.identity();

const toggleBardMusic = () => {
    isMusicPlaying = !isMusicPlaying;
    const btn = document.getElementById('btn-music');
    if (isMusicPlaying) {
        medievalMusic.play();
        btn.innerText = "Musica Bardo: ON";
    } else {
        medievalMusic.pause();
        btn.innerText = "Musica Bardo: OFF";
    }
};


async function main() {
    const canvas = document.getElementById("canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("Il tuo browser non supporta WebGL2!");
        return;
    }

    gl.enable(gl.DEPTH_TEST);
    //gl.enable(gl.CULL_FACE); 

    program = webglUtils.createProgramFromScripts(gl, ["vs", "fs"]);

    console.log("Inizio caricamento borgo...");
    
    // FASE 1: Legge il file di testo e scarica le immagini
    const borgoData = await loadOBJModel(gl, 'assets/models/village.obj?v=1', { textureBaseDir: 'assets/textures/' });
    
    // Indichiamo a quali 'location' del Vertex Shader mandare i dati
    const attribLocations = {
        position: 0,
        uv: 1,
        normal: 6, // Non ci servono per ora (luci spente)
        tangent: -1, 
        instanceMatrix: 2 // Parte dallo slot 2
    };

    // Creiamo un array con una singola matrice d'identità (vogliamo 1 solo borgo al centro)
    const borgoInstances = [m4.identity()];

    // FASE 2: utilities.js crea i VAO e prepara tutto per WebGL
    const builtBorgo = buildModel(gl, borgoData, borgoInstances, attribLocations);
    borgoRenderables = builtBorgo.renderables;
    // Diciamo a WebGL di ripetere le texture invece di "stirarle" ai bordi
    for (const renderable of borgoRenderables) {
        if (renderable.useTexture && renderable.texture) {
            gl.bindTexture(gl.TEXTURE_2D, renderable.texture);
            // Imposta la ripetizione sull'asse X (S) della texture
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            // Imposta la ripetizione sull'asse Y (T) della texture
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        }
    }
    console.log("Borgo pronto per il render!", borgoRenderables);

    console.log("Inizio caricamento Mazzmarill...");
    const mazzData = await loadOBJModel(gl, 'assets/models/mazzmarill.obj?v=4', { textureBaseDir: 'assets/textures/' });
    
    // --- AUDIO ---
    const ghigno1 = new Audio('assets/audio/risata1.mp3'); 
    const ghigno2 = new Audio('assets/audio/risata2.mp3');
    const ghigno3 = new Audio('assets/audio/fahhh.mp3');

    // --- STATO DEI MAZZMARILL ---
    mazzmarilli = [
        {
            basePosition: [-5.0, 0.0, -1.4], // Coordinate X, Y, Z (aggiorna la Y se sprofonda)
            matrix: m4.identity(),         
            state: 'IDLE',                 // 'IDLE' (nascosto) o 'CAUGHT' (trovato)
            animTimer: 0.0                 // Contatore per i saltelli
        }
    ];

    // Funzione per aggiornare le matrici in base alla posizione base
    const updateMazzMatrices = () => {
        for (let m of mazzmarilli) {
            let mat = m4.translation(m.basePosition[0], m.basePosition[1], m.basePosition[2]);
            mat = m4.yRotate(mat, 0.9);
            m.matrix = m4.scale(mat, 0.4, 0.4, 0.4);
        }
    };
   
    updateMazzMatrices();

    const builtMazz = buildModel(gl, mazzData, mazzmarilli.map(m => m.matrix), attribLocations);
    mazzmarillRenderables = builtMazz.renderables;
    
    console.log("Mazzmarill pronto!", mazzmarillRenderables);

    console.log("Inizio caricamento Bardo e Note...");
    
    // 1. Caricamento Bardo (Singola istanza statica)
    const bardData = await loadOBJModel(gl, 'assets/models/bard.obj', { textureBaseDir: 'assets/textures/' });
    bardMatrix = m4.translation(bardPosition[0], bardPosition[1], bardPosition[2]);
    // Opzionale: m4.yRotate(bardMatrix, Math.PI / 2) per girarlo verso il centro
    const builtBard = buildModel(gl, bardData, [bardMatrix], attribLocations);
    bardRenderables = builtBard.renderables;

    // 2. Caricamento Note (Multi-istanza dinamica)
    const noteData = await loadOBJModel(gl, 'assets/models/note.obj', { textureBaseDir: 'assets/textures/' });
    // Dichiariamo le istanze iniziali, ma i valori reali li calcoleremo nel drawScene
    let initialNoteInstances = Array(NUM_NOTES).fill(m4.identity());
    const builtNotes = buildModel(gl, noteData, initialNoteInstances, attribLocations);
    noteRenderables = builtNotes.renderables;

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // --- GESTIONE CAMBIO TELECAMERA ---
    document.getElementById('btn-camera').addEventListener('click', () => {
        cameraMode = cameraMode === 'ORBITAL' ? 'FREE' : 'ORBITAL';
        document.getElementById('btn-camera').innerText = `Camera: ${cameraMode}`;
    });

    // --- GESTIONE TASTIERA (Volo Libero) ---
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = true;
    });
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = false;
    });

    // --- GESTIONE MOUSE IBRIDA ---
    gl.canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        let deltaX = e.clientX - lastMouseX;
        let deltaY = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        if (cameraMode === 'ORBITAL') {
            orbitYaw -= deltaX * orbitSensitivity;
            orbitPitch += deltaY * orbitSensitivity;
            const pitchLimit = Math.PI / 2 - 0.1;
            if (orbitPitch > pitchLimit) orbitPitch = pitchLimit;
            if (orbitPitch < 0.1) orbitPitch = 0.1;
        } else {
            freeYaw -= deltaX * freeSensitivity;
            freePitch -= deltaY * freeSensitivity;
            const limit = Math.PI / 2 - 0.01;
            if (freePitch > limit) freePitch = limit;
            if (freePitch < -limit) freePitch = -limit;
        }
    });

    window.addEventListener('mouseup', () => isDragging = false);

    gl.canvas.addEventListener('wheel', (e) => {
        // Lo zoom funziona solo in orbitale
        if (cameraMode !== 'ORBITAL') return; 
        e.preventDefault();
        orbitRadius += e.deltaY * 0.02;
        if (orbitRadius < 3.0) orbitRadius = 3.0;
        if (orbitRadius > 40.0) orbitRadius = 40.0;
    }, { passive: false });

    // --- MOTORE DI RAYCASTING (Click del mouse) ---
    gl.canvas.addEventListener('mousedown', (e) => {
        // Se stiamo trascinando la telecamera (tasto destro o movimento), ignoriamo
        if (isDragging && e.button !== 0) return; 

        // 1. Coordinate NDC
        const rect = gl.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const clipX = (mouseX / gl.canvas.clientWidth) * 2.0 - 1.0;
        const clipY = 1.0 - (mouseY / gl.canvas.clientHeight) * 2.0;
        const clipCoords = [clipX, clipY, -1.0, 1.0];

        // 2. Calcolo della direzione del raggio (Ray Direction)
        const invProjection = m4.inverse(projectionMatrix);
        const invView = m4.inverse(viewMatrix);
        
        let eyeCoords = m4.transformVector(invProjection, clipCoords);
        eyeCoords = [eyeCoords[0], eyeCoords[1], -1.0, 0.0]; 
        
        let rayWorld = m4.transformVector(invView, eyeCoords);
        let rayDirection = m4.normalize([rayWorld[0], rayWorld[1], rayWorld[2]]);

        // 3. Controllo Intersezione Sfera (Semplificato)
        // Raggio d'azione del clic (essendo scalato al 40%, 1.0 unità dovrebbe bastare)
        const hitRadius = 0.35; 

        for (let i = 0; i < mazzmarilli.length; i++) {
            let mazz = mazzmarilli[i];
            
            if (mazz.state === 'IDLE') {
                // Vettore dalla telecamera al folletto
                const hitboxCenter = [
                    mazz.basePosition[0],
                    mazz.basePosition[1], 
                    mazz.basePosition[2]
                ];

                const vectorToMazz = [
                    hitboxCenter[0] - cameraPosition[0],
                    hitboxCenter[1] - cameraPosition[1],
                    hitboxCenter[2] - cameraPosition[2]
                ];
                
                // Proiezione del vettore sul raggio per trovare il punto più vicino
                const t = dotProduct(vectorToMazz, rayDirection);
                
                if (t > 0) { // Se è davanti a noi
                    const closestPoint = [
                        cameraPosition[0] + rayDirection[0] * t,
                        cameraPosition[1] + rayDirection[1] * t,
                        cameraPosition[2] + rayDirection[2] * t
                    ];
                    
                    const distanceToCenter = distance(closestPoint, mazz.basePosition);
                    // COLPITO!
                    if (distanceToCenter < hitRadius) {
                        mazz.state = 'CAUGHT';
                        mazz.animTimer = 0.0;
                        
                        mazzmarillScore++;
                        document.getElementById('score-val').innerText = mazzmarillScore;
                       
                        // Riproduci uno dei due suoni (50% probabilità)
                        let soundRandom = Math.random()
                        if (soundRandom < 0.3) {
                            ghigno1.currentTime = 0;
                            ghigno1.play();
                        } else if(soundRandom > 0.7) {
                            ghigno2.currentTime = 0;
                            ghigno2.play();
                        } else{
                            ghigno3.currentTime = 0;
                            ghigno3.play()
                        }
                        
                        console.log("Mazzmarill Trovato!");
                        break; // Ne catturiamo uno alla volta
                    }
                }
            }
        }

        // --- HITBOX BARDO ---
        // Alziamo il centro per mirare al busto
        const bardHitboxCenter = [bardPosition[0], bardPosition[1] + 1.0, bardPosition[2]];
        const bardVector = [
            bardHitboxCenter[0] - cameraPosition[0],
            bardHitboxCenter[1] - cameraPosition[1],
            bardHitboxCenter[2] - cameraPosition[2]
        ];
        
        const tBard = dotProduct(bardVector, rayDirection);
        
        if (tBard > 0) {
            const closestPointBard = [
                cameraPosition[0] + rayDirection[0] * tBard,
                cameraPosition[1] + rayDirection[1] * tBard,
                cameraPosition[2] + rayDirection[2] * tBard
            ];
            
            const distanceToBard = distance(closestPointBard, bardHitboxCenter);
            const bardHitRadius = 1.0; 
            
            if (distanceToBard < bardHitRadius) {
                toggleBardMusic()
            }
        }
    });

    // Funzioni helper matematiche da aggiungere se non presenti in m4.js
    function dotProduct(v1, v2) { return v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2]; }
    function distance(p1, p2) { 
        return Math.sqrt(Math.pow(p1[0]-p2[0], 2) + Math.pow(p1[1]-p2[1], 2) + Math.pow(p1[2]-p2[2], 2)); 
    }

    // --- SETUP UI DOM ---
    // Nascondi caricamento, mostra popup
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('welcome-popup').style.display = 'flex';

    // Click su Inizia
    document.getElementById('btn-start').addEventListener('click', () => {
        document.getElementById('welcome-popup').style.display = 'none';
        document.getElementById('game-hud').style.display = 'block';
    });

    // Click pulsante musica
    document.getElementById('btn-music').addEventListener('click', toggleBardMusic);

    // Click pulsante FPS
    document.getElementById('btn-fps').addEventListener('click', () => {
        fpsVisible = !fpsVisible;
        document.getElementById('fps-display').style.display = fpsVisible ? 'block' : 'none';
        document.getElementById('btn-fps').innerText = fpsVisible ? "Nascondi FPS" : "Mostra FPS";
    });

    requestAnimationFrame(drawScene);
}

function resizeCanvas() {
    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}

function drawScene(time) {

    // --- CALCOLO FPS ---
    frameCount++;
    if (time - lastTime >= 1000) { // Aggiorna ogni secondo (1000 millisecondi)
        if (fpsVisible) {
            document.getElementById('fps-val').innerText = frameCount;
        }
        frameCount = 0;
        lastTime = time;
    }
    // -------------------
    // Rallentiamo il tempo a 0.005 per goderci la transizione
    globalTime += 0.001; 
    const sunDirX = Math.cos(globalTime);
    const sunDirY = Math.sin(globalTime);
    const sunDirZ = 0.5;

    // --- COLORI DEL CICLO (RGB in scala 0.0 - 1.0) ---
    const skyDay = [0.53, 0.81, 0.92], sunDay = [1.0, 1.0, 1.0];
    const skySunset = [0.95, 0.45, 0.15], sunSunset = [1.0, 0.5, 0.0];
    const skyNight = [0.02, 0.02, 0.1], sunNight = [0.0, 0.0, 0.0];

    let currentSky = [], currentSun = [];

    // --- MOTORE DI INTERPOLAZIONE ---
    if (sunDirY > 0.2) { // Pieno Giorno
        currentSky = skyDay; currentSun = sunDay;
    } else if (sunDirY > 0.0) { // Tramonto (Giorno -> Arancio)
        let t = sunDirY / 0.2; // Valore tra 0 e 1
        for(let i=0; i<3; i++) {
            currentSky[i] = skySunset[i] + (skyDay[i] - skySunset[i]) * t;
            currentSun[i] = sunSunset[i] + (sunDay[i] - sunSunset[i]) * t;
        }
    } else if (sunDirY > -0.2) { // Crepuscolo (Arancio -> Notte)
        let t = (sunDirY + 0.2) / 0.2;
        for(let i=0; i<3; i++) {
            currentSky[i] = skyNight[i] + (skySunset[i] - skyNight[i]) * t;
            currentSun[i] = sunNight[i] + (sunSunset[i] - sunNight[i]) * t;
        }
    } else { // Notte Fonda
        currentSky = skyNight; currentSun = sunNight;
    }

    // Applica il colore dinamico al cielo (sostituisce il vecchio azzurro fisso)
    gl.clearColor(currentSky[0], currentSky[1], currentSky[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    projectionMatrix = m4.perspective(Math.PI / 3, aspect, 0.1, 200.0);
    
    // --- CALCOLO POSIZIONE TELECAMERA IBRIDO ---
    if (cameraMode === 'ORBITAL') {
        // Algoritmo Sferico
        cameraPosition[0] = orbitTarget[0] + orbitRadius * Math.cos(orbitPitch) * Math.sin(orbitYaw);
        cameraPosition[1] = orbitTarget[1] + orbitRadius * Math.sin(orbitPitch);
        cameraPosition[2] = orbitTarget[2] + orbitRadius * Math.cos(orbitPitch) * Math.cos(orbitYaw);
        
        cameraTarget = [orbitTarget[0], orbitTarget[1], orbitTarget[2]];
    } else {
        // Algoritmo Vettoriale (FPS)
        const forwardX = Math.sin(freeYaw) * Math.cos(freePitch);
        const forwardY = Math.sin(freePitch);
        const forwardZ = Math.cos(freeYaw) * Math.cos(freePitch);
        
        const rightX = Math.sin(freeYaw - Math.PI/2);
        const rightZ = Math.cos(freeYaw - Math.PI/2);

        if (keys.w) { cameraPosition[0] += forwardX * cameraSpeed; cameraPosition[1] += forwardY * cameraSpeed; cameraPosition[2] += forwardZ * cameraSpeed; }
        if (keys.s) { cameraPosition[0] -= forwardX * cameraSpeed; cameraPosition[1] -= forwardY * cameraSpeed; cameraPosition[2] -= forwardZ * cameraSpeed; }
        if (keys.a) { cameraPosition[0] -= rightX * cameraSpeed; cameraPosition[2] -= rightZ * cameraSpeed; }
        if (keys.d) { cameraPosition[0] += rightX * cameraSpeed; cameraPosition[2] += rightZ * cameraSpeed; }

        cameraTarget = [
            cameraPosition[0] + forwardX,
            cameraPosition[1] + forwardY,
            cameraPosition[2] + forwardZ
        ];
    }

    // Creazione finale delle matrici
    const cameraMatrix = m4.lookAt(cameraPosition, cameraTarget, upVector);
    viewMatrix = m4.inverse(cameraMatrix);
    const viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

    const vpLocation = gl.getUniformLocation(program, "u_viewProjection");
    gl.uniformMatrix4fv(vpLocation, false, viewProjectionMatrix);

    // --- MOTORE DEI LAMPIONI ---
    // Coordinate arbitrarie per iniziare (le aggiusteremo poi)
    //const lampPosition = [2.2, 1.3, -3.0]; 
    const lampPositions = [
        2.2, 1.43, -3.0,    // Lampione 1
        15.7, 1.43, 2.83,   // Lampione 2
        15.74, 1.43, -2.39,  // Lampione 3
        5.99, 1.43, 7.21,  // Lampione 4
        0.054, 1.43, 7.37,   // Lampione 5
        -9.84, 1.43, 9.32,  // Lampione 6 
        -11.13, 1.43, -1.66,   // Lampione 7
        -12.65, 1.43, -11.17,   // Lampione 8
        -10.24, 1.43, -11.16,  // Lampione 9
        -2.38, 1.43, -7.26,  // Lampione 10
        3.56, 1.43, -7.02,   // Lampione 11
        5.96, 1.43, 0.9,  // Lampione 12
        2.19, 1.43, 4.4,   // Lampione 13
        -1.32, 1.43, 0.64   // Lampione 14
    ];
    const lampColor = [1.0, 0.7, 0.2]; // Giallo caldo vintage
    
    // Il lampione si accende quando il sole scende sotto quota 0.1
    let lampIntensity = 0.0;
    if (sunDirY < 0.1) {
        // Sfuma l'accensione (arriva al 100% quando il sole è a -0.1)
        lampIntensity = Math.min(1.0, (0.1 - sunDirY) * 5.0); 
    }

    // --- FUNZIONE DI RENDERING (Definita qui per accedere a tutte le variabili di luce) ---
    const drawObjects = (renderables) => {
        for (const renderable of renderables) {
            if (renderable.materialName === 'COLLIDER') continue; 

            gl.bindVertexArray(renderable.vao);

            // 1. Texture e Colori
            const useTextureLoc = gl.getUniformLocation(program, "u_useTexture");
            const colorLoc = gl.getUniformLocation(program, "u_color");
            const textureLoc = gl.getUniformLocation(program, "u_texture");
            
            gl.uniform1i(useTextureLoc, renderable.useTexture ? 1 : 0);
            gl.uniform3fv(colorLoc, renderable.color);

            if (renderable.useTexture && renderable.texture) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, renderable.texture);
                gl.uniform1i(textureLoc, 0);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            }

            // 2. Luce del Sole
            const sunDirLoc = gl.getUniformLocation(program, "u_sunDirection");
            const sunColorLoc = gl.getUniformLocation(program, "u_sunColor");
            gl.uniform3f(sunDirLoc, sunDirX, sunDirY, sunDirZ);
            gl.uniform3fv(sunColorLoc, currentSun);

            // 3. Lampioni
            const lampPosLoc = gl.getUniformLocation(program, "u_lampPositions");
            const lampColorLoc = gl.getUniformLocation(program, "u_lampColor");
            const lampIntLoc = gl.getUniformLocation(program, "u_lampIntensity");
            
            gl.uniform3fv(lampPosLoc, lampPositions);
            gl.uniform3fv(lampColorLoc, lampColor);
            gl.uniform1f(lampIntLoc, lampIntensity);

            // ORDINE DI DISEGNO
            gl.drawArraysInstanced(gl.TRIANGLES, 0, renderable.vertexCount, renderable.instanceCount);
        }
    };

    // --- DISEGNO BARDO ---
    drawObjects(bardRenderables);

    // --- ANIMAZIONE NOTE MUSICALI (Sistema Particellare Semplificato) ---
    if (isMusicPlaying) {
        noteAnimTimer += 0.02; 

        for (let i = 0; i < NUM_NOTES; i++) {
            // Sfasamento angolare per distribuire le note in cerchio
            let offset = i * ((Math.PI * 2) / NUM_NOTES); 
            
            // Orbita: raggio costante attorno alle coordinate X e Z del bardo
            let radius = 1.5; 
            let speed = noteAnimTimer + offset;
            
            let noteX = bardPosition[0] + Math.cos(speed) * radius;
            let noteZ = bardPosition[2] + Math.sin(speed) * radius;
            
            // Fluttuazione ascensionale continua con azzeramento
            let noteY = bardPosition[1] + ((noteAnimTimer * 1.5 + offset) % 3.0); 

            let mat = m4.translation(noteX, noteY, noteZ);
            mat = m4.yRotate(mat, speed * 2.0); // Rotazione sull'asse per tridimensionalità
            
            // Regola questo valore (es. 0.2) in base a quanto hai fatto grandi i file .obj
            mat = m4.scale(mat, 0.2, 0.2, 0.2); 

            for (let j = 0; j < 16; j++) {
                noteMatricesArray[i * 16 + j] = mat[j];
            }
        }

        // Trasferimento dei dati aggiornati alla VRAM
        for (const renderable of noteRenderables) {
            gl.bindBuffer(gl.ARRAY_BUFFER, renderable.instanceBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, noteMatricesArray, gl.DYNAMIC_DRAW);
        }
        
        drawObjects(noteRenderables);
    }
// --- MOTORE DI ANIMAZIONE MAZZMARILL ---
    // Prepariamo un array piatto per contenere le matrici aggiornate di tutti i folletti
    let mazzMatricesArray = new Float32Array(mazzmarilli.length * 16);

    for (let i = 0; i < mazzmarilli.length; i++) {
        let mazz = mazzmarilli[i];

        if (mazz.state === 'CAUGHT') {
            // Avanziamo il tempo dell'animazione
            mazz.animTimer += 0.03; 

            // 1. Il Salto: Usiamo Math.abs(Math.sin) per creare un effetto "rimbalzo" sulla Y
            let jumpHeight = Math.abs(Math.sin(mazz.animTimer * Math.PI)) * 1.5;

            // 2. La Rotazione: Lo facciamo anche ruotare come una trottola in fuga
            let mat = m4.translation(mazz.basePosition[0], mazz.basePosition[1] + jumpHeight, mazz.basePosition[2]);
            mat = m4.yRotate(mat, mazz.animTimer * 10.0);
            
            mazz.matrix = m4.scale(mat, 0.4, 0.4, 0.4);

            // 3. Fine dell'animazione e Teletrasporto (dopo circa 2 rimbalzi)
            if (mazz.animTimer > 2.0) {
                // Peschiamo un indice a caso dall'array dei nascondigli
                const randomIndex = Math.floor(Math.random() * nascondigli.length);
                const nuovoSpot = nascondigli[randomIndex];

                // Assegnamo le nuove coordinate
                mazz.basePosition = [nuovoSpot.pos[0], nuovoSpot.pos[1], nuovoSpot.pos[2]];
                
                // Ricostruiamo la matrice includendo la rotazione predefinita
                let resetMat = m4.translation(mazz.basePosition[0], mazz.basePosition[1], mazz.basePosition[2]);
                resetMat = m4.yRotate(resetMat, nuovoSpot.rotazione);
                mazz.matrix = m4.scale(resetMat, 0.4, 0.4, 0.4);
                
                // Rimettiamo lo stato in attesa
                mazz.state = 'IDLE';
                mazz.animTimer = 0.0;
            }
        }

        // Copiamo i 16 numeri della matrice aggiornata nell'array piatto
        for (let j = 0; j < 16; j++) {
            mazzMatricesArray[i * 16 + j] = mazz.matrix[j];
        }
    }

    // --- AGGIORNAMENTO DELLA SCHEDA VIDEO (VRAM) ---
    // Diciamo a WebGL: "Ehi, i folletti si sono mossi, ecco le nuove coordinate!"
    for (const renderable of mazzmarillRenderables) {
        gl.bindBuffer(gl.ARRAY_BUFFER, renderable.instanceBuffer);
        // Usiamo gl.DYNAMIC_DRAW per segnalare che questi dati cambieranno spesso
        gl.bufferData(gl.ARRAY_BUFFER, mazzMatricesArray, gl.DYNAMIC_DRAW);
    }
    // ------------------------------------------------

    drawObjects(borgoRenderables);
    drawObjects(mazzmarillRenderables);
    requestAnimationFrame(drawScene);
}

window.onload = main;