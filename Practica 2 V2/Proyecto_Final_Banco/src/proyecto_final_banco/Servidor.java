/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Main.java to edit this template
 */
package proyecto_final_banco;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author israe
 */
public class Servidor {

    /**
     * @param args the command line arguments
     */
    public static void main(String[] args) {
        try (ServerSocket server = new ServerSocket(10000)) {
            Socket sc;
            
            System.out.println("Servidor Iniciado");
            
            while(true){
            
            sc = server.accept();
            
            DataInputStream in = new DataInputStream(sc.getInputStream());
            DataOutputStream out = new DataOutputStream(sc.getOutputStream());
            
            out.writeUTF("Ingresa tu numero de cuenta");
            
            String numeroCliente = in.readUTF();
            
            ServidorHilo hilo = new ServidorHilo(in, out, numeroCliente);
            
            hilo.start();
                System.out.println("Conexion Creada con el sevidor"+numeroCliente);
            }
            
        } catch (IOException ex) {
            Logger.getLogger(Servidor.class.getName()).log(Level.SEVERE, null, ex);
        }
    }
    
}
