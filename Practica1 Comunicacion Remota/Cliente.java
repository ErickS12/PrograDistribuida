import java.io.File;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

public class Cliente {

    private static final String RUTA_LOCAL = "./archivos";
    private static final int LIMITE_ARCHIVOS = 6; // Límite local de archivos
    
    private static final String IP_SERVIDOR = "127.0.0.1"; //ip del servidor
    private static final int PUERTO_SERVIDOR = 20000;

    public static void main(String[] args) {
        // Crear carpeta local si no existe
        new File(RUTA_LOCAL).mkdirs();

        try (Scanner scanner = new Scanner(System.in);
             DatagramSocket socket = new DatagramSocket()) {

            socket.setSoTimeout(2000); // 2 segundos de espera
            InetAddress addressServidor = InetAddress.getByName(IP_SERVIDOR);

            System.out.println("--- Sistema de Comunicación Remota (UDP) ---");
            System.out.println("Carpeta Local: " + new File(RUTA_LOCAL).getAbsolutePath());
            System.out.println("Limite Local: " + LIMITE_ARCHIVOS);

            while (true) {
                System.out.print("\nIngrese nombre del archivo a crear (o 'salir'): ");
                String nombreArchivo = scanner.nextLine().trim();

                if (nombreArchivo.equalsIgnoreCase("salir")) break;
                if (nombreArchivo.isEmpty()) continue;

                // 1. Verificamos cuántos archivos tenemos
                int cantidadActual = contarArchivosLocales();
                System.out.println("[INFO] Archivos locales actuales: " + cantidadActual);

                if (cantidadActual < LIMITE_ARCHIVOS) {
                    // CASO A: Crear Localmente
                    crearLocalmente(nombreArchivo);
                } else {
                    // CASO B: Enviar al Servidor
                    System.out.println("[INFO] Límite excedido. Enviando al servidor...");
                    enviarSolicitudRemota(socket, addressServidor, nombreArchivo);
                }
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // Cuenta archivos reales en la carpeta local
    private static int contarArchivosLocales() {
        File carpeta = new File(RUTA_LOCAL);
        File[] archivos = carpeta.listFiles();
        int contador = 0;
        if (archivos != null) {
            for (File f : archivos) {
                if (f.isFile()) contador++; // Solo contamos archivos, no carpetas
            }
        }
        return contador;
    }

    private static void crearLocalmente(String nombre) {
        File archivo = new File(RUTA_LOCAL, nombre);
        try {
            if (archivo.createNewFile()) {
                System.out.println("[LOCAL] Archivo creado: " + nombre);
            } else {
                System.out.println("[LOCAL] El archivo ya existe.");
            }
        } catch (IOException e) {
            System.err.println("[LOCAL] Error creando archivo: " + e.getMessage());
        }
    }

    private static void enviarSolicitudRemota(DatagramSocket socket, InetAddress ip, String nombre) {
        try {
            // Protocolo: Enviamos "CREAR:" seguido del nombre
            String mensaje = "CREAR:" + nombre;
            byte[] datos = mensaje.getBytes(StandardCharsets.UTF_8);

            DatagramPacket paquete = new DatagramPacket(datos, datos.length, ip, PUERTO_SERVIDOR);
            socket.send(paquete);

            // Esperamos confirmación
            byte[] buffer = new byte[1024];
            DatagramPacket respuesta = new DatagramPacket(buffer, buffer.length);
            socket.receive(respuesta);

            String textoRespuesta = new String(respuesta.getData(), 0, respuesta.getLength(), StandardCharsets.UTF_8);
            System.out.println("[REMOTO] Servidor respondió: " + textoRespuesta);

        } catch (SocketTimeoutException e) {
            System.out.println("[ERROR] El servidor no respondió (Timeout). ¿Está prendido?");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}