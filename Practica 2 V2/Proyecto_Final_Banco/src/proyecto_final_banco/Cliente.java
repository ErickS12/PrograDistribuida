/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Main.java to edit this template
 */
package proyecto_final_banco;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.Socket;
import java.util.Scanner;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author israe
 */
public class Cliente {

    /**
     * @param args the command line arguments
     */
    public static void main(String[] args) {
        //Configuracion de cliente general
        try (Scanner sn = new Scanner(System.in);
             Socket sc = new Socket("192.168.0.11",10000)) {//La ip es la del PC que hace de servidor
            //Tambien el port debe ser el mismo tanto en el cliente como en la clase servidor
            
            sn.useDelimiter("\n");
            
            DataInputStream in = new DataInputStream(sc.getInputStream());
            DataOutputStream out = new DataOutputStream(sc.getOutputStream());
            
            
            String mensaje = in.readUTF();
            System.out.println(mensaje);
            
            String numero = sn.next();
            out.writeUTF(numero);
            ClienteHilo hilo = new ClienteHilo(in,out);
            
            hilo.start();
            try {
                hilo.join();
            } catch (InterruptedException ex) {
                Logger.getLogger(Cliente.class.getName()).log(Level.SEVERE, null, ex);
            }
            
        } catch (IOException ex) {
            Logger.getLogger(Cliente.class.getName()).log(Level.SEVERE, null, ex);
        }
    }
    
}
