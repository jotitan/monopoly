import {DrawerFactory,Drawer} from '../ui/graphics.js'
import {GestionJoueur} from '../core/gestion_joueurs.js'
import {infoMessage, MessageDisplayer} from '../display/message.js'
import {VARIANTES,CURRENCY} from "../core/monopoly.js";
import {GestionFiche} from "../display/case_jeu.js";
import {dices} from "../request_service.js";
import {bus} from "../bus_message.js";
import {deepCopy, disableActions} from "../utils.js";

let GestionDes = {
    gestionDes:null,

    init:function(rollColor){
        this.gestionDes.init(rollColor);
    },
    lancer:function(){
        this.gestionDes.lancer();
    },
    isDouble:function(){
        return this.gestionDes.isDouble();
    },
    // Joueur continue (cas du double)
    continuePlayer:function(){
        return this.gestionDes.continuePlayer();
    },
    resetDouble:function(){
        return this.gestionDes.resetDouble();
    },
    total:function(){
        return this.gestionDes.total();
    },
    isSpecificAction:function(){
        return this.gestionDes.isSpecificAction()
    },
    doSpecificAction:function(){
        return this.gestionDes.doSpecificAction()
    }
}

class LocalDiceThrower {
    throw(nb){
        let throws = [];
        for(let i = 0 ; i < nb ; i++){
            throws[i] = this.throwOne();
        }
        return new Promise(resolve=>resolve(throws));
    }
    throwOne(){
        return Math.round((Math.random() * 1000)) % 6 + 1;
    }
}

class RemoteDiceThrower{
    throw(nb){
        return dices(nb)
    }
}

let DiceThrower = {
    instance:new LocalDiceThrower(),
    useLocal(){
        this.instance = new LocalDiceThrower();
    },
    useRemote(){
        this.instance = new RemoteDiceThrower();
    },
    throw(nb){
        return this.instance.throw(nb);
    }
};

class GestionDesImpl{
    constructor(montantPrison,parcGratuit) {
        this.parcGratuit = parcGratuit;
        this.nbAnimation = 8;
        this.cube = {des1: null, des2: null};
        this.des1 = 0;
        this.des2 = 0;
        this.nbDouble = 0;	// Nombre de double de suite pour le joueur en cours
        this.rollColor = '#000000';
        this.montantPrison = montantPrison;
    }
    init(rollColor){
        this._init(rollColor);
    }

    _init (rollColor){
        this.cube.des1 = DrawerFactory.getDes(150, 200, 50);
        this.cube.des2 = DrawerFactory.getDes(210, 200, 50);
        Drawer.addRealTime(this.cube.des1);
        Drawer.addRealTime(this.cube.des2);

        this.rollColor = rollColor;
    }
    resetDouble(){
        this.nbDouble = 0;
    }
    _rand(){
        return Math.round((Math.random() * 1000)) % 6 + 1;
    }
    isSpecificAction(){
        return false;
    }

    doSpecificAction(){}

    /* Action avant le lancement du des */
    before(callback){
        if (GestionJoueur.getJoueurCourant().enPrison) {
            // Propose au joueur de payer ou utiliser une carte
            let buttons = infoMessage.createPrison(this.montantPrison,GestionJoueur.getJoueurCourant(),GestionJoueur.getJoueurCourant().nbDouble, function () {
                callback();
            });
            GestionJoueur.getJoueurCourant().actionAvantDesPrison(buttons);
        } else {
            callback();
        }
    }
    /* Cas lorsque le joueur est en prison */
    treatPrison(){
        let j = GestionJoueur.getJoueurCourant();
        if (this.isDouble()) {
            let buttons = infoMessage.create(j,"Libere de prison", "lightblue", "Vous etes liberes de prison grace a un double", () =>{
                j.exitPrison({notrigger:true,notify:true});
                this.endLancer();
            }, {});
            this.nbDouble++;
            j.actionApresDes(buttons, null);
            return {prison:{sortie:true,montant:0},end:true};
        } else {
            if (j.nbDouble === 2) {
                let messagePrison = `Vous etes liberes de prison, mais vous devez payer ${CURRENCY} ${this.montantPrison} !`;
                let buttons = infoMessage.create(j,"Libere de prison", "lightblue", messagePrison,  ()=> {
                    j.payerParcGratuit(this.parcGratuit,this.montantPrison, () =>{
                        j.exitPrison({notrigger:true,paye:true,notify:true});
                        this.endLancer();
                    });
                }, {});
                j.actionApresDes(buttons, null);
                return {prison:{sortie:true,montant:this.montantPrison},end:true};
            } else {
                j.nbDouble++;
                let buttons = infoMessage.create(j,`Tour ${j.nbDouble}`, "red", "Vous restez en prison, vous n'avez pas fait de double.", ()=>GestionJoueur.change(), {});
                j.actionApresDes(buttons, null);
                return {prison:{sortie:false},end:true};
            }
        }
    }
    /* Action apres le lancement des des */
    /* Regle de gestion
     * 1 - Le joueur peut payer 5000 Frs ou utiliser une carte sortie de prison avant de lancer les des
     * 2 : Le joueur fait un double ou a payer, il sort
     * 3 - Le joueur atteint sont 3eme lancer, il paie
     * 4 - Pas de double, il reste en prison
     * */
    after(){
        let event = {total:this.total(),combinaison:this.combinaisonDes(),joueur:GestionJoueur.getJoueurCourant()};
        if (GestionJoueur.getJoueurCourant().enPrison === true) {
            event = deepCopy(event,this.treatPrison());
            //event = $.extend(event,this.treatPrison());
        } else {
            // Gere le cas du triple (de rapide) egalement
            if (this.isDouble()) {
                event = deepCopy(event,this.treatDouble());
                //event = $.extend(event,this.treatDouble());
            }
        }
        MessageDisplayer.events.lanceDes(event);
        this.notifyDices(event);
        if(event.end !== true) {
            this.endLancer();
        }
    }

    /* Renvoie la combinaison des des */
    combinaisonDes(){
        return this.des1 + " et " + this.des2;
    }

    /* Gere le comportement des doubles */
    treatDouble(){
        return this._doTreatDouble();
    }

    _doTreatDouble(){
        if (this.nbDouble >= 2) {
            let buttons = infoMessage.create(GestionJoueur.getJoueurCourant(),"Allez en prison", "red", "Vous avez fait 3 doubles, vous allez en prison",  ()=> {
                // On met des valeurs differentes pour les des pour que le joueur ne rejoue pas
                this.des2++;
                // Le changement de joueur lorsque le deplacement est termine
                GestionJoueur.getJoueurCourant().goPrison();
            }, {});
            GestionJoueur.getJoueurCourant().actionApresDes(buttons, null);
            return {double:{status:false,triple:true},end:true};
        }
        this.nbDouble++;
        return {double:{status:true,replay:true}};
    }

    endLancer(){
        GestionJoueur.getJoueurCourant().joueDes(this.total());
        this.showReload();
    }

    showReload(){
        document.getElementById('idReloadDice').style
            .setProperty('display',this.isDouble() ? '':'none');
    }

    continuePlayer(){
        return this.isDouble()
    }

    isDouble(){
        return this.des1 === this.des2;
    }
    /* lancement du des */
    lancer(){
        this.before(()=>{
            this._randDes();
            document.getElementById('idReloadDice').style.setProperty('display','none');
            this._anime();
        });
    }
    notifyDices(event){
        GestionJoueur.getJoueurCourant().notifyDices([this.des1,this.des2,0],event);
    }
    setDices(dice1,dice2){
        this.des1 = dice1;
        this.des2 = dice2;
    }
    async _randDes(){
        await DiceThrower.throw(2).then(dices=>this.setDices(dices[0],dices[1]));
    }
    _anime(){
        disableActions();
        let nb = VARIANTES.quickMove ? -1 : this.nbAnimation;
        const gd = this;
        const interval = setInterval(function () {
            if (nb-- < 0) {
                clearInterval(interval);
                // If double, desRapide is empty, only on end
                gd._drawCubes(gd.des1,gd.des2,gd.desRapide);
                gd.after();
                return;
            }
            gd._drawCubes(gd._rand(),gd._rand(),gd._rand()%3+1,gd.rollColor);
        }, 100);
    }
    setAndShowDices(event,joueur){
        // If prison, increase nb turn
        if(event.prison != null && event.prison.sortie != null && event.prison.sortie === false){
            GestionJoueur.getJoueurCourant().nbDouble++;
        }
        event.joueur = joueur;
        this.setDices(event.dice1,event.dice2,event.quickDice);
        this._drawCubes(event.dice1,event.dice2,event.quickDice);
        event.total = this.total();
        event.combinaison = this.combinaisonDes();
        MessageDisplayer.events.lanceDes(event);
    }
    _drawCubes(val1,val2,desRapide,color='black'){
        this.cube.des1.setValue(val1, color);
        this.cube.des2.setValue(val2, color);
    }
    /* Renvoie le total des dés */
    total(){
        return this.des1 + this.des2;
    }
}

/* Implementation pour le des rapide */
/* DES RAPIDE */
/* Si le des fait 1, 2 ou 3, on ajoute le score au des */
/* Si on obtient un triple, on se deplace ou l'on souhaite (IA : trouver meilleure case : terrain a acheter (finir un groupe), passer une zone a risque) */
/* Si on obtient le bus, on utilise l'un ou l'autre des des ou les deux (IA : chercher la cause la plus avantageuse / moins risque (terrain interessant, loyer le moins cher)) */
/* Si on obtient un Mr Monopoly, on se place sur la prochaine propriété vide. Si tout vendu, on se deplace sur la premiere */

class GestionDesRapideImpl extends GestionDesImpl{
    constructor(montantPrison,parcGratuit) {
        super(montantPrison,parcGratuit);
        this.cube.desRapide = null;
        this.desRapide = 0;
    }

    init(rollColor){
        this._init(rollColor);
        this.cube.desRapide = DrawerFactory.getDesRapide(270, 210, 35);
        Drawer.addRealTime(this.cube.desRapide);
    }

    isSpecificAction(){
        // Pas de Mr monopoly quand le joueur est en prison
        return !GestionJoueur.joueurCourant.enPrison && this._isMonopolyMan();
    }

    doSpecificAction(){
        // Apres son jeu, le joueur effectuera cette action
        this.desRapide = 0; // annule le mr monopoly
        let pos = GestionJoueur.getJoueurCourant().getPosition();
        let fiche = GestionFiche.isFreeFiches() ? GestionFiche.getNextFreeTerrain(pos) : GestionFiche.getNextTerrain(pos);
        bus.send('monopoly.derapide.mrmonopoly',{joueur:GestionJoueur.getJoueurCourant(),maison:fiche});
        GestionJoueur.getJoueurCourant().joueSurCase(fiche);
    }
    setDices(dice1,dice2,quickDice){
        this.des1 = dice1;
        this.des2 = dice2;
        if(GestionJoueur.getJoueurCourant().enPrison){
            this.desRapide = 0;
        }else{
            this.desRapide = quickDice;
        }
    }
    notifyDices(event){
        GestionJoueur.getJoueurCourant().notifyDices([this.des1,this.des2,this.desRapide],event);
    }
    async _randDes(){
        await DiceThrower.throw(3).then(dices=>this.setDices(dices[0],dices[1],dices[2]));
    }

    total(){
        let total = this.des1 + this.des2;
        if(!this.isDouble() && this._isValue()){
            total+=this.desRapide;
        }
        return total;
    }

    continuePlayer(){
        return this.isDouble() && !this.isTriple();
    }

    /* Le triple est vu comme un double (pour le traitement global) */
    isTriple(){
        return this.des1 === this.des2 && this.des2 === this.desRapide && this.des1 <=3;
    }

    /* Renvoie la combinaison des des */
    combinaisonDes(){
        if(this.isTriple()){
            return "triple " + this.des1;
        }
        const msg = this.des1 + ", " + this.des2
        if(this.isDouble()){
            return msg
        }
        return msg + " et " +((this._isBus())?" Bus":(this._isMonopolyMan())?"Mr Monopoly":this.desRapide);
    }

    // Cas du triple : double + des rapide avec le meme chiffre (1, 2 ou 3) => Joueur place son pion ou il veut
    // Cas du double : double + des rapide different. Seul le double est pris en compte => Double normal
    treatDouble(){
        // Cas triple
        if(this.isTriple()){
            GestionJoueur.getJoueurCourant().choisiCase(function(fiche){
                GestionJoueur.getJoueurCourant().joueSurCase(fiche);
                bus.send('monopoly.derapide.triple',{joueur:GestionJoueur.getJoueurCourant(),maison:fiche});
            });
            return {double:{status:true}};
        }else{
            this.desRapide = 0
            return this._doTreatDouble();
        }
    }

    _isBus(){
        return this.desRapide === 5;
    }

    _isMonopolyMan(){
        return this.desRapide === 4 || this.desRapide === 6;
    }

    _isValue(){
        return this.desRapide <=3;
    }
    showReload(){
        document.getElementById('idReloadDice').style
            .setProperty('display',this.isDouble() && !this.isTriple() ? '':'none');
    }
    /* Surcharge le comportement apres le lancer */
    endLancer(){
        this.showReload();
        if(this.isTriple()){    // Joueur a choisi la case
            return;
        }
        /* Cas du bus, le joueur choisi quel des il utilise */
        if(!this.isDouble() && this._isBus()){
            GestionJoueur.getJoueurCourant().choisiDes(this.des1,this.des2,function(total){
                bus.send('monopoly.derapide.bus',{joueur:GestionJoueur.getJoueurCourant(),total:total});
                GestionJoueur.getJoueurCourant().joueDes(total);
            });
            return;
        }
        if(this.isDouble()){
            this.desRapide = 0;
            document.getElementById('idReloadDice').style.setProperty('display','');
        }
        GestionJoueur.getJoueurCourant().joueDes(this.total());
    }

    _drawCubes(val1,val2,desRapide,color){
        this.cube.des1.setValue(val1, color);
        this.cube.des2.setValue(val2, color);
        if(this.isDouble() && !this.isTriple()){
            desRapide = 0;
        }
        if(GestionJoueur.getJoueurCourant().enPrison){
            this.cube.desRapide.setValue(0, color);
        }else{
            this.cube.desRapide.setValue(desRapide, color);
        }
    }
}

export {GestionDesRapideImpl,GestionDesImpl, GestionDes, DiceThrower};
