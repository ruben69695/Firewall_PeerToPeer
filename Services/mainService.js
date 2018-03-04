var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var sem = require('semaphore')(1);
var InfoMessage = require("./../Classes/InfoMessage");
var RuleLog = require("./../Classes/RuleLog");
var MongoClient = require('mongodb').MongoClient;
var nomdb="Firewalldb";
var urlConnexio="mongodb://localhost:27017/";
const _PORT = 3000;

server.listen(_PORT, function() {
    console.log("Socket running on http://*:%s", _PORT);
    console.log("Fecha de ejecución del servidor -> " + new Date().toISOString());

    /*var tempRule = new RuleLog("ASIX_SSH", "Apertura del puerto SSH", "", 22, "Crear", 
    "in", "allow", "tcp", "Ruben Arrebola");

    var numError = MongoInsertRule(tempRule); 
    
    console.log(numError);
    
    */

    /*
    CallbackToMongo("2018-02-25T08:19:25.712Z", function(resultado) {
        console.log(resultado);
    }); */

});



io.sockets.on('connection', function(socket) {

    console.log("Un cliente con IP %s , ha establecido conexión con el socket", socket.conn.remoteAddress);

    // PETICIONES A ATENDER POR PARTE DEL CLIENTE
    socket.on('addRule', function (json) {
        enterToSemaphore("dbMuttable", "addRule", json, socket);
    });

    socket.on('modifyRule', function(json) {
        enterToSemaphore("dbMuttable", "modifyRule", json, socket);
    });

    socket.on('deleteRule', function(json) {
        enterToSemaphore("dbMuttable", "deleteRule", json, socket);
    });

    socket.on('enableRule', function(json) {
        enterToSemaphore("dbMuttable", "enableRule", json, socket);
    });

    socket.on('disableRule', function(json) {
        enterToSemaphore("dbMuttable", "disableRule", json, socket);
    });

    socket.on('getCurrentList', function (json) {
        enterToSemaphore("dbImmutable", "getCurrentList", json, socket);
    });

});

/**
     * Función que controla con un semaforo los accesos a la base de datos
     * @param {string} dbAttackType Tipo de ataque contra la bbdd
     * @param {string} operation Elegir operacion
     * @param {string} json Información a pasarle a la función en formato json u otro formato
     */
    function enterToSemaphore(dbAtackType, operation, json, socket)
    {
        sem.take(1, function() {
            switch(dbAtackType) {
                case "dbMuttable":
                    flowMuttableOperations(operation, json, socket);
                break;
                case "dbImmutable":
                    flowImmutableOperations(operation, json, socket);
                break;
            }
            sem.leave(1);
        });
    }

    /**
     * Función que nos permite controlar el flujo de operaciones que hacen cambios en la base de datos
     * @param {string} operation Tipo de operacion muttable sobre la base de datos
     * @param {string} json Información en formato JSON
     */
    function flowMuttableOperations(operation, json, socket)
    {
        var result = JSON.parse(json);  // Deserializamos el JSON y creamos el objeto correcto
        var error = 0;                  // Default todo correcto
        var message;                    // Objeto de mensaje
        
        // Instanciamos una nueva regla con los datos correspondientes
        var newRule = new RuleLog (       
            result.Name, result.Description, result.Path, result.Port, 
            result.Operation, result.InOut, result.Permission, result.Protocol, result.Author
        );

        if(operation == "addRule")
        {
            // A la descripción le concatenamos un espacio y la versión
            newRule.Description = newRule.Description + " " + newRule.Version;
            newRule.Operation = "crear";         
            
            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado);     // Identificamos el error      
                notifyRuleToClients(newRule, socket);   // Notificamos al cliente y si no hay error a los clientes
            });
        }
        else if(operation == "modifyRule")
        {
            // Crear un registro de eliminación para la regla pasada por JSON y luego crearla como nueva
            newRule.Operation = "eliminar";

            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado);     // Identificamos el error
                if(!message.Erno)
                {
                    newRule.Operation = "create";       // Volvemos a crear la regla con las modificaciones
                    CallbackMongoAddRule(newRule, function(resultado) {
                        message = IdentifyError(resultado);     // Identificamos el error
                        notifyRuleToClients(newRule, socket);   // Notificamos al cliente y si no hay error a los clientes
                    });
                }

            });
        }
        else if(operation == "deleteRule")
        {
            newRule.Operation = "eliminar";     // Crear un registro de eliminación para la regla pasada por JSON

            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado);         // Identificamos el error
                notifyRuleToClients(newRule, socket);       // Notificamos al cliente y si no hay error a los clientes
            });

        }
        else if(operation == "enableRule")
        {
            // Crar registro para habilitar la regla pasada por JSON
            newRule.Operation = "habilitar";

            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado);     // Identificamos el error
                notifyRuleToClients(newRule, socket);   // Notificamos al cliente y si no hay error a los clientes
            });
        }
        else if(operation == "disableRule")
        {
            // Crear un registro para deshabilitar la regla pasada por JSON
            newRule.Operation = "deshabilitar";

            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado);     // Identificamos el error
                notifyRuleToClients(newRule, socket);   // Notificamos al cliente y si no hay error a los clientes
            });
        }

        /*
        // Notificamos el resultado de la operación al cliente que ha solicitado realizar el cambio
        socket.emit('okChange', message.ToJson());

        // Si no hay error en el mensaje hacemos un broadcast a todos los clientes para que actualicen la versión
        if(message.Erno == 0)
        {
            io.sockets.emit('newChangeDone', newRule.ToJson());
        }
        */
    }

    function notifyRuleToClients(rule, socket)
    {
        // Notificamos el resultado de la operación al cliente que ha solicitado realizar el cambio
        socket.emit('okChange', message.ToJson());

        // Si no hay error en el mensaje hacemos un broadcast a todos los clientes para que actualicen la versión
        if(message.Erno == 0)
        {
            io.sockets.emit('newChangeDone', rule.ToJson());
        }
    }

    /**
     * Función que nos permite controlar el flujo de operaciones que no modifican la base de datos y nos devuelven un resultado
     * @param {string} operation Tipo de operacion inmutable sobre la base de datos
     * @param {string} json Información en formato json
     */
    function flowImmutableOperations(operation, json, socket)
    {
        // Objeto de mensaje
        var message;
        // Deserializamos el JSON y creamos el objeto correcto
        var info = JSON.parse(json);
        // Variable de resultado
        var result;

        if(operation == "getCurrentList")
        {   
            //result = mongoGetVersion(info.clientDate);    // Obtenemos le resultado de la consulta
            CallbackMongoGetRules("2018-02-25T08:19:25.712Z", function(resultado) {
                // Retornamos el resultado al cliente
                console.log(resultado);
                socket.emit(resultado);
            });
        }
        //socket.emit(result);
    }

    /**
     * 
     * @param {Int} num Numero de error
     */
    function IdentifyError(num)
    {
        var error = 0;
        var message

        // 0 es que no hay error, mas grande de 0 es error
        if(error == 0)
        {
            // Si ha ido bien hacemos un broadcast a todos los sockets
            message = new InfoMessage(false, "Todo correcto, se ha insertado la nueva regla en base de datos", rule);
        }
        else if(error == 2)
        {
            // Si no avisamos al cliente socket que ha ido mal y el mensaje de error
            message = new InfoMessage(true, "Error al insertar el registro en base de datos", rule);
        }
        else if(error == 1)
        {
            message = new InfoMessage(true, "Ya existe en base de datos", rule);
        }

        return message;
    }

    
    function CallbackMongoGetRules(parametro, callback) {
        setTimeout(function() {
            var resultado = MongoGetRules(parametro);
            callback(resultado);
        }, 500);
    }

    function CallbackMongoAddRule(rule, callback) {
        setTimeout(function() {
            var result = MongoInsertRule(rule);
            callback(result);
        }, 500);
    }

    function MongoGetRules(date){
        if(date!=null)
        {
            MongoClient.connect(urlConnexio, function(err, db) {
                if (err) throw err;
                var dbo = db.db(nomdb);
                //Find the first document in the customers collection:
                dbo.collection("rules").find({
                    version: {"$gt":date}
                }).toArray(function(err, result) {
                if (err) throw er
                console.log(result);

                db.close();
                return JSON.stringify(result);
                });
            });
        }
    }

    function MongoInsertRule(obj)
    {
        if(obj!=null)
        {  
            MongoClient.connect(urlConnexio, function(err, db) {
            if (err){ 
                return 2;
                throw err;
            }
            var dbo = db.db(nomdb);

            dbo.collection("rules").findOne({
                name : obj.Name,
                desc : obj.Description
            },function(err, result){
            if (err) throw er
            //console.log("result:  "+result);
            if(result!=null || obj.Operation != "crear")
            {
                return 1;
            }
            else
            {
                var rule = { name: obj.Name, desc: obj.Description, path: obj.Path,port:obj.Port,operation:obj.Operation,inOut:obj.InOut,permission:obj.Permission,version:obj.Version,protocol:obj.Protocol,author:obj.Author}      
                dbo.collection("rules").insertOne(rule, function(err, res) {
                    if (err)
                    {
                        return 2;
                        throw err;
                    } 
                    console.log("Insert Rule Correctament");
                    db.close();
                    return 0;
                });
            }
            });
                });

        }
    }