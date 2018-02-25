
module.exports = class RuleLog {
    
    /**
     * Constructor principal de la clase
     * @param {string} name Nombre de la regla
     * @param {string} desc Descripción de la regla
     * @param {string} path Ruta del archivo ejecutable
     * @param {int} port Puerto a habilitar
     * @param {string} operation Operación a realizar con la regla en bbdd, crear, eliminar, habilitar, deshabilitar
     * @param {string} inOut Tipo de regla in=Entrada, out=Salida, inout=Entrada+Salida
     * @param {string} permission Permisos de la regla allow=permitir, block=bloquear
     * @param {DateTime} dateTime Fecha universal del servidor
     * @param {string} protocol Tipo de protocolo de la regla tcp/udp
     * @param {string} author Autor que crea la regla
     */
    constructor(name, desc, path, port, operation, inOut, permission, protocol, author) {
        
        this.Name = "ASIX_"+ name;
        this.Description = desc;
        this.Path = path;
        this.Port = port;
        this.Operation = operation;
        this.InOut = inOut;
        this.Permission = permission;
        this.Version = new Date().toISOString()
        this.Protocol = protocol;
        this.Author = author;
    }
    
    /** 
     * Función que retorna el objeto a formato JSON
     * @returns {string} this JS Object to JSON Object
    */
    ToJson() {
        return JSON.stringify(this);
    }
    
}


/** 
 * Obtener DateTime Universal (UTC)
*/
/*
getDateTimeUTC() 
{
    var date = new Date();

    var hour = date.getUTCHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getUTCMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec  = date.getUTCSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var year = date.getUTCFullYear();

    var month = date.getUTCMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day  = date.getUTCDay();
    day = (day < 10 ? "0" : "") + day;

    var mil = date.getUTCMilliseconds();
    mil = (day < 10 ? "0" : "") + day;

    return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec + ":" + mil;
    
} */