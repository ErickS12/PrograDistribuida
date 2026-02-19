/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package proyecto_final_banco;

import java.awt.Color;
import java.awt.Font;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.IOException;
import java.util.Scanner;
import javax.swing.*;
//import java.awt.event.KeyListener;


/**
 *
 * @author israe
 */
public class ClienteHilo extends Thread {
    

    private static final String RUTA_LOCAL = "./archivos";
    private static final int LIMITE_ARCHIVOS = 3; // limite de archivos locales 



    private DataInputStream in;
    private DataOutputStream out ;
    
     public  int opcion;
     public String mensaje;
     public String usuario;
     public String contra;
    public ClienteHilo(DataInputStream in, DataOutputStream out) {
        this.in = in;
        this.out = out;
    }
    
    
            
    
    public void run (){
       

        Scanner sn = new Scanner(System.in);
        //Creando las  ventanas del programa
        JFrame ventanaInicial = new JFrame ();
       //JFrame ventanaUsuario = new JFrame(); 
        //Atributos de la ventana Principal
        
        ventanaInicial.setSize(1200,800);
        ventanaInicial.setTitle("Menu Principal");
        ventanaInicial.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        //Centrando la ventana
        ventanaInicial.setLocationRelativeTo(null);
        
        //Creando un panel para mostrar el menu
        JPanel panelInicial = new JPanel();
        panelInicial.setLayout(null);
        panelInicial.setBackground(Color.WHITE);
        //Fin de la creacion y configuracion del panel principal
        
       
      


        
        //Caja de texto de Nombre del archivo 
        JTextField txtNombre = new JTextField(20);//Creando el txt y limitandolo a 20 caracteres
        txtNombre.setBounds(500, 500, 150, 50);
        
        //Fin de caja



        //Elementos del panel inicial del menu incial
        JLabel lblBienvenido = new JLabel("Bienvenido seleccione una opcion");
        lblBienvenido.setFont(new Font("arial",Font.ITALIC,15));
        lblBienvenido.setHorizontalAlignment(JLabel.CENTER);
        lblBienvenido.setBounds(450,0,300,100);
        lblBienvenido.setForeground(Color.black);
        //Btn ingresar
        JButton btnCrear = new JButton("Crear Archivo");
        btnCrear.setFont(new Font("arial",Font.ITALIC,19));
        btnCrear.setBounds(400, 400, 350, 50);
        btnCrear.addActionListener(new ActionListener() {//Accion del Boton Crear
            @Override
            public void actionPerformed(ActionEvent e) {//Creando un archivo cada que oprima el boton
                 // Crear carpeta local si no existe
                new File(RUTA_LOCAL).mkdirs();

                    
                        // 1. Verificamos cuántos archivos tenemos
                int cantidadActual = contarArchivosLocales();
                System.out.println("[INFO] Archivos locales actuales: " + cantidadActual);
                 String nombreArchivo = txtNombre.getText();
                if (cantidadActual < LIMITE_ARCHIVOS) {
                    // CASO A: Crear Localmente
                    int opc = crearLocalmente(nombreArchivo);

                    switch (opc) {
                        case 1:
                            JOptionPane.showMessageDialog(null, "Archivo creado con exito","Aviso", JOptionPane.INFORMATION_MESSAGE);
                            break;
                        case 2:
                            JOptionPane.showMessageDialog(null, "El archivo ya existe","Aviso", JOptionPane.INFORMATION_MESSAGE);
                            break;

                        case 0:
                            JOptionPane.showMessageDialog(null, "Error al crear archivo","Aviso", JOptionPane.WARNING_MESSAGE);
                            break;
                        default:
                            throw new AssertionError();
                    }

                } else {
                    try {
                        // CASO B: Enviar al Servidor
                        
                        //Se manda la solicitud al servidor
                        out.writeInt(33);
                        //Se envie en nombre del archivo
                        out.writeUTF(txtNombre.getText());
                        
                         int respuesta = in.readInt();

                        switch (respuesta) {
                        case 1:
                            JOptionPane.showMessageDialog(null, "Archivo creado con exito","Aviso", JOptionPane.INFORMATION_MESSAGE);
                            break;
                        case 2:
                            JOptionPane.showMessageDialog(null, "El archivo ya existe","Aviso", JOptionPane.INFORMATION_MESSAGE);
                            break;

                        case 0:
                            JOptionPane.showMessageDialog(null, "Error al crear archivo","Aviso", JOptionPane.WARNING_MESSAGE);
                            break;
                        default:
                            throw new AssertionError();
                    }
                    } catch (IOException ex) {
                        System.getLogger(ClienteHilo.class.getName()).log(System.Logger.Level.ERROR, (String) null, ex);
                    }
                    
                    
                }
            }
                
                      //  JOptionPane.showMessageDialog(null, "Rellene los campos", "Alerta", JOptionPane.WARNING_MESSAGE);
                
                
                
            
            
            
        });//Fin de la accion del boton Crear
        
        
        
        
        

        //Añadiendo elmentos al panel y ala ventana
        panelInicial.add(lblBienvenido);
        panelInicial.add(btnCrear);
      
       panelInicial.add(txtNombre);
       
        //Agregando el panel ala ventana Inicial 
        
        ventanaInicial.add(panelInicial);
        
        //Agregando el panel ala ventana de Usuario
        
        //ventanaUsuario.add(panelUsuario);
        //Mostrando la ventna 
        ventanaInicial.setVisible(true);
        
        
       
    }

    //Funciones para crear y contar archivos localmente
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

    private static int  crearLocalmente(String nombre) {
        File archivo = new File(RUTA_LOCAL, nombre);
        try {
            if (archivo.createNewFile()) {
                System.out.println("[LOCAL] Archivo creado: " + nombre);
                return 1;
            } else {
                System.out.println("[LOCAL] El archivo ya existe.");
                return 2;
            }
        } catch (IOException e) {
            System.err.println("[LOCAL] Error creando archivo: " + e.getMessage());
            return 0;
        }
    }
}

   
