
// Manage messages between parts of app

class Bus {
    constructor(){
        this.observers = {};
    }
    network(data){
        this.send('event.network',data);
    }
    debug(data){
        this.send('monopoly.debug',data);
    }

    refresh(){
        this.send('refreshPlateau');
    }

    send(key, data = {}){
        const clients = this.observers[key];
        if(clients != null){
            clients.forEach(callback => callback(data))
        }
    }
    observe(key, callback){
        let clients = this.observers[key];
        if(clients == null) {
            clients = [];
            this.observers[key] = clients;
        }
        clients.push(callback);
    }

    watchRefresh(callback) {
        this.observe('refreshPlateau',callback);
    }
}

const bus = new Bus()

export {bus}