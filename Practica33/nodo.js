const skeletonify = require('./skeletonify');
const stubify = require('./stubify');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');

// ==========================
// CONFIGURACIÓN INICIAL
// ==========================
const PUERTO = process.argv[2] ? parseInt(process.argv[2]) : 8081;
const PUERTO_P2P = 10000; 

function getIP() {
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
        for (let i of interfaces[iface]) {
            if (i.family === 'IPv4' && !i.internal) return i.address;
        }
    }
    return '127.0.0.1';
}

const miIp = getIP();
const miUrl = `http://${miIp}:${PUERTO}`;
let otrosNodos = [];
const REPLICA_FACTOR = 2; // 1/2 de los nodos se convertirán en réplicas (escalable)

console.log(`[SISTEMA] Iniciando nodo en ${miUrl}`);

// ==========================
// DESCUBRIMIENTO P2P
// ==========================
const p2p = dgram.createSocket({ type: 'udp4', reuseAddr: true });

p2p.on('message', (msg, rinfo) => {
    const mensaje = msg.toString();

    if (mensaje.startsWith("NODO_VIVO")) {
        const puertoRemoto = mensaje.split(":")[1];
        const urlRemota = `http://${rinfo.address}:${puertoRemoto}`;

        if (urlRemota !== miUrl && !otrosNodos.includes(urlRemota)) {
            otrosNodos.push(urlRemota);
            console.log(`[P2P] Nodo detectado y agregado: ${urlRemota}`);
            console.log(`[P2P] Lista actual: [${otrosNodos}]`);
        }
    }

    if (mensaje === "BUSCANDO_NODOS") {
        const respuesta = Buffer.from(`NODO_VIVO:${PUERTO}`);
        p2p.send(respuesta, rinfo.port, rinfo.address);
    }
});

p2p.bind(PUERTO_P2P, () => {
    p2p.setBroadcast(true);
    console.log(`[P2P] Buscando compañeros en el puerto ${PUERTO_P2P}...`);

    setInterval(() => {
        const anuncio = Buffer.from(`NODO_VIVO:${PUERTO}`);
        p2p.send(anuncio, PUERTO_P2P, '255.255.255.255');
    }, 4000);

    setInterval(() => {
        const busqueda = Buffer.from("BUSCANDO_NODOS");
        p2p.send(busqueda, PUERTO_P2P, '255.255.255.255');
    }, 10000);
});

// ==========================
// LÓGICA DE PERSISTENCIA
// ==========================
function guardarLocal(nombre, contenidoBase64) {
    const dir = './archivos_Local_' + PUERTO; 
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    const ruta = `${dir}/${nombre}`;
    if (fs.existsSync(ruta)) return 2; 

    // Convertimos de Base64 a binario antes de guardar en disco
    fs.writeFileSync(ruta, Buffer.from(contenidoBase64, 'base64'));
    console.log(`[DISCO] Guardado: ${nombre}`);
    return 1;
}

// ==========================
// FUNCIÓN AUXILIAR: Contar archivos y calcular réplicas dinámicas
// ==========================
async function contarArchivosEnNodos() {
    let nodosConCuentas = [];
    
    // Contar archivos locales
    const dirLocal = './archivos_Local_' + PUERTO;
    const countLocal = fs.existsSync(dirLocal) ? fs.readdirSync(dirLocal).length : 0;
    nodosConCuentas.push({ url: 'local', archivos: countLocal });
    
    // Contar archivos en otros nodos
    for (const url of otrosNodos) {
        try {
            const nodo = stubify(url, 'Nodo', ['contarArchivos']);
            const count = await nodo.contarArchivos();
            nodosConCuentas.push({ url, archivos: count });
        } catch (err) {
            console.error(`[ERROR] No se pudo contar archivos en ${url}`);
        }
    }
    
    // Ordenar por cantidad de archivos (menor primero)
    nodosConCuentas.sort((a, b) => a.archivos - b.archivos);
    return nodosConCuentas;
}

function calcularReplicasDinamicas(totalNodos) {
    // Calcula dinámicamente el número de réplicas basado en el total de nodos
    // 6 nodos → 2 réplicas, 120 nodos → 40 réplicas, etc.
    const replicas = Math.max(2, Math.floor(totalNodos / REPLICA_FACTOR));
    return Math.min(replicas, totalNodos - 1); // No puede ser más que (totalNodos - 1)
}

// ==========================
// LÓGICA DISTRIBUIDA (RPC)
// ==========================
const nodoLogica = {
    guardarEnDisco: async (nombre, contenidoBase64) => {
        console.log(`[COORDINADOR] Recibida solicitud para: ${nombre}`);
        
        // Obtener conteo de archivos en todos los nodos
        const nodosConCuentas = await contarArchivosEnNodos();
        const nodoDestino = nodosConCuentas[0];
        const maxReplicas = calcularReplicasDinamicas(nodosConCuentas.length);
        
        console.log(`[DISTRIBUCION] Nodo destino: ${nodoDestino.url} (tiene ${nodoDestino.archivos} archivos)`);
        console.log(`[REPLICACION] Creando ${maxReplicas} réplica(s) de ${maxReplicas > 1 ? 'un total de' : ''} ${nodosConCuentas.length} nodo(s)`);
        
        if (nodoDestino.url === 'local') {
            // Guardar en este nodo (es el que tiene menos archivos)
            const resultado = guardarLocal(nombre, contenidoBase64);
            if (resultado === 2) return 2;
            
            // Replicar en los siguientes maxReplicas nodos con menos archivos
            let replicasExitosas = 1;
            for (let i = 1; i <= maxReplicas && i < nodosConCuentas.length; i++) {
                const { url } = nodosConCuentas[i];
                try {
                    const nodo = stubify(url, 'Nodo', ['guardarReplica']);
                    const res = await nodo.guardarReplica(nombre, contenidoBase64);
                    if (res === 1 || res === 2) {
                        replicasExitosas++;
                        console.log(`[REPLICA] Copia creada en ${url}`);
                    }
                } catch (err) {
                    console.error(`[FALLO] No se pudo replicar en ${url}`);
                }
            }
            
            console.log(`[SISTEMA] Archivo '${nombre}' distribuido: 1 original + ${replicasExitosas - 1} réplica(s).`);
            return 1;
        } else {
            // El archivo debe guardarse en otro nodo
            try {
                // Preparar lista de nodos para replicación
                const nodosParaReplica = nodosConCuentas
                    .filter(n => n.url !== nodoDestino.url)
                    .slice(0, maxReplicas)
                    .map(n => n.url);
                
                const nodo = stubify(nodoDestino.url, 'Nodo', ['guardarEnDiscoDistribuido']);
                return await nodo.guardarEnDiscoDistribuido(nombre, contenidoBase64, nodosParaReplica);
            } catch (err) {
                console.error(`[FALLO] No se pudo guardar en ${nodoDestino.url}`);
                return 0;
            }
        }
    },

    guardarEnDiscoDistribuido: async (nombre, contenidoBase64, nodosParaReplica = []) => {
        // Guardar en el nodo actual
        const resultado = guardarLocal(nombre, contenidoBase64);
        if (resultado === 2) return 2;
        
        let replicasExitosas = 1;
        
        // Replicar en los nodos especificados
        for (const url of nodosParaReplica) {
            try {
                const nodo = stubify(url, 'Nodo', ['guardarReplica']);
                const res = await nodo.guardarReplica(nombre, contenidoBase64);
                if (res === 1 || res === 2) {
                    replicasExitosas++;
                    console.log(`[REPLICA] Copia creada en ${url}`);
                }
            } catch (err) {
                console.error(`[FALLO] No se pudo replicar en ${url}`);
            }
        }
        
        console.log(`[SISTEMA] Archivo '${nombre}' distribuido: 1 original + ${replicasExitosas - 1} réplica(s).`);
        return 1;
    },

    contarArchivos: async () => {
        const dir = './archivos_Local_' + PUERTO;
        if (!fs.existsSync(dir)) return 0;
        return fs.readdirSync(dir).length;
    },

    guardarReplica: async (nombre, contenidoBase64) => {
        return guardarLocal(nombre, contenidoBase64);
    },

    leerArchivo: async (nombre) => {
        const dir = './archivos_Local_' + PUERTO;
        const ruta = `${dir}/${nombre}`;

        if (fs.existsSync(ruta)) {
            console.log(`[LECTURA] Sirviendo copia local de ${nombre}`);
            // Retornamos el archivo convertido a Base64
            return fs.readFileSync(ruta).toString('base64');
        }

        for (const url of otrosNodos) {
            try {
                const nodoRemoto = stubify(url, 'Nodo', ['leerArchivoLocal']);
                const contenido = await nodoRemoto.leerArchivoLocal(nombre);
                if (contenido) return contenido;
            } catch (e) { continue; }
        }
        return null;
    },

    leerArchivoLocal: async (nombre) => {
        const dir = './archivos_Local_' + PUERTO;
        const ruta = `${dir}/${nombre}`;
        return fs.existsSync(ruta) ? fs.readFileSync(ruta).toString('base64') : null;
    },

    listarArchivos: async () => {
        const dir = './archivos_Local_' + PUERTO;
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir);
    }
};

// ==========================
// RECUPERACIÓN Y SINCRONIZACIÓN INICIAL
// ==========================
async function sincronizarArchivosInicial() {
    // Esperar un breve periodo para descubrir otros nodos en la red
    await new Promise(resolve => setTimeout(resolve, 5000));

    const dirLocal = './archivos_Local_' + PUERTO;
    if (!fs.existsSync(dirLocal)) fs.mkdirSync(dirLocal);

    // ✨ NUEVO: Replicar archivos locales existentes en otros nodos
    const archivosLocales = fs.readdirSync(dirLocal) || [];
    if (archivosLocales.length > 0 && otrosNodos.length > 0) {
        console.log(`[REPLICACIÓN] Encontrados ${archivosLocales.length} archivo(s) local(es). Iniciando replicación...`);
        for (const archivo of archivosLocales) {
            try {
                const ruta = `${dirLocal}/${archivo}`;
                if (fs.statSync(ruta).isFile()) {
                    const contenidoBase64 = fs.readFileSync(ruta).toString('base64');
                    await nodoLogica.guardarEnDisco(archivo, contenidoBase64);
                }
            } catch (err) {
                console.error(`[ERROR] No se pudo replicar '${archivo}':`, err.message);
            }
        }
        console.log(`[REPLICACIÓN] Replicación de archivos locales completada.`);
    }

    if (otrosNodos.length === 0) {
        console.log('[RECUPERACIÓN] No se encontraron otros nodos para sincronizar.');
        return;
    }

    const localFiles = new Set(fs.existsSync(dirLocal) ? fs.readdirSync(dirLocal) : []);

    for (const url of otrosNodos) {
        try {
            const nodoRemoto = stubify(url, 'Nodo', ['listarArchivos', 'leerArchivoLocal']);
            const archivosRemotos = await nodoRemoto.listarArchivos();

            for (const nombre of archivosRemotos) {
                if (localFiles.has(nombre)) continue;

                const contenidoBase64 = await nodoRemoto.leerArchivoLocal(nombre);
                if (!contenidoBase64) continue;

                const res = guardarLocal(nombre, contenidoBase64);
                if (res === 1) {
                    localFiles.add(nombre);
                    console.log(`[RECUPERACIÓN] Archivo '${nombre}' recuperado desde ${url}.`);
                }
            }
        } catch (err) {
            console.log(`[RECUPERACIÓN] Error conectando con ${url}: ${err.message}`);
        }
    }

    console.log(`[RECUPERACIÓN] Sincronización inicial completada. Archivos locales: ${localFiles.size}`);
}

// Ejecutar sincronización inicial después de iniciar RPC
sincronizarArchivosInicial();

// ==========================
// SERVIDOR RPC
// ==========================
skeletonify('Nodo', nodoLogica).listen(PUERTO, () => {
    console.log(`[RPC] Servidor escuchando en puerto ${PUERTO}`);
});