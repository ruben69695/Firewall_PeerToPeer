var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var sem = require('semaphore')(1);
var InfoMessage = require("./../Classes/InfoMessage");
var RuleLog = require("./../Classes/RuleLog");
const _PORT = 3000;

server.listen(_PORT, function() {
    console.log("Socket running on http://*:%s", _PORT);
    console.log("Fecha de ejecución del servidor -> " + new Date().toISOString());
});

io.sockets.on('connection', function(socket) {

    var thisClient;

    console.log("Un cliente con IP %s , ha establecido conexión con el socket", socket.conn.remoteAddress);

    // PETICIONES A ATENDER POR PARTE DEL CLIENTE
    socket.on('addRule', function (json) {
        enterToSemaphore("dbMuttable", "addRule", json);
    });

    socket.on('modifyRule', function(json) {
        enterToSemaphore("dbMuttable", "modifyRule", json);
    });

    socket.on('deleteRule', function(json) {
        enterToSemaphore("dbMuttable", "deleteRule", json);
    });

    socket.on('enableRule', function(json) {
        enterToSemaphore("dbMuttable", "enableRule", json);
    });

    socket.on('disableRule', function(json) {
        enterToSemaphore("dbMuttable", "disableRule", json);
    });

    socket.on('getCurrentList', function (json) {
        enterToSemaphore("dbImmutable", "getCurrentList", json);
    });


    /**
     * Función que controla con un semaforo los accesos a la base de datos
     * @param {string} dbAttackType Tipo de ataque contra la bbdd
     * @param {string} operation Elegir operacion
     * @param {string} json Información a pasarle a la función en formato json u otro formato
     */
    function enterToSemaphore(dbAtackType, operation, json)
    {
        sem.take(1, function() {
            switch(dbAtackType) {
                case "dbMuttable":
                    flowMuttableOperations(operation, json);
                break;
                case "dbImmutable":
                    flowImmutableOperations(operation, json);
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
    function flowMuttableOperations(operation, json)
    {
        var result = JSON.parse(json);  // Deserializamos el JSON y creamos el objeto correcto
        var error = 0;                  // Default todo correcto
        var message;                    // Objeto de mensaje
        
        // Instanciamos una nueva regla con los datos correspondientes
        var newRule = newRule = new RuleLog (       
            result.Name, result.Description, result.Path, result.Port, 
            result.Operation, result.InOut, result.Permission, result.Protocol, result.Author
        );

        if(operation == "addRule")
        {
            // A la descripción le concatenamos un espacio y la versión
            newRule.Description = newRule.Description + " " + newRule.Version;         
            message = createRule(newRule);
        }
        else if(operation == "modifyRule")
        {
            // Crear un registro de eliminación para la regla pasada por JSON y luego crearla como nueva
            message = deleteRule(newRule);
            if(!message.Erno)
                message = createRule(newRule);
        }
        else if(operation == "deleteRule")
        {
            // Crear un registro de eliminación para la regla pasada por JSON
            message = deleteRule(newRule);
        }
        else if(operation == "enableRule")
        {
            // Crar registro para habilitar la regla pasada por JSON
            message = enableRule(newRule);
        }
        else if(operation == "disableRule")
        {
            // Crear un registro para deshabilitar la regla pasada por JSON
            message = disableRule(newRule);
        }

        // Notificamos el resultado de la operación al cliente que ha solicitado realizar el cambio
        socket.emit('okChange', message.ToJson());

        // Si no hay error en el mensaje hacemos un broadcast a todos los clientes para que actualicen la versión
        if(message.Erno == 0)
        {
            io.sockets.emit('newChangeDone', newRule.ToJson());
        }
    }

    /**
     * Función que nos permite controlar el flujo de operaciones que no modifican la base de datos y nos devuelven un resultado
     * @param {string} operation Tipo de operacion inmutable sobre la base de datos
     * @param {string} json Información en formato json
     */
    function flowImmutableOperations(operation, json)
    {
        // Objeto de mensaje
        var message;
        // Deserializamos el JSON y creamos el objeto correcto
        var info = JSON.parse(json);
        // Variable de resultado
        var result;

        if(operation == "getCurrentList")
        {
            result = mongoGetVersion(info.clientDate);    // Obtenemos le resultado de la consulta
        }

        // Retornamos el resultado al cliente
        socket.emit(result);
    }

    /**
     * 
     * @param {RuleLog} rule Obtejo RuleLog para poder crear un nuevo registro en la base de datos
     */
    function createRule(rule)
    {
        var error = 0;
        var message;
   
        // Guardamos la regla en la base de datos
        rule.Operation = "Crear";
        error = MongoInsertRule(rule);

        // 0 es que no hay error, mas grande de 0 es error
        if(error == 0)
        {
            // Si ha ido bien hacemos un broadcast a todos los sockets
            message = new InfoMessage(false, "Todo correcto, se ha insertado la nueva regla en base de datos", newRule);
        }
        else
        {
            // Si no avisamos al cliente socket que ha ido mal y el mensaje de error
            message = new InfoMessage(true, "Error al insertar el registro en base de datos", newRule);
        }

        return message;
    }

    /**
     * Crear un log de eliminación d euna regla en base de datos
     * @param {RuleLog} rule Regla a marcar para eliminar
     */
    function deleteRule(rule)
    {
        var error = 0;
        var message;

        rule.Operation = "Eliminar";

        // Creamos un registro para eliminar la regla
        error = MongoDeleteRule(rule);

        if(error == 0)
        {
            message = new InfoMessage(false, "Todo correcto, se ha insertado la nueva regla de eliminación en base de datos", rule);
        }
        else
        {
            message = new InfoMessage(true, "Error al insertar el registro de eliminación en base de datos", rule);
        }

        return message;
    }

    function enableRule(rule)
    {
        var error = 0;
        var message;

        rule.Operation = "Habilitar";

        // Creamos el registro para habiliatar una regla
        error = MongoEnableRule(rule);

        if(error == 0)
        {
            message = new InfoMessage(false, "Todo correcto, se ha habilitado la regla en base de datos", rule);
        }
        else
        {
            message = new InfoMessage(false, "Error, no se ha podido habilitar la regla en base de datos", rule);
        }

        return message;
    }

    function disableRule(rule)
    {
        var error = 0;
        var message;

        rule.Operation = "Deshabilitar";

        error = MongoDisableRule(rule);

        if(error == 0)
        {
            message = new InfoMessage(false, "Todo correcto, se ha deshabilitado la regla en base de datos", rule);
        }
        else
        {
            message = new InfoMessage(false, "Error, no se ha podido deshabilitar la regla en base de datos", rule);
        }

        return message;
    }

});