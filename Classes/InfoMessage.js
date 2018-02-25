module.exports = class InfoMessage {
    
    /**
     * 
     * @param {boolean} xerror Resultado final True,False
     * @param {string} xmessage Mensaje descriptivo
     * @param {object} xobject Objeto de vuelta
     */
    constructor(xerror, xmessage, xobject)
    {
        this.Erno = xerror;
        this.Message = xmessage;
        this.Rule = xobject;
    }

    ToJson()
    {
        return JSON.stringify(this);
    }

}