import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class Servidor {

    // Usamos una ruta para almacenar los archivos creados remotamente
    private static final String RUTA_CARPETA = "./archivos_remotos";
    private static final int PUERTO = 20000;

    public static void main(String[] args) {
        // Nos asegurar que la carpeta exista
        new File(RUTA_CARPETA).mkdirs();

        try (DatagramSocket socket = new DatagramSocket(PUERTO)) {
            System.out.println("Servidor UDP 'Touch' escuchando en puerto " + PUERTO);
            System.out.println("Carpeta de almacenamiento: " + new File(RUTA_CARPETA).getAbsolutePath());

            byte[] buffer = new byte[1024];

            while (true) {
                DatagramPacket paquete = new DatagramPacket(buffer, buffer.length);
                socket.receive(paquete);

                String mensaje = new String(paquete.getData(), 0, paquete.getLength(), StandardCharsets.UTF_8).trim();
                InetAddress ipCliente = paquete.getAddress();
                int puertoCliente = paquete.getPort();

                System.out.println("Cliente [" + ipCliente.getHostAddress() + "] dice: " + mensaje);

                String respuestaTexto = "";

                if (mensaje.startsWith("CREAR:")) {
                    // creamos un mensaje para crear el archivo
                    String nombreArchivo = mensaje.substring(6); // Quitamos "CREAR:"
                    respuestaTexto = crearArchivoFisico(nombreArchivo);
                } 
                else if (mensaje.equalsIgnoreCase("salir")) {
                    System.out.println("Cliente solicitó desconexión.");
                    // Si en UDP no hay conexión real, solo ignoramos
                } 
                else {
                    respuestaTexto = "Comando no reconocido. Use CREAR:nombre";
                }

                // Enviar respuesta al cliente
                byte[] datosRespuesta = respuestaTexto.getBytes(StandardCharsets.UTF_8);
                DatagramPacket respuesta = new DatagramPacket(datosRespuesta, datosRespuesta.length, ipCliente, puertoCliente);
                socket.send(respuesta);
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static String crearArchivoFisico(String nombre) {
        File archivo = new File(RUTA_CARPETA, nombre);
        try {
            if (archivo.createNewFile()) {
                System.out.println(">> Archivo creado exitosamente: " + nombre);
                return "EXITO: Archivo creado remotamente.";
            } else {
                System.out.println(">> El archivo ya existe: " + nombre);
                return "INFO: El archivo ya existía.";
            }
        } catch (IOException e) {
            e.printStackTrace();
            return "ERROR: No se pudo crear el archivo en el servidor.";
        }
    }
}