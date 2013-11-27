// Calcul de PI

var NB_LANCER = 200000;
var results = {in:0,out:0};
for(var i = 0 ; i < NB_LANCER ; i++){
    var x = rand();
    var y = rand();
    if(x*x + y*y <=1){results.in++;}
    else{results.out++;}
}
var pi = (results.in/NB_LANCER)*4;
console.log(pi);

function rand(){
    return (Math.random()*1000000000)/1000000000;
}