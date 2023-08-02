import {NetworkJoueur, Joueur, Notifier} from '../joueur.js';
import {GestionFiche} from "../../display/case_jeu.js";
import {GestionDes} from "../dices.js";
import {GestionJoueur} from "../../gestion_joueurs.js";

/* Represent a local player in remote game */
/* Extend joueur but override many methods, no action, only receive events */
class LocalPlayer extends NetworkJoueur {
    constructor(numero, nom, color,argent,montantDepart){
        super(numero,nom,color,argent,montantDepart);
    }
    lancerDes() {
        // Send event to get score for dices. If prison, ask stay or not before
        GestionDes.gestionDes.before(()=>Notifier.askDices(this));
    }
    notifySelect(){}
    // Notify to master end of turn
    endTurn(){
        Notifier.notifyEnd()
    }
    notifyDices(dices){}
}

class RemotePlayer extends Joueur{
    constructor(numero,nom,color,argent,montantDepart){
        super(numero,nom,color,argent,montantDepart);
        this.canPlay = false;
        this.type = "Distant";
        this.free = true;
    }
    isSlotFree(){
        return this.free;
    }
    setPlayer(player){
        this.nom = player;
        this.free = false;
        $('.joueur-name',this.div).text(this.nom);
    }
    // If remote player receive money, it's done and send to all
    notifyPay(montant){
        Notifier.payer(montant,this);
    }
}

// Remote manage by master, must send his events
class MasterRemotePlayer extends RemotePlayer{
    constructor(numero,nom,color,argent,montantDepart) {
        super(numero, nom, color, argent,montantDepart);
    }
    // Send event when set as player
    notifySelect(){
        Notifier.notifySelect(this);
    }
    notifyDices(dices,event){
        // Send event tax if necessary, move to and change
        Notifier.dices(dices,event,this);
        if(event.prison != null) {
            if (!event.prison.sortie) {
                GestionJoueur.change()
            }else{
                GestionJoueur.getJoueurCourant().exitPrison()
                // exist but must by or relaunch
            }
        }
    }
    moveTo(nb){
        let nextCase = this.pion.deplaceValeursDes(nb);
        Notifier.moveTo(GestionFiche.buildId(nextCase),this);
        this.joueSurCase(nextCase);
    }
}

export {MasterRemotePlayer,RemotePlayer,LocalPlayer};
