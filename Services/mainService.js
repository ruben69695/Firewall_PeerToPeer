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
const _PORT = 3001;

server.listen(_PORT, function() {
    console.log("Socket running on http://*:%s", _PORT);
    console.log("Fecha de ejecución del servidor -> " + new Date().toISOString());

});



io.sockets.on('connection', function(socket) {

    console.log(new Date().toISOString() + " - Un cliente con IP %s , ha establecido conexión con el socket", socket.conn.remoteAddress);

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
            result.name, result.desc, result.path, result.port, 
            result.operation, result.inOut, result.permission, result.protocol, result.author
        );

        if(operation == "addRule")
        {
            // A la descripción le concatenamos un espacio y la versión

            newRule.desc = newRule.desc + " " + newRule.version;

            newRule.operation = "crear";
            
            console.log(newRule.ToJson());
            
            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado, newRule);     // Identificamos el error      
                notifyRuleToClients(message, socket);   // Notificamos al cliente y si no hay error a los clientes
            });
        }
        else if(operation == "modifyRule")
        {
            // Crear un registro de eliminación para la regla pasada por JSON y luego crearla como nueva
            newRule.name = result.name;
            newRule.operation = "eliminar";

            // Eliminamos
            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado, newRule);     // Identificamos el error
                notifyRuleToClients(message, socket);   // Notificamos al cliente y si no hay error a los clientes
                if(!message.Erno)
                {
                    newRule.operation = "crear";                // Volvemos a crear la regla con las modificaciones
                    newRule.version = new Date().toISOString()  // Le asignamos una nueva versión

                    // Creamos
                    CallbackMongoAddRule(newRule, function(xresult) {
                        message = IdentifyError(xresult, newRule);     // Identificamos el error
                        notifyRuleToClients(message, socket);   // Notificamos al cliente y si no hay error a los clientes
                    });
                }

            });
        }
        else if(operation == "deleteRule")
        {
            newRule.name = result.name;
            newRule.operation = "eliminar";     // Crear un registro de eliminación para la regla pasada por JSON

            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado, newRule);         // Identificamos el error
                notifyRuleToClients(message, socket);       // Notificamos al cliente y si no hay error a los clientes
            });

        }
        else if(operation == "enableRule")
        {
            // Crar registro para habilitar la regla pasada por JSON
            newRule.name = result.name;
            newRule.operation = "habilitar";

            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado, newRule);     // Identificamos el error
                notifyRuleToClients(message, socket);   // Notificamos al cliente y si no hay error a los clientes
            });
        }
        else if(operation == "disableRule")
        {
            // Crear un registro para deshabilitar la regla pasada por JSON
            newRule.name = result.name;
            newRule.operation = "deshabilitar";

            CallbackMongoAddRule(newRule, function(resultado) {
                message = IdentifyError(resultado, newRule);     // Identificamos el error
                notifyRuleToClients(message, socket);   // Notificamos al cliente y si no hay error a los clientes
            });
        }
    }

    function notifyRuleToClients(message, socket)
    {
        // Notificamos el resultado de la operación al cliente que ha solicitado realizar el cambio
        socket.emit('okChange', message.ToJson());

        // Si no hay error en el mensaje hacemos un broadcast a todos los clientes para que actualicen la versión
        if(!message.Erno)
        {
            io.sockets.emit('newChangeDone', message.Rule.ToJson());
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
        var info = json;
        // Variable de resultado
        var result;

        if(operation == "getCurrentList")
        {   
            CallbackMongoGetRules(info, function(resultado) {
                // Retornamos el resultado al cliente
                console.log("lista enviada con exito");
                socket.emit('list', resultado);
                console.log(resultado);
            });
        }
    }

    /**
     * 
     * @param {Int} num Numero de error
     */
    function IdentifyError(num, rule)
    {
        var message;

        // 0 es que no hay error, mas grande de 0 es error
        if(num == 0)
        {
            // Si ha ido bien hacemos un broadcast a todos los sockets
            message = new InfoMessage(false, "Todo correcto, se ha insertado la nueva regla en base de datos", rule);
        }
        else if(num == 2)
        {
            // Si no avisamos al cliente socket que ha ido mal y el mensaje de error
            message = new InfoMessage(true, "Error al insertar el registro en base de datos", rule);
        }
        else if(num == 1)
        {
            message = new InfoMessage(true, "Ya existe en base de datos", rule);
        }

        return message;
    }

   function CallbackMongoGetRules(date, callback) {
        setTimeout(function() {

            if(date!=null || date!="")


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
                    callback(result);
                    });
                });
            }
            else
            {    
                MongoClient.connect(urlConnexio, function(err, db) {
                    if (err) throw err;
                    var dbo = db.db(nomdb);
                    //Find the first document in the customers collection:
                    dbo.collection("rules").find({}).toArray(function(err, result) {
                    if (err) throw er
                    console.log(result);
    
                    db.close();
                    //return JSON.stringify(result);
                    callback(result);
                    });
                });
                }
     
        }, 500);
    }

    function CallbackMongoAddRule(obj, callback) {
        setTimeout(function() {

            var result = 0;

            if(obj!=null)
            {  
                MongoClient.connect(urlConnexio, function(err, db) {
                if (err){ 
                    // callback excepción error al connectar 2
                    result = 2;
                    throw err;
                }
                var dbo = db.db(nomdb);
    
                dbo.collection("rules").findOne({
                    name : obj.name,
                    desc : obj.desc
                    },function(err, result){
                        if (err) throw er
                        // En el caso de que 
                        if(result!=null && obj.Operation == "crear")
                        {
                            // callback aqui 1
                            result = 1;
                        }
                        else
                        {
                            var rule = { name: obj.name, desc: obj.desc, path: obj.path,port:obj.port,operation:obj.operation,inOut:obj.inOut,permission:obj.permission,version:obj.version,protocol:obj.protocol,author:obj.author}      
                            dbo.collection("rules").insertOne(rule, function(err, res) {
                                if (err)
                                {
                                    // callback excepción error al crear 2
                                    result = 2;
                                    throw err;
                                } 
                                console.log("Insert Rule Correctament");
                                console.log(rule);
                                db.close();
                            });
                        }
                    });
                });
            }
            console.log(result);
            callback(result);
        }, 500);
    }

    function MongoGetRules(date){
        if(date!=null || date!="")
        {
            MongoClient.connect(urlConnexio, function(err, db) {
                if (err) throw err;
                var dbo = db.db(nomdb);
                //Find the first document in the customers collection:
                dbo.collection("rules").find({
                    version: {"$gt":date}
                }).toArray(function(err, result) {
                if (err) throw er
                console.log("get rules mongo");

                db.close();
                return JSON.stringify(result);
                });
            });
        }
        else
        {    
            MongoClient.connect(urlConnexio, function(err, db) {
                if (err) throw err;
                var dbo = db.db(nomdb);
                //Find the first document in the customers collection:
                dbo.collection("rules").find({}).toArray(function(err, result) {
                if (err) throw er
                console.log(result);

                db.close();
                //return JSON.stringify(result);
                callback(result);
                });
            });
            } 
        
    }
