/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package proyecto_final_banco;

import com.sun.jdi.connect.spi.Connection;
import java.sql.DriverManager;
//import java.sql.SQLException;
//import java.util.logging.Level;
//import java.util.logging.Logger;
//import java.sql.*;

/**
 *
 * @author israe
 */
public class Conexion {

   Connection con;
    
    
    public  Connection conectar(){
        
        
        
        try {
            Class.forName("com.mysql.jdbc.Driver");
             con = (Connection) DriverManager.getConnection("jdbc:mysql://localhost:3306/banco","root","");//Creando la conexion a la base de datos
            
            
            System.out.println("Base de datos conectada");
        } catch (Exception e) {
            
             System.out.println("Error al conectarse a la base de datos");
             e.printStackTrace();
        }

    
    return  con;
    }
    
}
