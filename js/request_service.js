

function get(path){
    return fetch(path).then(d=>d.json())
}

function post(path, data=''){
    return fetch(path,{method:'POST',body:data}).then(d=>d.json())
}

function createGameRequest(){
    return post('/createGame')
}

function loadAllPlateaux(){
    return get('data/plateaux.json');
}

function dices(nb){
    return get(`dices?nb=${nb}`);
}

function sendEventOnNetwork(url, event){
    return post(url, JSON.stringify(event))
}

export {get, post, createGameRequest, loadAllPlateaux, dices, sendEventOnNetwork};